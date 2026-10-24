# ForgeCheck

**Stellar application compatibility tooling — under development.**

ForgeCheck is an independent open-source project by [SoraForge](https://github.com/SoraForge). Its goal is to identify evidence-backed SDK, RPC and protocol compatibility risks in applications built on Stellar.

> **Status:** Initial offline JS/TS compatibility scanning is wired into the CLI, covering selected documented SDK lifecycle, v17 migration, Protocol 30 address, and Horizon-to-RPC review checks. Coverage is intentionally limited; advisory findings do not prove runtime failure. Incomplete scans fail closed.

## Getting started

Prerequisites: Node.js **22 or later**, npm.

```sh
git clone https://github.com/SoraForge/ForgeCheck.git
cd ForgeCheck
npm ci
npm run build
node dist/cli.js --help
node dist/cli.js --version
node dist/cli.js scan /path/to/stellar-project --json
npm test
npm run check:repo
```

The built CLI is available at `dist/cli.js`; the package also declares a `forgecheck` binary for future packaging. It is **not published** to npm. Run it locally with `node dist/cli.js` (do not use `npx` to download unrelated packages).

**Supported commands now:**

- `forgecheck --help` (also `-h` or `help`) — CLI usage.
- `forgecheck --version` (also `-V` or `version`) — package version.
- `forgecheck scan <directory> [--json]` — inspect discovered JS/TS files, resolve npm lockfile context, and run the initial rules offline. An unsupported/incomplete target is explicitly unavailable, never silently clean.
- `forgecheck scan --help` — scan-specific help.

**JSON output:** `--json` returns `status`, `findings`, `filesScanned` and `rulesEvaluated` for completed scans. Findings include rule IDs, confidence, file/line, evidence links and remediation. Reports are redacted as defense-in-depth; do not publish unreviewed reports containing sensitive project metadata.

**Exit codes:** `0` completed scan without confirmed failures (including advisory findings), `1` internal failure, `2` invalid command/path, `3` incomplete or unsupported analysis, `4` confirmed failure. Initial built-in checks are conservative and normally produce review-required rather than confirmed-failure findings.

The CLI makes no network requests and executes no scripts from the target project. It does not need Stellar keys or credentials. By default the scanner has bounded file limits and ignores common build/secret directories. Supported lock context currently focuses on npm; not all imports, networks, dynamic behavior, or protocols can be evaluated. A no-findings result is not a security audit or guarantee.

## Contributing to the engine

The typed interfaces in [src/contracts.ts](src/contracts.ts) define `ScanEngine`, `ScanRequest`, `ScanResult`, `ScanFinding`, and `ScanReporter`. The CLI implementation in [src/application.ts](src/application.ts) accepts injected implementations; [src/scanner.ts](src/scanner.ts) wires the offline source discovery, SDK context, and rule registry. Source/registry APIs remain available for independently authored rules.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Local source discovery](docs/DISCOVERY.md)
- [Rule registry and proposal standards](docs/RULES.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)

## Governance and affiliation

ForgeCheck is independent and is not endorsed by the Stellar Development Foundation. The repository **has not been accepted into Drips Wave**; participating in future Waves requires organizer approval.

Licensed under [Apache License 2.0](LICENSE).
