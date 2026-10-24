import {readFile,lstat} from "node:fs/promises";
import {resolve,relative,isAbsolute,sep,posix} from "node:path";
import type {DiscoveryResult} from "./discovery.js";

export type Resolution="resolved"|"missing-lock"|"unsupported-lock"|"unresolved"|"stale-lock"|"ambiguous";
export interface SdkDependency {
 readonly manifest:string;readonly name:string;readonly packageName:string;readonly declared:string;
 readonly scope:string;readonly resolution:Resolution;readonly resolvedVersion?:string;readonly location?:string;
}
export interface DependencyDiagnostic {readonly path:string;readonly code:string;readonly message:string}
export interface DependencyContext {readonly dependencies:readonly SdkDependency[];readonly diagnostics:readonly DependencyDiagnostic[];readonly complete:boolean}
const targets=new Set(["@stellar/stellar-sdk","@stellar/stellar-base","stellar-sdk","stellar-base"]);
const scopes=["dependencies","devDependencies","optionalDependencies","peerDependencies"];
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const version=(x:unknown):x is string=>typeof x==="string"&&/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(x);
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
function alias(name:string,decl:string):string {
 if(!decl.startsWith("npm:"))return name;
 const raw=decl.slice(4);
 return raw.startsWith("@")?raw.slice(0,raw.indexOf("@",1)>0?raw.indexOf("@",1):raw.length):raw.split("@")[0]??name;
}
async function readJson(root:string,path:string,diagnostics:DependencyDiagnostic[]):Promise<Record<string,unknown>|undefined>{
 try{
  const absolute=resolve(root,path), rel=relative(root,absolute);
  if(!rel||rel===".."||rel.startsWith(".."+sep)||isAbsolute(rel)||path.includes("\\")||path.split("/").includes(".."))throw Error();
  const stat=await lstat(absolute);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2_000_000)throw Error();
  const result:unknown=JSON.parse(await readFile(absolute,"utf8"));
  if(!obj(result))throw Error();
  return result;
 }catch{diagnostics.push({path,code:"invalid-or-unreadable",message:"Cannot safely parse manifest or lockfile"});return undefined;}
}
function installations(lock:Record<string,unknown>,name:string,dir:string):{version:string;location:string}[]{
 const packages=lock.packages;if(!obj(packages))return [];
 const result:{version:string;location:string}[]=[];
 let current=dir;
 while(true){
  const location=(current?current+"/":"")+"node_modules/"+name;
  const entry=packages[location];
  if(obj(entry)&&version(entry.version))result.push({version:entry.version,location});
  if(!current)break;
  current=posix.dirname(current);if(current===".")current="";
 }
 return result;
}
/** Operates only on safe, discovered filenames; no registry, install, or project execution. */
export async function resolveStellarDependencies(discovery:DiscoveryResult):Promise<DependencyContext>{
 const files=[...new Set(discovery.files)].sort(cmp),set=new Set(files),diagnostics:DependencyDiagnostic[]=[];
 if(!discovery.complete)diagnostics.push({path:"",code:"partial-discovery",message:"Discovery is incomplete"});
 const lockFiles=files.filter(x=>/(^|\/)(package-lock\.json|npm-shrinkwrap\.json)$/.test(x));
 const unsupported=files.filter(x=>/(^|\/)(yarn\.lock|pnpm-lock\.yaml|bun\.lock)$/.test(x));
 const locks=new Map<string,Record<string,unknown>>();
 for(const file of lockFiles){
  const data=await readJson(discovery.projectRoot,file,diagnostics);
  if(!data)continue;
  if(![2,3].includes(Number(data.lockfileVersion))||!obj(data.packages)){
   diagnostics.push({path:file,code:"unsupported-npm-lock",message:"Supported npm lockfile formats are v2 and v3"});continue;
  }
  locks.set(posix.dirname(file)==="."?"":posix.dirname(file),data);
 }
 const dependencies:SdkDependency[]=[];
 for(const manifest of files.filter(x=>x==="package.json"||x.endsWith("/package.json"))){
  const data=await readJson(discovery.projectRoot,manifest,diagnostics);
  if(!data)continue;
  const dir=posix.dirname(manifest)==="."?"":posix.dirname(manifest);
  for(const scope of scopes){
   const declarations=data[scope];if(declarations===undefined)continue;
   if(!obj(declarations)){diagnostics.push({path:manifest,code:"invalid-manifest",message:"Invalid "+scope+" object"});continue;}
   for(const [name,raw] of Object.entries(declarations)){
    if(typeof raw!=="string"){diagnostics.push({path:manifest,code:"invalid-manifest",message:"Non-string dependency version"});continue;}
    const packageName=alias(name,raw);if(!targets.has(packageName))continue;
    let root=dir;
    while(root&&!locks.has(root)){root=posix.dirname(root);if(root===".")root="";}
    const lock=locks.get(root), local=dir.slice(root.length).replace(/^\//,"");
    const hits=lock?installations(lock,name,local):[];
    const versions=[...new Set(hits.map(x=>x.version))];
    let resolution:Resolution;
    if(versions.length>1)resolution="ambiguous";
    else if(versions.length===1&&version(raw)&&raw!==versions[0])resolution="stale-lock";
    else if(versions.length===1)resolution="resolved";
    else if(lock)resolution="unresolved";
    else if(unsupported.some(x=>posix.dirname(x)===(dir||".")))resolution="unsupported-lock";
    else resolution="missing-lock";
    dependencies.push({manifest,name,packageName,declared:raw,scope,resolution,
     ...(resolution==="resolved" && versions[0] !== undefined ? {resolvedVersion:versions[0]} : {}),
     ...(resolution==="resolved" && hits[0] !== undefined ? {location:hits[0].location} : {})});
   }
  }
 }
 for(const [dir,lock] of locks){
  const packages=lock.packages as Record<string,unknown>;
  for(const [location,info] of Object.entries(packages)){
   if(!obj(info)||!version(info.version))continue;
   const pkg=[...targets].find(x=>location.endsWith("node_modules/"+x));if(!pkg)continue;
   if(dependencies.some(x=>x.packageName===pkg&&x.resolvedVersion===info.version))continue;
   dependencies.push({manifest:(dir?dir+"/":"")+"package-lock.json",name:pkg,packageName:pkg,
    declared:"(transitive)",scope:"transitive",resolution:"resolved",resolvedVersion:info.version,location});
  }
 }
 if(unsupported.length&&!lockFiles.length)diagnostics.push({path:unsupported[0]??"",code:"unsupported-lock",message:"Yarn/pnpm/Bun version resolution not evaluated"});
 dependencies.sort((a,b)=>cmp(a.manifest,b.manifest)||cmp(a.name,b.name)||cmp(a.resolvedVersion??"",b.resolvedVersion??""));
 return {dependencies,diagnostics,complete:discovery.complete&&diagnostics.length===0};
}
