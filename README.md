# Clinical Review Workbench

A prototype for reviewing document-derived facts with source evidence and a human decision at every finding. It is not a medical device, is not MDR IIa classified or certified, and has not undergone a C5 audit. It must not be used for care or with real patient information.

## Architecture

The app is a modular Next.js App Router application. The workbench owns the upload/review experience; extraction, review, and export have separate module boundaries under `src/features/document-review`. Their focused tests live in each module's `__tests__` directory, while the feature-level contracts remain at the document-review boundary. Evaluation and shared language have their own feature/shared folders. This keeps the prototype in one deployment while making the provider replaceable through an explicit interface.

```mermaid
flowchart LR
  Browser[Review UI<br/>EN / DE] -->|PDF + authorization| Route[Node.js API route]
  Route --> Parser[PDF text parser]
  Parser --> Deid[Best-effort identifier redaction]
  Deid --> Provider[ExtractionProvider interface]
  Provider --> Gemini[Gemini adapter<br/>server-side API key]
  Gemini --> Validate[Runtime schema + evidence verification]
  Validate -->|original text, redacted submitted text,<br/>drafts, model metadata| Browser
  Browser --> Human[Human edit / accept / reject]
  Human --> Audit[Session-memory audit events<br/>no document text]
  Human --> PDF[Review PDF]
  Human --> FHIR[FHIR R4 Bundle + Provenance<br/>schema validated]
  Eval[8 synthetic EN / DE cases] --> Harness[Offline evaluation harness]
  Harness --> Results[/evaluation page]
```

### Data flow

1. The browser uploads a PDF to `POST /api/extract`, with an explicit authorization confirmation. The route runs on Node.js and enforces the PDF size and text limits.
2. The server extracts selectable PDF text and applies deterministic, label-based redaction for names, dates of birth, record numbers, and addresses before calling the provider. The Gemini API key stays server-side.
3. Gemini receives only the redacted text. Its flat structured response is validated finding-by-finding; only findings with valid fields and source evidence are kept. Invalid findings are counted and shown as skipped. Truncated, blocked, empty, malformed-JSON, and schema errors have distinct API codes. Development diagnostics contain response metadata and schema paths only, never document text or model output.
4. For local review, redaction markers are restored in the source text and evidence excerpts in the current request’s memory. The UI displays both the original extracted text and a collapsed **What was sent to Gemini** panel containing the redacted text.
5. Findings remain drafts until a reviewer edits, accepts, or rejects them. Only accepted findings that map to the requested FHIR resource types can be exported. Each exported resource has a `Provenance` entry with its verbatim source quote.
6. Audit events record action, timestamp, model name, prompt version, and finding ID in browser memory for the current document. They do not contain source text or finding values.

### Evaluation

`/eval` contains eight synthetic labeled documents (four English and four German). `npm run evaluate` reports precision, recall, and evidence-verification pass rate. `npm test` also runs this threshold check and exits non-zero if evidence verification drops below 95%.

Current offline fixture results:

| Metric | Result |
|---|---:|
| Precision | 88.9% |
| Recall | 100.0% |
| Evidence verification pass rate | 100.0% |
| CI evidence threshold | 95.0% |

These are deterministic metrics for curated candidate outputs, not Gemini quality results. A matching source quote proves only that the quote occurs in the document; it does not prove that the finding is correct or appropriately interpreted.

## Local development

Use Node.js supported by the installed Next.js version and npm.

```powershell
npm install
Copy-Item .env.example .env.local
# Set GEMINI_API_KEY in .env.local; never commit the key.
npm run dev
```

The FHIR export is available after at least one supported finding is accepted. `visit_preparation` findings are not forced into an unrelated FHIR resource and are omitted from this export. Extraction returns categories, values, evidence, sections, and optional explicitly documented details; it does not generate terminology-code suggestions.

## Limitations and future work

- **De-identification is best-effort, not a guarantee.** It masks common labeled fields; it is not a validated NER system, may miss identifiers in free text or images, and may remove too much text. Do not send real patient data.
- The current provider uses the configured Gemini API directly. Before any real-data use, establish an approved EU-region production deployment, contractual no-training/data-use terms, retention and deletion controls, a data-processing agreement, subprocessor review, and verified logging controls. EU residency and no-training behavior are future requirements to verify—not current properties of this prototype.
- No authentication, authorization service, tenant isolation, rate limiting, durable storage, or incident monitoring is implemented. The upload confirmation is a UI/API guard, not identity or access control.
- The audit view is ephemeral browser state, not an immutable or attributable audit trail. Production requires authenticated reviewer identity, durable tamper-evident audit storage, retention policy, and access controls—without storing document contents in general logs.
- FHIR output is schema-checked against the R4 resource and Bundle schemas used by the app. It is not validated against a jurisdictional implementation guide, terminology server, receiving EHR, or a full conformance test suite.
- The offline evaluation set validates metric computation and evidence rules only; it does not establish clinical performance. Expand it with governance, expert annotation, representative language variation, bias/error analysis, and independent validation before making performance claims.
- Regulatory classification and obligations depend on intended purpose and deployment. MDR IIa suitability, C5 audit scope, privacy, security, and clinical safety require qualified legal, regulatory, clinical, and security review. This repository does not establish compliance.

## Commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run evaluate
```
