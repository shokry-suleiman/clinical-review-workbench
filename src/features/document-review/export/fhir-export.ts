import {
  createAllergyIntoleranceSchema,
  createBundleSchema,
  createConditionSchema,
  createMedicationStatementSchema,
  createObservationSchema,
  createProvenanceSchema,
  createServiceRequestSchema,
} from "@solarahealth/fhir-r4";
import { z } from "zod";
import type { ReviewFinding } from "../review/review-state";
import { normalizeEvidenceQuote } from "../contracts";

const FHIR_RESOURCE_SCHEMAS = {
  Condition: createConditionSchema(),
  MedicationStatement: createMedicationStatementSchema(),
  AllergyIntolerance: createAllergyIntoleranceSchema(),
  Observation: createObservationSchema(),
  ServiceRequest: createServiceRequestSchema(),
  Provenance: createProvenanceSchema(),
};

function getFhirResourceSchema(resourceType: string) {
  switch (resourceType) {
    case "Condition":
      return FHIR_RESOURCE_SCHEMAS.Condition;
    case "MedicationStatement":
      return FHIR_RESOURCE_SCHEMAS.MedicationStatement;
    case "AllergyIntolerance":
      return FHIR_RESOURCE_SCHEMAS.AllergyIntolerance;
    case "Observation":
      return FHIR_RESOURCE_SCHEMAS.Observation;
    case "ServiceRequest":
      return FHIR_RESOURCE_SCHEMAS.ServiceRequest;
    case "Provenance":
      return FHIR_RESOURCE_SCHEMAS.Provenance;
    default:
      return undefined;
  }
}

const FhirBundleEnvelopeSchema = z
  .object({
    resourceType: z.literal("Bundle"),
    type: z.literal("collection"),
    timestamp: z.string().datetime(),
    entry: z
      .array(
        z
          .object({
            fullUrl: z.string().startsWith("urn:uuid:"),
            resource: z.unknown(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((bundle, context) => {
    const bundleValidation = createBundleSchema().safeParse(bundle);
    if (!bundleValidation.success) {
      context.addIssue({
        code: "custom",
        message: "FHIR R4 Bundle validation failed.",
      });
    }

    bundle.entry?.forEach((entry, index) => {
      if (
        typeof entry.resource !== "object" ||
        entry.resource === null ||
        !("resourceType" in entry.resource) ||
        typeof entry.resource.resourceType !== "string"
      ) {
        context.addIssue({
          code: "custom",
          message: "FHIR Bundle entry must contain a FHIR resource.",
          path: ["entry", index, "resource"],
        });
        return;
      }

      const schema = getFhirResourceSchema(entry.resource.resourceType);
      if (!schema || !schema.safeParse(entry.resource).success) {
        context.addIssue({
          code: "custom",
          message: "FHIR resource failed R4 schema validation.",
          path: ["entry", index, "resource"],
        });
      }
    });
  });

export const FhirBundleSchema = FhirBundleEnvelopeSchema;

export type FhirBundle = z.infer<typeof FhirBundleSchema>;
export type FhirResourceType =
  | "Condition"
  | "MedicationStatement"
  | "AllergyIntolerance"
  | "Observation"
  | "ServiceRequest";

const CODE_SYSTEM_URL: Record<string, string> = {
  "ICD-10-GM": "http://fhir.de/CodeSystem/bfarm/icd-10-gm",
  ATC: "http://www.whocc.no/atc",
  LOINC: "http://loinc.org",
};

function getResourceType(field: ReviewFinding["field"]): FhirResourceType | null {
  switch (field) {
    case "condition":
      return "Condition";
    case "medication_statement":
      return "MedicationStatement";
    case "allergy_intolerance":
      return "AllergyIntolerance";
    case "observation":
      return "Observation";
    case "service_request":
    case "follow_up":
      return "ServiceRequest";
    case "visit_preparation":
    case "patient_instruction":
      return null;
  }
}

function codedText(finding: ReviewFinding, display = finding.editedValue) {
  const { suggestedCode } = finding;
  return suggestedCode?.code.trim()
    ? {
        coding: [
          {
            system: CODE_SYSTEM_URL[suggestedCode.system],
            code: suggestedCode.code,
            display,
            userSelected: false,
          },
        ],
        text: display,
      }
    : { text: display };
}

function parseNumericValue(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/u.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getMedicationStatus(documentedStatus?: string) {
  const status = documentedStatus?.trim().toLowerCase();
  if (status === "continue" || status === "increase") return "active";
  if (status === "stop" || status === "discontinued") return "stopped";
  if (status === "hold") return "on-hold";
  return "unknown";
}

function toFhirResource(finding: ReviewFinding, id: string) {
  const code = codedText(finding);
  const subject = { display: "Source document subject (not identified)" };

  switch (getResourceType(finding.field)) {
    case "Condition":
      return {
        resourceType: "Condition",
        id,
        code,
        subject,
      };
    case "MedicationStatement": {
      return {
        resourceType: "MedicationStatement",
        id,
        status: getMedicationStatus(finding.documentedStatus),
        medicationCodeableConcept: code,
        subject,
      };
    }
    case "AllergyIntolerance":
      return {
        resourceType: "AllergyIntolerance",
        id,
        code,
        patient: subject,
      };
    case "Observation": {
      const name = finding.name?.trim() || finding.editedValue;
      const value = finding.editedValue.trim();
      const bloodPressure = /(?:blood pressure|blutdruck|\bbp\b)/iu.test(name)
        ? value.match(
            /^\s*([+-]?\d+(?:[.,]\d+)?)\s*\/\s*([+-]?\d+(?:[.,]\d+)?)\s*$/u,
          )
        : null;
      const scalarValue = parseNumericValue(value);
      return {
        resourceType: "Observation",
        id,
        status: "final",
        code: codedText(finding, name),
        subject,
        ...(bloodPressure
          ? {
              component: [
                {
                  code: {
                    coding: [
                      {
                        system: "http://loinc.org",
                        code: "8480-6",
                        display: "Systolic blood pressure",
                      },
                    ],
                    text: "Systolic blood pressure",
                  },
                  valueQuantity: {
                    value: Number(bloodPressure[1]?.replace(",", ".")),
                    ...(finding.unit ? { unit: finding.unit } : {}),
                  },
                },
                {
                  code: {
                    coding: [
                      {
                        system: "http://loinc.org",
                        code: "8462-4",
                        display: "Diastolic blood pressure",
                      },
                    ],
                    text: "Diastolic blood pressure",
                  },
                  valueQuantity: {
                    value: Number(bloodPressure[2]?.replace(",", ".")),
                    ...(finding.unit ? { unit: finding.unit } : {}),
                  },
                },
              ],
            }
          : scalarValue !== undefined
            ? {
                valueQuantity: {
                  value: scalarValue,
                  ...(finding.unit ? { unit: finding.unit } : {}),
                },
              }
            : { valueString: value }),
      };
    }
    case "ServiceRequest":
      return {
        resourceType: "ServiceRequest",
        id,
        status: "unknown",
        intent: "proposal",
        code,
        subject,
      };
    case null:
      return null;
  }
}

export function createFhirBundle(findings: ReviewFinding[]) {
  const accepted = findings.filter((finding) => finding.status === "accepted");
  const exportable = accepted.filter(
    (finding) => getResourceType(finding.field) !== null,
  );
  const unknownMedicationStatusCount = exportable.filter(
    (finding) =>
      finding.field === "medication_statement" &&
      getMedicationStatus(finding.documentedStatus) === "unknown",
  ).length;
  const entries = exportable.flatMap((finding) => {
    const resourceId = crypto.randomUUID();
    const resourceUrl = `urn:uuid:${crypto.randomUUID()}`;
    const resource = toFhirResource(finding, resourceId);
    if (!resource) return [];

    const provenanceId = crypto.randomUUID();
    return [
      {
        fullUrl: resourceUrl,
        resource,
      },
      {
        fullUrl: `urn:uuid:${crypto.randomUUID()}`,
        resource: {
          resourceType: "Provenance",
          id: provenanceId,
          target: [{ reference: resourceUrl }],
          recorded: new Date().toISOString(),
          agent: [
            {
              who: {
                display:
                  "Reviewer action; identity is not authenticated by this prototype",
              },
            },
          ],
          entity: (
            finding.evidence ?? [
              { quote: normalizeEvidenceQuote(finding.sourceExcerpt) },
            ]
          ).map((evidence) => ({
              role: "source",
              what: { display: normalizeEvidenceQuote(evidence.quote) },
            })),
        },
      },
    ];
  });

  const bundle = {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: entries,
  };
  const validation = FhirBundleSchema.safeParse(bundle);
  if (!validation.success) {
    throw new Error(
      "The generated export did not pass the FHIR R4 schema validation.",
    );
  }

  return {
    bundle: validation.data,
    exportedCount: exportable.length,
    excludedCount: accepted.length - exportable.length,
    unknownMedicationStatusCount,
  };
}

export function downloadFhirBundle(findings: ReviewFinding[]) {
  const result = createFhirBundle(findings);
  const { bundle } = result;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/fhir+json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "clinical-review-fhir-r4-bundle.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return result;
}
