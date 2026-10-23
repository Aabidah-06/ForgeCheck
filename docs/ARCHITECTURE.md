# ForgeCheck Architecture

**Status:** CLI transport and interfaces exist; source discovery, rule engine and actual compatibility detection are **not yet implemented**.

## Implemented CLI boundary (issue #5)

`src/contracts.ts` exports `ScanEngine`, `ScanRequest`, `ScanResult`, `ScanFinding`, and `ScanReporter`. `src/application.ts` validates commands and local directory arguments and delegates analysis to an injected `ScanEngine`. The default engine always returns `unavailable` until future components are actually merged.

```text
forgecheck CLI (implemented)
    |
    +--> input validation (implemented)
    |
    +--> ScanEngine (interface; default unavailable)
              |
              +--> discovery (planned #6)
              +--> dependency context (planned #7)
              +--> rule registry (planned #8)
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
