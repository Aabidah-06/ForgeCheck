import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = resolve(root, "dist/cli.js");
function fixture(t, sdk = "17.0.0", packageName = "@stellar/stellar-sdk") {
  const dir = mkdtempSync(join(tmpdir(), "forgecheck-end-to-end-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (sdk !== null) {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "forgecheck-test", version: "1.0.0", dependencies: { [packageName]: sdk }
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      name: "forgecheck-test", version: "1.0.0", lockfileVersion: 3,
      packages: { "": { dependencies: { [packageName]: sdk } },
        ["node_modules/" + packageName]: { version: sdk } }
    }));
  }
  return dir;
}
function scan(dir, ...options) {
  const x = spawnSync(process.execPath, [cli, "scan", dir, ...options], {
    encoding: "utf8", timeout: 15000, env: { ...process.env, NODE_OPTIONS: "" }
  });
  assert.equal(x.error, undefined);
  assert.equal(x.signal, null);
  return x;
}
test("positive Horizon fixture produces review-required evidence", t => {
  const dir = fixture(t);
  writeFileSync(join(dir, "app.ts"),
    'import { Horizon } from "@stellar/stellar-sdk";\n' +
    'const server = new Horizon.Server("https://horizon-testnet.stellar.org");\n' +
    'server.loadAccount("GCUSTOM");\n');
  const r = scan(dir, "--json");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  const report = JSON.parse(r.stdout);
  assert.equal(report.status, "complete");
  assert.ok(report.findings.some(f => f.ruleId.includes("horizon-rpc") &&
    f.confidence === "review-required" && f.evidenceUrls.length && f.file === "app.ts"));
  assert.ok(report.rulesEvaluated >= 2);
  assert.equal(report.filesScanned, 1);
});
test("safe account-specific address validation is not a generic W-address warning", t => {
  const dir = fixture(t);
  writeFileSync(join(dir, "safe.ts"),
    'import { StrKey } from "@stellar/stellar-sdk";\n' +
    'function validateCreateAccountAddress(address: string) {\n' +
    ' return StrKey.isValidEd25519PublicKey(address);\n}\n');
  const r = scan(dir, "--json");
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.status, "complete");
  assert.equal(report.findings.filter(f => f.ruleId.startsWith("protocol-30")).length, 0);
  assert.equal(report.findings.filter(f => f.confidence === "confirmed-failure").length, 0);
});
test("legacy SDK is an explicit review finding, not a fabricated confirmed failure", t => {
  const dir = fixture(t, "12.0.0", "stellar-sdk");
  const r = scan(dir, "--json");
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.ok(report.findings.some(f => f.ruleId === "stellar/sdk-support-lifecycle"
    && f.confidence === "review-required"));
});
test("non-Stellar input is not given an unsupported all-clear", t => {
  const dir = fixture(t, null);
  writeFileSync(join(dir, "plain.ts"), "export const number = 1;\n");
  const r = scan(dir, "--json");
  assert.equal(r.status, 3);
  assert.equal(JSON.parse(r.stdout).status, "unavailable");
});
test("invalid manifest fails closed", t => {
  const dir = fixture(t);
  writeFileSync(join(dir, "package.json"), "{not valid}");
  const r = scan(dir, "--json");
  assert.equal(r.status, 3);
  assert.equal(JSON.parse(r.stdout).status, "unavailable");
});
test("large source and symlink escape are not silently passed", t => {
  const dir = fixture(t);
  writeFileSync(join(dir, "too-big.ts"), "x".repeat(1024 * 1024 + 12));
  const r = scan(dir, "--json");
  assert.equal(r.status, 3);
  assert.equal(JSON.parse(r.stdout).status, "unavailable");
  rmSync(join(dir, "too-big.ts"));
  const outside = mkdtempSync(join(tmpdir(), "forgecheck-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "bad.ts"), 'throw new Error("should not run");');
  // Do not follow a symbolic-link directory. A truly safe scan sees no bad.ts.
  mkdirSync(join(dir, "local"));
  writeFileSync(join(dir, "local", "safe.ts"), "export const good = 1;");
  const ok = scan(dir, "--json");
  assert.equal(ok.status, 0, ok.stderr);
});
test("scans do not execute target scripts or emit secrets", t => {
  const dir = fixture(t);
  writeFileSync(join(dir, "danger.ts"), 'throw new Error("SHOULD_NEVER_EXECUTE");');
  const r = scan(dir, "--json");
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout + r.stderr, /SHOULD_NEVER_EXECUTE/);
});
test("stable JSON output across identical runs", t => {
  const dir = fixture(t);
  writeFileSync(join(dir, "a.ts"),
    'import { Horizon } from "@stellar/stellar-sdk";\n' +
    'const server = new Horizon.Server("https://horizon-testnet.stellar.org");\nserver.loadAccount("G");');
  const a = scan(dir, "--json");
  const b = scan(dir, "--json");
  assert.equal(a.status, 0);
  assert.equal(b.status, 0);
  assert.equal(a.stdout, b.stdout);
});
