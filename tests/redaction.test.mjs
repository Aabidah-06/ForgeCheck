import test from "node:test";
import assert from "node:assert/strict";
import { redactDiagnostic, redactReport } from "../src/modules/redaction/index.mjs";

test("redacts authorization, structured secrets, URL credentials and private keys", () => {
  const input = "Authorization: Bearer abc.def\npassword=hello https://alice:pass@example.com/a?token=abc&safe=1\n-----BEGIN PRIVATE KEY-----\nverySecret\n-----END PRIVATE KEY-----";
  const out = redactDiagnostic(input);
  for (const secret of ["abc.def", "hello", "alice:pass", "verySecret", "token=abc"]) assert.equal(out.includes(secret), false);
  assert.match(out, /safe=1/);
  assert.match(out, /\[REDACTED\]/);
});
test("preserves benign text, unicode and repeatability", () => {
  const text = "Rule v16.4 αβ @stellar/stellar-sdk with id ABC123";
  assert.equal(redactDiagnostic(text), text);
  const long = "token=x ".repeat(10000);
  assert.equal(redactDiagnostic(long), redactDiagnostic(long));
  assert.equal(redactDiagnostic(long).includes("token=x"), false);
});
test("redacts report without mutating source, including unavailable reason", () => {
  const original = {status:"complete",findings:[{ruleId:"X",confidence:"review-required",message:"api_key=private",file:"src/a.ts",line:3}]};
  const snapshot = JSON.stringify(original);
  const out = redactReport(original);
  assert.equal(JSON.stringify(original), snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
  assert.equal(out.findings[0].ruleId, "X");
  assert.equal(out.findings[0].message.includes("private"), false);
  assert.equal(redactReport({status:"unavailable",reason:"token=secret"}).reason.includes("secret"), false);
  assert.throws(() => redactReport({status:"complete",findings:[{}]}), /Invalid/);
});
