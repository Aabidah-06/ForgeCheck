# ForgeCheck

**Stellar application compatibility tooling — under development.**

ForgeCheck is an independent open-source project by [SoraForge](https://github.com/SoraForge). Its goal is to identify evidence-backed SDK, RPC and protocol compatibility risks in applications built on Stellar.

> **Current status:** The Node.js 22+ TypeScript CLI is runnable, but **compatibility scanning is not implemented**. Running `scan` on an existing directory exits with status 3 and does not claim that the project was checked. Standalone discovery (#6) and rule-registry (#8) APIs are implemented, but dependency context, concrete rules, and CLI integration remain pending; see [issues #6–#13](https://github.com/SoraForge/ForgeCheck/issues).

## Getting started

Prerequisites: Node.js **22 or later**, npm.

```sh
git clone https://github.com/SoraForge/ForgeCheck.git
cd ForgeCheck
npm ci
npm run build
node dist/cli.js --help
node dist/cli.js --version
node dist/cli.js scan .
npm test
npm run check:repo
```

The built CLI is available at `dist/cli.js`; the package also declares a `forgecheck` binary for future packaging. It is **not published** to npm. Run it locally with `node dist/cli.js` (do not use `npx` to download unrelated packages).

**Supported commands now:**

- `forgecheck --help` (also `-h` or `help`) — CLI usage.
- `forgecheck --version` (also `-V` or `version`) — package version.
- `forgecheck scan <directory>` — validates that a local directory exists, then prints a clear *analysis unavailable* message. It **does not analyze compatibility yet**.
- `forgecheck scan --help` — scan-specific help.

**Exit codes:** `0` help/version or a completed scan (when a real scanner is wired in), `1` internal failure, `2` invalid command/path, `3` analysis unavailable. The default CLI currently cannot successfully complete a scan.

The CLI makes no network requests and executes no scripts from the target project. It does not need Stellar keys or credentials.

## Contributing to the engine

The typed interfaces in [src/contracts.ts](src/contracts.ts) define `ScanEngine`, `ScanRequest`, `ScanResult`, `ScanFinding`, and `ScanReporter`. The CLI implementation in [src/application.ts](src/application.ts) accepts injected implementations; integration will be handled in [issue #13](https://github.com/SoraForge/ForgeCheck/issues/13). Independent APIs are exported as `@soraforge/forgecheck/discovery` and `@soraforge/forgecheck/rules` and are not used by the CLI yet.

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
