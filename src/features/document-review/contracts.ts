import { z } from "zod";

export const ExtractionFieldSchema = z.enum([
  "follow_up",
  "visit_preparation",
]);

export const ExtractionFindingSchema = z
  .object({
    id: z.string().min(1).max(100),
    field: ExtractionFieldSchema,
    value: z.string().min(1).max(500),
    sourceExcerpt: z.string().min(1).max(2_000),
    sourceSection: z.string().min(1).max(120).optional(),
  })
  .strict();

export const ExtractionResponseSchema = z
  .object({
    findings: z.array(ExtractionFindingSchema).max(10),
  })
  .strict()
  .superRefine((response, context) => {
    const ids = new Set<string>();

    response.findings.forEach((finding, index) => {
      if (ids.has(finding.id)) {
        context.addIssue({
          code: "custom",
          message: "Finding IDs must be unique.",
          path: ["findings", index, "id"],
        });
      }
      ids.add(finding.id);
    });
  });

export function validateExtractionResponse(
  input: unknown,
  sourceText: string,
): ExtractionResponse | undefined {
  const parsed = ExtractionResponseSchema.safeParse(input);
  if (!parsed.success) return undefined;

  if (
    !parsed.data.findings.every(
      (finding) =>
        sourceText.includes(finding.sourceExcerpt) &&
        (finding.sourceSection === undefined ||
          sourceText.includes(finding.sourceSection)),
    )
  ) {
    return undefined;
  }

  return parsed.data;
}

export const UploadTextSchema = z.string().trim().min(1).max(50_000);
export const ExtractedDocumentSchema = z
  .object({
    sourceText: UploadTextSchema,
    findings: ExtractionResponseSchema.shape.findings,
  })
  .strict();

export const ServiceErrorSchema = z
  .object({
    error: z.string().min(1),
  })
  .strict();

export type ExtractionField = z.infer<typeof ExtractionFieldSchema>;
export type ExtractionFinding = z.infer<typeof ExtractionFindingSchema>;
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;
export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;
