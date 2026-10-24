# Anchor — Neighborhood Hacks submission draft

## Project name

Anchor

## Elevator pitch

Anchor turns confusing benefits notices into clear next steps, guided official forms, and timely reminders—helping neighbors act on the support they depend on.

## About the project

### Inspiration

While volunteering at my local food bank, I liked talking with the people I was serving. I heard about difficulties with CalFresh paperwork: people could not always understand what a form required, and calls for help sometimes left them confused about what to do next. I wanted to make that next step easier to understand and act on.

I grounded that experience in local evidence. Santa Clara County reported **129,794 CalFresh participants as of July 1, 2025**. Its SAR 7 handbook also identifies failure to submit a complete required report by the extended filing date as a reason for discontinuance. That makes clear why understandable instructions and complete preparation matter in my community. [County annual report](https://files.santaclaracounty.gov/exjcpb1491/2026-02/debs-annual-report-2025.pdf?VersionId=Ux94RaVNZW0h7Hh8nEBq3Z7JLwJDDuDb), [county reporting guidance](https://stgenssa.sccgov.org/debs/program_handbooks/calfresh/assets/CalFresh/SAR7Processing/Defs.htm).

I focused Anchor on the gap between receiving a notice and preparing a response: understanding the request, gathering proof for the correct period, completing the right form, and following through. My starting community is Santa Clara County, with additional resources for neighboring San Mateo County.

### What it does

I built a connected workspace for benefits paperwork:

- **Understand the request.** I added local PDF reading and English/Spanish OCR for supported notices. Potential dates and requested materials link back to original wording for review.
- **Catch preparation problems.** I combined document classification with checks for missing proof, reporting-period mismatches, and compatible facts. For example, Anchor flags an August paystub when a notice asks for September income proof.
- **Prepare the actual form.** I mapped guided answers onto official CF 37 and SAR 7B PDFs. Users can see answers appear on the document and download the complete, editable, unsigned draft.
- **Get contextual help.** I placed Ask Anchor beside form questions and built a searchable library of reviewed public guidance. Optional AI explains approved public topics; uploaded notices and private form answers are excluded from AI requests.
- **Follow through.** I added task dependencies, optional Calendar reminders, selected appointment packets, and user-recorded submission history.

I included guest use, Spanish guidance, mobile layouts, keyboard-accessible controls, reduced-motion support, and cached core tools. Google sign-in adds optional private workspace synchronization. The original official PDFs retain their source language, and cloud features require internet access.

### How I built it

I used TypeScript for typed workflow logic, form mappings, document inference, and retrieval, with JavaScript, HTML, and CSS for the browser interface.

I used Python to train and evaluate a small TF-IDF/logistic-regression document classifier, then implemented its inference in the browser. I kept predictions separate from confirmed facts and allowed unfamiliar documents to remain unknown. PDF.js and Tesseract.js handle reading and OCR; pdf-lib writes guided answers into verified PDF fields.

I modeled preparation tasks as a dependency graph and used BM25 search over reviewed bilingual passages. Gemini explanations run through Supabase Edge Functions using bounded public-topic identifiers. SQL and PostgreSQL support ownership policies, revision-aware saving, and assistant quotas. Supabase provides authentication, persistence, and private file storage; GitHub Pages hosts the frontend.

I used automated browser and domain tests, reproducible model evaluation, and GitHub Actions to check releases. Each component has a specific responsibility, with source documents and user confirmation kept visible throughout the workflow.

I used AI-assisted coding during development.

### Challenges I ran into

I found that reading a document and understanding what action it requires are different problems. A notice can contain several dates, while a supporting document can be readable but cover the wrong month. I preserved original evidence, distinguished date purposes, and required confirmation before treating inferred details as reviewed facts.

I also had to map guided answers to real PDF fields while preserving every page and leaving signatures blank. Making all of that understandable required careful navigation, contextual help, and a clear next action.

Another challenge was keeping cloud assistance useful without sending private case material to the AI provider. I separated local document processing from the public-guidance explanation path.

### Accomplishments that I'm proud of

I'm proud that I connected a confusing notice to a reviewable plan, supporting-document checks, and an actual prepared official form. The wrong-month warning is especially meaningful because it helps someone inspect a specific preparation problem before submitting their paperwork.

I'm also proud of the live PDF workflow, the bilingual guidance, and the ability to choose exactly which materials go into an appointment packet. I published a reproducible fictional model benchmark and a usability-study protocol, keeping software verification separate from claims about real resident outcomes.

### What I learned

I learned that civic technology needs a clear relationship between a suggestion and its evidence. A useful system must communicate uncertainty and give people a way to check its work.

Building Anchor also taught me how to connect machine learning, search, document processing, authentication, and database permissions around one practical workflow. My food-bank conversations kept the goal concrete: help someone understand and complete their next step.

### What's next

I want to test Anchor with consenting local adults and benefits navigators using fictional paperwork. I plan to measure task completion, reporting-period errors, preparation time, and the amount of help needed, including feedback from Spanish-speaking and mobile users.

I then want to improve the confusing steps, strengthen source maintenance, and expand verified form coverage. I have not yet conducted a resident usability study or measured benefit retention. My next milestone is evidence that people can complete the workflow more clearly and confidently.

## Built with — 25 entries

TypeScript; JavaScript; Python; SQL; HTML5; CSS3; PostgreSQL; Supabase; Supabase Edge Functions; Deno; Google Gemini API; Google Identity Services; Google Calendar API; PDF.js; pdf-lib; Tesseract.js; IndexedDB; Service Workers; Web Workers; GitHub Pages; GitHub Actions; Node.js; esbuild; Playwright; Zippopotam.us API.

Technical methods to explain in the description/video: TF-IDF, logistic regression, BM25 retrieval, dependency graphs, source-coordinate matching, row-level ownership policies, and revision-aware synchronization. These are implemented methods, not additional product integrations.

## Links

- Try it: https://jaivardhansamadhiya.github.io/Anchor/
- Public source: https://github.com/JaivardhanSamadhiya/Anchor
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Model evaluation and limitations: [DOCUMENT_INTELLIGENCE.md](DOCUMENT_INTELLIGENCE.md)
- Future usability-study protocol: [USABILITY_STUDY.md](USABILITY_STUDY.md)

Judges can start with the fictional case as guests. Optional accounts, adult-only AI explanations, and Calendar connections have separate access requirements.

## Demo format and preparation

Target approximately **4 minutes 30 seconds**, within the event's required 2–6 minutes. Use a narrated screen recording for the main demonstration. An optional on-camera opening of 10–15 seconds can introduce the food-bank connection. Use one brief evidence card; the working product supplies the rest of the visuals. An acted scene and full slideshow are unnecessary.

Before recording:

1. Use a clean guest browser profile, hide unrelated tabs, silence notifications, and set readable browser zoom. Record at 1080p with a clear microphone.
2. Open **How we test → Try the complete fictional case**. Rehearse the full story: September income requested, August paystub supplied, fact review, wrong-month warning, guided SAR 7B, and selected appointment packet.
3. Keep the August document unconfirmed until the recording's review segment. Prepare [fictional September income proof](demo/fictional-september-income.txt) and [fictional rent proof](demo/fictional-excluded-rent.txt) in an otherwise empty demo folder. After showing the mismatch, add and verify the September document. Keep the rent document out of the appointment packet.
4. Prepare fictional form details, such as **Elena Rivera**, and one public question: **“Is gross income before or after taxes?”** Leave signatures blank. Use source guidance in guest mode; only demonstrate authenticated AI or Calendar with an eligible, authorized account and a real successful result.
5. Keep one downloaded form and packet ready for inspection if the operating-system PDF viewer opens slowly. Record the actual download; edit waiting time only, preserving the sequence and result.
6. Evidence card: “Food-bank conversations → confusing CalFresh forms and unclear next steps”; “129,794 Santa Clara County CalFresh participants, July 1, 2025”; “Complete reporting and required verification matter.” Include the two source links above in the video description.

## Full narration and screen plan

### 0:00–0:25 — Personal connection

**Show:** Optional brief face-to-camera introduction, then Anchor's overview.

“While volunteering at my local food bank, I talked with people who described struggling with CalFresh paperwork. They were unsure what forms required, and calls for help sometimes left them confused about the next step. I built Anchor to make that next step clearer. I'll demonstrate it with fictional information.”

### 0:25–0:45 — Establish the local need

**Show:** One evidence card with the county source and date.

“Santa Clara County reported nearly 130,000 CalFresh participants as of July 2025. Its handbook documents that an incomplete required report can lead to discontinuance. That gives this project a concrete local focus: helping people understand and prepare the paperwork needed to keep their case moving.”

### 0:45–1:15 — Read the request

**Show:** The fictional notice, requested September proof, potential deadline, and original wording. Open the source view.

“This fictional notice asks for September income proof and a reporting form. Anchor organizes the requested materials and potential dates, while keeping the original wording available. I can inspect the source before confirming a suggestion. The goal is to make the action understandable while preserving the evidence behind it.”

### 1:15–2:00 — Catch a consequential mismatch

**Show:** Check packet. Review the suggested paystub facts, confirm August from the original, and show the September/August warning. Add and verify the matching September file.

“Here is the important detail: this paystub covers August, while the notice asks for September. Anchor's local classifier suggests a document type, but I still verify the facts against the original. Once I confirm the month, the readiness check flags the mismatch. I can then gather the requested September proof. A readable document alone does not establish that it answers the request.”

### 2:00–2:50 — Fill the actual form

**Show:** The requested SAR 7B guided form. Type Elena Rivera, show the PDF update, ask the public gross-income question, open its source, and download the unsigned draft.

“Next, I open the requested reporting form. As I enter this fictional answer, it appears directly on the official PDF. I can work through the questions step by step, review the complete document, and download an editable, unsigned draft. If I need help understanding gross income, Ask Anchor provides reviewed guidance and official sources. Optional AI explanations use approved public topics; my uploaded notice and private form answers stay out of those AI requests.”

### 2:50–3:20 — Prepare for follow-through

**Show:** Select the notice and September income file for an appointment packet; leave rent proof unchecked; add a question and download. Briefly show Submit & track.

“I can also prepare an appointment packet containing exactly the notices, supporting files, and questions I select. This unrelated rent document stays out. After I use an official submission channel, Anchor lets me keep my own submission reference and follow-up record. The app keeps preparation and recorded actions distinct from an agency decision.”

### 3:20–3:50 — Demonstrate accessibility

**Show:** Spanish navigation and guidance, a narrow mobile window, and the source library. Optionally show the Calendar preview only if already configured.

“I included Spanish guidance, mobile layouts, keyboard access, and guest use because the people facing this paperwork need a practical way to use the tool. Official PDFs keep their original language. Core tools can work after their required assets are cached; cloud features need a connection. Optional accounts save work across devices, and reviewed dates can become Calendar reminders.”

### 3:50–4:15 — Show the engineering

**Show:** A simple architecture view and the How we test page, with limitations visible.

“Under the interface, I connected browser-based OCR, a Python-trained document classifier, typed workflow rules, BM25 search, and PostgreSQL-backed synchronization. I also published reproducible fictional evaluation results and automated tests. Those checks verify software behavior; I am not presenting them as measured improvements in real residents' benefits.”

### 4:15–4:30 — Close on the community goal

**Show:** Anchor overview and both public links.

“My next step is testing this workflow with local volunteers and benefits navigators. I want the people I meet at the food bank to leave with a next step they understand, can check, and can act on. That's the purpose of Anchor.”

## Judging focus

- **Community relevance, 25%:** lead with the food-bank experience and dated official county evidence.
- **Impact potential, 20%:** show the specific task friction Anchor addresses; identify future usability measures without inventing outcomes.
- **Technical execution, 20%:** demonstrate source review, confirmation, the wrong-month check, and a real editable PDF download.
- **Creativity, 15%:** explain the connected notice/evidence/form/follow-up workflow and its traceable decisions.
- **Presentation and clarity, 10%:** use one fictional case from start to finish and spend most of the video in the working app.
- **Accessibility, 10%:** visibly show guest access, Spanish guidance, readable mobile layouts, and the boundaries of offline functionality.

Judging source: https://neighborhoodhacks.org/judging/
