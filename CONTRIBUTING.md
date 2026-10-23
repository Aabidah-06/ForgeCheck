# Contributing to ForgeCheck

Thanks for helping build useful open-source infrastructure. ForgeCheck is **currently a foundation project**, not a published compatibility scanner.

## Before contributing

1. Search existing issues for duplicates.
2. For new proposals, explain the concrete developer problem and reference real affected Stellar projects or official documentation.
3. Use a GitHub issue template and specify relevant SDK/API/protocol versions.
4. Provide a reproducible **redacted** example; never post credentials, production keys or seed phrases.
5. Obtain maintainer agreement before substantial implementation work.

For new compatibility rules, follow [docs/RULES.md](docs/RULES.md), including cases that *must not* trigger your rule. Avoid speculative or reward-oriented placeholder issues.

## Local development

Requires Node.js 22 or later:

```sh
git clone https://github.com/SoraForge/ForgeCheck.git
cd ForgeCheck
npm run check:repo
npm test
```

These checks currently validate only the project foundation. Full integration tests will be added as implementation progresses.

## Pull requests

Work on a focused branch. Reference the relevant issue, explain the change and tradeoffs, include test fixtures for behavior changes, update documentation and list actual test results. A passing CI run is not a guarantee of acceptance; maintainers review accuracy, security, scope and reproducibility.

Follow [our Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately using [SECURITY.md](SECURITY.md). Contributions do not imply eligibility for any paid program.
