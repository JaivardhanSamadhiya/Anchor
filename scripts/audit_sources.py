#!/usr/bin/env python3
"""Offline release audit for Anchor's static artifact and source registry.

This checks deployability and provenance structure, not whether a policy is still
current. No notices, documents, network requests, or user credentials are read.
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


def audit(site: Path, repository: Path, today: date | None = None) -> dict:
    site, repository = site.resolve(), repository.resolve()
    today = today or date.today()
    errors: list[str] = []
    warnings: list[str] = []
    checked_assets: set[str] = set()
    report = {"status": "pass", "site": str(site), "sources": 0, "practice_fixtures": 0,
              "checked_assets": 0, "reader_bytes": 0, "reader_checksum_verified": False,
              "errors": errors, "warnings": warnings}

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
