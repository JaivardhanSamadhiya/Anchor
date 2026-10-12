"""Report honest held-out document-classifier results and abstention coverage."""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path

from train_document_model import CORPUS, MODEL, ROOT, LABELS, predict, tokens


# A deliberately simple comparison: fixed, readable bilingual document cues.
# These generic category terms are not fit to either split or changed by the
# evaluator. A unique highest cue count suggests a class; ties/no cues abstain.
# This baseline tests whether the tiny fixture actually needs a learned model.
BASELINE_CUES = {
    "benefit-notice": ("benefit notice", "calfresh", "medi cal", "aviso", "county", "condado", "eligibility"),
    "paystub": ("paystub", "pay stub", "payroll", "gross pay", "gross wages", "net pay", "pay period",
                "nomina", "sueldo bruto", "pago neto", "talon de pago"),
    "rent-proof": ("rent", "rental", "lease", "tenant", "landlord", "alquiler", "renta", "arrendador", "inquilino"),
    "identity": ("identification", "identity", "driver license", "passport", "identificacion", "pasaporte",
                 "licencia de conducir"),
    "utility-bill": ("utility", "electricity", "electric", "kwh", "water bill", "electricidad", "factura de agua",
                     "servicios publicos", "medidor"),
}


def keyword_baseline(text: str) -> str:
    """Suggest one document class from literal cues; never inspect test labels."""
    normalized = " " + " ".join(tokens(text[:100_000])) + " "
    scores = {label: sum(" " + cue + " " in normalized for cue in cues)
              for label, cues in BASELINE_CUES.items()}
    highest = max(scores.values())
    winners = [label for label, score in scores.items() if score == highest]
    return winners[0] if highest and len(winners) == 1 else "unknown"


def confusion_matrix(rows: list[dict]) -> dict:
    labels = LABELS[:-1] + ["unknown"]
    matrix = {label: {actual: 0 for actual in labels} for label in labels}
    for row in rows:
        matrix[row["expected"]][row["actual"]] += 1
    return matrix


def evaluate(corpus_path: Path, model_path: Path) -> dict:
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    model = json.loads(model_path.read_text(encoding="utf-8"))
    training = {text.strip().lower() for texts in corpus["train"].values() for text in texts}
    test = corpus["test"]
    if any(example["text"].strip().lower() in training for example in test):
        raise ValueError("Test/training overlap; evaluation must remain held out.")
    if len({example["id"] for example in test}) != len(test):
        raise ValueError("Test IDs must be unique.")
    rows = []
    baseline_rows = []
    for example in test:
        result = predict(example["text"], model)
        expected = "unknown" if example["label"] == "other" else example["label"]
        rows.append({"id": example["id"], "language": example["language"], "expected": expected,
                     "actual": result["kind"], "correct": result["kind"] == expected,
                     "score": round(result["score"], 6), "margin": round(result["margin"], 6)})
        baseline = keyword_baseline(example["text"])
        baseline_rows.append({"id": example["id"], "language": example["language"], "expected": expected,
                              "actual": baseline, "correct": baseline == expected})
    abstentions = [predict(text, model)["kind"] == "unknown" for text in corpus["abstention"]]
    supported = [row for row in rows if row["expected"] != "unknown"]
    covered = [row for row in supported if row["actual"] != "unknown"]
    baseline_supported = [row for row in baseline_rows if row["expected"] != "unknown"]
    baseline_covered = [row for row in baseline_supported if row["actual"] != "unknown"]
    baseline_abstentions = [keyword_baseline(text) == "unknown" for text in corpus["abstention"]]
    return {
        "schemaVersion": 1, "modelVersion": model["version"], "reviewedAt": "2026-10-12",
        "modelSha256": sha256(model_path.read_bytes()).hexdigest(),
        "corpusSha256": sha256(corpus_path.read_bytes()).hexdigest(),
        "scope": "Separately authored English/Spanish fictional short excerpts; not real-world or user-study evidence",
        "trainingExamples": model["provenance"]["trainingExamples"],
        "testExamples": len(rows), "correct": sum(row["correct"] for row in rows),
        "supportedExamples": len(supported), "coveredSupportedExamples": len(covered),
        "correctCoveredExamples": sum(row["correct"] for row in covered),
        "abstentionExamples": len(abstentions), "correctAbstentions": sum(abstentions),
        "languages": {language: {"total": sum(row["language"] == language for row in rows),
                                   "correct": sum(row["language"] == language and row["correct"] for row in rows)}
                      for language in ["en", "es"]},
        "confusion": confusion_matrix(rows), "results": rows,
        "baseline": {
            "name": "Fixed bilingual keyword cue counts", "version": "keyword-cues-v1",
            "method": "Count distinct literal category cues after accent-insensitive normalization; abstain on ties or no cues",
            "trained": False, "testUsedForTuning": False,
            "cues": {label: list(cues) for label, cues in BASELINE_CUES.items()},
            "testExamples": len(baseline_rows), "correct": sum(row["correct"] for row in baseline_rows),
            "supportedExamples": len(baseline_supported), "coveredSupportedExamples": len(baseline_covered),
            "correctCoveredExamples": sum(row["correct"] for row in baseline_covered),
            "abstentionExamples": len(baseline_abstentions), "correctAbstentions": sum(baseline_abstentions),
            "confusion": confusion_matrix(baseline_rows), "results": baseline_rows,
            "limitations": ["Uses exactly the same small fictional fixture as the model", "No real-world validation",
                            "Literal cues cannot establish document validity or acceptance"],
        },
        "metricDefinitions": {
            "correct": "Correct suggested class, including rejection of unsupported documents",
            "coveredSupportedExamples": "Supported test excerpts where the model made a suggestion rather than abstaining",
            "correctCoveredExamples": "Correct suggestions among those covered excerpts",
            "correctAbstentions": "Rejection of the separate sparse, mixed or unfamiliar text challenge set",
        },
        "userStudy": {"participants": 0, "status": "Not conducted; no participant or impact claims"},
        "limitations": model["provenance"]["limitations"],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--model", type=Path, default=MODEL)
    parser.add_argument("--output", type=Path, default=ROOT / "web/models/evaluation.json")
    args = parser.parse_args()
    report = evaluate(args.corpus, args.model)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Held-out fictional excerpts: {report['correct']}/{report['testExamples']} correct. "
          f"Supported suggestion coverage: {report['coveredSupportedExamples']}/{report['supportedExamples']}. "
          f"Abstention checks: {report['correctAbstentions']}/{report['abstentionExamples']}. "
          f"Keyword baseline: {report['baseline']['correct']}/{report['baseline']['testExamples']} correct; "
          f"{report['baseline']['correctAbstentions']}/{report['baseline']['abstentionExamples']} abstentions. "
          "This is not real-world accuracy.")
