# ForgeCheck Architecture

**Status:** CLI transport and interfaces exist. Safe discovery (#6) and the rule registry (#8) are implemented as standalone modules. Dependency context, concrete compatibility rules and CLI integration are still pending; the default CLI scan does not report success.

## Implemented CLI boundary (issue #5)

`src/contracts.ts` exports `ScanEngine`, `ScanRequest`, `ScanResult`, `ScanFinding`, and `ScanReporter`. `src/application.ts` validates commands and local directory arguments and delegates analysis to an injected `ScanEngine`. The default engine still returns `unavailable` until the complete analysis pipeline is wired in.

```text
forgecheck CLI (implemented)
    |
    +--> input validation (implemented)
    |
    +--> ScanEngine (interface; default unavailable)
              |
              +--> discovery (implemented library #6)
              +--> dependency context (planned #7)
              +--> rule registry (implemented library #8)
              +--> compatibility rules (planned #9–#12)
    |
    +--> ScanReporter (text format; extensible via #13)
```

## Proposed integration architecture

1. Discover relevant source files, manifests and supported lockfiles without reading secrets.
2. Determine declared and lockfile-resolved SDK versions, preserving uncertainty.
3. Execute authoritative, version-aware compatibility checks with positive and negative fixtures.
4. Produce results classified `confirmed-failure`, `review-required` or `not-evaluated`.
5. Produce terminal and later structured CI output.

**Security invariants:** Scans are read-only and offline by default; executing project scripts, installing dependencies into the target, collecting keys or uploading source files is forbidden. Purposefully G-only address checks must not be classified as bugs without verifying operation semantics. See [rule policy](RULES.md) and [roadmap](ROADMAP.md).

The first implementation targets Node.js 22+ with TypeScript ESM compiled using `tsc`. Built files are emitted under `dist/` and ignored by Git.

The standalone `src/discovery.ts` module provides bounded, deterministic, secret-avoiding filesystem inventory with explicit partial-coverage diagnostics. The `src/rules.ts` module provides isolated rule registration, typed certainty/severity findings, evidence metadata and fail-closed execution. Neither is currently connected to the default CLI `unavailableEngine`; see [discovery documentation](DISCOVERY.md) and [rule documentation](RULES.md).
