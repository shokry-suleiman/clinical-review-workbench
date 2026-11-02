import { z } from "zod";

export const ExtractionFieldSchema = z.enum([
  "condition",
  "medication_statement",
  "allergy_intolerance",
  "observation",
  "service_request",
  "follow_up",
  "visit_preparation",
  "patient_instruction",
]);

export const SuggestedCodeSchema = z
  .object({
    system: z.enum(["ICD-10-GM", "ATC", "LOINC"]),
    code: z.string().min(1).max(40),
  })
  .strict();

export const ExtractionFindingSchema = z
  .object({
    id: z.string().min(1).max(100),
    field: ExtractionFieldSchema,
    value: z.string().min(1).max(500),
    name: z.string().max(120).optional(),
    sourceExcerpt: z.string().min(1).max(2_000),
    sourceSection: z.string().min(1).max(120).optional(),
    suggestedCode: SuggestedCodeSchema.optional(),
    dose: z.string().max(120).optional(),
    frequency: z.string().max(120).optional(),
    documentedStatus: z.string().max(120).optional(),
    unit: z.string().max(120).optional(),
    flag: z.string().max(120).optional(),
  })
  .strict();

export const ExtractionResponseSchema = z
  .object({
    findings: z.array(ExtractionFindingSchema).max(100),
    findingsSkipped: z.number().int().nonnegative().default(0),
  })
  .strict();

export function validateExtractionResponse(
  input: unknown,
  sourceText: string,
): ExtractionResponse | undefined {
  const envelope = z
    .object({
      findings: z.array(z.unknown()).max(100),
      findingsSkipped: z.number().int().nonnegative().default(0),
    })
    .safeParse(input);
  if (!envelope.success) return undefined;

  const ids = new Set<string>();
  const findings = [];
  let findingsSkipped = envelope.data.findingsSkipped;

  for (const rawFinding of envelope.data.findings) {
    const parsedFinding = ExtractionFindingSchema.safeParse(rawFinding);
    if (
      !parsedFinding.success ||
      ids.has(parsedFinding.data.id) ||
      !includesNormalizedEvidence(
        sourceText,
        parsedFinding.data.sourceExcerpt,
      )
    ) {
      findingsSkipped += 1;
      continue;
    }

    ids.add(parsedFinding.data.id);
    findings.push({
      ...parsedFinding.data,
      sourceExcerpt: normalizeEvidenceQuote(parsedFinding.data.sourceExcerpt),
    });
  }

  return ExtractionResponseSchema.parse({ findings, findingsSkipped });
}

export function normalizeEvidence(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u00ad/gu, "")
    .replace(/([\p{L}])[-‐‑]\s*(?=[\p{Ll}])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeEvidenceQuote(value: string) {
  return value.replace(/[\p{White_Space}\uFEFF]+/gu, " ").trim();
}

export function includesNormalizedEvidence(sourceText: string, excerpt: string) {
  return normalizeEvidence(sourceText).includes(normalizeEvidence(excerpt));
}

export const UploadTextSchema = z.string().trim().min(1).max(50_000);
export const ExtractedDocumentSchema = z
  .object({
    sourceText: UploadTextSchema,
    submittedText: UploadTextSchema,
    findings: ExtractionResponseSchema.shape.findings,
    findingsSkipped: z.number().int().nonnegative(),
    modelName: z.string().min(1).max(100),
    promptVersion: z.string().min(1).max(100),
    redactionCounts: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();

export const ServiceErrorSchema = z
  .object({
    error: z.string().min(1),
    code: z.string().min(1).optional(),
  })
  .strict();

export type ExtractionField = z.infer<typeof ExtractionFieldSchema>;
export type SuggestedCode = z.infer<typeof SuggestedCodeSchema>;
export type ExtractionFinding = z.infer<typeof ExtractionFindingSchema>;
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;
export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;
