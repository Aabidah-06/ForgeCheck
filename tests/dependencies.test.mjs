import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import {discoverProjectFiles} from "../dist/discovery.js";
import {resolveStellarDependencies} from "../dist/dependencies.js";
import {assessSdkLifecycle,sdkLifecycleRule} from "../dist/rules/sdk-lifecycle.js";
import {RuleRegistry} from "../dist/rules.js";
function fixture(t,files){
 const root=mkdtempSync(join(tmpdir(),"forgecheck-sdk-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const [file,val] of Object.entries(files)){const full=join(root,file);mkdirSync(dirname(full),{recursive:true});writeFileSync(full,typeof val==="string"?val:JSON.stringify(val));}
 return root;
}
const mf=v=>({dependencies:{"@stellar/stellar-sdk":v}});
const lock=p=>({lockfileVersion:3,packages:{"":{},...p}});
const inspect=async root=>resolveStellarDependencies(await discoverProjectFiles({projectRoot:root}));
test("resolved v16 remains supported",async t=>{
 const root=fixture(t,{"package.json":mf("^16.0.0"),"package-lock.json":lock({"node_modules/@stellar/stellar-sdk":{version:"16.3.0"}})});
 const r=await inspect(root);assert.equal(r.dependencies[0].resolvedVersion,"16.3.0");assert.equal(assessSdkLifecycle(r.dependencies)[0].status,"supported");
});
test("missing and unsupported lock do not infer version from range",async t=>{
 for(const [raw,other,expected] of [["^16.x",{},"missing-lock"],[">=16",{"pnpm-lock.yaml":"lockfileVersion: 9"},"unsupported-lock"]]){
  const root=fixture(t,{"package.json":mf(raw),...other}),r=await inspect(root);
  assert.equal(r.dependencies[0].resolution,expected);assert.equal(r.dependencies[0].resolvedVersion,undefined);
 }
});
test("multiple workspaces and npm alias",async t=>{
 const root=fixture(t,{"package.json":{dependencies:{"old-sdk":"npm:@stellar/stellar-sdk@^15.0.0"}},
 "apps/a/package.json":mf("^16.0.0"),"apps/b/package.json":mf("^17.0.0"),
 "package-lock.json":lock({"node_modules/old-sdk":{version:"15.0.0"},"apps/a/node_modules/@stellar/stellar-sdk":{version:"16.3.0"},"apps/b/node_modules/@stellar/stellar-sdk":{version:"17.1.0"}})});
 const r=await inspect(root);assert.equal(r.dependencies.filter(x=>x.resolution==="resolved").length,3);
 assert.deepEqual(assessSdkLifecycle(r.dependencies).map(x=>x.status).sort(),["supported","supported","unsupported"]);
});
test("legacy unscoped SDK reported as review-required in registry",async t=>{
 const root=fixture(t,{"package.json":{dependencies:{"stellar-sdk":"12.0.0"}},"package-lock.json":lock({"node_modules/stellar-sdk":{version:"12.0.0"}})});
 const r=await inspect(root);
 const result=await new RuleRegistry().register(sdkLifecycleRule(r.dependencies)).execute({projectRoot:root,files:["package.json"],coverage:"complete"});
 assert.equal(result.findings.length,1);assert.equal(result.findings[0].confidence,"review-required");
});
test("stale npm lock never passes as installed version",async t=>{
 const root=fixture(t,{"package.json":mf("16.1.0"),"package-lock.json":lock({"node_modules/@stellar/stellar-sdk":{version:"17.0.0"}})});
 const r=await inspect(root);assert.equal(r.dependencies[0].resolution,"stale-lock");
});
test("invalid manifest, no SDK, and scripts are safe",async t=>{
 const root=fixture(t,{"package.json":"{ bad","evil.js":"throw Error('executed')"});
 const r=await inspect(root);assert.equal(r.complete,false);assert.equal(r.dependencies.length,0);
 const empty=assessSdkLifecycle([]);assert.deepEqual(empty,[]);
});
