import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { required, missing, brokenLinks } from "../scripts/check-repository.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("required files exist", () => assert.deepEqual(missing(root), []));
test("relative Markdown links resolve", () => assert.deepEqual(brokenLinks(root), []));
test("missing files are reported", t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "forgecheck-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  assert.deepEqual(missing(folder), required);
});
test("broken links are detected", t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "forgecheck-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.writeFileSync(path.join(folder, "README.md"), "[broken](missing.md)\n");
  assert.deepEqual(brokenLinks(folder), ["README.md: missing target: missing.md"]);
});
test("external and in-page links are allowed", t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "forgecheck-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.writeFileSync(path.join(folder, "README.md"), "[external](https://example.com) [here](#section)\n");
  assert.deepEqual(brokenLinks(folder), []);
});
test("package metadata is private and tests use Node", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.private, true);
  assert.match(pkg.scripts.test, /node --test/);
});
