import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { CliServices, ScanEngine, ScanReporter, ScanResult } from "./contracts.js";

export const EXIT = {
  OK: 0,
  INTERNAL_ERROR: 1,
  USAGE_ERROR: 2,
  UNAVAILABLE: 3
} as const;

export const HELP = `ForgeCheck — Stellar application compatibility tooling

Usage:
  forgecheck --help
  forgecheck --version
  forgecheck scan <directory>

Commands:
  scan <directory>  Validate a local project directory (analysis not implemented yet)

Options:
  -h, --help        Show help (also: forgecheck scan --help)
  -V, --version     Print the version

Status: this release provides the CLI boundary only. The scanner and rules
are not implemented. A scan exits with code 3; it never reports false success.

Exit codes: 0=help/version/success, 1=internal error, 2=usage/input error,
            3=scan unavailable.
`;

const SCAN_HELP = `Usage: forgecheck scan <directory>

Checks that the target exists and is a directory.
Compatibility analysis is NOT implemented yet and will exit with status 3.
No network calls or project scripts are executed.
`;

export const unavailableEngine: ScanEngine = {
  async scan(): Promise<ScanResult> {
    return {
      status: "unavailable",
      reason: "Source discovery and compatibility rules are not implemented yet (issues #6–#12)."
    };
  }
};

export const textReporter: ScanReporter = {
  format(result): string {
    if (result.status === "unavailable") {
      return `ForgeCheck: scan unavailable. ${result.reason}`;
    }
    const count = result.findings.length;
    const lines = [`ForgeCheck: scan complete — ${count} finding(s).`];
    for (const finding of result.findings) {
      const location = finding.file
        ? ` ${finding.file}${finding.line === undefined ? "" : `:${finding.line}`}`
        : "";
      lines.push(`[${finding.confidence}] ${finding.ruleId}${location}: ${finding.message}`);
    }
    return lines.join("\n");
  }
};

function usageError(services: CliServices, message: string): number {
  services.io.err(`Error: ${message}\nRun 'forgecheck --help' for usage.`);
  return EXIT.USAGE_ERROR;
}

/** Execute the CLI with injectable analysis/reporting services. No process.exit(). */
export async function runCli(
  args: readonly string[],
  services: CliServices
): Promise<number> {
  const [command, ...rest] = args;

  if (command === undefined) {
    services.io.out(HELP);
    return EXIT.OK;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    if (rest.length !== 0) {
      return usageError(services, "Help does not accept additional arguments.");
    }
    services.io.out(HELP);
    return EXIT.OK;
  }

  if (command === "--version" || command === "-V" || command === "version") {
    if (rest.length !== 0) {
      return usageError(services, "Version does not accept additional arguments.");
    }
    services.io.out(services.version);
    return EXIT.OK;
  }

  if (command !== "scan") {
    return usageError(services, `Unknown command or option '${command}'.`);
  }

  if (rest.length === 1 && (rest[0] === "--help" || rest[0] === "-h")) {
    services.io.out(SCAN_HELP);
    return EXIT.OK;
  }

  if (rest.length === 0) {
    return usageError(services, "Missing directory. Usage: forgecheck scan <directory>.");
  }

  if (rest.length > 1) {
    return usageError(services, "Too many arguments for scan. Use: forgecheck scan <directory>.");
  }

  const directory = rest[0];
  if (directory === undefined || directory.startsWith("-")) {
    return usageError(services, `Unknown scan option '${directory ?? ""}'.`);
  }

  const projectRoot = resolve(services.cwd, directory);

  try {
    const entry = await stat(projectRoot);
    if (!entry.isDirectory()) {
      return usageError(services, `Target is not a directory: ${directory}`);
    }
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return usageError(services, `Directory does not exist: ${directory}`);
    }
    return usageError(services, `Cannot access directory: ${directory}`);
  }

  let result: ScanResult;
  try {
    result = await services.engine.scan({ projectRoot });
  } catch {
    services.io.err("ForgeCheck: scan failed unexpectedly. No compatibility conclusion was produced.");
    return EXIT.INTERNAL_ERROR;
  }

  if (result.status === "unavailable") {
    services.io.err(services.reporter.format(result));
    return EXIT.UNAVAILABLE;
  }

  services.io.out(services.reporter.format(result));
  return EXIT.OK;
}
