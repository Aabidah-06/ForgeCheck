# Offline report comparison (#32)

Run `node tools/report-diff/index.mjs old.json new.json` for a text summary, or add `--json` for deterministic machine output. Import `compareReports(before, after)` for a pure API. Reports must have `status: "complete"` and valid `findings`; unavailable reports are **rejected**, never treated as clean scans.

Normalized finding identity consists of rule ID, POSIX-normalized relative file path, line and exact message. Confidence changes are paired deterministically, with duplicate findings counted independently. Exit code 0 = no changes, 1 = differences, 2 = bad input. File input is limited to 5 MiB. No live scan, network access, or executable code from projects. Text and JSON output may contain sensitive report messages; sanitize reports before sharing.
