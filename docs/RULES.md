# Compatibility Rule Quality Standard

**This is a proposal standard; no runtime rule library exists yet.**

Each rule proposal must provide:

- Stable ID and descriptive title.
- Specific SDK, API, protocol and language applicability.
- Authoritative evidence: specifications, release notes or a confirmed bug.
- Exact detection conditions and safe exceptions.
- Confidence level: **confirmed failure**, **review required**, or **not evaluated**.
- Helpful, non-misleading remediation guidance.
- Positive and negative fixtures and automated regression tests.
- Known limitations and false-positive risks.

**Illustrative candidate, not an implemented rule:** A G-only address check might need review in a universal payment-destination flow, yet be necessary for account creation. Flagging every G-only validator as broken is unacceptable.

No rule may upload source code, execute arbitrary scripts or claim broad safety guarantees.
