import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ReviewFinding } from "../review/review-state";
import { normalizeEvidenceQuote } from "../contracts";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_BOTTOM = 56;
const BODY_COLOR = rgb(0.14, 0.23, 0.22);
const MUTED_COLOR = rgb(0.38, 0.46, 0.44);
const PRIMARY_COLOR = rgb(0.13, 0.42, 0.36);
const RULE_COLOR = rgb(0.84, 0.89, 0.87);

const FIELD_LABELS: Record<ReviewFinding["field"], string> = {
  condition: "Condition",
  medication_statement: "Medication",
  allergy_intolerance: "Allergy",
  observation: "Observation",
  service_request: "Requested service",
  follow_up: "Follow-up",
  visit_preparation: "Visit preparation",
  patient_instruction: "Patient instruction",
};

const DETAIL_LABELS = {
  dose: "Dose",
  frequency: "Frequency",
  documentedStatus: "Documented status",
  unit: "Unit",
  flag: "Flag",
} as const;

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
    let segment = "";
    for (const character of word) {
      if (
        segment &&
        font.widthOfTextAtSize(`${segment}${character}`, size) > width
      ) {
        lines.push(segment);
        segment = character;
      } else {
        segment += character;
      }
    }
    line = segment;
  }

  if (line) lines.push(line);
  return lines;
}

export async function createReviewPdf(
  documentName: string,
  findings: ReviewFinding[],
): Promise<Uint8Array> {
  const acceptedFindings = findings.filter(
    (finding) => finding.status === "accepted",
  );
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function addPage(continued = true) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    if (continued) {
      page.drawText("CLINICAL REVIEW SUMMARY", {
        x: MARGIN,
        y: PAGE_HEIGHT - 34,
        size: 8,
        font: bold,
        color: MUTED_COLOR,
      });
      page.drawLine({
        start: { x: MARGIN, y: PAGE_HEIGHT - 43 },
        end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 43 },
        thickness: 0.7,
        color: RULE_COLOR,
      });
      y = PAGE_HEIGHT - 66;
    }
  }

  function ensureSpace(height: number) {
    if (y - height < CONTENT_BOTTOM) addPage();
  }

  function drawText(
    text: string,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb>,
    options: { indent?: number; width?: number; gap?: number } = {},
  ) {
    const indent = options.indent ?? 0;
    const width = options.width ?? PAGE_WIDTH - MARGIN * 2 - indent;
    const lineHeight = size * 1.45;

    for (const line of wrapText(text, font, size, width)) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: MARGIN + indent,
        y: y - size,
        size,
        font,
        color,
      });
      y -= lineHeight;
    }
    y -= options.gap ?? 0;
  }

  drawText("Clinical Review Summary", bold, 23, PRIMARY_COLOR, { gap: 5 });
  drawText(
    "Human-reviewed findings from the selected source document",
    regular,
    10,
    MUTED_COLOR,
    { gap: 18 },
  );

  drawText("SOURCE DOCUMENT", bold, 8, MUTED_COLOR, { gap: 3 });
  drawText(documentName, regular, 10, BODY_COLOR, { gap: 10 });
  drawText(
    `Prepared ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date())}`,
    regular,
    9,
    MUTED_COLOR,
    { gap: 13 },
  );
  page.drawLine({
    start: { x: MARGIN, y: y + 3 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 3 },
    thickness: 1.2,
    color: PRIMARY_COLOR,
  });

  drawText(
    `${acceptedFindings.length} accepted finding${acceptedFindings.length === 1 ? "" : "s"}`,
    bold,
    12,
    BODY_COLOR,
    { gap: 4 },
  );
  drawText(
    "Only items explicitly accepted during review are included below.",
    regular,
    9,
    MUTED_COLOR,
    { gap: 8 },
  );

  if (acceptedFindings.length === 0) {
    drawText("No findings were accepted for export.", regular, 10, BODY_COLOR);
  }

  acceptedFindings.forEach((finding, index) => {
    ensureSpace(75);
    y -= 8;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.6,
      color: RULE_COLOR,
    });
    y -= 12;

    drawText(
      `${index + 1}. ${FIELD_LABELS[finding.field].toUpperCase()}`,
      bold,
      8,
      PRIMARY_COLOR,
      { gap: 4 },
    );

    const value =
      finding.field === "observation" && finding.name
        ? `${finding.name}: ${finding.editedValue}${finding.unit ? ` ${finding.unit}` : ""}`
        : finding.editedValue;
    drawText(value, bold, 12, BODY_COLOR, { gap: 5 });

    const details = (
      Object.keys(DETAIL_LABELS) as Array<keyof typeof DETAIL_LABELS>
    )
      .flatMap((key) => {
        const value = finding[key]?.trim();
        return value ? [`${DETAIL_LABELS[key]}: ${value}`] : [];
      });
    if (details.length > 0) {
      drawText(details.join("  |  "), regular, 9, BODY_COLOR, {
        indent: 8,
        gap: 5,
      });
    }

    if (finding.suggestedCode?.code.trim()) {
      drawText(
        `Suggested code (not independently verified): ${finding.suggestedCode.system} ${finding.suggestedCode.code}`,
        regular,
        9,
        MUTED_COLOR,
        { indent: 8, gap: 5 },
      );
    }

    const evidence =
      finding.evidence?.length
        ? finding.evidence
        : [
            {
              quote: normalizeEvidenceQuote(finding.sourceExcerpt),
              section: finding.sourceSection,
            },
          ];
    evidence.forEach((item) => {
      const sourceLabel = item.section
        ? `Source (${printableText(item.section)})`
        : "Source";
      drawText(
        `${sourceLabel}: "${normalizeEvidenceQuote(item.quote)}"`,
        regular,
        9,
        MUTED_COLOR,
        { indent: 8, gap: 3 },
      );
    });
    y -= 5;
  });

  ensureSpace(48);
  y -= 8;
  drawText(
    "This summary reflects the review decisions recorded in this application. It is not a substitute for the original document, a complete medical record, or professional clinical judgment.",
    regular,
    8,
    MUTED_COLOR,
  );

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawLine({
      start: { x: MARGIN, y: 39 },
      end: { x: PAGE_WIDTH - MARGIN, y: 39 },
      thickness: 0.6,
      color: RULE_COLOR,
    });
    const footer = `Clinical Review Summary  |  Page ${index + 1} of ${pages.length}`;
    pdfPage.drawText(printableText(footer), {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(footer, 8),
      y: 25,
      size: 8,
      font: regular,
      color: MUTED_COLOR,
    });
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
  link.download = `${documentName.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "_")}-review-summary.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
