"""Small failure cases for the deployment audit, independent of live services."""
import base64
from datetime import date
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("anchor_audit", Path(__file__).resolve().parents[1] / "scripts/audit_sources.py")
audit_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_module)


class SourceAuditTests(unittest.TestCase):
    def form_fixture(self, root, **updates):
        """A small public-asset fixture; no real resident files are needed."""
        forms = root / "forms"
        forms.mkdir(exist_ok=True)
        raw = b"%PDF-1.7\npublic form fixture\n%%EOF\n"
        (forms / "example.pdf").write_bytes(raw)
        record = {
            "file": "example.pdf", "title": "Official blank", "agency": "CDSS",
            "source": "https://www.cdss.ca.gov/forms/example.pdf",
            "catalogue": "https://www.cdss.ca.gov/inforesources/forms-brochures/",
            "sha256": hashlib.sha256(raw).hexdigest(), "pages": 2,
        }
        record.update(updates)
        manifest = {"reviewedAt": "2026-10-10", "assets": [record]}
        (forms / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
        return manifest

    def check_forms(self, root):
        errors, warnings, assets = [], [], set()
        result = audit_module.audit_official_forms(root, root, date(2026, 10, 10), errors, warnings, assets)
        return result, errors, warnings, assets

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

    def test_official_public_form_checksums_are_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.form_fixture(root)
            result, errors, warnings, assets = self.check_forms(root)
            self.assertEqual(errors, [])
            self.assertEqual(warnings, [])
            self.assertEqual(result["official_form_checksums_verified"], 1)
            self.assertIn("forms/example.pdf", assets)

    def test_tampered_official_pdf_fails_provenance_audit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.form_fixture(root)
            with (root / "forms/example.pdf").open("ab") as file:
                file.write(b"changed without rechecking the mapping")
            result, errors, _, _ = self.check_forms(root)
            self.assertEqual(result["official_form_checksums_verified"], 0)
            self.assertTrue(any("checksum differs" in error for error in errors))

    def test_unsafe_form_paths_and_unofficial_urls_fail_without_reading_outside_artifact(self):
        for path in ("../private.pdf", "/absolute.pdf", "C:\\private.pdf", "https://example.com/a.pdf", "..%2fprivate.pdf", "nested/example.pdf"):
            with self.subTest(path=path), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.form_fixture(root, file=path)
                _, errors, _, _ = self.check_forms(root)
                self.assertTrue(any("unsafe PDF file path" in error for error in errors))
        for source in ("http://www.cdss.ca.gov/forms/a.pdf", "https://cdss.ca.gov.evil.example/a.pdf", "https://user@www.cdss.ca.gov/a.pdf"):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.form_fixture(root, source=source)
                _, errors, _, _ = self.check_forms(root)
                self.assertTrue(any("HTTPS CDSS source" in error for error in errors))

    def test_guided_forms_require_source_manifest_in_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "form-assistance.js").write_text("// guided forms", encoding="utf-8")
            report = audit_module.audit(root, root, date(2026, 10, 10))
            self.assertTrue(any("Missing forms/sources.json" in error for error in report["errors"]))

    def test_form_review_dates_and_page_bounds_are_checked(self):
        for pages in (0, 41, True, "11"):
            with self.subTest(pages=pages), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.form_fixture(root, pages=pages)
                _, errors, _, _ = self.check_forms(root)
                self.assertTrue(any("page count" in error for error in errors))
        for reviewed in ("2026-10-11", "2025-10-10", "10/10/2026"):
            with self.subTest(reviewed=reviewed), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                manifest = self.form_fixture(root)
                manifest["reviewedAt"] = reviewed
                (root / "forms/sources.json").write_text(json.dumps(manifest), encoding="utf-8")
                _, errors, _, _ = self.check_forms(root)
                self.assertTrue(any("review" in error for error in errors))

    def test_manifest_cannot_silently_change_a_mapped_template(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.form_fixture(root)
            (root / "form-assistance.js").write_text("// guided forms", encoding="utf-8")
            catalogue = root / "src/domain/form-assistance.ts"
            catalogue.parent.mkdir(parents=True)
            catalogue.write_text("localPath: './forms/example.pdf', sha256: '" + "0" * 64 + "'", encoding="utf-8")
            _, errors, _, _ = self.check_forms(root)
            self.assertTrue(any("field-mapping catalogue" in error for error in errors))

    def test_editable_derivative_requires_verified_unchanged_original_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.form_fixture(root)
            original = manifest["assets"][0]
            derived = dict(original, file="example-editable.pdf", derivedFrom="example.pdf",
                           sourceSha256=original["sha256"], transformation="empty-password-decryption")
            (root / "forms/example-editable.pdf").write_bytes((root / "forms/example.pdf").read_bytes())
            manifest["assets"].append(derived)
            registry = root / "forms/sources.json"
            registry.write_text(json.dumps(manifest), encoding="utf-8")
            _, errors, _, _ = self.check_forms(root)
            self.assertEqual(errors, [])
            for change in ({"sourceSha256": "0" * 64}, {"pages": 3},
                           {"derivedFrom": "example-editable.pdf"},
                           {"transformation": "recreated-from-scratch"}):
                with self.subTest(change=change):
                    manifest["assets"][1] = dict(derived, **change)
                    registry.write_text(json.dumps(manifest), encoding="utf-8")
                    _, errors, _, _ = self.check_forms(root)
                    self.assertTrue(any("invalid original-form provenance" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
