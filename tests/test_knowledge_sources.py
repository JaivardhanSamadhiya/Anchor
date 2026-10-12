"""Offline source-maintenance fixtures; no live agency or resident data."""
from copy import deepcopy
from datetime import date
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("anchor_knowledge", Path(__file__).resolve().parents[1] / "scripts/check_knowledge_sources.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class KnowledgeSourceTests(unittest.TestCase):
    def setUp(self):
        self.corpus = module.load_corpus()
        self.today = date(2026, 10, 12)

    def test_current_corpus_is_bilingual_with_all_programs_and_provenance(self):
        self.assertEqual(module.validate_corpus(self.corpus, self.today), [])

    def test_missing_language_or_unofficial_url_fails_offline_review(self):
        corpus = deepcopy(self.corpus)
        del corpus["passages"][0]["text"]["es"]
        corpus["sources"][0]["url"] = "https://unofficial.example/benefits"
        issues = module.validate_corpus(corpus, self.today)
        self.assertTrue(any("bilingual" in issue for issue in issues))
        self.assertTrue(any("Non-allowlisted" in issue for issue in issues))

    def test_stale_future_or_duplicate_reviews_are_rejected(self):
        corpus = deepcopy(self.corpus)
        corpus["sources"][0]["reviewedAt"] = "2025-01-01"
        corpus["sources"][1]["reviewedAt"] = "2027-01-01"
        corpus["sources"].append(deepcopy(corpus["sources"][0]))
        issues = module.validate_corpus(corpus, self.today)
        self.assertTrue(any("Duplicate source" in issue for issue in issues))
        self.assertGreaterEqual(sum("review needs attention" in issue for issue in issues), 2)

    def test_page_changes_require_review_and_never_mutate_an_accepted_snapshot(self):
        source = self.corpus["sources"][0]
        baseline = {"url": source["url"], "sha256": "old-public-text", "algorithm": "html-public-text-sha256"}
        original = deepcopy(baseline)
        current = {"id": source["id"], "status": "fetched", "sha256": "changed-public-text", "algorithm": "html-public-text-sha256"}
        result = module.compare_source(source, current, baseline)
        self.assertEqual(result["status"], "changed_needs_review")
        self.assertEqual(result["previousSha256"], "old-public-text")
        self.assertEqual(baseline, original)
        self.assertEqual(result["reviewedAt"], source["reviewedAt"])

    def test_fetch_failures_and_new_sources_never_pass_as_unchanged(self):
        source = self.corpus["sources"][0]
        self.assertEqual(module.compare_source(source, {"status": "unavailable", "reason": "http_403"}, None)["status"], "unavailable")
        self.assertEqual(module.compare_source(source, {"status": "fetched", "sha256": "new", "algorithm": "html-public-text-sha256"}, None)["status"], "needs_baseline_review")

    def test_tracking_script_changes_do_not_change_public_text_fingerprint(self):
        original = b'<html><body><h1>Official public instructions</h1><p>Contact the county office to discuss missing verification and obtain reporting instructions.</p><script>trackingRevision=1</script></body></html>'
        changed = original.replace(b'trackingRevision=1', b'trackingRevision=999')
        self.assertEqual(module.content_fingerprint(original, "text/html"), module.content_fingerprint(changed, "text/html"))
        meaningful = original.replace(b'missing verification', b'renewal appointment')
        self.assertNotEqual(module.content_fingerprint(original, "text/html"), module.content_fingerprint(meaningful, "text/html"))

    def test_challenge_pages_and_nested_malformed_metadata_cannot_pass_review(self):
        challenge = b'<html><title>Request Rejected</title><p>Your support ID is a server-generated identifier. Contact the administrator for assistance with this request.</p></html>'
        with self.assertRaises(ValueError):
            module.content_fingerprint(challenge, "text/html")
        corpus = deepcopy(self.corpus)
        corpus["sources"][0]["jurisdiction"] = {"private": "malformed"}
        corpus["passages"][0]["program"] = {}
        corpus["passages"][0]["intents"] = [{}]
        corpus["passages"][0]["formIds"] = 42
        self.assertGreaterEqual(len(module.validate_corpus(corpus, self.today)), 4)

    def test_canonical_data_parser_rejects_executable_javascript(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "malformed.ts"
            target.write_text('export const KNOWLEDGE_DATA = {"version": (() => "private")() } as const;', encoding="utf-8")
            with self.assertRaises(ValueError):
                module.load_corpus(target)

    def test_official_urls_reject_credentials_plain_http_and_external_redirects(self):
        for value in ("http://www.usa.gov/food-stamps", "https://private:secret@www.usa.gov/food-stamps", "https://www.usa.gov.attacker.invalid/", "https://www.usa.gov:444/", "file:///resident-document.pdf"):
            self.assertFalse(module.official_url(value))
        self.assertTrue(module.official_url(self.corpus["sources"][0]["url"]))


if __name__ == "__main__":
    unittest.main()
