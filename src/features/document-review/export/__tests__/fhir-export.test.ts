import { describe, expect, it } from "vitest";
import { createFhirBundle, FhirBundleSchema } from "../fhir-export";
import type { ReviewFinding } from "../../review/review-state";

const resourceTypes = [
  "condition",
  "medication_statement",
  "allergy_intolerance",
  "observation",
  "service_request",
  "follow_up",
  "visit_preparation",
] as const;

function finding(field: ReviewFinding["field"], status: ReviewFinding["status"]): ReviewFinding {
  return {
    id: `finding-${field}`,
    field,
    value: "Explicit source fact",
    sourceExcerpt: "Verbatim source quote.",
    status,
    editedValue: "Explicit source fact",
  };
}

describe("FHIR R4 export", () => {
  it("exports accepted supported findings with Provenance and validates the Bundle", () => {
    const { bundle, exportedCount, excludedCount } = createFhirBundle(
      resourceTypes.map((field) => finding(field, "accepted")),
    );

    expect(FhirBundleSchema.safeParse(bundle).success).toBe(true);
    expect(exportedCount).toBe(6);
    expect(excludedCount).toBe(1);
    expect(JSON.stringify(bundle)).toContain("Verbatim source quote.");
    expect(JSON.stringify(bundle)).toContain('"resourceType":"Provenance"');
  });

  it("does not export draft or rejected findings", () => {
    const { bundle, exportedCount } = createFhirBundle([
      finding("observation", "draft"),
      finding("service_request", "rejected"),
    ]);

    expect(exportedCount).toBe(0);
    expect(bundle.entry).toHaveLength(0);
  });

  it("rejects resources that do not satisfy their FHIR R4 schema", () => {
    expect(
      FhirBundleSchema.safeParse({
        resourceType: "Bundle",
        type: "collection",
        timestamp: "2026-11-02T10:00:00.000Z",
        entry: [
          {
            fullUrl: "urn:uuid:11111111-1111-4111-8111-111111111111",
            resource: {
              resourceType: "Condition",
              id: "incomplete-condition",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("exports codes as coding suggestions without marking them user-selected", () => {
    const codedFinding = {
      ...finding("condition", "accepted"),
      suggestedCode: { system: "ICD-10-GM" as const, code: "R03.0" },
    };
    const { bundle } = createFhirBundle([codedFinding]);

    expect(FhirBundleSchema.safeParse(bundle).success).toBe(true);
    expect(JSON.stringify(bundle)).toContain("http://fhir.de/CodeSystem/bfarm/icd-10-gm");
    expect(JSON.stringify(bundle)).toContain('"userSelected":false');
  });
});
