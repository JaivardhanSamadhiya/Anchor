#!/usr/bin/env python3
"""Check Anchor's reviewed public corpus without importing app/runtime code.

Offline checks validate provenance and both languages. Network checks hash
public source pages/PDFs and report changes for human review. This tool never
updates passages, review dates, the release version, or accepted fingerprints.
It needs no API key and never reads resident files, account data or .env files.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "supabase/functions/anchor-assistant/knowledge-data.ts"
SNAPSHOTS = ROOT / "supabase/functions/anchor-assistant/knowledge-source-snapshots.json"
OFFICIAL_HOSTS = {
    "www.usa.gov", "www.cdss.ca.gov", "www.dhcs.ca.gov", "www.medicare.gov",
    "www.ssa.gov", "www.smcgov.org", "stgenssa.sccgov.org",
}
JURISDICTIONS = {"federal", "california", "santa-clara", "san-mateo"}
PROGRAMS = {"calfresh", "medi-cal", "medicare", "ssi", "ssdi", "housing", "wic", "energy", "unemployment"}
INTENTS = {"overview", "apply", "renew", "documents", "status", "appeal", "eligibility", "reporting", "compare"}
FOCUSES = {"general", "identity", "income", "household", "proof-alternatives", "interview", "timing", "disability", "coverage", "waitlist", "energy-crisis", "ssi-vs-ssdi", "medicare-vs-medicaid", "snap-vs-wic"}
MAX_BYTES = 8 * 1024 * 1024
MAX_REVIEW_AGE = 180


def load_corpus(path: Path = DATA) -> dict:
    """The canonical export contains JSON only; never eval JavaScript."""
    text = path.read_text(encoding="utf-8")
    match = re.search(r"export const KNOWLEDGE_DATA =\s*(\{.*\})\s+as const;\s*$", text, re.S)
    if not match:
        raise ValueError("Knowledge data must contain the canonical JSON literal export")
    value = json.loads(match.group(1))
    if not isinstance(value, dict):
        raise ValueError("Knowledge corpus must be an object")
    return value


def official_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        url = urlsplit(value)
        return (url.scheme == "https" and url.hostname in OFFICIAL_HOSTS
                and not url.username and not url.password and not url.fragment
                and url.port in {None, 443})
    except ValueError:
        return False


def validate_corpus(corpus: dict, today: date | None = None) -> list[str]:
    today = today or datetime.now(timezone.utc).date()
    issues: list[str] = []
    try:
        version = date.fromisoformat(corpus["version"])
        if version > today:
            issues.append("Release review version is in the future")
    except (ValueError, KeyError, TypeError):
        issues.append("Release review version must be an ISO date")
    sources = corpus.get("sources")
    passages = corpus.get("passages")
    if not isinstance(sources, list) or not isinstance(passages, list) or not sources or not passages:
        return issues + ["Sources and passages must be nonempty lists"]
    source_by_id: dict[str, dict] = {}
    for source in sources:
        if not isinstance(source, dict):
            issues.append("Source is not an object")
            continue
        identifier = source.get("id", "")
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-z0-9-]+", identifier):
            issues.append("Source has an invalid identifier")
            continue
        if identifier in source_by_id:
            issues.append(f"Duplicate source: {identifier}")
        source_by_id[identifier] = source
        if not official_url(source.get("url")):
            issues.append(f"Non-allowlisted official source: {identifier}")
        if not isinstance(source.get("jurisdiction"), str) or source["jurisdiction"] not in JURISDICTIONS:
            issues.append(f"Unknown source jurisdiction: {identifier}")
        if not isinstance(source.get("title"), str) or not source["title"].strip():
            issues.append(f"Source needs a title: {identifier}")
        try:
            reviewed = date.fromisoformat(source["reviewedAt"])
            age = (today - reviewed).days
            if age < 0 or age > MAX_REVIEW_AGE:
                issues.append(f"Source review needs attention: {identifier}")
        except (ValueError, KeyError, TypeError):
            issues.append(f"Source needs an ISO review date: {identifier}")
    identifiers: set[str] = set()
    covered: set[str] = set()
    for passage in passages:
        if not isinstance(passage, dict):
            issues.append("Passage is not an object")
            continue
        identifier = passage.get("id", "")
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-z0-9-]+", identifier):
            issues.append("Passage has an invalid identifier")
            continue
        if identifier in identifiers:
            issues.append(f"Duplicate passage: {identifier}")
        identifiers.add(identifier)
        if passage.get("sourceId") not in source_by_id:
            issues.append(f"Passage needs an existing source: {identifier}")
        program = passage.get("program")
        if not isinstance(program, str) or program not in PROGRAMS:
            issues.append(f"Unknown passage program: {identifier}")
        else:
            covered.add(program)
        for key, choices in (("intents", INTENTS), ("focuses", FOCUSES)):
            values = passage.get(key)
            if not isinstance(values, list) or not values or any(not isinstance(value, str) or value not in choices for value in values):
                issues.append(f"Invalid {key}: {identifier}")
        for key in ("formIds", "sections"):
            values = passage.get(key)
            if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
                issues.append(f"Invalid {key}: {identifier}")
        form_ids = passage.get("formIds")
        if isinstance(form_ids, list) and any(not isinstance(value, str) or value not in {"cf37", "sar7b"} for value in form_ids):
            issues.append(f"Unreviewed form mapping: {identifier}")
        for key in ("title", "text"):
            values = passage.get(key)
            if not isinstance(values, dict) or set(values) != {"en", "es"}:
                issues.append(f"Missing bilingual {key}: {identifier}")
                continue
            for language, value in values.items():
                if not isinstance(value, str) or not value.strip() or len(value) > 1800:
                    issues.append(f"Invalid {language} {key}: {identifier}")
                elif re.search(r"https?://|<[^>]+>|[\x00-\x08\x0b\x0c\x0e-\x1f]", value):
                    issues.append(f"Unsafe passage text: {identifier}")
    for program in sorted(PROGRAMS - covered):
        issues.append(f"Program has no reviewed passage: {program}")
    return issues


class PublicText(HTMLParser):
    """Exclude scripts/styles so a tracking asset revision does not add facts."""
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.hidden = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self.hidden += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self.hidden:
            self.hidden -= 1

    def handle_data(self, value: str) -> None:
        if not self.hidden:
            self.parts.append(value)


def content_fingerprint(body: bytes, content_type: str) -> tuple[str, str]:
    if body.startswith(b"%PDF-"):
        return hashlib.sha256(body).hexdigest(), "pdf-bytes-sha256"
    if "html" not in content_type.lower():
        raise ValueError("Expected a public HTML page or PDF")
    parser = PublicText()
    parser.feed(body.decode("utf-8", errors="replace"))
    normalized = re.sub(r"\s+", " ", " ".join(parser.parts)).strip()
    if len(normalized) < 80:
        raise ValueError("Source contains too little public text")
    if re.search(r"request rejected|access denied|your support id|verify you are human|checking your browser", normalized, re.I):
        raise ValueError("Source returned a challenge page, not agency instructions")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest(), "html-public-text-sha256"


class OfficialRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not official_url(newurl):
            raise ValueError("Source redirected outside the official allowlist")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_fingerprint(source: dict) -> dict:
    identifier = source["id"]
    if not official_url(source.get("url")):
        return {"id": identifier, "status": "unavailable", "reason": "non_official_url"}
    try:
        opener = build_opener(OfficialRedirects())
        request = Request(source["url"], headers={"User-Agent": "Anchor-Public-Source-Review/1.0", "Accept": "text/html,application/pdf"})
        with opener.open(request, timeout=15) as response:
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError("Public source exceeded size limit")
            fingerprint, algorithm = content_fingerprint(body, response.headers.get("content-type", ""))
        return {"id": identifier, "status": "fetched", "sha256": fingerprint, "algorithm": algorithm}
    except HTTPError as error:
        return {"id": identifier, "status": "unavailable", "reason": f"http_{error.code}"}
    except (URLError, TimeoutError, ValueError, OSError):
        return {"id": identifier, "status": "unavailable", "reason": "fetch_or_content_failed"}


def compare_source(source: dict, fetched: dict, previous: dict | None) -> dict:
    result = {"id": source["id"], "title": source["title"], "url": source["url"],
              "reviewedAt": source["reviewedAt"], "jurisdiction": source["jurisdiction"], **fetched}
    if fetched.get("status") != "fetched":
        result["status"] = "unavailable"
    elif not previous or previous.get("url") != source["url"] or not previous.get("sha256"):
        result["status"] = "needs_baseline_review"
    elif previous.get("algorithm") != fetched.get("algorithm") or previous.get("sha256") != fetched.get("sha256"):
        result["status"] = "changed_needs_review"
        result["previousSha256"] = previous.get("sha256")
    else:
        result["status"] = "unchanged"
    # An equal page fingerprint confirms only byte/text stability; it does not
    # extend the manually reviewed date or certify a benefit rule is current.
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Validate the checked-in corpus without network requests")
    parser.add_argument("--report", type=Path, help="Write a JSON report, never an accepted snapshot or corpus update")
    args = parser.parse_args(argv)
    try:
        corpus = load_corpus()
        issues = validate_corpus(corpus)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Knowledge validation failed: {error}", file=sys.stderr)
        return 1
    if issues:
        for issue in issues:
            print(issue, file=sys.stderr)
        return 1
    if args.offline:
        print(f"Knowledge corpus valid: {len(corpus['passages'])} bilingual passages, {len(corpus['sources'])} official sources, version {corpus['version']}.")
        return 0
    baseline = {}
    if SNAPSHOTS.exists():
        snapshots = json.loads(SNAPSHOTS.read_text(encoding="utf-8"))
        baseline = {entry["id"]: entry for entry in snapshots.get("sources", [])}
    with ThreadPoolExecutor(max_workers=6) as executor:
        fetched = list(executor.map(fetch_fingerprint, corpus["sources"]))
    results = [compare_source(source, current, baseline.get(source["id"]))
               for source, current in zip(corpus["sources"], fetched)]
    report = {"version": corpus["version"], "checkedAt": datetime.now(timezone.utc).isoformat(),
              "policy": "Changes require manual source and translation review; no content or review date is automatically approved.",
              "sources": results}
    if args.report:
        target = args.report.resolve()
        if target in {DATA.resolve(), SNAPSHOTS.resolve()}:
            print("The report cannot overwrite accepted knowledge or fingerprints.", file=sys.stderr)
            return 1
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for result in results:
        print(f"{result['id']}: {result['status']}")
    return 0 if all(result["status"] == "unchanged" for result in results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
