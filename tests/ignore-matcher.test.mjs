import test from "node:test";
import assert from "node:assert/strict";
import {compileIgnorePatterns} from "../src/modules/ignore-matcher/index.mjs";

test("directories, nested files, anchored patterns and similar prefixes", () => {
  const m=compileIgnorePatterns(["node_modules/", "/dist/", "src/**/*.log"]);
  assert.equal(m.shouldIgnore("a/node_modules/x.js"), true);
  assert.equal(m.shouldIgnore("node_modules-extra/x.js"), false);
  assert.equal(m.shouldIgnore("dist/x.js"), true);
  assert.equal(m.shouldIgnore("a/dist/x.js"), false);
  assert.equal(m.shouldIgnore("src/deep/errors.log"), true);
  assert.equal(m.shouldIgnore("src/errors.log"), true);
  assert.equal(m.shouldIgnore("assets/errors.log"), false);
});
test("negation precedence, comments and Windows candidate paths", () => {
  const m=compileIgnorePatterns(["# comment", "*.log", "!keep.log", "*.tmp", "\\#todo", "\\!important"]);
  assert.equal(m.shouldIgnore("logs/a.log"), true);
  assert.equal(m.shouldIgnore("logs/keep.log"), false);
  assert.equal(m.shouldIgnore("a\\test.tmp"), true);
  assert.equal(m.shouldIgnore("#todo"), true);
  assert.equal(m.shouldIgnore("!important"), true);
  assert.equal(m.shouldIgnore("keep.txt"), false);
  assert.equal(m.shouldIgnore("logs/a.log"), true);
});
test("rejects unsafe candidates and unsupported patterns", () => {
  const m=compileIgnorePatterns(["*.tmp"]);
  for (const p of ["/root/file", "../secret", "a/../b", "C:\\secret", "", "a\0b"]) assert.throws(()=>m.shouldIgnore(p));
  for (const p of ["[abc]", "foo\\bar", "../x", "***"]) assert.throws(()=>compileIgnorePatterns([p]));
});
