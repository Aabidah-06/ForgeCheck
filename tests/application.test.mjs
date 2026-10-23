import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli, textReporter, unavailableEngine, EXIT } from "../dist/application.js";

function harness(engine = unavailableEngine, cwd = process.cwd()) {
  const stdout = [];
  const stderr = [];
  return {
    services: {
      engine,
      reporter: textReporter,
      cwd,
      version: "0.0.0",
      io: { out: value => stdout.push(value), err: value => stderr.push(value) }
    },
    stdout,
    stderr
  };
}

test("injected unavailable engine returns unavailable status", async () => {
  const h = harness();
  const result = await runCli(["scan", "."], h.services);
  assert.equal(result, EXIT.UNAVAILABLE);
  assert.equal(h.stdout.length, 0);
  assert.match(h.stderr.join(""), /scan unavailable/);
});

test("future engine can receive absolute path and return findings", async (t) => {
  const folder = mkdtempSync(join(tmpdir(), "forgecheck-injection-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  let requested;
  const h = harness({
    async scan(request) {
      requested = request;
      return { status: "complete", findings: [{
        ruleId: "fixture/example",
        message: "Example fixture finding",
        confidence: "review-required",
        file: "package.json",
        line: 1
      }] };
    }
  });
  const code = await runCli(["scan", folder], h.services);
  assert.equal(code, EXIT.OK);
  assert.deepEqual(requested, { projectRoot: resolve(folder) });
  assert.match(h.stdout.join(""), /fixture\/example package.json:1/);
  assert.equal(h.stderr.length, 0);
});

test("engine exception fails closed, not a false success", async () => {
  const h = harness({ async scan() { throw new Error("sensitive data"); } });
  const code = await runCli(["scan", "."], h.services);
  assert.equal(code, EXIT.INTERNAL_ERROR);
  assert.match(h.stderr.join(""), /failed unexpectedly/);
  assert.doesNotMatch(h.stderr.join(""), /sensitive data/);
  assert.equal(h.stdout.length, 0);
});

test("reporter distinguishes review required vs confirmed failure", () => {
  const report = textReporter.format({status:"complete",findings:[
    {ruleId:"example/one",message:"Review this",confidence:"review-required"},
    {ruleId:"example/two",message:"Confirmed test failure",confidence:"confirmed-failure"}
  ]});
  assert.match(report, /2 finding\(s\)/);
  assert.match(report, /\[review-required\]/);
  assert.match(report, /\[confirmed-failure\]/);
});
