import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync, spawnSync} from "node:child_process";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {compareReports} from "../tools/report-diff/index.mjs";
const f=(message,confidence="review-required",file="src\\a.ts")=>({ruleId:"R",message,confidence,file,line:1});
test("new/resolved/unchanged/confidence and duplicate counts are deterministic",()=>{
  const before={status:"complete",findings:[f("keep"),f("resolved"),f("confidence"),f("duplicate"),f("duplicate")]};
  const after={status:"complete",findings:[f("added"),f("keep"),f("confidence","confirmed-failure"),f("duplicate")]};
  const got=compareReports(before,after);
  assert.deepEqual(Object.fromEntries(Object.entries(got).map(([k,v])=>[k,v.length])),{added:1,resolved:2,persistent:2,changedConfidence:1});
  assert.equal(got.persistent[0].file,"src/a.ts");
  assert.deepEqual(got,compareReports({status:"complete",findings:[...before.findings].reverse()},{status:"complete",findings:[...after.findings].reverse()}));
});
test("invalid, unavailable and traversal inputs fail closed",()=>{
  assert.throws(()=>compareReports({status:"unavailable",reason:"disabled"},{status:"complete",findings:[]}));
  assert.throws(()=>compareReports({status:"complete",findings:[f("x","review-required","../unsafe")]},{status:"complete",findings:[]}));
});
test("CLI produces JSON and distinct differences/invalid exit codes",()=>{
  const dir=mkdtempSync(join(tmpdir(),"forgecheck-report-diff-"));
  try {
    const a=join(dir,"a.json"),b=join(dir,"b.json");
    writeFileSync(a,JSON.stringify({status:"complete",findings:[]}));
    writeFileSync(b,JSON.stringify({status:"complete",findings:[f("added")]}));
    const args=["tools/report-diff/index.mjs",a,b,"--json"];
    const run=spawnSync(process.execPath,args,{encoding:"utf8"});
    assert.equal(run.status,1);
    assert.equal(JSON.parse(run.stdout).added.length,1);
    assert.equal(spawnSync(process.execPath,["tools/report-diff/index.mjs",a,a],{encoding:"utf8"}).status,0);
    writeFileSync(b,JSON.stringify({status:"unavailable",reason:"no analyzer"}));
    assert.equal(spawnSync(process.execPath,args,{encoding:"utf8"}).status,2);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
