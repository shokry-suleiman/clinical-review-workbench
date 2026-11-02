import type { ExtractionResponse } from "../contracts";

export type ExtractionProviderMetadata = {
  modelName: string;
  promptVersion: string;
};

export interface ExtractionProvider {
  readonly metadata: ExtractionProviderMetadata;
  extract(documentText: string): Promise<ExtractionResponse>;
}
