/**
 * Stable integration boundary for future ForgeCheck modules.
 * Issue #5 ships the interface, not an implementation of project scanning.
 * Discovery (#6), context (#7), rules (#8–#12) and reporting (#13)
 * must integrate without importing or executing target projects.
 */
export interface ScanRequest {
  /** Absolute directory path; not a request to execute the project. */
  readonly projectRoot: string;
}

export type FindingConfidence =
  | "confirmed-failure"
  | "review-required"
  | "not-evaluated";

export interface ScanFinding {
  readonly ruleId: string;
  readonly message: string;
  readonly confidence: FindingConfidence;
  readonly file?: string;
  readonly line?: number;
}

export type ScanResult =
  | { readonly status: "unavailable"; readonly reason: string }
  | { readonly status: "complete"; readonly findings: readonly ScanFinding[] };

export interface ScanEngine {
  scan(request: ScanRequest): Promise<ScanResult>;
}

export interface ScanReporter {
  format(result: ScanResult): string;
}

export interface CliIO {
  out(line: string): void;
  err(line: string): void;
}

export interface CliServices {
  readonly engine: ScanEngine;
  readonly reporter: ScanReporter;
  readonly io: CliIO;
  readonly cwd: string;
  readonly version: string;
}
