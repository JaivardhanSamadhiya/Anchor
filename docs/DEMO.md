# Anchor: three-minute demonstration

The story is a fictional resident responding to benefit correspondence between everyday responsibilities. Show the complete workflow: learn the interface, review original wording, prepare, preserve submission records, and ask for help. No real household or successful renewal is implied.

## Before recording

- Follow the [README](../README.md), run `npm run dev`, and open **http://localhost:4317**, or use the [GitHub Pages app](https://jaivardhansamadhiya.github.io/Anchor/).
- Rehearse **Guide**. First visits offer a welcome walkthrough; it can be skipped and replayed. Finish or close it before recording the main notice review.
- Stay in **Practice** for the core story. The first two notices are present. The practice clock is October 9, 2026, keeping the fictional October 15 date six days away regardless of recording date.
- Open **Privacy & storage → Prepare readers for offline use**, wait for success while connected, and allow the service worker to install before rehearsing an offline refresh.
- Allow downloads. Rehearse the conflicting-date sample through **Add a notice → Try a sample**. Use notes such as `DEMO ONLY — fictional renewal and income evidence; nothing was sent.`
- For a real account demonstration, first complete [Google activation](GOOGLE_SETUP.md) and cross-device verification. Use an authorized test account and fictional personal test records. If Google is not activated, describe the account controls as implemented but awaiting configuration; do not simulate a successful login or claim a cloud save.

## The three-minute sequence

| Time | Show | Narration |
| --- | --- | --- |
| 0:00–0:20 | First-visit welcome or **Guide**, then close it and show the sample banner. | “Anchor helps turn a benefits letter into a clear next step. A short guide shows people where to begin. These are fictional practice notices; personal letters stay separate.” |
| 0:20–0:35 | Account button and save status. If activated, use a prepared test account. | “You can stay a guest on this device or sign in with Google to save personal work in your account. The save status shows whether changes have reached the account. Practice examples stay separate.” |
| 0:35–1:15 | Open the renewal. **Show in the letter** for October 15, distinguish October 31 certification end and October 20 supplemental appointment. Check each line, confirm, and **Use this action plan**. | “These dates serve different purposes. Each links to its original wording. I check them before relying on the plan. The appointment time and method still need the original appointment reminder.” |
| 1:15–1:40 | Open the verification notice. Show October 24, selected pay-stub and rent requests, and the unchecked option. Confirm its date, use the plan, and mark one item prepared. | “Definite requests become a checklist. An unchecked option is not treated as a requirement. Prepared means ready; it does not mean submitted or accepted.” |
| 1:40–2:05 | **Record a submission** with demo-only notes and an optional fictional receipt. Show **Recorded by you**, then export checked dates. | “After using an official channel, a resident keeps their own record and confirmation here. This example is fictional. Calendar exports contain checked dates as all-day reminders.” |
| 2:05–2:30 | **Make a handoff** and show exact quotes and labels. Download it and open **Get support**. | “A navigator sees the original request, checked dates, and the resident's records together. The summary can be printed or shared by choice. County staff decide what is accepted.” |
| 2:30–2:50 | Open **Continuity**. Switch between 15, 30, and 60 minutes, then expand a notice's recorded progress. | “Anchor connects review, preparation, submission, proof, and follow-up. The next-step queue explains what can happen now and what is waiting on an earlier step. A time choice changes the focus plan without changing my letters.” |
| 2:50–3:00 | Set browser network mode to **Offline** and refresh the cached workspace. | “This device's saved copy remains available offline after preparation. Account changes wait for reconnection, and the status keeps that visible.” |

When Google is not activated, replace the account narration with: **“Guest progress is saved on this device. Account storage is implemented; the Supabase project and Google provider must be configured before signing in.”** Show the actual unconfigured message.

Use the browser's developer-tools **Offline** setting to prove cached operation; a reachable localhost server alone is not offline proof. Rehearse it and restore online mode afterward. Sample activity demonstrates the workflow locally; it is never uploaded as personal account data.

## Follow-up demonstrations

For account persistence after activation, use a fictional letter in **My workspace**, wait for the saved status, then load it in a second permitted browser profile signed into the same Google account. Show the original and receipt downloads. Explain that Supabase PostgreSQL stores records and private Supabase Storage stores files; Google supplies identity, while document reading still runs in the browser. An existing guest workspace is imported only through the user's explicit action into an empty account.

For continuity, add the conflicting-date sample and compare the source lines. Only checked, applicable submission and appointment dates enter the continuity timeline. With two letters requesting the same evidence in the same county, mark the first item prepared and demonstrate **Compare for reuse**. Check both originals before recording the possible link. The second checklist stays unfinished. After a fictional submission, **Record a response I received** preserves the resident's report and links it to that submission; it does not assert approval.

For navigation, replay **Guide**, move Next/Back, close with Escape, and show the English/Spanish controls on a mobile-width screen. The guide works with an empty workspace and does not change notice dates or progress.

For document processing, import a clear English practice PDF or photo and compare the extracted text with the original. The three practice PDFs are downloadable from the sample import screen. Explain that English OCR and source text remain English when interface controls switch to Español. Do not claim perfect recognition.

For uncertainty, show an unresolved date or competing-date warning. A PDF over ten pages or a file over 20 MB is rejected rather than silently shortened.

Keep outcome language precise: **a plan reviewed by the user**, **an item prepared by the user**, **a submission recorded by the user**, and **account changes saved only after synchronization succeeds**. The app does not prove that benefits were renewed, that documents were accepted, or that a date is legally controlling.
