export type RedactionType = "name" | "date_of_birth" | "mrn" | "address";

export type DeidentificationResult = {
  text: string;
  redactionCounts: Record<RedactionType, number>;
  restore(value: string): string;
};

const LABEL_PATTERNS: Array<{
  type: RedactionType;
  pattern: RegExp;
}> = [
  {
    type: "date_of_birth",
    pattern:
      /\b(?:date\s+of\s+birth|birth\s+date|dob|geburtsdatum|geb\.?\s*am)\s*[:=]\s*([^;\r\n|]+)/giu,
  },
  {
    type: "mrn",
    pattern:
      /\b(?:medical\s+record\s+(?:number|no\.?)|mrn|patient\s*(?:id|number)|aktenzeichen|fallnummer)\s*[:=#]\s*([A-Z0-9][A-Z0-9-]{2,})/giu,
  },
  {
    type: "address",
    pattern:
      /\b(?:home\s+address|address|anschrift|adresse|wohnort)\s*[:=]\s*([^\r\n]+)/giu,
  },
  {
    type: "name",
    pattern:
      /\b(?:patient(?:\s*name|enname|in(?:nen)?name)?|name\s+of\s+patient|name)\s*[:=]\s*([^;\r\n|]+)/giu,
  },
];

export function deidentifyDocument(sourceText: string): DeidentificationResult {
  const counts: Record<RedactionType, number> = {
    name: 0,
    date_of_birth: 0,
    mrn: 0,
    address: 0,
  };
  const replacements = new Map<string, string>();
  let text = sourceText;

  for (const { type, pattern } of LABEL_PATTERNS) {
    text = text.replace(pattern, (match, value: string) => {
      const marker = `[REDACTED_${type.toUpperCase()}_${counts[type] + 1}]`;
      const valueStart = match.indexOf(value);
      replacements.set(marker, value);
      counts[type] += 1;
      return `${match.slice(0, valueStart)}${marker}${match.slice(valueStart + value.length)}`;
    });
  }

  return {
    text,
    redactionCounts: counts,
    restore(value: string) {
      let restored = value;
      for (const [marker, original] of replacements) {
        restored = restored.replaceAll(marker, original);
      }
      return restored;
    },
  };
}
