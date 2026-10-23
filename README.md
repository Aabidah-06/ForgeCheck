# ForgeCheck

**Stellar application compatibility tooling — under development.**

ForgeCheck is an independent open-source project of [SoraForge](https://github.com/SoraForge). Its goal is to identify evidence-backed SDK, RPC, and protocol compatibility risks in applications built on Stellar.

> **Status (October 2026): foundation only.** There is currently **no working ForgeCheck CLI, scanner or production release**. The repository contains governance, technical specifications and checks for the repository itself.

## Planned capabilities

- A TypeScript-first CLI for inspecting application dependencies and integration assumptions.
- A version-aware rule library sourced from Stellar's documented protocol and SDK changes.
- Review findings that distinguish confirmed failures from suspicious patterns and untested scenarios.
- Reproducible fixtures, CI reporting, and later explicitly opt-in isolated integration tests.

**Non-goals:** another generic static-analysis engine, custody of assets, automatically running application code, or claims of formal security certification.

## Development setup (foundation only)

Node.js 22+ is required. No external npm packages are needed to run foundation checks:

```sh
npm run check:repo
npm test
```

These validate **repository documentation and templates**, not Stellar applications. Installation instructions for the actual product will be added when the CLI exists.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Compatibility rule quality standard](docs/RULES.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

## Governance and affiliation

SoraForge is independently run and not affiliated with or endorsed by the Stellar Development Foundation. This repository **has not been accepted into Drips Wave**. Participation and contributor rewards, if any, would be subject to program rules and acceptance by organizers.

Licensed under [Apache License 2.0](LICENSE).
