import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectPath } from "../dist/modules/path-policy/index.js";

test("canonical paths, internal links, traversal, missing paths and escape loops", async t => {
  const parent = await mkdtemp(join(tmpdir(), "fc-policy-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "app"), outside = join(parent, "app-evil");
  await mkdir(join(root, "nested"), { recursive: true }); await mkdir(outside);
  await writeFile(join(root, "nested", "a.txt"), "safe");
  await writeFile(join(outside, "secret"), "private");
  await symlink("nested", join(root, "link"));
  await symlink("link", join(root, "link2"));
  await symlink(outside, join(root, "escape"));
  await symlink("loop-b", join(root, "loop-a"));
  await symlink("loop-a", join(root, "loop-b"));
  const check = p => resolveProjectPath(root, p);
  assert.deepEqual(await check("nested/a.txt"), { classification: "inside", diagnostic: "ok", canonicalPath: join(root, "nested", "a.txt"), relativePath: "nested/a.txt" });
  const inside = await check("link2/a.txt");
  assert.equal(inside.classification, "symlink-internal"); assert.equal(inside.relativePath, "nested/a.txt");
  assert.equal((await check("escape/secret")).classification, "escaped");
  assert.equal((await check("../app-evil/secret")).classification, "escaped");
  assert.equal((await check("missing")).classification, "nonexistent");
  assert.deepEqual(await check("loop-a"), { classification: "unreadable", diagnostic: "symlink-loop" });
  assert.equal((await check("/etc/passwd")).classification, "escaped");
});
