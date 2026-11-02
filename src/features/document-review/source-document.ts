export const SYNTHETIC_SOURCE_DOCUMENT = {
  title: "Visit summary",
  description: "This fully synthetic note is provided for interface demonstration only.",
  sections: [
    {
      label: "Follow-up plan",
      text: "Please schedule a follow-up visit in 6 weeks.",
    },
    {
      label: "Preparation",
      text: "Bring the symptom journal to the next visit.",
    },
  ],
  text: [
    "This fully synthetic note is provided for interface demonstration only.",
    "Follow-up plan",
    "Please schedule a follow-up visit in 6 weeks.",
    "Preparation",
    "Bring the symptom journal to the next visit.",
  ].join("\n\n"),
} as const;

export function isDocumentEvidence(
  excerpt: string,
  sourceText: string,
  section?: string,
): boolean {
  return (
    sourceText.includes(excerpt) &&
    (section === undefined || sourceText.includes(section))
  );
}
