# Local document intelligence and paperwork readiness

Anchor includes a real, small machine-learning model that runs in the browser.
It suggests whether readable text resembles a benefit notice, paystub, rent
receipt / rental agreement, identity document, utility bill, or unsupported
document. The suggested type is a preparation aid. It is not document
authentication, a determination of eligibility, or a claim of county acceptance.

## Model and reproducible evaluation

`scripts/train_document_model.py` uses standard-library Python to train a
multinomial logistic classifier. Unicode normalization makes English and Spanish
accent variants comparable. The features are TF-IDF weighted unigrams and
bigrams, with L2 normalization. Training uses a deterministic seed, 240 shuffled
epochs, and a regularized softmax objective.

The public artifact is `web/models/document-classifier.v1.json`: 408 features,
six class weight vectors, vocabulary, IDF values, bias, abstention gates, and
provenance. No resident files are part of training. The source corpus contains
84 author-written, entirely fictional excerpts. The 24 held-out test excerpts
were authored separately and are not used for vocabulary, IDF, weights, or
threshold selection. The model has not been validated on real-world documents,
longer page layouts, unusual fonts, or degraded OCR.

```sh
python scripts/train_document_model.py
python scripts/evaluate_document_model.py
python -m unittest discover -s tests -p test_document_model.py
node --test tests/document-intelligence.test.mjs tests/evidence-readiness.test.mjs
```

The reproducible held-out report, `web/models/evaluation.json`, currently records
24 / 24 correct classifications or appropriate unsupported-document rejections
on those fictional short excerpts. The 20 supported excerpts each received a
suggestion. All six separate sparse, mixed, and unfamiliar text challenges were
rejected. Those results describe this small synthetic test set; they are not a
percentage accuracy claim for residents or real agency paperwork. The report
records **zero user-study participants** because a user study has not been
conducted. Public UI should retain these limitations beside the counts.

The report also runs a transparent deterministic baseline on exactly the same
24 excerpts and six rejection challenges. Its fixed bilingual literal cues use
accent-insensitive normalization, count distinct category cues, and reject ties
or text without a cue. The evaluator never learns or adjusts those cues from
test labels. The baseline currently also scores **24 / 24** on the held-out
excerpts and **6 / 6** on the separate rejection challenges. This small fixture
therefore shows **no measured advantage of the learned model over the keyword
baseline**. Both methods need independent real-document evaluation before any
claim of superiority, robustness, or resident accuracy. Per-example baseline
results, its full cue list and confusion matrix are included in the public JSON.

Browser and Python inference use the same vocabulary, normalization and model.
Source tests compare actual browser results against the recorded Python report.
Python checks reproduce the exact model bytes and verify that replacing the test
split does not change learned parameters. A SHA-256 links each artifact to its
corpus and evaluation.

The softmax score is a ranking value, **not a calibrated probability**. Do not
present it as a confidence percentage. Fixed gates require at least three known
words, vocabulary coverage, a top score of 0.65, and a class margin of 0.20.
Sparse, mixed, or unsupported text produces `unknown`. Scores never change
confirmed notice deadlines or checklist statuses. English and Spanish labels
are available through `documentKindLabel`.

## Browser integration

The static build bundles these canonical TypeScript domain entries:

- `src/domain/document-intelligence.ts`
- `src/domain/evidence-readiness.ts`

Load the public JSON once using `loadDocumentModel(json)`. That validator rejects
unexpected versions, class ordering, dimensions, non-finite values, and weakened
review gates. Call `inspectDocumentText(readableText, model)` locally after PDF or
image text extraction. It returns a classification, source-anchored month and
amount candidates, explicitly labeled person candidates, and a UI fingerprint.
The source spans refer to the exact readable text supplied to the function.
Coordinate highlights must be resolved against the PDF/OCR page text by the
reader; this classifier itself does not infer geometry from a plain string.

`web/readiness-ui.js` connects these modules to **Check packet**. Add a supporting
file, choose its notice, and review the suggested facts in the confirmation dialog.
New PDF/image imports preserve page/word rectangles. The
`src/domain/source-locations.ts` resolver locates exact normalized wording against
those rectangles; the original-page view stays unhighlighted when no exact match
is available. Existing imports without layout metadata can still be read and
downloaded.

Each inferred detail remains a proposal. The resident checks the original and
confirms the document kind, reporting month, person, and any optional amount.
Payment dates are exposed separately from reporting-period candidates. Missing
years, invalid dates, ambiguous numeric month/day order, and unlabeled amounts
are not guessed. A reading limit of 100,000 characters prevents an oversized
file from monopolizing the UI and is disclosed when text was shortened.

`EvidenceDocument` includes `id`, `name`, optional `noticeId`, `requestIds`,
`attachmentId`, `text`, `sha256`, `insight`, and a `confirmation` object. The
confirmation fields are `kind`, `month` (`YYYY-MM`), `person`, `amountCents`,
`amountKind`, `amountBasis` (`monthly` or `per-payment`), and `checked`. Only
`checked === true` is treated as a reviewed fact. Store metadata with the
resident's private notice workspace; keep file bytes in the existing local or
private-account attachment store. These inputs must never enter public model
artifacts or public AI prompts.

The fingerprint is deliberately non-cryptographic and is only an internal UI
key. Duplicate checks use a genuine file SHA-256, or full normalized readable
text when a file hash is unavailable. Matching extracted text does not establish
that images, annotations or signatures are the same.

## Paperwork checks

Call `evaluateEvidenceReadiness({ notices, documents, formDrafts, language })`.
The function is pure and returns `findings`, per-request candidate status,
`checkedDocuments`, and a count summary. It considers selected `document`
requests from supported notices, preserving the actual request quote and source
span. It never invents requirements from unchecked examples elsewhere in a
notice, and it never treats an interview or form step as missing evidence.

Checks cover:

- No compatible evidence candidate for a requested item, even if an earlier
  checklist was marked complete.
- Unchecked document details or an unchecked reporting period.
- A checked month that differs from the explicit month and year in a request.
- Multiple requested months, which remain a manual period comparison.
- A SAR 7 report month that differs from an evidence request's month, while
  acknowledging the steps may legitimately serve different purposes.
- Different monthly rent amounts between a reviewed document and the form.
- Different explicitly reviewed monthly gross amounts for the same named person
  and form income row. Net pay and individual paychecks are never substituted
  for gross monthly income. Multiple records are not summed by assumption.
- Duplicate file contents or identical extracted text, without deleting records.
- Unsupported evidence wording, which produces a manual review prompt.

An attachment explicitly associated with another notice or different request
cannot silently satisfy this request. Findings identify affected document IDs,
request IDs, source quotes and, where applicable, the exact form field. Spanish
public finding text retains original evidence and dates. The function does not
change answers, deadlines, submission history, or agency acknowledgement.

`matched` means that a user-checked candidate is present without one of these
bounded consistency findings. It does not mean complete coverage of agency
requirements, validity of a proof, approval, or permission to submit.

Removing a supporting document **from checks** removes that notice's evidence
metadata; it is not a promise to erase a separately stored original. Workspace
deletion and saved-file cleanup use the existing account controls. Preserve the
original externally if it is an important record.

## Privacy and further validation

Both domain modules contain no network, storage, telemetry, or Gemini calls.
The static model and evaluation are public; resident document text is private.
Run classification locally and preserve the existing opt-in private account
save controls. The free-tier public-information assistant must not receive raw
form answers, uploaded document text, people, amounts, or document coordinates.

Before making real-world performance claims, collect appropriately consented,
de-identified evaluation material, have independent reviewers label it, include
document and OCR failures, and report abstention coverage alongside errors.
Conduct a separate usability study with fictional paperwork and report actual
participant counts, task completion, and observed accessibility problems. Neither
passing software tests nor a perfect synthetic score is evidence of resident
outcomes.

Source geometry has a whole-file limit of 1,200 boxes and a 120,000-byte box budget, with coordinates rounded to four decimal places. Oversized chunks are omitted rather than clipped. This optional metadata cannot grow with every dense PDF page; the complete readable source text and saved original remain available. When coordinate metadata is omitted, Anchor warns the resident and abstains from highlighting any area it cannot locate exactly.
