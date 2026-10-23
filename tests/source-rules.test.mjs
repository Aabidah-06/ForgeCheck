import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scanSdkV17Source } from "../dist/rules/sdk-v17.js";
import { scanWAddressSource } from "../dist/rules/w-address.js";

function fixture(group, label) {
  const file = `tests/fixtures/${group}/${label}.ts`;
  return {file, source: readFileSync(new URL(`fixtures/${group}/${label}.ts`, import.meta.url), "utf8")};
}

test("#10 detects distinct SDK v17 XDR and Buffer migration patterns with exact location", () => {
  const findings = scanSdkV17Source(fixture("v17", "positive"));
  assert.deepEqual(findings.map(f => [f.ruleId, f.line]), [
    ["stellar-sdk-v17/xdr-method-rename", 2],
    ["stellar-sdk-v17/xdr-method-rename", 3],
    ["stellar-sdk-v17/byte-buffer-method", 6],
    ["stellar-sdk-v17/byte-buffer-method", 8],
    ["stellar-sdk-v17/xdr-method-rename", 10]
  ]);
  for (const finding of findings) {
    assert.equal(finding.confidence, "review-required");
    assert.equal(finding.file, "tests/fixtures/v17/positive.ts");
    assert.ok(finding.column > 0);
    assert.match(finding.evidenceUrl, /^https:\/\/stellar\.github\.io/);
    assert.ok(finding.suggestion.length > 20);
    assert.match(finding.versionContext, /not resolved/);
  }
});

test("#10 ignores comments, strings, non-SDK calls, Buffer objects and migrated calls", () => {
  assert.deepEqual(scanSdkV17Source(fixture("v17", "negative")), []);
});

test("#10 handles namespace imports, CommonJS requires and known inline results", () => {
  const a = scanSdkV17Source({file:"src/check.js",source:`
    import * as Stellar from '@stellar/stellar-sdk';
    const b = Stellar.Keypair.fromSecret('S...').rawPublicKey();
    b.toString('base64');
    Stellar.TransactionBuilder.fromXDR('...', 'test');
  `});
  assert.deepEqual(a.map(f => f.ruleId), ["stellar-sdk-v17/byte-buffer-method", "stellar-sdk-v17/xdr-method-rename"]);
  const b = scanSdkV17Source({file:"src/check.cjs", source:`
    const { Keypair: KP } = require('stellar-sdk');
    const bytes = KP.fromSecret('S...').sign(new Uint8Array());
    bytes.toString('hex');
  `});
  assert.equal(b.length, 1);
  assert.equal(b[0].ruleId, "stellar-sdk-v17/byte-buffer-method");
});

test("#10 avoids unscoped Buffer and arbitrary hex text without Stellar imports", () => {
  const file = {file:"unrelated.js", source:`
    const thing = {toXDR() {}};
    thing.toXDR();
    Buffer.from('deadbeef', 'hex').toString('hex');
    const s = 'hash().toString(\\'hex\\')';
  `};
  assert.deepEqual(scanSdkV17Source(file), []);
});

test("#11 flags generic StrKey checks, regex and switches as review-required", () => {
  const findings = scanWAddressSource(fixture("w-address", "positive"));
  assert.deepEqual(findings.map(f => [f.ruleId, f.line]), [
    ["protocol-30/w-address-strkey-validator", 3],
    ["protocol-30/w-address-prefix-regex", 5],
    ["protocol-30/w-address-prefix-switch", 7]
  ]);
  for (const f of findings) {
    assert.equal(f.confidence, "review-required");
    assert.match(f.evidenceUrl, /bell-protocol-30-upgrade-guide/);
    assert.match(f.affectedVersions, /network activation dependent/);
    assert.ok(f.column >= 1);
    assert.ok(f.suggestion.length > 30);
  }
});

test("#11 deliberately exempts create-account G-only and W-aware paths", () => {
  assert.deepEqual(scanWAddressSource(fixture("w-address", "negative")), []);
});

test("#11 ignores generic regexes from unrelated domains and comments", () => {
  assert.deepEqual(scanWAddressSource({file:"src/theme.ts", source:`
    const palette = /^[GMC]/;
    const addressList = ['G', 'M', 'C'];
    // function isValidStellarAddress(s) { return /^[GMC]/.test(s); }
    const message = '/^[GMC]/';
  `}), []);
});

test("both modules are deterministic and never execute a target file", () => {
  const source = `import { Keypair } from '@stellar/stellar-sdk';\nthrow new Error('never run');\nKeypair.fromSecret('S').sign(new Uint8Array()).toString('hex');`;
  const input = {file:"tests/malicious.ts",source,resolvedSdkVersion:"17.0.0"};
  assert.deepEqual(scanSdkV17Source(input), scanSdkV17Source(input));
  assert.equal(scanSdkV17Source(input)[0].versionContext.includes("17.0.0"), true);
  assert.deepEqual(scanWAddressSource(input), []);
});

test("#10 respects lexical shadowing and ignores unproven byte flow", () => {
  const input = {file:"src/scopes.ts",source:`
    import { Keypair as KP } from '@stellar/stellar-sdk';
    const signature = KP.fromSecret('S').sign(new Uint8Array());
    function processUnrelated(signature: any, KP: any) {
      signature.toString('hex');
      KP.fromXDR('not a stellar class');
    }
    signature.toString('hex');
  `};
  const found = scanSdkV17Source(input);
  assert.deepEqual(found.map(f => f.ruleId), ["stellar-sdk-v17/byte-buffer-method"]);
});

test("#10 supports namespace require and named XDR conversion helpers", () => {
  const actual = scanSdkV17Source({file:"src/commonjs.js",source:`
    const SDK = require('stellar-sdk');
    SDK.TransactionBuilder.fromXDR('...', 'network');
    SDK.StrKey.decodeEd25519PublicKey('G...').toString('hex');
  `});
  assert.deepEqual(actual.map(f => f.ruleId), [
    "stellar-sdk-v17/xdr-method-rename", "stellar-sdk-v17/byte-buffer-method"
  ]);
});

test("#11 recognizes anchored G/M/C alternation and class method validators", () => {
  const matches = scanWAddressSource({file:"ui/validator.tsx",source:`
    export class AddressParser {
      validateStellarAddress(input: string) {
        return /^(?:G|M|C)[A-Z2-7]+$/.test(input);
      }
    }
  `});
  assert.equal(matches.length, 1);
  assert.equal(matches[0].ruleId, "protocol-30/w-address-prefix-regex");
});

test("#11 handles universal transfer destination arrows but exempts narrowly named account validators", () => {
  const findings = scanWAddressSource({file:"src/payments.js",source:`
    const isTransferDestination = (destination) => /^[GMC]/.test(destination);
    const isBaseAccountAddress = (a) => /^G/.test(a);
  `});
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
});
