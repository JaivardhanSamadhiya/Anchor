# Anchor: impact hypothesis and validation plan

Anchor’s intended impact is to help a resident understand a supported benefit notice, identify the requested next steps, and retain enough evidence to follow up with a person. The first scope is CalFresh renewal and verification correspondence in Santa Clara and San Mateo counties. There are no measured household outcomes, pilots, agency endorsements, or demonstrated reductions in benefit loss at this stage.

## Why this problem and scope

The official CF377.2 expiration notice describes several distinct renewal steps, including filing, an interview, and requested verification. The CF377.6 information-request form depends on a household’s reported change, the county’s selected circumstances, and the filled-in request/date. A useful action tool must preserve those distinctions rather than assume a list of documents or a universal deadline. [CDSS CF377.2](https://www.cdss.ca.gov/Portals/9/FMUForms/A-D/CF%20377.2.pdf?ver=2018-09-20-141948-567), [CDSS CF377.6](https://www.cdss.ca.gov/cdssweb/entres/forms/english/cf377.6.pdf).

Both counties already offer application and document channels. Santa Clara also describes help with obtaining verification, interpreting language, and understanding forms. San Mateo lists multiple ways to submit verification and a number to call with questions. These establish the practical service handoff Anchor can support; they do not establish how many residents currently miss deadlines. [Santa Clara application and verification guidance](https://ssa.santaclaracounty.gov/apply-public-benefits), [Santa Clara contact and accommodations](https://ssa.santaclaracounty.gov/departments/department-employment-and-benefit-services/contact-department-employment-and-benefit), [San Mateo verification channels](https://www.smcgov.org/hsa/submit-verifications).

The product hypothesis is that connecting each draft task to its exact source, separating preparation from submission, and making a portable summary will reduce avoidable confusion. This is an inference to test, not a demonstrated effect. The app begins with a narrow scope so failures can be inspected and corrected before adding other benefit programs or languages. Source checks and revision caveats are documented in [RESEARCH.md](RESEARCH.md).

## What to measure

| Question | Proposed measure | What it can establish |
| --- | --- | --- |
| Does extraction preserve the source? | For each output field, verify that its quote, line, and offsets exactly match the input. Independently label the requested action, date kind, date value, and checkbox state. | Traceability and field-level correctness on the tested collection. |
| Does the app avoid misleading certainty? | Count unsupported documents that receive an inferred plan, conflicting dates that go unflagged, unchecked options mistaken for requests, and invalid dates exported. | Specific failure modes; a small test cannot prove they never occur. |
| Can a person use the plan? | Observe whether a participant identifies the submission date, distinguishes certification end and appointment, finds the source, and selects the requested evidence without facilitator correction. | Usability for the recruited participants and scenarios. |
| Does review help catch errors? | Introduce clearly fictional OCR errors and conflicting dates. Record corrections, unresolved items, and whether users mistakenly confirm an unresolved field. | Whether the review step is understood and useful. |
| Is the handoff useful? | Ask service professionals to use a sample summary to locate original requests, confirmation labels, remaining questions, and user-entered records. | Handoff completeness and clarity, not agency acceptance. |
| Does local operation work? | Test PDF, scan, image, receipt save/download, reload persistence, cached offline launch, offline reader preparation, storage failures, and clearing data. Inspect runtime network requests during imports. | Behavior on the tested devices, browsers, and network conditions. |

Separate parser performance on correctly extracted text from OCR performance on images. Report field precision/recall, abstention rate, and errors by notice family and input quality. Never report recognition of the three built-in fixtures as broad accuracy. Distinguish exports created from calendar imports completed; Anchor cannot observe whether an external calendar notification fired.

## A feasible staged study

**Stage 1 — source and scenario review.** Ask a benefits navigator or county service professional to review the supported form definitions and fictional examples. This would be a request for review, not an existing partnership. Maintain a revision matrix for each supported form, including unsupported variants. Correct scope and wording before testing with residents.

**Stage 2 — technical benchmark.** Begin with a small, independently labeled collection of fictional, public blank-form-based, and consented redacted examples. Keep a held-out set separate from parser development. Include straight scans, angled phone photos, faint text, checkbox ambiguity, missing years, relative dates, multiple form codes, and contradictory requests. Public blank forms do not reproduce real county wording, so report their provenance separately.

**Stage 3 — moderated usability.** A proposed first round is 8–12 adult volunteers using fictional scenarios, including people comfortable in English or Spanish and people with different levels of digital confidence. No one is recruited yet. Obtain consent, allow stopping, avoid collecting real benefit records, and make assistance available. Test keyboard use, zoom, a narrow phone viewport, source highlighting, and the distinction between checked, prepared, and recorded. Review Spanish interface wording with a fluent reviewer; this does not validate Spanish notice parsing.

**Stage 4 — limited real-context evaluation.** Only after resolving critical errors, consider a consented evaluation with a service organization. Residents would continue using official channels and retain human support. Define who handles uncertain requests, protect records, and have participants verify their own dates. Any resulting report should state recruitment, sample size, dates, scope, devices, failures, and limitations. A reduction in misunderstanding would not by itself prove reduced benefit loss.

## Release gates and honest claims

Before broadening access, require exact source-span checks to pass; review every observed wrong date or selected-document error; verify that unsupported forms abstain; and confirm that unreviewed dates cannot enter a calendar export. These are proposed quality gates, not proof of universal correctness. Accessibility review and real-device testing must be reported separately from automated tests.

Publish findings with denominators. For example, report how many participants correctly identified the sample’s submission date out of how many attempted the task, along with assistance and mistakes. Collect only the study data needed for that question. Avoid uploading actual case numbers, sensitive documents, or receipt content into an analytics system. If later evaluating renewal completion, rely on consented, independently verified outcomes and a study design that separates Anchor’s contribution from navigator help and other factors.

The current defensible claim is functional: **Anchor can turn supported English practice correspondence into an inspectable draft plan, let the user check dates, preserve local records, and export a handoff.** The intended social outcome is better follow-through on vital services. Its magnitude remains to be measured.
