# Contributing to ForgeCheck

We welcome genuine contributions with reproducible requirements and tests. ForgeCheck is currently an *under-development CLI*, not a fully implemented compatibility analyzer.

## Proposing work

1. Search existing issues and avoid duplicates. The initial [core-functionality backlog](https://github.com/SoraForge/ForgeCheck/issues) begins with issue #5.
2. Explain the real Stellar developer problem and affected SDK/API/protocol versions.
3. Include minimal, redacted fixtures; never share real wallet keys, credentials or seed phrases.
4. For new compatibility rules, follow [docs/RULES.md](docs/RULES.md) and include safe/negative examples.
5. Discuss overlapping core modules with maintainers **before** implementation.

## Local development

Requires Node.js 22+, npm. Dependency upgrades are reviewed **manually**; no Dependabot configuration is used.

```sh
git clone https://github.com/SoraForge/ForgeCheck.git
cd ForgeCheck
npm ci
npm run build
npm run check:repo
npm test
node dist/cli.js --help
```

The CLI's scan command deliberately returns status 3 while the engine is being built. A successful build does not imply compatibility scanning is implemented.

## Pull requests

Use a focused branch and PR, reference the issue (`Closes #N`), document actual test runs and limitations, and update fixtures for changed behavior. Check the issue's dependencies before implementation to prevent merge conflicts. Maintainers review code correctness, evidence, reproducibility and security; passing CI does not guarantee acceptance.

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately under [SECURITY.md](SECURITY.md). Issues and contributions do not imply Drips Wave eligibility or payment.
