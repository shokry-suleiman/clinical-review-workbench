# Clinical Review Workbench

A focused engineering demo of a human-reviewed clinical document workflow.
This is not a healthcare product and is not production-ready.

## Local development

Requires Node.js 20.9 or newer and npm.

1. Create a Gemini API key in Google AI Studio.
2. Put it in `.env.local` at the repository root:

   ```dotenv
   GEMINI_API_KEY=your_api_key
   ```

3. Run the application:

   ```bash
   npm install
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000). Never prefix the key with
`NEXT_PUBLIC_`; the key is used only by the Node.js route handler.

## Architecture

- `src/app` owns the Next.js App Router shell, global error boundary, layout,
  and Node.js extraction route.
- `src/features/workbench` composes the shell and feature areas.
- `src/features/patient-context` owns patient-context presentation and receives
  only explicitly accepted findings.
- `src/features/document-review` owns upload/preview, extraction contracts,
  Gemini response parsing, and explicit review-state transitions.

This is a modular monolith, not a microfrontend. A single app and deployment
keep this demo simple while feature ownership remains explicit. Separate
deployments would be justified if teams needed independent release schedules,
runtime isolation, or separate scaling and ownership.

## Upload and extraction

The Document Review feature accepts plain-text `.txt` files up to 50 KB and
previews the selected text. The user must confirm that it is synthetic before
analysis. Uploaded text is sent from the Node.js route to Google Gemini using
the free tier; the app does not save or log the document. Google states that
free-tier content may be used to improve its products, so **only upload
fictional documents—never real patient records or PHI**. Check current
[Gemini API pricing and terms](https://ai.google.dev/gemini-api/docs/pricing)
before use; free-tier availability and limits can change.

The model is instructed to extract only explicit follow-up or visit-preparation
text, not to produce diagnoses, prescriptions, or clinical decisions. Runtime
validation rejects malformed responses and any source excerpt not found
verbatim in the uploaded document. Every result remains a draft until a
clinician accepts it. Only accepted findings appear in Patient Context.

The built-in sample and mock response selector remain local and do not call
Gemini. A sample file is available in the UI or at
[fictional-visit.txt](./public/fictional-visit.txt). PDF/DOCX parsing, OCR,
authentication, persistence, real patient data, and clinical use are out of
scope.

## Safety limitations

The synthetic-data checkbox is not PHI detection or a security control. This
demo has no authentication, audit trail, data-retention controls, provider
agreement, clinical validation, or production safeguards. Do not use it for
patient care. Any real healthcare use requires privacy, security, legal,
clinical, regulatory, and vendor review.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
