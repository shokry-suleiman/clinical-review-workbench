import type { ExtractionResponse, Scenario } from "./contracts";

const validResponse = {
  findings: [
    {
      id: "follow-up-01",
      field: "follow_up",
      value: "Follow up in 6 weeks",
      sourceExcerpt: "Please schedule a follow-up visit in 6 weeks.",
      sourceSection: "Follow-up plan",
    },
    {
      id: "preparation-01",
      field: "visit_preparation",
      value: "Bring the symptom journal to the next visit",
      sourceExcerpt: "Bring the symptom journal to the next visit.",
      sourceSection: "Preparation",
    },
  ],
} satisfies ExtractionResponse;

const partialResponse = {
  findings: [
    {
      id: "follow-up-01",
      field: "follow_up",
      value: "Follow up in 6 weeks",
      sourceExcerpt: "Please schedule a follow-up visit in 6 weeks.",
    },
  ],
} satisfies ExtractionResponse;

export function getMockExtractionResponse(scenario: Exclude<Scenario, "service-failure">): unknown {
  if (scenario === "malformed") {
    return {
      findings: [
        {
          id: "broken-01",
          field: "follow_up",
          value: 6,
          sourceExcerpt: null,
        },
      ],
    };
  }

  return scenario === "partial" ? partialResponse : validResponse;
}
