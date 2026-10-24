#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

function normalizedFile(file) {
  if (file === undefined) return "";
  if (typeof file !== "string" || file.startsWith("/") || /^[a-z]:[\\/]/i.test(file)) throw new Error("Unsafe finding file path");
  const parts=file.replace(/\\/g,"/").split("/").filter(x=>x && x!==".");
  if (parts.includes("..") || file.includes("\0")) throw new Error("Unsafe finding file path");
  return parts.join("/");
}
function validate(report) {
  if (!report || report.status !== "complete" || !Array.isArray(report.findings)) throw new Error("Only complete ScanResult reports can be compared");
  for (const f of report.findings) {
    if (!f || typeof f.ruleId!=="string" || !f.ruleId || typeof f.message!=="string" ||
        !["confirmed-failure","review-required","not-evaluated"].includes(f.confidence) ||
        (f.line!==undefined && (!Number.isSafeInteger(f.line) || f.line<1)))
      throw new Error("Invalid finding");
    normalizedFile(f.file);
  }
}
const compareOrder = (a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b),"en");
function sorted(items) { return items.sort(compareOrder); }
function makeBuckets(findings) {
  const buckets=new Map();
  for (const f of findings) {
    const file=normalizedFile(f.file);
    const identity=JSON.stringify([f.ruleId,file,f.line ?? null,f.message]);
    const copy={ruleId:f.ruleId,message:f.message,confidence:f.confidence,...(file?{file}:{}),...(f.line!==undefined?{line:f.line}:{})};
    if (!buckets.has(identity)) buckets.set(identity,[]);
    buckets.get(identity).push(copy);
  }
  for (const bucket of buckets.values()) sorted(bucket);
  return buckets;
}
export function compareReports(before,after) {
  validate(before); validate(after);
  const old=makeBuckets(before.findings), next=makeBuckets(after.findings);
  const changes={added:[],resolved:[],persistent:[],changedConfidence:[]};
  for (const key of [...new Set([...old.keys(),...next.keys()])].sort()) {
    const a=[...(old.get(key)??[])],b=[...(next.get(key)??[])];
    for (let i=a.length-1;i>=0;i--) {
      const match=b.findIndex(x=>x.confidence===a[i].confidence);
      if(match!==-1){changes.persistent.push(a[i]);a.splice(i,1);b.splice(match,1);}
    }
    while(a.length && b.length) changes.changedConfidence.push({before:a.shift(),after:b.shift()});
    changes.resolved.push(...a);changes.added.push(...b);
  }
  for (const key of Object.keys(changes)) sorted(changes[key]);
  return changes;
}
async function main(args) {
  const json=args.includes("--json"); const files=args.filter(x=>x!=="--json");
  if (files.length!==2) throw new Error("Usage: node tools/report-diff/index.mjs before.json after.json [--json]");
  const read=async name=>{
    const stat=(await import("node:fs/promises")).stat;
    if ((await stat(name)).size>5*1024*1024) throw new Error("Report exceeds 5 MiB limit");
    return JSON.parse(await readFile(name,"utf8"));
  };
  const changes=compareReports(await read(files[0]),await read(files[1]));
  if(json) console.log(JSON.stringify(changes,null,2));
  else for(const [key,items] of Object.entries(changes)) {
    console.log(key + ": " + items.length);
    for(const item of items) console.log("  "+JSON.stringify(item));
  }
  if(changes.added.length || changes.resolved.length || changes.changedConfidence.length) process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(()=>{ console.error("Invalid or unavailable report input");process.exitCode=2; });
