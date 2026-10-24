import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import type { CliServices, ScanEngine, ScanReporter, ScanResult } from "./contracts.js";

const redaction = createRequire(import.meta.url)("../src/modules/redaction/index.mjs") as {
  redactDiagnostic(value: string): string;
  redactReport(value: ScanResult): ScanResult;
};
function safe(value: string): string { return redaction.redactDiagnostic(value); }
function sanitized(result: ScanResult): ScanResult {
  const basic = redaction.redactReport(result);
  return result.status === "complete" && basic.status === "complete"
    ? { ...basic, ...(result.filesScanned === undefined ? {} : { filesScanned: result.filesScanned }),
                  ...(result.rulesEvaluated === undefined ? {} : { rulesEvaluated: result.rulesEvaluated }) }
    : basic;
}

export const EXIT = {
  OK: 0, INTERNAL_ERROR: 1, USAGE_ERROR: 2, UNAVAILABLE: 3, CONFIRMED_FAILURE: 4
} as const;

export const HELP = [
  "ForgeCheck — offline Stellar JavaScript/TypeScript compatibility reviews",
  "",
  "Usage:",
  "  forgecheck --help",
  "  forgecheck --version",
  "  forgecheck scan <directory> [--json]",
  "",
  "Commands:",
  "  scan <directory>  Inspect supported Stellar SDK integrations without executing them",
  "",
  "Options:",
  "  -h, --help        Show help (also: forgecheck scan --help)",
  "  -V, --version     Print version",
  "      --json        Machine-readable ScanResult JSON (scan command only)",
  "",
  "Coverage: SDK lifecycle, SDK v17 AST migration, Protocol 30 W-address",
  "review patterns and selected Horizon-to-RPC migration patterns.",
  "Incomplete or unsupported inputs exit 3, never silently pass.",
  "",
  "Exit codes: 0=completed without confirmed failures, 1=internal error,",
  "            2=usage/input error, 3=analysis unavailable or incomplete,",
  "            4=confirmed compatibility failure."
].join("\n");

const SCAN_HELP = [
  "Usage: forgecheck scan <directory> [--json]",
  "Offline, read-only checks for selected Stellar JS/TS compatibility patterns.",
  "Use --json for a versioned-shape ScanResult object.",
  "Review-required findings are advisory. Unknown/incomplete coverage returns status 3.",
  "No project scripts run; no network calls are made."
].join("\n");

export const unavailableEngine: ScanEngine = {
  async scan() { return { status: "unavailable", reason: "Scanner is unavailable." }; }
};

export const textReporter: ScanReporter = {
  format(result): string {
    const value = sanitized(result);
    if (value.status === "unavailable") return "ForgeCheck: scan unavailable. " + value.reason;
    const lines = ["ForgeCheck: scan complete — " + value.findings.length + " finding(s)."];
    if (value.filesScanned !== undefined) lines.push("Source files scanned: " + value.filesScanned + ".");
    if (value.rulesEvaluated !== undefined) lines.push("Rules evaluated: " + value.rulesEvaluated + ".");
    for (const finding of value.findings) {
      const loc = finding.file ? " " + finding.file +
        (finding.line === undefined ? "" : ":" + finding.line) : "";
      lines.push("[" + finding.confidence + "] " + finding.ruleId + loc +
        ": " + finding.message);
      for (const url of finding.evidenceUrls ?? []) lines.push("  Evidence: " + safe(url));
      if (finding.remediation) lines.push("  Recommendation: " + safe(finding.remediation));
    }
    return lines.join("\n");
  }
};
function usageError(services: CliServices, message: string): number {
  services.io.err("Error: " + safe(message) + "\nRun 'forgecheck --help' for usage.");
  return EXIT.USAGE_ERROR;
}

/** Testable CLI runner; the engine is always injected by the caller. */
export async function runCli(args: readonly string[], services: CliServices): Promise<number> {
  const [command, ...rest] = args;
  if (command === undefined) { services.io.out(HELP); return EXIT.OK; }
  if (command === "--help" || command === "-h" || command === "help") {
    if (rest.length) return usageError(services, "Help does not accept additional arguments.");
    services.io.out(HELP); return EXIT.OK;
  }
  if (command === "--version" || command === "-V" || command === "version") {
    if (rest.length) return usageError(services, "Version does not accept additional arguments.");
    services.io.out(services.version); return EXIT.OK;
  }
  if (command !== "scan") return usageError(services, "Unknown command or option '" + command + "'.");
  if (rest.length === 1 && (rest[0] === "--help" || rest[0] === "-h")) {
    services.io.out(SCAN_HELP); return EXIT.OK;
  }
  const json = rest.includes("--json");
  const positions = rest.filter(arg => arg !== "--json");
  if (!positions.length) return usageError(services, "Missing directory. Usage: forgecheck scan <directory> [--json].");
  if (positions.length !== 1 || rest.filter(arg => arg === "--json").length > 1) {
    return usageError(services, "Too many arguments for scan. Use: forgecheck scan <directory> [--json].");
  }
  const directory = positions[0];
  if (directory === undefined || directory.startsWith("-")) {
    return usageError(services, "Unknown scan option '" + (directory ?? "") + "'.");
  }
  const projectRoot = resolve(services.cwd, directory);
  try {
    const entry = await stat(projectRoot);
    if (!entry.isDirectory()) return usageError(services, "Target is not a directory: " + directory);
  } catch (error: unknown) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return usageError(services, "Directory does not exist: " + directory);
    }
    return usageError(services, "Cannot access directory: " + directory);
  }
  let result: ScanResult;
  try { result = await services.engine.scan({ projectRoot }); }
  catch { services.io.err("ForgeCheck: scan failed unexpectedly. No compatibility conclusion was produced.");
    return EXIT.INTERNAL_ERROR; }
  const clean = sanitized(result);
  if (json) services.io.out(JSON.stringify(clean, null, 2));
  else if (clean.status === "unavailable") services.io.err(services.reporter.format(clean));
  else services.io.out(services.reporter.format(clean));
  if (clean.status === "unavailable") return EXIT.UNAVAILABLE;
  return clean.findings.some(item => item.confidence === "confirmed-failure")
    ? EXIT.CONFIRMED_FAILURE : EXIT.OK;
}
