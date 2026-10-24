import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type PathClassification = "inside" | "symlink-internal" | "escaped" | "nonexistent" | "unreadable";
export type PathDiagnostic = "ok" | "invalid-path" | "root-unavailable" | "outside-root" | "not-found" | "permission-denied" | "symlink-loop" | "filesystem-error";
export interface PathResolution {
  readonly classification: PathClassification;
  readonly diagnostic: PathDiagnostic;
  readonly relativePath?: string;
  readonly canonicalPath?: string;
}
const within = (base: string, target: string): boolean => {
  const rel = relative(base, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
};
const failure = (classification: PathClassification, diagnostic: PathDiagnostic): PathResolution => ({ classification, diagnostic });
const errorCode = (error: unknown): string | undefined =>
  error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;

/** Resolves paths relative to a trusted directory without reading file contents. */
export async function resolveProjectPath(root: string, candidate: string): Promise<PathResolution> {
  if (!root || typeof candidate !== "string" || !candidate || candidate.includes("\0") || isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate)) {
    return failure("escaped", "invalid-path");
  }
  if (candidate.split(/[\\/]/).some(part => part === "..")) return failure("escaped", "outside-root");
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(root);
    if (!(await lstat(canonicalRoot)).isDirectory()) return failure("unreadable", "root-unavailable");
  } catch {
    return failure("unreadable", "root-unavailable");
  }
  const target = resolve(canonicalRoot, candidate);
  if (!within(canonicalRoot, target)) return failure("escaped", "outside-root");
  let symlink = false;
  let cursor = canonicalRoot;
  for (const component of relative(canonicalRoot, target).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, component);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) symlink = true;
      const actual = await realpath(cursor);
      if (!within(canonicalRoot, actual)) return failure("escaped", "outside-root");
    } catch (error) {
      const code = errorCode(error);
      if (code === "ENOENT" || code === "ENOTDIR") return failure("nonexistent", "not-found");
      if (code === "ELOOP") return failure("unreadable", "symlink-loop");
      if (code === "EACCES" || code === "EPERM") return failure("unreadable", "permission-denied");
      return failure("unreadable", "filesystem-error");
    }
  }
  try {
    const actual = await realpath(target);
    if (!within(canonicalRoot, actual)) return failure("escaped", "outside-root");
    return { classification: symlink ? "symlink-internal" : "inside", diagnostic: "ok",
      canonicalPath: actual, relativePath: relative(canonicalRoot, actual).split(sep).join("/") || "." };
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") return failure("nonexistent", "not-found");
    if (code === "ELOOP") return failure("unreadable", "symlink-loop");
    return failure("unreadable", code === "EACCES" || code === "EPERM" ? "permission-denied" : "filesystem-error");
  }
}
