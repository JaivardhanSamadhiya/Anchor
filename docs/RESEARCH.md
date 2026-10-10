# Anchor source provenance and supported scope

Research checked **October 9, 2026**. The date records when these public pages were checked; it does not establish that every county letter uses the same wording or that a future policy change is covered. The app’s public source registry is in `dist/data.js`.

Anchor’s prototype turns supported CalFresh correspondence into a draft action plan. It extracts visible requests, dates, and appointments and asks the user to verify them. It provides official county contact and submission links. It does not make eligibility decisions, file an application, contact an agency, certify completion, or promise continued benefits.

## Form provenance

| Source | Verified information | Prototype use |
| --- | --- | --- |
| [CDSS forms directory](https://www.cdss.ca.gov/inforesources/forms-brochures/forms-alphabetic-list/a-d) | Lists CF 377.2 (9/18) and CF 377.6 (8/13). It separately lists CF 377.2B, CF 377.2C, CF 377.2D, CF 386, and CF 387. | Supported identifiers must be specific; related forms are not interchangeable. |
| [CF 377.2 (9/18)](https://www.cdss.ca.gov/Portals/9/FMUForms/A-D/CF%20377.2.pdf?ver=2018-09-20-141948-567) | Includes a certification end date and renewal instructions. Standard instructions refer to submitting the application by the 15th day of the last certification month, completing an interview, and providing requested information. An interview appointment is described as separate correspondence. | Recognize the expiration/renewal family and organize explicit dates. The sample’s appointment appears in a visibly fictional supplemental reminder. |
| [CF 377.6 (8/13)](https://www.cdss.ca.gov/cdssweb/entres/forms/english/cf377.6.pdf) | Requests information following a reported household change. Its selectable circumstances and county-filled request/date matter. It describes contacting the county for help or additional time. | Recognize requested verification and explicit return dates. No universal document requirement or automatic termination consequence is inferred. |

Versions are the revisions displayed in the official directory and PDF, not a claim that a form was newly released in 2026. The CF 377.2 PDF also has a hearing-rights reverse side. Anchor is not a hearing-rights or appeals calculator; it must not replace the complete correspondence. Form substitutions, county variations, other languages, scanned layouts, and poor OCR need further validation. A known identifier does not prove all extracted fields are correct. Unknown or ambiguous text requires review, and a form variant such as CF 377.2B must not be matched as CF 377.2.

## Official local channels

| County | Verified contact and location | Official sources |
| --- | --- | --- |
| Santa Clara | CalFresh contact: (408) 758-3800. Published phone hours are Monday–Friday, 8 AM–5 PM, except county holidays. Benefits Assistance Center: 1867 Senter Road, San Jose, CA 95112. Current recipients are directed to their assigned worker’s number on their notice when available. | [Contacts, offices, and accommodations](https://ssa.santaclaracounty.gov/departments/department-employment-and-benefit-services/contact-department-employment-and-benefit) |
| Santa Clara | County page links BenefitsCal for applying, managing benefits, and submitting documents. It also lists mail, fax, and office/drop-box options. Verification examples are conditional; county staff determine what is needed and can help obtain information. | [Apply and submit documents](https://ssa.santaclaracounty.gov/apply-public-benefits) |
| San Mateo | Human Services Agency call center: (800) 223-8383, Monday–Friday, 8 AM–5 PM. Regional office: 2500 Middlefield Road, Redwood City, CA 94063. This street address is an office location, not the published mailing address. | [Phone, mail, and fax](https://www.smcgov.org/hsa/apply-mail-phone-or-fax), [office locations](https://www.smcgov.org/hsa/office-locations) |
| San Mateo | CalFresh page links BenefitsCal and describes other application channels and interpretive services. Separate verification page lists BenefitsCal, mail, county upload, office drop-off, and fax options. | [Apply for CalFresh](https://www.smcgov.org/hsa/apply-calfresh), [submit verifications](https://www.smcgov.org/hsa/submit-verifications) |

The contact card exposes one verified office per county and links to the full county page for alternatives. It uses the county’s published hours without estimating holiday closures or wait times. BenefitsCal is an external official destination linked by both counties; Anchor has no agency integration or assumed public API. A link or phone number does not confirm receipt of documents. A user should keep any confirmation supplied by the receiving agency.

## Original synthetic demo data

Every built-in notice is prominently labeled **FICTIONAL PRACTICE NOTICE** and is original simplified correspondence, not a reproduction of an official template or a county-issued letter. No actual person, name, case number, worker identity, or government logo appears. County names are scenario context only. All dates, appointments, and document requests are fictional.

| Fixture ID | Intended demonstration | Expected review boundary |
| --- | --- | --- |
| `renewal` | CF377.2 marker; notice October 9, 2026; submit October 15; certification ends October 31; a fictional supplemental interview reminder for October 20 at 10 AM. | Dates and appointment must be checked. The appointment method is intentionally unspecified. October 15 aligns the sample with the standard form’s timing, but real input dates must not be calculated from this sample. |
| `verification` | CF377.6 marker; explicit request for August and September pay stubs and proof of rent; return date October 24, 2026; an unchecked item. | Checklist reflects this sample’s selected requests only. It does not imply every household needs two months of pay stubs or rent proof. |
| `conflicting-dates` | CF377.6 marker; two submission dates for one request: October 23 and October 26, 2026. | Flag conflict and retain both pieces of evidence. Do not choose a controlling date or enable reliance on an unreviewed reminder. |

Fixtures are designed to test inspectable extraction and user correction, not to establish accuracy on unseen real letters. A contest demonstration should distinguish functioning local software from future partnerships or validation. No claim that Anchor has reduced benefit losses, served real households, achieved county endorsement, or obtained broad multilingual accuracy is supported by this research.

## Safe interpretation rules

- Preserve the evidence line next to each extracted field and treat an extracted deadline as unconfirmed until the user reviews it.
- Distinguish the notice date, submission date, certification end, and appointment; not every date is a deadline.
- Require review for conflicting dates, unsupported forms, missing request details, missing appointment method, or uncertain OCR.
- Show selected/requested documents rather than a generic mandatory-document list. Do not infer that an unchecked option was requested.
- The county resolves what is acceptable, whether more time is available, and what steps apply to the household. Anchor cannot decide those questions from a form marker.
- Never derive legal, eligibility, appeal, benefit-continuity, or outcome guarantees from these sample dates or form summaries.

For broader real-world support, independently validate complete county-issued examples with consent, redacted test material, language specialists, and service professionals. Measure field extraction errors, review success, and task completion before making impact claims. These are future validation needs, not completed activities.
