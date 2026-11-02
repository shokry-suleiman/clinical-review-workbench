import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText } from "../pdf-document";

describe("PDF text extraction", () => {
  it("extracts selectable text from a PDF", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("Schedule a follow-up visit in 3 weeks.", {
      x: 48,
      y: 760,
      font,
      size: 12,
    });

    const extracted = await extractPdfText(await pdf.save());

    expect(extracted).toContain("Schedule a follow-up visit in 3 weeks.");
  });
});
