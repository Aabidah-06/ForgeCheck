# Report redaction (#19)

Import `redactDiagnostic(text)` or `redactReport(scanResult)` from `./index.mjs`. These pure functions preserve the original input and the ScanResult status, rule IDs, and confidence levels. They mask recognizable credentials, bearer tokens, URL basic-auth credentials, sensitive query values, and complete PEM private-key blocks.

This is **defense in depth**, not comprehensive secret detection. Redact before logging or serializing reports; never treat the output as guaranteed safe for public sharing. Unrecognized credential syntax and incomplete PEM blocks may remain. No file/network access occurs.
