"""Train Anchor's bounded, local document classifier without external packages.

This is a reproducible multinomial logistic model, not a call to an AI service.
Only the training split is used to fit vocabulary, IDF, parameters or thresholds.
The separately authored test excerpts are evaluated by evaluate_document_model.py.
All supplied examples are fictional; synthetic accuracy is not real-world accuracy.
"""
from __future__ import annotations

import argparse
from collections import Counter
from hashlib import sha256
import json
import math
from pathlib import Path
import random
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "web/models/document-training-fixtures.v1.json"
MODEL = ROOT / "web/models/document-classifier.v1.json"
LABELS = ["benefit-notice", "paystub", "rent-proof", "identity", "utility-bill", "other"]


def tokens(text: str) -> list[str]:
    """Match the browser's NFKD, accent-insensitive English/Spanish tokenizer."""
    normalized = unicodedata.normalize("NFKD", text.lower())
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    return ["#" if word.isdigit() else word for word in re.findall(r"[a-z]+|[0-9]+", normalized)]


def terms(text: str) -> Counter[str]:
    words = tokens(text[:100_000])
    return Counter(words + [a + " " + b for a, b in zip(words, words[1:])])


def vector(text: str, model: dict) -> list[tuple[int, float]]:
    counts = terms(text)
    result = [(i, (1 + math.log(counts[word])) * model["idf"][i])
              for i, word in enumerate(model["vocabulary"]) if counts[word]]
    norm = math.sqrt(sum(value * value for _, value in result))
    return [(i, value / norm) for i, value in result] if norm else []


def probabilities(features: list[tuple[int, float]], model: dict) -> list[float]:
    logits = [bias + sum(row[i] * value for i, value in features)
              for bias, row in zip(model["bias"], model["weights"])]
    peak = max(logits)
    exps = [math.exp(value - peak) for value in logits]
    total = sum(exps)
    return [value / total for value in exps]


def predict(text: str, model: dict) -> dict:
    scores = probabilities(vector(text, model), model)
    ordered = sorted(range(len(scores)), key=lambda i: (-scores[i], i))
    top, runner = ordered[:2]
    vocabulary = set(model["vocabulary"])
    words = set(tokens(text)) - {"#"}
    hits = len(words & vocabulary)
    coverage = hits / len(words) if words else 0
    thresholds = model["abstention"]
    abstain = (model["labels"][top] == "other" or hits < thresholds["minKnownWords"]
               or coverage < thresholds["minCoverage"] or scores[top] < thresholds["minScore"]
               or scores[top] - scores[runner] < thresholds["minMargin"])
    return {"kind": "unknown" if abstain else model["labels"][top],
            "suggestedKind": "unknown" if model["labels"][top] == "other" else model["labels"][top],
            "score": scores[top], "margin": scores[top] - scores[runner]}


def train(corpus_path: Path, output: Path) -> dict:
    source = corpus_path.read_bytes()
    corpus = json.loads(source)
    examples = [(text, LABELS.index(label)) for label in LABELS for text in corpus["train"][label]]
    documents = [terms(text) for text, _ in examples]
    df = Counter(term for document in documents for term in document)
    vocabulary = sorted(sorted((term for term, count in df.items() if count >= 2),
                               key=lambda term: (-df[term], term))[:650])
    model = {
        "schemaVersion": 1,
        "version": "anchor-documents-2026-10-12-v1",
        "algorithm": "multinomial-logistic-tfidf",
        "tokenizer": "nfkd-ascii-unigrams-bigrams-v1",
        "labels": LABELS,
        "vocabulary": vocabulary,
        "idf": [round(math.log((1 + len(examples)) / (1 + df[word])) + 1, 8) for word in vocabulary],
        "weights": [[0.0] * len(vocabulary) for _ in LABELS],
        "bias": [0.0] * len(LABELS),
        # Fixed before evaluating the held-out split. These are ranking gates,
        # not calibrated probabilities or a claim of agency/document validity.
        "abstention": {"minScore": 0.65, "minMargin": 0.20, "minKnownWords": 3, "minCoverage": 0.15},
        "provenance": {
            "corpusSha256": sha256(source).hexdigest(),
            "trainingExamples": len(examples),
            "trainingLanguages": ["en", "es"],
            "trainingSource": "Author-written fictional excerpts; no private records",
            "testUsedForTraining": False,
            "seed": 20261012,
            "epochs": 240,
            "regularization": 0.0005,
            "limitations": ["Short synthetic excerpts only", "No real-world validation",
                            "Scores are not calibrated probabilities", "Not document authentication or eligibility"],
        },
    }
    features = [vector(text, model) for text, _ in examples]
    rng = random.Random(model["provenance"]["seed"])
    order = list(range(len(examples)))
    for epoch in range(model["provenance"]["epochs"]):
        rng.shuffle(order)
        learning_rate = 0.45 / (1 + epoch / 120)
        for example in order:
            scores = probabilities(features[example], model)
            target = examples[example][1]
            for label in range(len(LABELS)):
                error = scores[label] - int(label == target)
                model["bias"][label] -= learning_rate * error
                row = model["weights"][label]
                for index, value in features[example]:
                    row[index] -= learning_rate * (error * value + 0.0005 * row[index])
    model["weights"] = [[round(value, 8) for value in row] for row in model["weights"]]
    model["bias"] = [round(value, 8) for value in model["bias"]]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return model


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--output", type=Path, default=MODEL)
    args = parser.parse_args()
    result = train(args.corpus, args.output)
    print(f"Trained {result['version']} on {result['provenance']['trainingExamples']} fictional excerpts; "
          f"{len(result['vocabulary'])} features; saved {args.output}.")
