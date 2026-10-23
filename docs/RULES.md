# Compatibility Rule Quality Standard and Registry (issue #8)

ForgeCheck provides a typed, **standalone** rule registry in `src/rules.ts`. It does **not** yet ship a compatibility rule catalog or wire this registry into the CLI. Actual version extraction and individual rules belong to subsequent issues.

## Rule contract

Each trusted `CompatibilityRule` module must supply:

- Stable slash-separated lower-case ID such as `stellar/my-check`, descriptive title and rationale.
- Applicable language(s), affected version(s), and operation(s), expressed as explicit, non-empty metadata arrays. The rule handler checks applicability against the local version context once available.
- One or more authoritative HTTPS evidence URLs (specifications, release notes or validated issues).
- Explicit safe exceptions and severity independent of certainty (`critical`, `high`, `medium`, `low`, `info`).
- Actionable remediation and an independent `detect(context)` handler returning one of `matched`, `not-matched`, `safe-exception`, or `not-evaluated`.

`RuleRegistry.register(rule)` validates and snapshots metadata, rejecting missing fields, malformed evidence links and duplicate IDs. Rules are sorted by ID. `registry.execute({projectRoot, files, coverage, facts?}, selection?)` invokes selected handlers in ID order. `selection` is optional, but unknown IDs fail explicitly rather than silently being skipped.

`files` contains local project-relative paths from discovery; file paths emitted by a rule are normalized and **must be members of that inventory**. Absolute paths are allowed only when they stay inside the declared project root. Path normalization supports POSIX and Windows fixture paths. Input coverage must be marked `complete` or `partial`; partial inputs remain partial and produce diagnostics.

## Findings and certainty

- **`confirmed-failure`** — a demonstrated, rule-specific criterion, an inventory-backed file location, an authoritative rule evidence URL, and remediation are required. The handler must actually verify the criterion; a mere regular-expression suspicion is insufficient.
- **`review-required`** — contextual evidence indicates potential risk, but the rule cannot establish the behavior is definitely incorrect. Include file and line when known.
- **`not-evaluated`** — insufficient/missing context, a failed handler or malformed output. This is *not* an all-clear or an absent finding.

Each normalized finding carries `ruleId`, `confidence`, **separate** `severity`, `message`, `evidenceUrls`, `remediation`, and optional project-relative `file`, `line`, `column` and verified criterion. Findings and diagnostics are deterministic and sorted. Invalid or external paths, unsound confirmed findings, malformed handler output and unexpected exceptions are converted into `not-evaluated` findings without exposing exception strings, source excerpts or stack traces.

A safe exception is an **evaluated** outcome with zero findings. A no-match is also evaluated, provided input coverage was complete. If discovery reports partial coverage, the registry adds `incomplete-coverage` diagnostics and never returns a complete conclusion.

## Usage

```ts
import { RuleRegistry } from "@soraforge/forgecheck/rules";
import { discoverProjectFiles } from "@soraforge/forgecheck/discovery";
import { myRule } from "./trusted-rules/my-rule.js";

const discovery = await discoverProjectFiles({ projectRoot: process.cwd() });
const registry = new RuleRegistry().register(myRule);
const result = await registry.execute({
  projectRoot: discovery.projectRoot,
  files: discovery.files,
  coverage: discovery.complete ? "complete" : "partial"
});
```

## Security and limitations

The registry itself does **not** import scanned project code, run project scripts, send telemetry or call the network. It exposes local paths/facts, not source excerpts. Only repository-reviewed trusted rule modules should be registered: a JavaScript `detect()` implementation is arbitrary executable code and **cannot be sandboxed** by this registry. Rule authors must not import/execute the user's source, access credentials, upload source material, or include raw contents/secrets in findings. The registry sanitizes thrown errors, enforces location containment and rejects multiline control characters, but cannot prove that a trusted rule author's static message contains no sensitive data. No source contents are automatically read or included in a finding.

Use positive fixtures, safe-exception fixtures and counterexamples. Avoid false positives: a G-only address check may be correct in an account-creation workflow yet risky in a general payment-destination workflow. Do not mark it confirmed without checking operation semantics. The framework is not a claim of whole-project safety or official Stellar endorsement.
