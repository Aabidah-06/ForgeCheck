import test from "node:test";
import assert from "node:assert/strict";
import { analyzeHorizonSource, HORIZON_MIGRATION_GUIDE } from "../dist/rules/horizon.js";

test("named Stellar Horizon SDK import finds account candidate with source location and evidence", () => {
  const findings = analyzeHorizonSource(`import { Horizon } from "@stellar/stellar-sdk";
const server = new Horizon.Server("https://horizon-testnet.stellar.org");
await server.accounts().accountId(account).call();`, "src/wallet.ts");
  assert.ok(findings.length >= 1);
  const account = findings.find(f => f.ruleId === "stellar/horizon-rpc-account");
  assert.ok(account);
  assert.equal(account.line, 3);
  assert.equal(account.file, "src/wallet.ts");
  assert.equal(account.confidence, "review-required");
  assert.ok(account.evidence.includes(HORIZON_MIGRATION_GUIDE));
  assert.match(account.suggestion, /getLedgerEntries/);
  assert.match(account.suggestion, /trustlines/);
});
test("namespace SDK Horizon transaction lookup distinguishes bounded RPC history", () => {
  const findings = analyzeHorizonSource(`import * as StellarSdk from "stellar-sdk";
const h = new StellarSdk.Horizon.Server("https://example.com");
await h.transactions().transaction(hash).call();`, "src/query.js");
  assert.ok(findings.some(f => f.ruleId === "stellar/horizon-rpc-transaction" && f.line === 3
    && /bounded history/.test(f.suggestion)));
});
test("Horizon transaction submission produces review advice, not hard failure", () => {
  const findings = analyzeHorizonSource(`const { Horizon } = require("@stellar/stellar-sdk");
const h = new Horizon.Server(url);
h.submitTransaction(tx);`, "src/submit.js");
  assert.deepEqual(findings.map(f => f.ruleId), ["stellar/horizon-rpc-submit"]);
  assert.equal(findings[0].confidence, "review-required");
  assert.match(findings[0].suggestion, /sendTransaction/);
});
test("Horizon official REST paths are detected only for documented API hosts", () => {
  const findings = analyzeHorizonSource(`await fetch("https://horizon.stellar.org/accounts/GABC");
await axios.get("https://horizon-testnet.stellar.org/transactions/HASH");`, "src/remote.ts");
  assert.deepEqual(findings.map(f => [f.ruleId, f.line]), [
    ["stellar/horizon-rpc-account", 1],
    ["stellar/horizon-rpc-transaction", 2]
  ]);
});
test("intentional historical or curated Horizon-only queries do not imply RPC replacement", () => {
  const source = `import { Horizon } from "@stellar/stellar-sdk";
const h = new Horizon.Server("https://horizon.stellar.org");
await h.trades().forAssetPair(base, counter).call();
await h.effects().forAccount(account).call();`;
  assert.deepEqual(analyzeHorizonSource(source, "history.ts"), []);
});
test("RPC usage and W unrelated APIs are ignored", () => {
  const source = `import { rpc } from "@stellar/stellar-sdk";
const client = new rpc.Server("https://soroban-testnet.stellar.org");
await client.getTransaction(hash);`;
  assert.deepEqual(analyzeHorizonSource(source, "rpc.ts"), []);
});
test("unrelated Server, method names and non-Stellar URLs are ignored", () => {
  const source = `const Horizon = { Server: class {} };
const s = new Horizon.Server("https://horizon.stellar.org");
s.accounts().call();
fetch("https://example.org/accounts/anything");
axios.get("https://horizon.example.org/transactions/123");`;
  assert.deepEqual(analyzeHorizonSource(source, "unrelated.js"), []);
});
test("comments and strings mentioning Horizon APIs are not executed or flagged", () => {
  const source = `// new Horizon.Server("https://horizon.stellar.org")
const code = "await h.transactions().transaction(hash).call();";
// fetch("https://horizon.stellar.org/accounts/G")`;
  assert.deepEqual(analyzeHorizonSource(source, "comments.ts"), []);
});
test("result ordering is deterministic and doesn't depend on network access", () => {
  const source = `fetch("https://horizon.stellar.org/transactions/ABC");
fetch("https://horizon.stellar.org/accounts/GABC");`;
  assert.deepEqual(analyzeHorizonSource(source, "repeat.js"), analyzeHorizonSource(source, "repeat.js"));
});

test("standalone imported Horizon.Server is review-required, not a confirmed breakage", () => {
  const findings = analyzeHorizonSource(`import { Horizon } from "@stellar/stellar-sdk";
const h = new Horizon.Server(url);`, "integration.ts");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, "stellar/horizon-rpc-server");
  assert.equal(findings[0].confidence, "review-required");
  assert.equal(findings[0].line, 2);
});
