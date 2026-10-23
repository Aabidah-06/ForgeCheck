import test from "node:test";
import assert from "node:assert/strict";
import { RuleRegistry, RuleRegistryError, normalizeProjectPath } from "../dist/rules.js";
const context={projectRoot:"/repo",files:["src/main.ts","package.json"],coverage:"complete",facts:{sdk:"1.0"}};
const baseRule=(id,detect)=>({
  id,title:"Compatibility check",rationale:"Documented migration risk",
  applicability:{languages:["typescript"],affectedVersions:["1.0.x"],operations:["submitTransaction"]},
  evidenceUrls:["https://developers.stellar.org/docs"],safeExceptions:["Explicitly validated contract usage"],
  severity:"high",remediation:"Use the supported API",detect
});

test("match, not-match and safe exception, with deterministic registered-rule sorting", async()=>{
  const registry=new RuleRegistry();
  registry.register(baseRule("stellar/zzz",()=>({kind:"not-matched"})));
  registry.register(baseRule("stellar/bbb",()=>({kind:"safe-exception"})));
  registry.register(baseRule("stellar/aaa",()=>({kind:"matched",observations:[
    {confidence:"review-required",file:"src\\main.ts",line:9,message:"Check operation semantics"},
    {confidence:"confirmed-failure",file:"/repo/src/main.ts",line:3,criterion:"SDK 1.0 call has incompatible signature",message:"Unsupported call"}
  ]})));
  const result=await registry.execute({...context,files:[...context.files].reverse()});
  assert.equal(result.status,"complete");
  assert.deepEqual(result.evaluatedRules.map(x=>[x.ruleId,x.status]),[
    ["stellar/aaa","matched"],["stellar/bbb","safe-exception"],["stellar/zzz","not-matched"]
  ]);
  assert.deepEqual(result.findings.map(x=>[x.file,x.line,x.confidence]),[
    ["src/main.ts",3,"confirmed-failure"],["src/main.ts",9,"review-required"]
  ]);
  assert.deepEqual(result.findings[0].evidenceUrls,["https://developers.stellar.org/docs"]);
  assert.equal((await registry.execute(context)).findings.length,2);
});

test("missing context, crashed handlers, invalid detections fail explicitly and never leak exceptions",async()=>{
  const r=new RuleRegistry();
  r.register(baseRule("stellar/crash",()=>{throw new Error("secret seed phrase DO NOT LEAK")}));
  r.register(baseRule("stellar/missing",()=>({kind:"not-evaluated",reason:"missing-context"})));
  r.register(baseRule("stellar/unsafe",()=>({kind:"matched",observations:[
    {confidence:"confirmed-failure",file:"/etc/private.ts",criterion:"proof",message:"Outside"}
  ]})));
  r.register(baseRule("stellar/noproof",()=>({kind:"matched",observations:[
    {confidence:"confirmed-failure",file:"src/main.ts",message:"No proof"}
  ]})));
  const result=await r.execute(context);
  assert.equal(result.status,"partial");assert.equal(result.findings.length,4);
  assert.ok(result.findings.every(f=>f.confidence==="not-evaluated"));
  assert.ok(result.diagnostics.some(d=>d.code==="rule-crashed"));
  assert.ok(result.diagnostics.some(d=>d.code==="invalid-detection"));
  assert.doesNotMatch(JSON.stringify(result),/secret seed phrase|\/etc\/private/);
});

test("incomplete discovery is never reported as all-clear, even if nothing matches",async()=>{
  const r=new RuleRegistry().register(baseRule("stellar/clean",()=>({kind:"not-matched"})));
  const result=await r.execute({...context,coverage:"partial"});
  assert.equal(result.status,"partial");
  assert.ok(result.diagnostics.some(d=>d.code==="incomplete-coverage"));
});

test("rejects duplicate IDs, malformed metadata, invalid selection and bad context",async()=>{
  const r=new RuleRegistry().register(baseRule("stellar/same",()=>({kind:"not-matched"})));
  assert.throws(()=>r.register(baseRule("stellar/same",()=>({kind:"not-matched"}))),RuleRegistryError);
  assert.throws(()=>r.register({...baseRule("stellar/new",()=>({kind:"not-matched"})),evidenceUrls:["http://insecure.example"]}),RuleRegistryError);
  assert.throws(()=>r.register({...baseRule("stellar/new",()=>({kind:"not-matched"})),safeExceptions:[]}),RuleRegistryError);
  assert.throws(()=>r.register(baseRule("invalid id",()=>({kind:"not-matched"}))),RuleRegistryError);
  await assert.rejects(r.execute(context,["stellar/unknown"]),RuleRegistryError);
  await assert.rejects(r.execute({...context,files:["../escape.ts"]}),RuleRegistryError);
});

test("only chosen rules run and independently added rule modules require no engine changes",async()=>{
  let calls=0;const r=new RuleRegistry();
  r.register(baseRule("stellar/a",()=>{calls++;return {kind:"not-matched"}}));
  r.register(baseRule("stellar/b",()=>{throw new Error("not selected")}));
  const result=await r.execute(context,["stellar/a","stellar/a"]);
  assert.equal(calls,1);assert.equal(result.status,"complete");
  assert.deepEqual(result.evaluatedRules,[{ruleId:"stellar/a",status:"not-matched"}]);
});

test("cross-platform fixture normalization and escape prevention",()=>{
  assert.equal(normalizeProjectPath("C:\\my repo","C:\\my repo\\src\\hello.ts"),"src/hello.ts");
  assert.equal(normalizeProjectPath("C:\\my repo","src\\nested\\hello.ts"),"src/nested/hello.ts");
  assert.equal(normalizeProjectPath("/my repo","./src/hello.ts"),"src/hello.ts");
  assert.throws(()=>normalizeProjectPath("C:\\my repo","D:\\secret.ts"),RuleRegistryError);
  assert.throws(()=>normalizeProjectPath("/my repo","/tmp/secret.ts"),RuleRegistryError);
  assert.throws(()=>normalizeProjectPath("/my repo","src/../../secret.ts"),RuleRegistryError);
});

test("metadata is snapshotted against mutation after registration",()=>{
  const rule=baseRule("stellar/immutable",()=>({kind:"not-matched"}));
  const registry=new RuleRegistry().register(rule);
  rule.evidenceUrls.push("https://unapproved.example");
  rule.applicability.operations.push("otherOperation");
  assert.deepEqual(registry.list()[0].evidenceUrls,["https://developers.stellar.org/docs"]);
  assert.deepEqual(registry.list()[0].applicability.operations,["submitTransaction"]);
});
