# ForgeCheck Roadmap

This roadmap distinguishes shipped foundation work from planned capabilities.

## M0 — Repository foundation ✅

Governance and community files, issue templates, repository checks and GitHub Actions.

## M1 — First usable compatibility CLI (in progress)

- [x] #5 CLI runtime, build system, typed contracts and honest unavailable status.
- [ ] #6 Source discovery.
- [ ] #7 SDK dependency/version context.
- [ ] #8 Compatibility rule registry and finding model integration.
- [ ] #9 JS SDK support-lifecycle rule.
- [ ] #10 JS SDK v17 API migration checks.
- [ ] #11 Protocol 30 W-address review rules.
- [ ] #12 Horizon/RPC migration review rules.
- [ ] #13 End-to-end scanner integration and CLI reporting.

## M2 — Real-project validation

Compare the implemented CLI against existing tools, run on consenting public applications, measure false positives and gather independent developer feedback.

## M3 — CI integrations

JSON/SARIF output, suppression/baseline handling and minimally privileged GitHub Actions integration.

## M4 — Optional executable compatibility checks

Only user-opted-in, safely isolated test integrations; ordinary scans must never execute arbitrary project scripts.

## Release gate

Do not claim production compatibility assessment until functionality, evidence and tests are verified. Drips Wave acceptance is separately determined by program organizers.
