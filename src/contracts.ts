/** Public, read-only integration contracts for ForgeCheck. */
export interface ScanRequest { readonly projectRoot: string; }
export type FindingConfidence = "confirmed-failure" | "review-required" | "not-evaluated";
export interface ScanFinding {
  readonly ruleId: string;
  readonly message: string;
  readonly confidence: FindingConfidence;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly severity?: "critical" | "high" | "medium" | "low" | "info";
  readonly evidenceUrls?: readonly string[];
  readonly remediation?: string;
}
export type ScanResult =
  | { readonly status: "unavailable"; readonly reason: string }
  | { readonly status: "complete"; readonly findings: readonly ScanFinding[];
      readonly filesScanned?: number; readonly rulesEvaluated?: number };
export interface ScanEngine { scan(request: ScanRequest): Promise<ScanResult>; }
export interface ScanReporter { format(result: ScanResult): string; }
export interface CliIO { out(line: string): void; err(line: string): void; }
export interface CliServices {
  readonly engine: ScanEngine; readonly reporter: ScanReporter;
  readonly io: CliIO; readonly cwd: string; readonly version: string;
}
