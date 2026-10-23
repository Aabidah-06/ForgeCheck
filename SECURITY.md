# Security Policy

## Supported versions

There is **no released ForgeCheck product** yet; no production versions are currently supported.

## Reporting vulnerabilities

Never disclose exploits, credentials, private keys or unpatched vulnerabilities in public issues. If enabled, use GitHub's **Security → Report a vulnerability**. Otherwise, ask the maintainers to provide a confidential channel **without disclosing sensitive technical details**. SoraForge's owner should enable **Private vulnerability reporting** in repository settings.

Please include affected commit/version, impact, reproduction with non-production fixtures and potential mitigations. Do not send real secrets.

## Planned safety controls

The scanner must operate locally and read-only by default. It must not silently execute scanned repository code, publish source code, or send telemetry. Executable integration testing must require explicit opt-in and isolation. A report is not a security certification.
