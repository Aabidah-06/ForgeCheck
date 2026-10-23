/**
 * A deterministic, offline compatibility-rule registry. Rule handlers are
 * trusted modules, NEVER files from the scanned project.
 */
import { posix, win32 } from "node:path";
import type { FindingConfidence } from "./contracts.js";

export type RuleSeverity = "critical" | "high" | "medium" | "low" | "info";
export type RuleNotEvaluatedReason =
  | "missing-context" | "unsupported-context" | "insufficient-evidence";

export interface RuleApplicability {
  readonly languages: readonly string[];
  readonly affectedVersions: readonly string[];
  readonly operations: readonly string[];
}

/** Minimal, local-only context supplied by discovery and version extraction. */
export interface RuleContext {
  readonly projectRoot: string;
  readonly files: readonly string[];
  /** Callers must mark partial discovery explicitly; results will remain partial. */
  readonly coverage: "complete" | "partial";
  readonly facts?: Readonly<Record<string, string | number | boolean | null>>;
}

export type RuleObservation =
  | {
      readonly confidence: "confirmed-failure";
      /** Demonstrable rule-specific criterion (not a source excerpt). */
      readonly criterion: string;
      readonly message: string;
      readonly file: string;
      readonly line?: number;
      readonly column?: number;
    }
  | {
      readonly confidence: "review-required";
      readonly message: string;
      readonly file?: string;
      readonly line?: number;
      readonly column?: number;
    };

/** Safe exceptions are recorded as evaluated, with no finding. */
export type RuleAssessment =
  | { readonly kind: "matched"; readonly observations: readonly RuleObservation[] }
  | { readonly kind: "not-matched" }
  | { readonly kind: "safe-exception" }
  | { readonly kind: "not-evaluated"; readonly reason: RuleNotEvaluatedReason };

export interface CompatibilityRule {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  readonly applicability: RuleApplicability;
  /** HTTPS links to specifications, verified release notes or authoritative bugs. */
  readonly evidenceUrls: readonly string[];
  readonly safeExceptions: readonly string[];
  readonly severity: RuleSeverity;
  readonly remediation: string;
  readonly detect: (context: Readonly<RuleContext>) => RuleAssessment | Promise<RuleAssessment>;
}

export interface RuleFinding {
  readonly ruleId: string;
  readonly message: string;
  readonly confidence: FindingConfidence;
  readonly severity: RuleSeverity;
  readonly evidenceUrls: readonly string[];
  readonly remediation: string;
  readonly criterion?: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}
export interface RuleDiagnostic {
  readonly ruleId: string;
  readonly code: "rule-not-evaluated" | "rule-crashed" | "invalid-detection" | "incomplete-coverage";
  readonly message: string;
}
export interface RuleExecutionSummary {
  readonly ruleId: string;
  readonly status: "matched" | "not-matched" | "safe-exception" | "not-evaluated";
}
export interface RuleRunResult {
  readonly status: "complete" | "partial";
  readonly evaluatedRules: readonly RuleExecutionSummary[];
  readonly findings: readonly RuleFinding[];
  readonly diagnostics: readonly RuleDiagnostic[];
}

export class RuleRegistryError extends Error {
  constructor(readonly code: "invalid-rule" | "duplicate-rule" | "unknown-rule" | "invalid-context") {
    super(`Rule registry: ${code}`);
    this.name = "RuleRegistryError";
  }
}

const ID_PATTERN = /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+$/;
const SEVERITIES = new Set<RuleSeverity>(["critical", "high", "medium", "low", "info"]);
const REASONS = new Set<RuleNotEvaluatedReason>([
  "missing-context", "unsupported-context", "insufficient-evidence"
]);
const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const validText = (x: unknown): x is string =>
  typeof x === "string" && x.trim().length > 0 && x.length <= 2000 && !/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f]/.test(x);
const validArray = (x: unknown, nonempty: boolean): x is string[] =>
  Array.isArray(x) && (!nonempty || x.length > 0) && x.every(validText);
const validPosition = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) > 0;

function checkRule(rule: CompatibilityRule): void {
  if (!rule || typeof rule !== "object" || !ID_PATTERN.test(rule.id) ||
      !validText(rule.title) || !validText(rule.rationale) ||
      !validText(rule.remediation) || !SEVERITIES.has(rule.severity) ||
      typeof rule.detect !== "function" || !rule.applicability ||
      !validArray(rule.applicability.languages, true) ||
      !validArray(rule.applicability.affectedVersions, true) ||
      !validArray(rule.applicability.operations, true) ||
      !validArray(rule.safeExceptions, true) ||
      !validArray(rule.evidenceUrls, true)) {
    throw new RuleRegistryError("invalid-rule");
  }
  for (const url of rule.evidenceUrls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
        throw new Error("unsafe evidence URL");
      }
    } catch { throw new RuleRegistryError("invalid-rule"); }
  }
}

/**
 * Normalize either POSIX or Windows fixture paths to slash-separated paths.
 * Escapes, cross-drive references, empty paths and NULs are rejected.
 */
export function normalizeProjectPath(projectRoot: string, file: string): string {
  if (!validText(projectRoot) || !validText(file) || file.includes("\0")) {
    throw new RuleRegistryError("invalid-context");
  }
  const windows = /^[A-Za-z]:[\\/]/.test(projectRoot) || /^\\\\/.test(projectRoot);
  const path = windows ? win32 : posix;
  const root = windows ? path.resolve(projectRoot.replace(/\//g, "\\")) : path.resolve(projectRoot);
  const candidate = windows ? file.replace(/\//g, "\\") : file.replace(/\\/g, "/");
  // Reject Windows absolute paths under POSIX roots and vice versa.
  if ((!windows && (/^[A-Za-z]:[\\/]/.test(file) || file.startsWith("\\\\"))) ||
      (windows && file.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(file))) {
    throw new RuleRegistryError("invalid-context");
  }
  const resolved = path.resolve(root, candidate);
  const relativePath = path.relative(root, resolved);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(".." + path.sep) || path.isAbsolute(relativePath)) {
    throw new RuleRegistryError("invalid-context");
  }
  return relativePath.replace(/\\/g, "/");
}

function normalizedContext(context: RuleContext): RuleContext {
  if (!context || !validText(context.projectRoot) || !Array.isArray(context.files) ||
      (context.coverage !== "complete" && context.coverage !== "partial") ||
      (context.facts !== undefined &&
        (typeof context.facts !== "object" || context.facts === null || Array.isArray(context.facts)))) {
    throw new RuleRegistryError("invalid-context");
  }
  const files = [...new Set(context.files.map(path => normalizeProjectPath(context.projectRoot, path)))].sort(cmp);
  const facts: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(context.facts ?? {})) {
    if (!validText(key) || !(value === null || typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && validText(value)))) {
      throw new RuleRegistryError("invalid-context");
    }
    facts[key] = value;
  }
  return Object.freeze({
    projectRoot: context.projectRoot,
    files: Object.freeze(files),
    coverage: context.coverage,
    facts: Object.freeze(facts)
  });
}

function normalizeObservation(rule: CompatibilityRule, context: RuleContext, value: RuleObservation): RuleFinding {
  if (!value || !validText(value.message) ||
      (value.confidence !== "confirmed-failure" && value.confidence !== "review-required") ||
      (value.line !== undefined && !validPosition(value.line)) ||
      (value.column !== undefined && !validPosition(value.column)) ||
      (value.line === undefined && value.column !== undefined)) {
    throw new RuleRegistryError("invalid-context");
  }
  const file = value.file === undefined ? undefined : normalizeProjectPath(context.projectRoot, value.file);
  if (file !== undefined && !context.files.includes(file)) throw new RuleRegistryError("invalid-context");
  if (value.confidence === "confirmed-failure" && (!file || !validText(value.criterion))) {
    throw new RuleRegistryError("invalid-context");
  }
  if (!file && (value.line !== undefined || value.column !== undefined)) throw new RuleRegistryError("invalid-context");
  return {
    ruleId: rule.id, message: value.message, confidence: value.confidence,
    severity: rule.severity, evidenceUrls: rule.evidenceUrls, remediation: rule.remediation,
    ...(file === undefined ? {} : { file }),
    ...(value.line === undefined ? {} : { line: value.line }),
    ...(value.column === undefined ? {} : { column: value.column }),
    ...(value.confidence === "confirmed-failure" ? { criterion: value.criterion } : {})
  };
}

function failClosed(rule: CompatibilityRule, code: RuleDiagnostic["code"], message: string): {
  finding: RuleFinding; diagnostic: RuleDiagnostic;
} {
  return {
    finding: {
      ruleId: rule.id, message, confidence: "not-evaluated", severity: rule.severity,
      evidenceUrls: rule.evidenceUrls, remediation: rule.remediation
    },
    diagnostic: { ruleId: rule.id, code, message }
  };
}

/** Independent rule registration: adding rules does not alter the engine. */
export class RuleRegistry {
  private readonly rules = new Map<string, CompatibilityRule>();

  register(rule: CompatibilityRule): this {
    checkRule(rule);
    if (this.rules.has(rule.id)) throw new RuleRegistryError("duplicate-rule");
    // Snapshot mutable metadata, without freezing user-owned inputs.
    this.rules.set(rule.id, Object.freeze({
      ...rule,
      applicability: Object.freeze({
        languages: Object.freeze([...rule.applicability.languages]),
        affectedVersions: Object.freeze([...rule.applicability.affectedVersions]),
        operations: Object.freeze([...rule.applicability.operations])
      }),
      evidenceUrls: Object.freeze([...rule.evidenceUrls]),
      safeExceptions: Object.freeze([...rule.safeExceptions])
    }));
    return this;
  }

  list(): readonly CompatibilityRule[] {
    return [...this.rules.values()].sort((a, b) => cmp(a.id, b.id));
  }

  async execute(context: RuleContext, selection?: readonly string[]): Promise<RuleRunResult> {
    const ctx = normalizedContext(context);
    if (selection !== undefined && (!Array.isArray(selection) || selection.some(id => !this.rules.has(id)))) {
      throw new RuleRegistryError("unknown-rule");
    }
    const ids = [...new Set(selection ?? this.rules.keys())].sort(cmp);
    const findings: RuleFinding[] = [];
    const diagnostics: RuleDiagnostic[] = [];
    const evaluatedRules: RuleExecutionSummary[] = [];
    for (const id of ids) {
      const rule = this.rules.get(id);
      if (!rule) throw new RuleRegistryError("unknown-rule");
      try {
        const assessment = await rule.detect(ctx);
        if (!assessment || typeof assessment !== "object" || !(["matched", "not-matched", "safe-exception", "not-evaluated"].includes(assessment.kind))) {
          throw new RuleRegistryError("invalid-context");
        }
        if (assessment.kind === "matched") {
          if (!Array.isArray(assessment.observations) || assessment.observations.length === 0) {
            throw new RuleRegistryError("invalid-context");
          }
          const normalized = assessment.observations.map(item => normalizeObservation(rule, ctx, item));
          findings.push(...normalized);
          evaluatedRules.push({ ruleId: id, status: "matched" });
        } else if (assessment.kind === "not-evaluated") {
          if (!REASONS.has(assessment.reason)) throw new RuleRegistryError("invalid-context");
          const { finding, diagnostic } = failClosed(rule, "rule-not-evaluated", `Rule not evaluated: ${assessment.reason}`);
          findings.push(finding);
          diagnostics.push(diagnostic);
          evaluatedRules.push({ ruleId: id, status: "not-evaluated" });
        } else {
          evaluatedRules.push({ ruleId: id, status: assessment.kind });
        }
      } catch (error) {
        const invalid = error instanceof RuleRegistryError;
        const { finding, diagnostic } = failClosed(rule, invalid ? "invalid-detection" : "rule-crashed",
          invalid ? "Rule returned invalid or unsafe finding data" : "Rule execution failed; compatibility not evaluated");
        findings.push(finding);
        diagnostics.push(diagnostic);
        evaluatedRules.push({ ruleId: id, status: "not-evaluated" });
      }
      if (ctx.coverage === "partial") {
        diagnostics.push({ ruleId: id, code: "incomplete-coverage", message: "Input discovery was incomplete" });
      }
    }
    const orderFindings = (a: RuleFinding, b: RuleFinding): number =>
      cmp(a.ruleId, b.ruleId) || cmp(a.file ?? "", b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0) ||
      cmp(a.confidence, b.confidence) || cmp(a.message, b.message);
    findings.sort(orderFindings);
    diagnostics.sort((a, b) => cmp(a.ruleId, b.ruleId) || cmp(a.code, b.code));
    return {
      status: diagnostics.length ? "partial" : "complete",
      evaluatedRules, findings, diagnostics
    };
  }
}
