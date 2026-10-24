import type {CompatibilityRule,RuleAssessment} from "../rules.js";
import type {SdkDependency} from "../dependencies.js";
export const SUPPORT_AS_OF="2026-10-24";
export const SUPPORT_SOURCE="https://github.com/stellar/js-stellar-sdk/blob/master/RELEASE_POLICY.md";
export interface LifecycleAssessment {readonly dependency:SdkDependency;readonly status:"supported"|"unsupported"|"review-required"|"not-evaluated";readonly explanation:string}
export function assessSdkLifecycle(items:readonly SdkDependency[]):LifecycleAssessment[]{
 return items.filter(x=>x.packageName==="@stellar/stellar-sdk"||x.packageName==="stellar-sdk").map(dependency=>{
  const {resolvedVersion,packageName,resolution}=dependency;
  if(resolution!=="resolved"||!resolvedVersion)return {dependency,status:"not-evaluated",explanation:"Installed SDK version cannot be established ("+resolution+")"};
  if(packageName==="stellar-sdk")return {dependency,status:"unsupported",explanation:"Legacy unscoped stellar-sdk package: migrate and validate separately"};
  const major=Number(resolvedVersion.split(".")[0]);
  return major===16||major===17?{dependency,status:"supported",explanation:"Documented supported SDK major at reference date"}:
   {dependency,status:"unsupported",explanation:"SDK major outside documented v16/v17 supported lines"};
 });
}
export function sdkLifecycleRule(items:readonly SdkDependency[]):CompatibilityRule{
 return {id:"stellar/sdk-support-lifecycle",title:"Stellar JavaScript SDK support lifecycle",
 rationale:"Unsupported SDKs may lack fixes; SDK support does not prove protocol support.",
 applicability:{languages:["javascript","typescript"],affectedVersions:["legacy","<16","unresolved"],operations:["SDK dependency"]},
 evidenceUrls:[SUPPORT_SOURCE,"https://github.com/stellar/js-stellar-sdk"],
 safeExceptions:["Current supported major v16 (through March 2027)","Current supported major v17","No SDK dependency"],
 severity:"medium",remediation:"Review dated upstream support policy and lockfile; upgrade unsupported packages and assess target protocol separately.",
 detect():RuleAssessment{
  const observations=assessSdkLifecycle(items).filter(x=>x.status!=="supported").map(x=>({
   confidence:"review-required" as const,file:x.dependency.manifest,
   message:x.dependency.packageName+": "+x.explanation+" (as of "+SUPPORT_AS_OF+")"
  }));
  return observations.length?{kind:"matched",observations}:{kind:"safe-exception"};
 }};
}
