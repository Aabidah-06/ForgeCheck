/** Offline, fail-closed integration of discovery, dependency context and rule modules. */
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import ts from "typescript";
import type { ScanEngine, ScanFinding, ScanResult } from "./contracts.js";
import { discoverProjectFiles } from "./discovery.js";
import { resolveStellarDependencies } from "./dependencies.js";
import { RuleRegistry, type CompatibilityRule } from "./rules.js";
import { sdkLifecycleRule } from "./rules/sdk-lifecycle.js";
import { scanSdkV17Source } from "./rules/sdk-v17.js";
import { scanWAddressSource } from "./rules/w-address.js";
import { analyzeHorizonSource } from "./rules/horizon.js";
import type { SourceRuleFinding, SourceRuleInput } from "./rules/source.js";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_FILES = 2000;
const COMPAT_DOC = "https://developers.stellar.org/docs/";
const SRC_EXT = /\.(?:js|jsx|ts|tsx)$/i;

const SOURCE_SPECS: Readonly<Record<string, {
  readonly evidence: string; readonly remediation: string;
}>> = {
  "stellar-sdk-v17/xdr-method-rename": {
    evidence: "https://stellar.github.io/js-stellar-sdk/migration/xdr-migration/",
    remediation: "Review the SDK v17 migration guide and the method's precise API usage."
  },
  "stellar-sdk-v17/byte-buffer-method": {
    evidence: "https://stellar.github.io/js-stellar-sdk/migration/uint8array-migration/",
    remediation: "Update affected Buffer assumptions to Uint8Array-compatible operations."
  },
  "protocol-30/w-address-strkey-validator": {
    evidence: "https://stellar.org/blog/developers/bell-protocol-30-upgrade-guide",
    remediation: "Review generic address handling for W support, preserving account-only restrictions."
  },
  "protocol-30/w-address-prefix-regex": {
    evidence: "https://stellar.org/blog/developers/bell-protocol-30-upgrade-guide",
    remediation: "Review generic address-prefix validation; do not change intentional G-only flows."
  },
  "protocol-30/w-address-prefix-switch": {
    evidence: "https://stellar.org/blog/developers/bell-protocol-30-upgrade-guide",
    remediation: "Review generic address prefix switches for appropriate W support."
  },
  "stellar/horizon-rpc-account": {
    evidence: "https://developers.stellar.org/docs/data/apis/migrate-from-horizon-to-rpc",
    remediation: "Review Horizon account methods versus RPC current-ledger-state capabilities."
  },
  "stellar/horizon-rpc-transaction": {
    evidence: "https://developers.stellar.org/docs/data/apis/migrate-from-horizon-to-rpc",
    remediation: "Review the availability window and semantics of RPC transaction methods."
  },
  "stellar/horizon-rpc-submit": {
    evidence: "https://developers.stellar.org/docs/data/apis/migrate-from-horizon-to-rpc",
    remediation: "Review RPC transaction submission and subsequent status polling."
  },
  "stellar/horizon-rpc-server": {
    evidence: "https://developers.stellar.org/docs/data/apis/migrate-from-horizon-to-rpc",
    remediation: "Review actual Horizon endpoints; historical data may still need Horizon."
  }
};

function within(root: string, absolute: string): boolean {
  const rel = relative(root, absolute);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}

/** Reads a bounded file with no-follow and containment checks. Never executes target code. */
async function readSource(root: string, path: string): Promise<string> {
  if (!path || isAbsolute(path) || path.split("/").includes("..") ||
      path.includes("\\") || path.includes("\0")) throw Error("unsafe file path");
  const absolute = resolve(root, path);
  if (!within(root, absolute) || !within(root, await realpath(absolute))) throw Error("unsafe file path");
  const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const st = await handle.stat();
    if (!st.isFile() || st.size > MAX_FILE_BYTES) throw Error("source exceeds per-file limit");
    const chunks: Buffer[] = [];
    const scratch = Buffer.alloc(64 * 1024);
    let size = 0;
    while (true) {
      const { bytesRead } = await handle.read(scratch, 0, scratch.length, null);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > MAX_FILE_BYTES) throw Error("source exceeds per-file limit");
      chunks.push(Buffer.from(scratch.subarray(0, bytesRead)));
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally { await handle.close(); }
}

function versionFor(file: string, items: readonly {
  manifest: string; packageName: string; resolution: string; resolvedVersion?: string;
}[]): string | undefined {
  const scope = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
  const candidates = items.filter(x => x.packageName === "@stellar/stellar-sdk" &&
    x.resolution === "resolved" && x.resolvedVersion &&
    (x.manifest === "package.json" || (scope !== "" &&
     scope.startsWith(x.manifest.slice(0, x.manifest.lastIndexOf("/") + 1)))));
  const versions = [...new Set(candidates.map(x => x.resolvedVersion))];
  return versions.length === 1 ? versions[0] : undefined;
}

function sourceRule(id: string, evidence: string, remediation: string,
                    matches: readonly SourceRuleFinding[]): CompatibilityRule {
  return {
    id, title: id, rationale: "Review documented Stellar integration compatibility assumptions.",
    applicability: { languages: ["javascript", "typescript"], affectedVersions: ["version-dependent"],
                     operations: ["integration migration"] },
    evidenceUrls: [evidence, COMPAT_DOC],
    safeExceptions: ["Unrelated code and intentional operation-specific restrictions."],
    severity: "medium", remediation,
    detect() {
      const observations = matches.filter(f => f.ruleId === id).map(f => ({
        confidence: "review-required" as const, file: f.file,
        line: f.line, column: f.column, message: f.message
      }));
      return observations.length ? { kind: "matched" as const, observations }
        : { kind: "not-matched" as const };
    }
  };
}

export const projectScanEngine: ScanEngine = {
  async scan({ projectRoot }): Promise<ScanResult> {
    const discovery = await discoverProjectFiles({
      projectRoot, maxFiles: 5000, maxEntries: 60000, maxDepth: 32
    });
    if (!discovery.complete) {
      return { status: "unavailable", reason: "File discovery incomplete; no all-clear result can be issued." };
    }
    const dependencies = await resolveStellarDependencies(discovery);
    if (!dependencies.complete) {
      return { status: "unavailable", reason: "SDK dependency context could not be evaluated completely." };
    }
    const sourceFiles = discovery.files.filter(f => SRC_EXT.test(f));
    if (sourceFiles.length > MAX_SOURCE_FILES) {
      return { status: "unavailable", reason: "Source file count exceeds safe scan limit." };
    }
    const sourceFindings: SourceRuleFinding[] = [];
    let bytes = 0;
    let foundImport = false;
    for (const file of sourceFiles) {
      let code: string;
      try { code = await readSource(discovery.projectRoot, file); }
      catch { return { status: "unavailable", reason: "Source could not be safely read: " + file }; }
      bytes += Buffer.byteLength(code, "utf8");
      if (bytes > MAX_TOTAL_BYTES) return { status: "unavailable", reason: "Source size exceeds scan limit." };
      // These checks are advisory when precise SDK version/application context is unknown.
      const syntax = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true,
        /\.tsx$/i.test(file) ? ts.ScriptKind.TSX :
        /\.jsx$/i.test(file) ? ts.ScriptKind.JSX :
        /\.ts$/i.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
      // Recognize actual syntax nodes, not string literals/comments describing imports.
      function isSdk(value: string): boolean {
        return /^(?:@stellar\/(?:stellar-sdk|stellar-base)|stellar-sdk|stellar-base)(?:\/.*)?$/.test(value);
      }
      function findSdkImport(node: ts.Node): void {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) &&
            isSdk(node.moduleSpecifier.text)) foundImport = true;
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
            node.expression.text === "require" && node.arguments.length === 1 &&
            node.arguments[0] && ts.isStringLiteral(node.arguments[0]) &&
            isSdk(node.arguments[0].text)) foundImport = true;
        ts.forEachChild(node, findSdkImport);
      }
      findSdkImport(syntax);
      const parsed = syntax as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] };
      if ((parsed.parseDiagnostics?.length ?? 0) > 0) {
        return { status: "unavailable", reason: "Source syntax could not be completely parsed: " + file };
      }
      const resolvedSdkVersion = versionFor(file, dependencies.dependencies);
      const input: SourceRuleInput = { file, source: code,
        ...(resolvedSdkVersion === undefined ? {} : { resolvedSdkVersion }) };
      sourceFindings.push(...scanSdkV17Source(input));
      sourceFindings.push(...scanWAddressSource(input));
      // Horizon is a standalone AST analyzer with equivalent conservative confidence.
      sourceFindings.push(...analyzeHorizonSource(code, file).map(f => ({
        ruleId: f.ruleId, file: f.file ?? file, line: f.line ?? 1, column: 1,
        message: f.message, confidence: "review-required" as const,
        suggestion: f.suggestion, evidenceUrl: f.evidence[0] ?? COMPAT_DOC,
        affectedVersions: "Horizon-to-RPC migration", versionContext: "Migration review only"
      })));
    }
    if (dependencies.dependencies.length === 0 && !foundImport) {
      return { status: "unavailable",
        reason: "No supported Stellar JavaScript SDK integration was identified; not evaluated." };
    }
    const registry = new RuleRegistry();
    registry.register(sdkLifecycleRule(dependencies.dependencies));
    for (const [id, spec] of Object.entries(SOURCE_SPECS)) {
      registry.register(sourceRule(id, spec.evidence, spec.remediation, sourceFindings));
    }
    const run = await registry.execute({
      projectRoot: discovery.projectRoot, files: discovery.files, coverage: "complete"
    });
    if (run.status !== "complete" || run.diagnostics.length) {
      return { status: "unavailable",
        reason: "At least one compatibility rule could not be evaluated completely." };
    }
    const findings: ScanFinding[] = run.findings.map(f => ({
      ruleId: f.ruleId, message: f.message, confidence: f.confidence,
      severity: f.severity, evidenceUrls: f.evidenceUrls, remediation: f.remediation,
      ...(f.file ? { file: f.file } : {}),
      ...(f.line === undefined ? {} : { line: f.line }),
      ...(f.column === undefined ? {} : { column: f.column })
    }));
    return { status: "complete", findings,
      filesScanned: sourceFiles.length, rulesEvaluated: run.evaluatedRules.length };
  }
};
