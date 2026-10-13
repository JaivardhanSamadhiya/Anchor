# Anchor usability study kit

**Status: no participant study has been conducted.** The model evaluation uses fictional test excerpts; passing software tests and synthetic model accuracy are not evidence of benefit renewals, agency acceptance or resident outcomes. This document is a protocol for collecting real feedback without collecting real case information.

## Aim and participants

Test whether adults can follow a source-linked notice, identify a reporting-period mismatch, prepare an unsigned form and choose what goes into an appointment packet. Recruit a small initial group of six to eight consenting adults, ideally including local community members and benefits navigators. That is a recruitment goal, not a completed participant count. Include volunteers who prefer Spanish and volunteers who use phones or keyboard navigation if available. Record the actual sample composition and missing perspectives.

Use only fictional documents in a fresh guest browser profile. Do not ask for actual notices, benefits status, household income, passwords or Google sign-in. Participants may skip any question or stop at any time. Do not record audio, video or identifying quotes unless separately agreed. Give the same instructions and time allowance to everyone; record assistance instead of silently helping people through difficult steps.

Suggested introduction: “We are testing Anchor, not you. These documents and names are fictional. Anchor helps prepare paperwork; it cannot decide eligibility or submit a case. Please say what you expect to happen. You can stop whenever you like. May I record anonymous task outcomes and your feedback?”

## Prepare the fictional session

Record the exact release commit before starting. Open a fresh guest browser profile,
choose English or Spanish, and use **How we test → Try the complete fictional case**
to create the notice and August paystub scenario. Rehearse the tasks yourself first;
do not count rehearsal as a participant session. Prepare readers while connected if
you plan to test offline use, then verify with the browser actually offline.

For the packet task, add these two UTF-8 text files as supporting documents for the
fictional notice. The first gives a matching reporting period; the second should
remain excluded from the packet. Label all materials as fictional.

`fictional-september-income.txt`:

```text
FICTIONAL PRACTICE DOCUMENT — NOT FOR SUBMISSION
Employee: Elena Rivera
Employer: Example Orchard
Reporting period: September 2026
Monthly gross income: $1,250.00
Income verification for practice only.
```

`fictional-excluded-rent.txt`:

```text
FICTIONAL PRACTICE DOCUMENT — NOT FOR SUBMISSION
Tenant: Elena Rivera
Rent receipt for September 2026
Monthly rent: $900.00
This file must remain excluded from the appointment packet task.
```

Have participants review document facts from the originals. Do not pre-confirm
their facts or resolve the wrong-month warning for them. Use the supported SAR 7B
draft requested by the practice notice for the form task. Use fictional answers
only; keep signatures blank. The packet task asks for the September income file
and one notice, with the rent file and optional history left unchecked.

## Fictional tasks

| Task                    | Resident instruction                                                                                                      | Successful observable outcome                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A1: notice review       | Find the return deadline and explain how it differs from the benefit end date.                                            | Opens the original wording, identifies the two purposes and confirms only the intended date.                                                    |
| A2: evidence review     | This notice asks for September income proof. Review the sample August paystub.                                            | Recognizes the wrong period, keeps uncertainty visible and identifies the need for the requested proof or agency clarification.                 |
| A3: form preparation    | Put the fictional household name into the guided form and download it.                                                    | Answer appears on the actual form; download retains all pages and editable fields, while signatures remain blank.                               |
| A4: appointment packet  | Include the practice notice and fictional September income file, leave the rent file and history out, and add a question. | Selected summary, file and question are present; excluded material is absent. Participant understands the form is a separate editable download. |
| A5: official help       | Find relevant official guidance for the county and explain how to check its source.                                       | Chooses the appropriate jurisdiction and opens or identifies the cited official source.                                                         |
| A6: submission boundary | After a fictional official upload, record its reference here. Does this prove approval?                                   | Saves a user-entered record and correctly explains that this does not establish receipt, acceptance or eligibility.                             |

For Spanish sessions, use the app guidance in Spanish and a fictional Spanish notice. Explain that the displayed official PDF retains its original language. Ask participants which terms are confusing; have a fluent reviewer assess translations before describing them as independently language-reviewed. For keyboard sessions, let the volunteer use Tab, Shift+Tab, Enter and Escape without taking control of the mouse. For mobile sessions, use the participant's usual text-size settings on a test device or fictional browser profile.

## Observation and analysis

Use anonymous participant IDs such as P01. Record each task's completion, time to completion, number of assists, wrong-period errors, unintended file inclusion and whether the submission boundary was understood. Stop timing at completion or the announced task limit; an incomplete task is not counted as a successful timed task. Save issue descriptions without real names or case details. Keep raw observations outside the public repository unless reviewed for disclosure and participants agreed to that use.

CSV template:

```csv
participant_id,language,device,task_id,completed_without_help,completed_with_help,time_seconds,assists,critical_errors,issue_summary
```

Report numerators and denominators rather than a bare percentage. Example formats to fill only after sessions: “A2: __ of __ volunteers identified the period mismatch without help”; “A4: __ of __ packets contained only the requested files”; “Median time among __ completed A3 tasks: __ seconds.” Count each participant once per task. Report incomplete tasks and assistance separately; explain any exclusions. A small convenience sample provides design feedback, not a population estimate.

If comparing Anchor with an ordinary checklist, give comparable fictional notices, counterbalance task order and report the versions tested. Keep that comparison separate from model classification accuracy. Do not claim improvement without a real baseline and observed outcomes.

## Results template

```text
Sessions conducted: __; dates: __; Anchor commit: __
Languages/devices represented: __
Recruitment method and limitations: __
Task completion without help: __ / __ for each task
Wrong-period errors: __ / __ opportunities
Unintended file inclusions: __ / __ packets inspected
Submission boundary understood: __ / __ participants asked
Median completed-task times and denominators: __
Main observed issues: __
Changes made from feedback: __; retested with __ participants
Claims this study does not support: eligibility, agency acceptance, benefits retained
```

Until this template is populated from actual sessions, the public evaluation page should continue reporting zero study participants and no real-world outcome claims.
