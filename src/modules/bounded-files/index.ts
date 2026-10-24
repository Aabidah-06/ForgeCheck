import { open, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type ReadErrorCode = "invalid-path" | "outside-root" | "not-found" | "permission-denied" | "too-large" | "invalid-utf8" | "binary-file" | "not-file" | "io-error";
export type TextReadResult = { readonly ok: true; readonly text: string; readonly bytes: number; readonly relativePath: string }
  | { readonly ok: false; readonly code: ReadErrorCode };
export interface ReadLimits { readonly maxBytes: number }
const fail = (code: ReadErrorCode): TextReadResult => ({ ok: false, code });
function within(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}
function codeOf(e: unknown): string | undefined {
  return e && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : undefined;
}
function error(e: unknown): TextReadResult {
  const code = codeOf(e);
  if (code === "ENOENT" || code === "ENOTDIR") return fail("not-found");
  if (code === "EACCES" || code === "EPERM") return fail("permission-denied");
  if (code === "ELOOP") return fail("outside-root");
  return fail("io-error");
}
/** Offline bounded UTF-8 reader. Does not evaluate or import target files. */
export async function readProjectTextFile(root: string, relativePath: string, limits: ReadLimits): Promise<TextReadResult> {
  if (!root || !relativePath || typeof relativePath !== "string" || relativePath.includes("\0")
      || isAbsolute(relativePath) || /^[A-Za-z]:[\\/]/.test(relativePath)) return fail("invalid-path");
  if (relativePath.split(/[\\/]/).includes("..")) return fail("outside-root");
  if (!limits || !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 0 || limits.maxBytes > 16 * 1024 * 1024) return fail("invalid-path");
  let base: string;
  let target: string;
  try {
    base = await realpath(root);
    if (!(await stat(base)).isDirectory()) return fail("invalid-path");
    const lexical = resolve(base, relativePath);
    if (!within(base, lexical)) return fail("outside-root");
    target = await realpath(lexical);
    if (!within(base, target)) return fail("outside-root");
  } catch (e) { return error(e); }
  let handle;
  try {
    handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const metadata = await handle.stat();
    if (!metadata.isFile()) return fail("not-file");
    if (metadata.size > limits.maxBytes) return fail("too-large");
    const chunk = Buffer.allocUnsafe(Math.min(8192, limits.maxBytes + 1));
    const fragments: Buffer[] = [];
    let bytes = 0;
    for (;;) {
      const allowance = Math.min(chunk.length, limits.maxBytes + 1 - bytes);
      if (allowance <= 0) return fail("too-large");
      const read = await handle.read(chunk, 0, allowance, null);
      if (read.bytesRead === 0) break;
      bytes += read.bytesRead;
      if (bytes > limits.maxBytes) return fail("too-large");
      fragments.push(Buffer.from(chunk.subarray(0, read.bytesRead)));
    }
    const data = Buffer.concat(fragments, bytes);
    if (data.includes(0)) return fail("binary-file");
    let decoded: string;
    try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(data); }
    catch { return fail("invalid-utf8"); }
    if (/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(decoded)) return fail("binary-file");
    return { ok: true, text: decoded, bytes, relativePath: relative(base, target).split(sep).join("/") };
  } catch (e) { return error(e); }
  finally { if (handle) await handle.close().catch(() => undefined); }
}
