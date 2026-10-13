"""Reproducibility, split integrity and bounded evaluation for the local model."""
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from train_document_model import CORPUS, MODEL, train, predict
from evaluate_document_model import evaluate, keyword_baseline


class DocumentModelTests(unittest.TestCase):
    def test_public_model_artifacts_use_portable_lf_bytes(self):
        for path in [CORPUS, MODEL, ROOT / "web/models/evaluation.json"]:
            raw = path.read_bytes()
            self.assertNotIn(b"\r\n", raw, path.name)
            self.assertTrue(raw.endswith(b"\n"), path.name)

    def test_artifact_matches_fictional_corpus(self):
        model = json.loads(MODEL.read_text(encoding="utf-8"))
        self.assertEqual(model["provenance"]["corpusSha256"], sha256(CORPUS.read_bytes()).hexdigest())
        self.assertFalse(model["provenance"]["testUsedForTraining"])
        self.assertIn("No real-world validation", model["provenance"]["limitations"])

    def test_training_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "model.json"
            train(CORPUS, output)
            self.assertEqual(output.read_bytes(), MODEL.read_bytes())

    def test_changing_the_test_split_does_not_train_on_it(self):
        corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
        corpus["test"] = [{"id": "ignored", "text": "A deliberately unrelated test replacement.",
                           "language": "en", "label": "other"}]
        with tempfile.TemporaryDirectory() as directory:
            corpus_path = Path(directory) / "changed-corpus.json"
            output = Path(directory) / "model.json"
            corpus_path.write_text(json.dumps(corpus), encoding="utf-8")
            actual = train(corpus_path, output)
            expected = json.loads(MODEL.read_text(encoding="utf-8"))
            for field in ["vocabulary", "idf", "weights", "bias", "abstention"]:
                self.assertEqual(actual[field], expected[field], field)

    def test_evaluation_reports_actual_counts_and_no_invented_user_study(self):
        actual = evaluate(CORPUS, MODEL)
        expected = json.loads((ROOT / "web/models/evaluation.json").read_text(encoding="utf-8"))
        self.assertEqual(actual, expected)
        self.assertEqual(actual["correct"], sum(row["correct"] for row in actual["results"]))
        self.assertEqual(actual["userStudy"]["participants"], 0)

    def test_baseline_uses_the_same_test_rows_and_reports_observed_results(self):
        report = evaluate(CORPUS, MODEL)
        baseline = report["baseline"]
        self.assertFalse(baseline["trained"])
        self.assertFalse(baseline["testUsedForTuning"])
        self.assertEqual([row["id"] for row in report["results"]],
                         [row["id"] for row in baseline["results"]])
        self.assertEqual(baseline["correct"], sum(row["correct"] for row in baseline["results"]))
        self.assertEqual(sum(sum(row.values()) for row in baseline["confusion"].values()), baseline["testExamples"])
        corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
        self.assertEqual(baseline["correctAbstentions"],
                         sum(keyword_baseline(text) == "unknown" for text in corpus["abstention"]))

    def test_keyword_baseline_handles_accents_ties_and_substrings(self):
        self.assertEqual(keyword_baseline("NÓMINA sueldo bruto pago neto"), "paystub")
        self.assertEqual(keyword_baseline("rent passport"), "unknown")
        self.assertEqual(keyword_baseline("An apparent rentability coefficient"), "unknown")
        self.assertEqual(keyword_baseline("A telescope photograph"), "unknown")

    def test_overlapping_train_test_data_is_rejected(self):
        corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
        corpus["test"][0]["text"] = corpus["train"]["paystub"][0]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "leaky.json"
            source.write_text(json.dumps(corpus), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "overlap"):
                evaluate(source, MODEL)

    def test_sparse_and_unfamiliar_input_abstains(self):
        model = json.loads(MODEL.read_text(encoding="utf-8"))
        for text in ["", "Pay", "Texto borroso 00 11 ??", "Random telescope nebula spectrum"]:
            self.assertEqual(predict(text, model)["kind"], "unknown")


if __name__ == "__main__":
    unittest.main()
