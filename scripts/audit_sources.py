#!/usr/bin/env python3
"""Offline release audit for Anchor's static artifact and source registry.

This checks deployability, official form integrity, and provenance structure,
not whether a policy is still current. Only public release assets are read;
no resident documents, network requests, or user credentials are read.
Python's standard library keeps the same checks runnable locally and in CI.
"""
from __future__ import annotations

import argparse
import base64
from datetime import date
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

READER_LICENSES = (
    "pdfjs-dist-LICENSE.txt", "tesseract.js-LICENSE.txt",
    "tesseract.js-core-LICENSE.txt", "eng-Apache-2.0-LICENSE.txt",
    "eng-traineddata.txt",
)
REQUIRED_MODULES = (
    "app.js", "account.js", "platform.js", "engine.js", "guide.js",
    "continuity.js", "continuity-view.js", "supabase-transport.js", "config.js",
)
ACCOUNT_LICENSES = (
    "supabase-js-LICENSE.txt", "supabase-auth-js-LICENSE.txt",
    "supabase-functions-js-LICENSE.txt", "supabase-postgrest-js-LICENSE.txt",
    "supabase-realtime-js-LICENSE.txt", "supabase-storage-js-LICENSE.txt",
    "supabase-phoenix-LICENSE.txt", "iceberg-js-LICENSE.txt", "tslib-LICENSE.txt",
)
ASSET_SUFFIXES = r"(?:js|mjs|css|svg|png|pdf|webmanifest|wasm|gz|woff2|bcmap|json)"
OFFICIAL_FORM_HOSTS = {"www.cdss.ca.gov", "cdss.ca.gov"}
MAX_OFFICIAL_FORM_BYTES = 20 * 1024 * 1024
MAX_FORM_REVIEW_AGE_DAYS = 180


class HTMLReferences(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if value and ((tag in {"script", "img", "iframe", "source"} and name == "src")
                          or (tag == "link" and name == "href")):
                self.references.append(value)


def safe_local_file(site: Path, reference: str, relative_to: Path | None = None) -> Path | None:
    """Resolve local paths without permitting an artifact to escape its root."""
    url = urlsplit(reference)
    if url.scheme or url.netloc or not url.path:
        return None
    candidate = ((relative_to or site) / unquote(url.path)).resolve()
    if not candidate.is_relative_to(site.resolve()):
        raise ValueError("path leaves website directory")
    return candidate


def read_sources(data: str) -> list[dict[str, str]]:
    """Read the deliberately small JS metadata registry without executing JS."""
    marker = re.search(r"export\s+const\s+SOURCES\s*=\s*\[(.*?)\];", data, re.S)
    if not marker:
        return []
    records = []
    for body in re.findall(r"\{([^{}]+)\}", marker.group(1), re.S):
        fields = {}
        for field in ("id", "title", "url", "checkedAt"):
            value = re.search(rf"\b{field}\s*:\s*(['\"])(.*?)\1", body, re.S)
            if value:
                fields[field] = value.group(2)
        records.append(fields)
    return records


def secret_key_present(text: str) -> bool:
    if re.search(r"\bsb_secret_[A-Za-z0-9_-]{16,}", text):
        return True
    # A public anon key is allowed, while a service_role JWT bypasses SQL RLS.
    for token in re.findall(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", text):
        try:
            payload = token.split(".")[1]
            decoded = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
            if isinstance(decoded, dict) and decoded.get("role") == "service_role":
                return True
        except (ValueError, UnicodeError, json.JSONDecodeError):
            continue
    return False


def audit_official_forms(site: Path, repository: Path, today: date,
                         errors: list[str], warnings: list[str],
                         checked_assets: set[str]) -> dict:
    """Verify only the bundled public forms, never files from a user's case.

    SHA-256 checks bind each source record to its exact bytes and, for mapped
    forms, to the canonical TypeScript catalogue. Declared page counts are
    bounded metadata: actual compressed/encrypted PDF structure is checked by
    the local PDF reader and the fillable-template tests, not guessed here.
    """
    result = {"official_forms": 0, "official_form_bytes": 0,
              "official_form_checksums_verified": 0}
    manifest = site / "forms/sources.json"
    required = (site / "form-assistance.js").is_file()
    if not manifest.is_file():
        if required:
            errors.append("Missing forms/sources.json for guided form assistance.")
        return result
    try:
        if manifest.stat().st_size > 128 * 1024:
            raise ValueError("oversized registry")
        contents = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(contents, dict):
            raise ValueError("registry must be an object")
        assets = contents.get("assets")
        if not isinstance(assets, list) or not 1 <= len(assets) <= 20:
            raise ValueError("registry needs one to twenty public forms")
    except (OSError, ValueError, UnicodeError):
        errors.append("forms/sources.json is invalid or exceeds its size limit.")
        return result
    checked_assets.add("forms/sources.json")
    reviewed_at = contents.get("reviewedAt")
    try:
        if not isinstance(reviewed_at, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", reviewed_at):
            raise ValueError("ISO date required")
        age = (today - date.fromisoformat(reviewed_at)).days
        if age < 0:
            errors.append("Official form registry has a future review date.")
        elif age > MAX_FORM_REVIEW_AGE_DAYS:
            errors.append(f"Official forms were reviewed {age} days ago; recheck their sources before release.")
        elif age > 90:
            warnings.append(f"Official forms were reviewed {age} days ago; check for revised templates.")
    except ValueError:
        errors.append("Official form registry needs an ISO reviewedAt date.")

    # Changing both an asset and its JSON checksum must not silently drift from
    # the PDF field mapping's pinned template. No TypeScript is executed.
    catalogue = repository / "src/domain/form-assistance.ts"
    mapped_checksums: dict[str, str] = {}
    expected_files: set[str] = set()
    if required and catalogue.is_file():
        source = catalogue.read_text(encoding="utf-8")
        mapped_checksums = dict(re.findall(
            r"\blocalPath\s*:\s*['\"]\./forms/([^'\"]+)['\"][\s\S]*?\bsha256\s*:\s*['\"]([a-f0-9]{64})['\"]",
            source,
        ))
        mapped_checksums.update(dict(re.findall(
            r"\beditablePath\s*:\s*['\"]\./forms/([^'\"]+)['\"][\s\S]*?\beditableSha256\s*:\s*['\"]([a-f0-9]{64})['\"]",
            source,
        )))
        expected_files.update(mapped_checksums)
        expected_files.update(re.findall(r"\binstructionsPath\s*:\s*['\"]\./forms/([^'\"]+)['\"]", source))

    # Editable derivatives retain an independently verified official original.
    # Provenance must name that original, not another derivative or a cycle.
    by_name = {asset.get("file"): asset for asset in assets
               if isinstance(asset, dict) and isinstance(asset.get("file"), str)}
    filenames: set[str] = set()
    for asset in assets:
        if not isinstance(asset, dict):
            errors.append("Official form registry contains a non-object record.")
            continue
        filename = asset.get("file")
        # A basename is deliberate: URLs, absolute paths, backslashes, encoded
        # traversal, queries and nested resident-document directories are invalid.
        if not isinstance(filename, str) or not re.fullmatch(r"[a-z0-9]+(?:[-_][a-z0-9]+)*\.pdf", filename):
            errors.append("Official form registry contains an unsafe PDF file path.")
            continue
        if filename in filenames:
            errors.append(f"Duplicate official form file: {filename}.")
            continue
        filenames.add(filename)
        result["official_forms"] += 1
        for name in ("title", "agency"):
            if not isinstance(asset.get(name), str) or not asset[name].strip() or len(asset[name]) > 250:
                errors.append(f"Official form {filename} needs a bounded {name}.")
        for name in ("source", "catalogue"):
            value = asset.get(name)
            try:
                if not isinstance(value, str) or len(value) > 2000 or re.search(r"\s", value):
                    raise ValueError("invalid URL")
                url = urlsplit(value)
                if (url.scheme != "https" or url.hostname not in OFFICIAL_FORM_HOSTS
                        or url.username or url.password or url.port not in (None, 443)
                        or url.fragment or (name == "source" and not url.path.lower().endswith(".pdf"))):
                    raise ValueError("not an official CDSS URL")
            except ValueError:
                errors.append(f"Official form {filename} needs an HTTPS CDSS {name} URL.")
        if type(asset.get("pages")) is not int or not 1 <= asset["pages"] <= 40:
            errors.append(f"Official form {filename} page count must be between 1 and 40.")
        checksum = asset.get("sha256")
        if not isinstance(checksum, str) or not re.fullmatch(r"[a-f0-9]{64}", checksum):
            errors.append(f"Official form {filename} needs a SHA-256 checksum.")
            checksum = None
        if filename in mapped_checksums and checksum != mapped_checksums[filename]:
            errors.append(f"Official form {filename} checksum differs from its field-mapping catalogue.")
        if "derivedFrom" in asset:
            original_name = asset.get("derivedFrom")
            original = by_name.get(original_name) if isinstance(original_name, str) else None
            if (not original or original_name == filename or "derivedFrom" in original
                    or asset.get("transformation") != "empty-password-decryption"
                    or asset.get("sourceSha256") != original.get("sha256")
                    or any(asset.get(key) != original.get(key)
                           for key in ("source", "catalogue", "pages"))):
                errors.append(f"Editable form {filename} has invalid original-form provenance.")
        try:
            candidate = safe_local_file(site, f"./forms/{filename}")
            if candidate is None or not candidate.is_file():
                errors.append(f"Missing official form PDF: {filename}.")
                continue
            size = candidate.stat().st_size
            if not 8 <= size <= MAX_OFFICIAL_FORM_BYTES:
                errors.append(f"Official form {filename} is empty or exceeds 20 MB.")
                continue
            raw = candidate.read_bytes()
            result["official_form_bytes"] += size
            checked_assets.add(candidate.relative_to(site).as_posix())
            if not re.match(rb"%PDF-[12]\.\d", raw):
                errors.append(f"Official form {filename} has no valid PDF header.")
            if checksum and hashlib.sha256(raw).hexdigest() == checksum:
                result["official_form_checksums_verified"] += 1
            elif checksum:
                errors.append(f"Official form {filename} checksum differs from its source registry.")
        except (OSError, ValueError):
            errors.append(f"Official form {filename} cannot be read safely inside the website.")
    for filename in sorted(expected_files - filenames):
        errors.append(f"Official form {filename} is absent from its source registry.")
    return result


def audit(site: Path, repository: Path, today: date | None = None) -> dict:
    site, repository = site.resolve(), repository.resolve()
    today = today or date.today()
    errors: list[str] = []
    warnings: list[str] = []
    checked_assets: set[str] = set()
    report = {"status": "pass", "site": str(site), "sources": 0, "practice_fixtures": 0,
              "checked_assets": 0, "reader_bytes": 0, "reader_checksum_verified": False,
              "errors": errors, "warnings": warnings}
    report.update(audit_official_forms(site, repository, today, errors, warnings, checked_assets))

    def check_reference(reference: str, from_file: Path) -> None:
        if reference.startswith("/") and not reference.startswith("//"):
            errors.append(f"{from_file.relative_to(site)}: origin-root asset {reference} breaks repository Pages paths")
            return
        try:
            candidate = safe_local_file(site, reference, from_file.parent)
            if candidate is not None:
                if not candidate.is_file():
                    errors.append(f"{from_file.relative_to(site)}: missing asset {reference}")
                else:
                    checked_assets.add(str(candidate.relative_to(site)))
        except ValueError:
            errors.append(f"{from_file.relative_to(site)}: asset path escapes website {reference}")

    index = site / "index.html"
    if not index.is_file():
        errors.append("Missing index.html; build the Pages artifact before auditing.")
    else:
        html = index.read_text(encoding="utf-8")
        parser = HTMLReferences()
        parser.feed(html)
        for reference in parser.references:
            check_reference(reference, index)
        if "Content-Security-Policy" not in html:
            errors.append("index.html has no Content-Security-Policy.")
        if re.search(r"connect-src[^;]*(?:https:\s|\*)", html):
            errors.append("connect-src must allow specific origins rather than all HTTPS hosts.")

    for name in REQUIRED_MODULES:
        if not (site / name).is_file():
            errors.append(f"Missing browser module {name}; run the TypeScript bundle build.")
    for path in site.glob("*.js"):
        text = path.read_text(encoding="utf-8")
        for reference in re.findall(r"(?:from\s*|import\s*\()(['\"])([^'\"]+)\1", text):
            if reference[1].startswith(("./", "../", "/")):
                check_reference(reference[1], path)
        for reference in re.findall(rf"['\"](/(?!/)[^'\"]+\.{ASSET_SUFFIXES})['\"]", text):
            check_reference(reference, path)
        for legal in re.findall(r"For license information please see\s+([^\s*]+)", text):
            check_reference(legal, path)
    for path in site.glob("*.css"):
        for reference in re.findall(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", path.read_text(encoding="utf-8")):
            check_reference(reference.strip(), path)

    manifest = site / "manifest.webmanifest"
    if manifest.is_file():
        try:
            contents = json.loads(manifest.read_text(encoding="utf-8"))
            for name in ("start_url", "scope", "id"):
                if str(contents.get(name, "")).startswith("/"):
                    errors.append(f"manifest.webmanifest: {name} must be relative for repository Pages")
            for icon in contents.get("icons", []):
                check_reference(icon["src"], manifest)
        except (ValueError, KeyError):
            errors.append("manifest.webmanifest is invalid.")
    else:
        errors.append("Missing manifest.webmanifest.")

    # The reader manifest tracks all local OCR/PDF assets and their byte lengths.
    reader_manifest = site / "vendor/manifest.json"
    if reader_manifest.is_file():
        try:
            contents = json.loads(reader_manifest.read_text(encoding="utf-8"))
            for asset in contents.get("assets", []):
                reference = asset["path"]
                check_reference(reference, site / "index.html")
                candidate = safe_local_file(site, reference)
                if candidate and candidate.is_file():
                    size = candidate.stat().st_size
                    report["reader_bytes"] += size
                    if size != asset["bytes"]:
                        errors.append(f"Reader manifest byte count differs for {reference}.")
            language = site / "vendor/lang/eng.traineddata.gz"
            if language.is_file():
                checksum = hashlib.sha256(language.read_bytes()).hexdigest()
                report["reader_checksum_verified"] = checksum == contents.get("languageSha256")
                if not report["reader_checksum_verified"]:
                    errors.append("OCR language file checksum differs from reader manifest.")
            else:
                errors.append("Missing offline OCR language data.")
        except (ValueError, KeyError):
            errors.append("vendor/manifest.json is invalid.")
    else:
        errors.append("Missing reader manifest; offline document reading cannot be audited.")
    for name in (*READER_LICENSES, *ACCOUNT_LICENSES):
        if not (site / "vendor/licenses" / name).is_file():
            errors.append(f"Missing bundled dependency license {name}.")

    data_file = site / "data.js"
    data = data_file.read_text(encoding="utf-8") if data_file.is_file() else ""
    sources = read_sources(data)
    report["sources"] = len(sources)
    if not sources:
        errors.append("Public source registry is missing or empty.")
    known_ids: set[str] = set()
    for source in sources:
        identifier = source.get("id", "(missing ID)")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", identifier):
            errors.append(f"Source {identifier} needs a stable lowercase source ID.")
        if identifier in known_ids:
            errors.append(f"Duplicate public source ID: {identifier}.")
        known_ids.add(identifier)
        url = urlsplit(source.get("url", ""))
        if url.scheme != "https" or not url.hostname or not source.get("title"):
            errors.append(f"Source {identifier} needs a title and an HTTPS source URL.")
        try:
            date_text = source.get("checkedAt", "")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_text):
                raise ValueError("Research dates must use YYYY-MM-DD")
            reviewed = date.fromisoformat(date_text)
            age = (today - reviewed).days
            if age < 0:
                errors.append(f"Source {identifier} has a future research check date.")
            elif age > 90:
                warnings.append(f"Source {identifier} was checked {age} days ago; review current instructions.")
        except ValueError:
            errors.append(f"Source {identifier} needs an ISO research check date.")

    # Source references in typed policy code must resolve to the visible registry.
    for policy_file in sorted((repository / "src/domain").glob("*.ts")):
        policy = policy_file.read_text(encoding="utf-8")
        for identifier in re.findall(r"\bsourceId\s*:\s*['\"]([^'\"]+)['\"]", policy):
            if identifier not in known_ids:
                errors.append(f"{policy_file.name}: unknown policy source ID {identifier}.")
        for values in re.findall(r"\bsourceIds\s*:\s*\[([^\]]*)\]", policy):
            for identifier in re.findall(r"['\"]([^'\"]+)['\"]", values):
                if identifier not in known_ids:
                    errors.append(f"{policy_file.name}: unknown policy source ID {identifier}.")
    report["practice_fixtures"] = data.count("FICTIONAL PRACTICE NOTICE")
    if report["practice_fixtures"] < 3:
        errors.append("Expected at least three visibly fictional practice notices.")

    # Scan only deployable authored files, not package source or user documents.
    for path in site.rglob("*"):
        if path.is_symlink():
            errors.append(f"GitHub Pages artifacts cannot contain symbolic links: {path.relative_to(site)}.")
        if path.is_file() and (path.name.startswith((".env", ".dev.vars"))
                               or path.name in {"wrangler.jsonc", "credentials.json"}
                               or path.suffix in {".pem", ".key"}):
            errors.append(f"Private/server configuration was copied into the website: {path.relative_to(site)}.")
        if path.is_file() and "vendor" not in path.relative_to(site).parts and path.suffix in {".js", ".json", ".html", ".map"}:
            if secret_key_present(path.read_text(encoding="utf-8")):
                errors.append(f"Server-privileged Supabase key in website: {path.relative_to(site)}.")
    report["checked_assets"] = len(checked_assets)
    report["status"] = "fail" if errors else "pass"
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=Path("dist/pages"), help="Built static website directory")
    parser.add_argument("--repository", type=Path, default=Path(__file__).resolve().parents[1])
    arguments = parser.parse_args()
    report = audit(arguments.site, arguments.repository)
    print(json.dumps(report, indent=2))
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
