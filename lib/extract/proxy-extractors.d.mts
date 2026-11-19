import type { BallotItem } from "../types";

export interface ExtractionInfo {
  method: string;
  version: string;
  gaps: string[];
  automated: true;
}
export function extractBallot(input: { html: string; accession: string; filingDate: string }): {
  items: BallotItem[];
  meta: { meetingDate: string | null; fiscalYear: number | null; meetingYear: number };
  extraction: ExtractionInfo;
};
export function htmlToText(html: string): string;
