# Architecture — Proposed Design

**This is a specification, not an implemented system.**

ForgeCheck aims to evaluate application integration compatibility for Stellar, not replace general linters, Stellar SDKs, security audits or monitoring platforms.

```text
application repository
      |
      v
file / dependency discovery ---> SDK + API + protocol context
      |                                  |
      +----------> detection adapters <-+---- version-aware rule registry
                             |
                      evidence findings
                             |
                    local CLI / CI output
```

**Planned components:**

1. **Discovery:** Relevant lockfiles, manifests and source files, ignoring secrets and generated output.
2. **Version context:** SDK, API and protocol assumptions tied to authoritative compatibility references.
3. **Rules:** Unique IDs, applicability conditions, documented exceptions, upstream citations and tested fixtures.
4. **Analysis:** Reuse mature parsers and analyzers; report evidence and classify confidence accurately.
5. **Outputs:** Human-readable summaries and, later, versioned JSON/SARIF formats.
6. **Opt-in test runner (later):** Reproducible testnet/integration tests in isolated user-controlled environments.

**Safety constraints:** No arbitrary code execution during static scans, no hidden telemetry, no implicit credential collection. A G-only address validator can be perfectly valid for account-creation logic; context matters. See [rule standards](RULES.md) and [roadmap](ROADMAP.md).

The first product implementation is expected to use Node.js/TypeScript, subject to initial architecture review.
