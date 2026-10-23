import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const executable = resolve(root, "dist/cli.js");
const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;

function run(...args) {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: root, encoding: "utf8", timeout: 10000, env: {
      ...process.env, NODE_OPTIONS: ""
    }
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  return result;
}

test("empty invocation returns truthful help", () => {
  const r = run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /forgecheck scan <directory>/);
  assert.match(r.stdout, /not implemented/i);
  assert.equal(r.stderr, "");
});

test("long and short help work", () => {
  for (const option of ["--help", "-h", "help"]) {
    const r = run(option);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Exit codes/);
    assert.equal(r.stderr, "");
  }
});

test("version matches package metadata", () => {
  for (const option of ["--version", "-V", "version"]) {
    const r = run(option);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), version);
    assert.equal(r.stderr, "");
  }
});

test("scan --help documents unavailable analysis", () => {
  const r = run("scan", "--help");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /NOT implemented/);
});

test("unknown command produces usage failure", () => {
  const r = run("bogus");
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /Unknown command or option 'bogus'/);
});

test("unknown scan option produces usage failure", () => {
  const r = run("scan", "--format");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown scan option/);
});

test("missing target produces usage failure", () => {
  const r = run("scan");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Missing directory/);
});

test("extra scan argument produces usage failure", () => {
  const r = run("scan", ".", "more");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Too many arguments/);
});

test("nonexistent target produces usage failure", () => {
  const r = run("scan", "./there-is-no-such-forgecheck-project-98231");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Directory does not exist/);
});

test("file target produces usage failure", () => {
  const r = run("scan", "package.json");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not a directory/);
});

test("existing directory returns unavailable, never success", () => {
  const r = run("scan", ".");
  assert.equal(r.status, 3);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /scan unavailable/);
  assert.match(r.stderr, /not implemented yet/);
});

test("valid temporary directory is never scanned or executed", (t) => {
  const folder = mkdtempSync(join(tmpdir(), "forgecheck-cli-"));
  t.after(() => rmSync(folder, { force: true, recursive: true }));
  writeFileSync(join(folder, "package.json"), JSON.stringify({
    name: "untrusted-project",
    scripts: { postinstall: "exit 99", test: "exit 99" }
  }));
  const r = run("scan", folder);
  assert.equal(r.status, 3);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /scan unavailable/);
});

test("global commands reject surplus arguments", () => {
  assert.equal(run("--version", "extra").status, 2);
  assert.equal(run("--help", "extra").status, 2);
  assert.equal(run("scan", "-h", "extra").status, 2);
});
