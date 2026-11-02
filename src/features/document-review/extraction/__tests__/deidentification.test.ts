import { describe, expect, it } from "vitest";
import { deidentifyDocument } from "../deidentification";

describe("document de-identification", () => {
  it("redacts labeled names, birth dates, MRNs, and addresses before submission", () => {
    const source =
      "Patient name: Anna Beispiel\nDOB: 03.04.1981\nMRN: DE-12345\nAddress: Musterstraße 4, Berlin\nFollow-up in 6 weeks.";
    const result = deidentifyDocument(source);

    expect(result.text).not.toContain("Anna Beispiel");
    expect(result.text).not.toContain("03.04.1981");
    expect(result.text).not.toContain("DE-12345");
    expect(result.text).not.toContain("Musterstraße 4");
    expect(result.text).toContain("Follow-up in 6 weeks.");
    expect(result.redactionCounts).toEqual({
      name: 1,
      date_of_birth: 1,
      mrn: 1,
      address: 1,
    });
  });

  it("restores source quotes for local review without changing the submission", () => {
    const result = deidentifyDocument("Name: Alex Example\nDOB: 01/02/1980");
    const excerpt = `Patient ${result.text.split("\n")[0]}`;

    expect(result.restore(excerpt)).toBe("Patient Name: Alex Example");
    expect(result.text).not.toContain("Alex Example");
  });

  it("recognizes German patient identifiers", () => {
    const result = deidentifyDocument(
      "Patientenname: Anna Beispiel\nGeburtsdatum: 03.04.1981\nFallnummer: DE-1004\nAnschrift: Musterstraße 4",
    );

    expect(result.text).not.toContain("Anna Beispiel");
    expect(result.text).not.toContain("03.04.1981");
    expect(result.text).not.toContain("DE-1004");
    expect(result.text).not.toContain("Musterstraße 4");
    expect(result.redactionCounts).toEqual({
      name: 1,
      date_of_birth: 1,
      mrn: 1,
      address: 1,
    });
  });

  it("redacts dates that contain punctuation", () => {
    const result = deidentifyDocument("Date of birth: January 12, 1980");

    expect(result.text).not.toContain("January 12");
    expect(result.text).not.toContain("1980");
    expect(result.redactionCounts.date_of_birth).toBe(1);
  });

  it("does not leave the second part of a comma-formatted name exposed", () => {
    const result = deidentifyDocument("Patient name: Example, Anna");

    expect(result.text).not.toContain("Example");
    expect(result.text).not.toContain("Anna");
    expect(result.redactionCounts.name).toBe(1);
  });
});
