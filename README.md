Claude
Explaining what the evaluation command reports.
Explaining what the evaluation command reports.
npm run evaluate is a script that scores the app’s extraction results against answer keys. It prints three numbers and doesn’t open the app or call Gemini.

I’m going from your README and the evaluation page, since I can’t see the script itself.

What it does

It loads the 8 small synthetic documents (4 English, 4 German). Each has a hand-written answer key listing the findings that should be extracted, with their quotes. These are the “gold labels” on your /eval page.
It takes a fixed list of candidate outputs, which are pre-written results that stand in for what the model might return. They are not live Gemini answers.
It compares candidates with the answer key and prints:
Precision: of the findings produced, how many were correct. Your result is 88.9% (8 of 9 correct, 1 wrong).
Recall: of the findings that should have been found, how many were found. Your result is 100% (8 of 8, none missed).
Evidence verification: of the quotes produced, how many really appear in the document. Your result is 100%.
It checks the evidence number against the 95% threshold. If it drops below that, the script fails. npm test runs the same check, so a broken evidence check would fail your tests.
Why it exists
It tests the scoring code and the evidence-checking rules: does the program compute the metrics correctly, and does it catch a quote that isn’t in the document? It’s a safety net for the code, like a unit test.

What it does not do
It doesn’t measure how good Gemini is. The candidate outputs are fixed, so the numbers will be the same every time, no matter how the real model behaves. Don’t present 88.9% as “the accuracy of the AI”. If someone asks, say: “That tests my scoring pipeline. Live model evaluation on labeled documents is the next step.”

I will not make a demo video just I will add screen shots from review or review pdf

Choosing screenshots that show only synthetic data
That works. Screenshots are fine instead of a video, and they’re easier for a busy reader to scan.

Which screenshots to take (4 is enough)

Upload screen with the “Draft only, not a medical device” notice visible.
Findings with evidence: a few findings grouped, each with its source quote. This is the most important one.
Review in action: some findings accepted, one rejected, one edited. It shows the human step.
The review PDF, first page. Open the PDF and screenshot it, or link the PDF itself.
An optional fifth: a short piece of the FHIR JSON (for example the blood pressure Observation with systolic and diastolic). Pick one that’s correct, and skip the ibuprofen medication.

Tips

Use the heart failure note, since its report was clean.
On Windows, Win+Shift+S takes a screenshot.
Crop out your browser tabs, bookmarks and anything personal. Make sure no API key or .env file is visible.
Use only synthetic documents.
Save them in docs/screenshots/ with simple names: 1-upload.png, 2-findings.png, 3-review.png, 4-report.png.
Also copy one sample review PDF to docs/sample-review-report.pdf, so people can open it without running the app.
Replace the video line in the README
Delete this line:

**Demo video:** `[add link]`
Add this section right after the first notice (before “The problem”):

markdown
## Screenshots

| Upload | Findings with source evidence |
|---|---|
| ![Upload](docs/screenshots/1-upload.png) | ![Findings](docs/screenshots/2-findings.png) |

| Human review | Review report |
|---|---|
| ![Review](docs/screenshots/3-review.png) | ![Report](docs/screenshots/4-report.png) |

A full example report is in [`docs/sample-review-report.pdf`](docs/sample-review-report.pdf).
When you message the CTO, replace “60-second video: [link]” with the repo link and one sentence: “The README has screenshots and a sample report, so you can see it without running anything.”

If you’d like, I can regenerate the full README file with this section already included.

did you updated readme.md

No. I only gave you the snippet, and the README.md I sent still has the video line. I’ll update the file now.

Ran a command, shared files
Done. The updated README.md now has a Screenshots section instead of the demo video line. Nothing else changed.

Before you commit it
Create these files, or the images will show as broken in the README:

docs/screenshots/1-upload.png
docs/screenshots/2-findings.png
docs/screenshots/3-review.png
docs/screenshots/4-report.png
docs/sample-review-report.pdf (copy one of your review PDFs)
Also still needed: the samples/ folder with the two synthetic PDFs, which the “Try it” section refers to.

If you only take some of the screenshots, delete the rows for the missing ones so no empty image slots remain.

Readme
Document
·MD

You are out of free messages until 10:20 PM


Claude is AI and can make mistakes.


Readme · MD
# Clinical Review Workbench
 
Upload a clinical PDF. The app drafts the key facts from it, shows the exact sentence behind each fact, and lets a person approve, edit or reject every one. Approved facts can be downloaded as a PDF report or as a FHIR file (the standard format health systems use to exchange data).
 
> **Prototype for demonstration only.** It uses fictional documents, is not a medical device, and must never be used with real patient information. It extracts what a document says. It does not diagnose or recommend anything.
 
## Screenshots
 
| Upload | Findings with source evidence |
|---|---|
| ![Upload](docs/screenshots/1-upload.png) | ![Findings](docs/screenshots/2-findings.png) |
 
| Human review | Review report |
|---|---|
| ![Review](docs/screenshots/3-review.png) | ![Report](docs/screenshots/4-report.png) |
 
A full example report is in [`docs/sample-review-report.pdf`](docs/sample-review-report.pdf).
 
## The problem
 
Clinical documents (visit notes, discharge letters) usually arrive as PDFs. The information inside has to be typed into other systems by hand, which is slow and easy to get wrong.
 
## How it works
 
1. **Upload** a PDF and confirm you are allowed to send it.
2. **Read:** the server extracts the text and hides personal identifiers such as names and dates of birth.
3. **Draft:** an AI model (Gemini) proposes findings: conditions, medications, allergies, vitals, lab results, orders, follow-ups and patient instructions.
4. **Check:** every finding shows a quote from the document. The app verifies that the quote really appears in the text.
5. **Review:** a person accepts, edits or rejects each finding. Nothing is confirmed until they do.
6. **Export:** download a PDF report or a FHIR file containing only the accepted findings.
```
PDF  ->  extract text  ->  hide identifiers  ->  AI drafts findings
     ->  verify quotes  ->  human review  ->  PDF report / FHIR file
```
 
## Example
 
From a heart failure visit note:
 
| The note says | The app drafts | A person decides |
|---|---|---|
| "Ibuprofen 400 mg ... Stop - avoid NSAIDs" | Medication: ibuprofen, with that quote | Accept |
| "Potassium 5.3 mmol/L ... High" | Lab result: potassium 5.3 mmol/L | Accept |
| "Weigh yourself every morning..." | Patient instruction | Edit or reject |
 
The app does not extract things the note rules out ("denies chest pain") or things that belong to a relative (family history).
 
## Try it
 
Two fictional sample notes are in the `samples/` folder:
 
- `synthetic_clinic_note_realistic.pdf` (diabetes and high blood pressure)
- `synthetic_clinic_note_2_heart_failure.pdf` (heart failure)
Upload one, open the evidence for a few findings, accept some, reject one, edit one, then download the PDF report and the FHIR file.
 
## Run it locally
 
You need Node.js and a Gemini API key.
 
```powershell
npm install
Copy-Item .env.example .env.local
# Open .env.local and set GEMINI_API_KEY. Never commit this key.
npm run dev
```
 
Other commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run evaluate`.
 
## Safety choices
 
- **Human in the loop:** findings are drafts until a person accepts them.
- **Evidence for every finding:** quote and section, with an automatic check that the quote exists.
- **Identifiers hidden before sending:** the app shows exactly what was sent to the AI.
- **Model can be swapped:** Gemini sits behind a simple interface.
- **No private text in logs:** the audit trail records actions, not document content.
## Evaluation
 
The `/evaluation` page scores eight small synthetic documents (English and German). The current results are Precision 88.9%, Recall 100% and Evidence verification 100%.
 
**These numbers test the scoring code, not the AI model.** They do not show how accurate Gemini is. Measuring that on labeled documents is the next step.
 
## Known issues
 
- Medication status in the FHIR file is only partly mapped. "Continue" becomes `active`, but words like "Stop" can export as `unknown`. Check each medication's status before relying on an export.
- Similar conditions worded differently are not always merged (for example, "heart failure" and "acute on chronic heart failure").
- Some details are not extracted, such as ejection fraction values and physical exam findings.
- Lab flags (High/Low) appear in the quote but not as a separate field.
- Scanned PDFs are not supported (there is no OCR).
## Planned next
 
1. Finish medication status mapping.
2. Merge similar conditions and separate symptoms from diagnoses.
3. Test the real AI model on expert-labeled English and German documents.
4. Add a German discharge letter sample.
5. Add structured lab flags and optional code suggestions (ICD-10-GM, LOINC, ATC).
6. Add reviewer login and a permanent audit trail.
## Limitations
 
- **Never use real patient data.** Hiding identifiers is best-effort and can miss things.
- **Not production-ready.** There is no login, access control, permanent storage or monitoring. The audit trail lives only in the browser session.
- **Hosting:** before real use, the AI would need an EU-hosted setup with a data-processing agreement and no-training terms. This prototype does not provide that.
- **FHIR output** is checked against the standard R4 schemas, not against a specific health system or implementation guide.
- **Regulation:** this repository does not establish compliance with any regulation or certification. That needs qualified legal, clinical and security review.
## Technical overview
 
Next.js (App Router) with TypeScript. Code for extraction, review and export is split into separate modules under `src/features/document-review`, each with its own tests. The upload goes to `POST /api/extract`, which runs on the server so the API key never reaches the browser.
 
All sample documents are fictional and created for software testing.
 











Claude finished the response
