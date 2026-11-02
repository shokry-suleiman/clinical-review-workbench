import { z } from "zod";
import { isDocumentEvidence, SYNTHETIC_SOURCE_DOCUMENT } from "./source-document";

export const ExtractionFieldSchema = z.enum([
  "follow_up",
  "visit_preparation",
]);

export const ExtractionFindingSchema = z
  .object({
    id: z.string().min(1),
    field: ExtractionFieldSchema,
    value: z.string().min(1),
    sourceExcerpt: z.string().min(1),
    sourceSection: z.string().min(1).optional(),
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
  sourceText: string = SYNTHETIC_SOURCE_DOCUMENT.text,
): ExtractionResponse | undefined {
  const parsed = ExtractionResponseSchema.safeParse(input);
  if (!parsed.success) return undefined;

  if (
    !parsed.data.findings.every((finding) =>
      isDocumentEvidence(
        finding.sourceExcerpt,
        sourceText,
        finding.sourceSection,
      ),
    )
  ) {
    return undefined;
  }

  return parsed.data;
}

export const UploadTextSchema = z.string().trim().min(1).max(50_000);

export const ScenarioSchema = z.enum([
  "valid",
  "partial",
  "malformed",
  "service-failure",
]);

export const ServiceErrorSchema = z
  .object({
    error: z.string().min(1),
  })
  .strict();

export type ExtractionField = z.infer<typeof ExtractionFieldSchema>;
export type ExtractionFinding = z.infer<typeof ExtractionFindingSchema>;
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
