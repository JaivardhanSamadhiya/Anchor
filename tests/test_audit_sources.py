"""Small failure cases for the deployment audit, independent of live services."""
import base64
from datetime import date
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("anchor_audit", Path(__file__).resolve().parents[1] / "scripts/audit_sources.py")
audit_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_module)


class SourceAuditTests(unittest.TestCase):
    def test_registry_reads_metadata_without_executing_javascript(self):
        data = "export const SOURCES = [{id: 'cf377-2', title: 'Official form', url: 'https://www.cdss.ca.gov/form.pdf', checkedAt: '2026-10-09'}]; throw new Error('never executed');"
        self.assertEqual(audit_module.read_sources(data)[0]["id"], "cf377-2")

    def test_private_key_detection_distinguishes_public_anon(self):
        def jwt(role):
            payload = base64.urlsafe_b64encode(json.dumps({"role": role}).encode()).decode().rstrip("=")
            return "eyJhbGciOiJIUzI1NiJ9." + payload + ".c2lnbmF0dXJl"
        self.assertFalse(audit_module.secret_key_present(jwt("anon")))
        self.assertTrue(audit_module.secret_key_present(jwt("service_role")))
        self.assertTrue(audit_module.secret_key_present("sb_secret_0123456789abcdef0123456789"))
        self.assertFalse(audit_module.secret_key_present("sb_publishable_0123456789abcdef0123456789"))

    def test_local_paths_cannot_escape_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(audit_module.safe_local_file(root, "./app.js"), root / "app.js")
            self.assertIsNone(audit_module.safe_local_file(root, "https://example.com/app.js"))
            with self.assertRaises(ValueError):
                audit_module.safe_local_file(root, "../private.env")

    def test_bad_asset_path_and_future_source_date_fail_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.html").write_text('<script src="/app.js"></script>', encoding="utf-8")
            (root / "data.js").write_text("export const SOURCES = [{id:'test',title:'Test',url:'https://example.com/',checkedAt:'2030-01-01'}];", encoding="utf-8")
            report = audit_module.audit(root, root, date(2026, 10, 10))
            self.assertEqual(report["status"], "fail")
            self.assertTrue(any("origin-root" in error for error in report["errors"]))
            self.assertTrue(any("future research" in error for error in report["errors"]))


if __name__ == "__main__":
    unittest.main()
