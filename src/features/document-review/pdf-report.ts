import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ReviewFinding } from "./review-state";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const BODY_COLOR = rgb(0.14, 0.23, 0.22);
const MUTED_COLOR = rgb(0.38, 0.46, 0.44);
const PRIMARY_COLOR = rgb(0.13, 0.42, 0.36);

function printableText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = printableText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }

  if (line) lines.push(line);
  return lines;
}

export async function createReviewPdf(
  documentName: string,
  findings: ReviewFinding[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function drawBlock(
    text: string,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb>,
    gap = 6,
  ) {
    const lines = wrapText(text, font, size, PAGE_WIDTH - MARGIN * 2);
    const lineHeight = size * 1.45;

    for (const line of lines) {
      if (y - lineHeight < MARGIN) {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color });
      y -= lineHeight;
    }
    y -= gap;
  }

  drawBlock("Clinical Document Review", bold, 21, PRIMARY_COLOR, 8);
  drawBlock(`Source document: ${documentName}`, regular, 10, MUTED_COLOR, 4);
  drawBlock(
    `Generated: ${new Date().toLocaleString()}`,
    regular,
    9,
    MUTED_COLOR,
    14,
  );
  drawBlock(
    "DRAFT REVIEW REPORT - AI-generated findings require human review. This report is not a clinical decision.",
    bold,
    10,
    BODY_COLOR,
    14,
  );

  if (findings.length === 0) {
    drawBlock("No findings were returned for review.", regular, 11, BODY_COLOR);
  }

  findings.forEach((finding, index) => {
    drawBlock(`${index + 1}. ${finding.field} - ${finding.status.toUpperCase()}`, bold, 12, PRIMARY_COLOR, 4);
    drawBlock(finding.editedValue, regular, 11, BODY_COLOR, 4);
    drawBlock(
      `Source evidence${finding.sourceSection ? ` (${finding.sourceSection})` : ""}: "${finding.sourceExcerpt}"`,
      regular,
      9,
      MUTED_COLOR,
      12,
    );
  });

  return pdf.save();
}

export async function downloadReviewPdf(
  documentName: string,
  findings: ReviewFinding[],
) {
  const bytes = await createReviewPdf(documentName, findings);
  const blob = new Blob([new Uint8Array(bytes).buffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${documentName.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "_")}-review.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
