import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverProjectFiles, DiscoveryInputError } from "../dist/discovery.js";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "forgecheck-discovery-"));
  t.after(() => { try { chmodSync(join(root,"unreadable"),0o700); } catch {} rmSync(root, {recursive:true,force:true}); });
  const write = (path, content = "never execute") => {
    const full = join(root,path); mkdirSync(join(full,".."),{recursive:true}); writeFileSync(full,content);
  };
  return {root,write};
}

test("discovers monorepo source, manifests and supported lockfiles in deterministic order", async (t) => {
  const f=fixture(t);
  for(const name of ["packages/app/src/main.tsx","packages/app/src/entry.js","packages/ui/view.jsx","packages/ui/types.ts","package.json","packages/app/package.json","package-lock.json","pnpm-lock.yaml","yarn.lock","npm-shrinkwrap.json","bun.lock","folder with spaces/my code.ts"]){f.write(name)}
  for(const name of [".env",".env.production","src/private.pem","src/key.key","node_modules/lib/index.ts",".git/hooks/index.js","dist/generated.ts","build/generated.ts","coverage/bad.ts","src/image.png","bun.lockb"]){f.write(name,"PRIVATE_SECRET");}
  const a=await discoverProjectFiles({projectRoot:f.root});
  const b=await discoverProjectFiles({projectRoot:f.root});
  assert.equal(a.complete,true);assert.deepEqual(a.files,b.files);assert.deepEqual(a.diagnostics,[]);
  assert.deepEqual(a.files,["bun.lock","folder with spaces/my code.ts","npm-shrinkwrap.json","package-lock.json","package.json","packages/app/package.json","packages/app/src/entry.js","packages/app/src/main.tsx","packages/ui/types.ts","packages/ui/view.jsx","pnpm-lock.yaml","yarn.lock"]);
});

test("include and exclude globs work for POSIX and Windows-style patterns; cannot include secrets", async (t) => {
  const f=fixture(t);
  for (const p of ["src/nested/a.ts","src/nested/b.tsx","src/root.js","other/c.ts","src/nested/.env.test.ts","src/nested/secret.pem"])f.write(p);
  const r=await discoverProjectFiles({projectRoot:f.root,include:["src\\**\\*.ts","src\\**\\*.ts?"],exclude:["src/nested/b.tsx"]});
  assert.deepEqual(r.files,["src/nested/a.ts"]);assert.equal(r.complete,true);
  const empty=await discoverProjectFiles({projectRoot:f.root,include:[]});
  assert.deepEqual(empty.files,[]);
});

test("ignores symlink loops, escapes, file links, and broken links", async (t) => {
  const f=fixture(t);f.write("src/real.ts");
  const outside=mkdtempSync(join(tmpdir(),"forgecheck-outside-"));
  t.after(()=>rmSync(outside,{recursive:true,force:true}));
  writeFileSync(join(outside,"external.ts"),"PRIVATE_SECRET");
  symlinkSync("../src",join(f.root,"src","loop"),"dir");
  symlinkSync(outside,join(f.root,"outside"),"dir");
  symlinkSync(join(outside,"external.ts"),join(f.root,"secret.ts"),"file");
  symlinkSync("missing.ts",join(f.root,"broken.ts"),"file");
  const r=await discoverProjectFiles({projectRoot:f.root});
  assert.deepEqual(r.files,["src/real.ts"]);assert.equal(r.complete,true);
});

test("flags unreadable directories instead of declaring coverage complete", async (t) => {
  const f=fixture(t);f.write("ok.ts");f.write("unreadable/hidden.ts");
  chmodSync(join(f.root,"unreadable"),0o000);
  const result=await discoverProjectFiles({projectRoot:f.root});
  // Root or privileged CI runners may bypass POSIX permissions; skip that case.
  if (process.getuid?.() === 0) {t.skip("root user bypasses permission bits");return;}
  assert.equal(result.complete,false);
  assert.deepEqual(result.files,["ok.ts"]);
  assert.equal(result.diagnostics[0]?.code,"unreadable-directory");
  assert.doesNotMatch(JSON.stringify(result),/hidden\.ts/);
});

test("bounded traversal marks truncation with explicit diagnostic", async (t) => {
  const f=fixture(t);
  for(let i=0;i<9;i++)f.write(`src/file${i}.js`);
  f.write("deep/inside/file.ts");
  const capped=await discoverProjectFiles({projectRoot:f.root,maxFiles:2});
  assert.equal(capped.complete,false);assert.equal(capped.files.length,2);
  assert.ok(capped.diagnostics.some(x=>x.code==="limit-reached"));
  const depth=await discoverProjectFiles({projectRoot:f.root,maxDepth:1});
  assert.equal(depth.complete,false);assert.ok(depth.diagnostics.some(x=>x.message.includes("depth")));
  const entries=await discoverProjectFiles({projectRoot:f.root,maxEntries:2});
  assert.equal(entries.complete,false);assert.ok(entries.diagnostics.some(x=>x.message.includes("entries")));
});

test("rejects symlink roots and invalid inputs",async(t)=>{
  const f=fixture(t);const link=join(f.root,"alias");
  symlinkSync(f.root,link,"dir");
  await assert.rejects(discoverProjectFiles({projectRoot:link}),DiscoveryInputError);
  await assert.rejects(discoverProjectFiles({projectRoot:f.root,maxFiles:0}),DiscoveryInputError);
  await assert.rejects(discoverProjectFiles({projectRoot:f.root,include:["../secret.ts"]}),DiscoveryInputError);
  await assert.rejects(discoverProjectFiles({projectRoot:f.root,exclude:["/etc"]}),DiscoveryInputError);
});

test("never imports or runs scanned project JavaScript or reads files", async(t)=>{
  const f=fixture(t);
  f.write("danger.js","throw new Error('should not execute');");
  f.write("package.json",JSON.stringify({scripts:{postinstall:"exit 1"}}));
  const result=await discoverProjectFiles({projectRoot:f.root});
  assert.deepEqual(result.files,["danger.js","package.json"]);
  assert.equal(result.complete,true);
});


test("unreadable source files are reported without opening contents",async(t)=>{
  const f=fixture(t);f.write("private.ts","PRIVATE_SECRET");f.write("public.ts");
  chmodSync(join(f.root,"private.ts"),0o000);
  const result=await discoverProjectFiles({projectRoot:f.root});
  assert.equal(result.complete,false);
  assert.deepEqual(result.files,["public.ts"]);
  assert.equal(result.diagnostics[0]?.code,"unreadable-entry");
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SECRET/);
});
