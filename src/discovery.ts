/**
 * Bounded, read-only source-file discovery. No file is opened or executed.
 * A partial traversal is never represented as complete.
 */
import { access, lstat, readdir, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const SUPPORTED_LOCKFILES = Object.freeze([
  "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"
] as const);

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const SKIP_DIRECTORIES = new Set([
  ".git", ".hg", ".svn", "node_modules", ".pnpm-store", "vendor",
  "dist", "build", "out", "coverage", ".next", ".nuxt", ".svelte-kit",
  ".output", ".turbo", ".cache", "target", "tmp", "temp"
]);
const FORBIDDEN_NAMES = new Set([
  ".npmrc", ".pypirc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
  "credentials.json", "secrets.json", "secret.json"
]);
const FORBIDDEN_EXTENSIONS = new Set([
  ".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".der", ".asc"
]);

export interface DiscoveryOptions {
  /** Directory to visit. A symlink as the root is rejected. */
  readonly projectRoot: string;
  /** Optional glob allow-list. Patterns use forward slashes; ** matches directories. */
  readonly include?: readonly string[];
  /** Additional glob exclusions (cannot undo built-in exclusions). */
  readonly exclude?: readonly string[];
  /** Maximum encountered directory entries, including excluded entries. Default 100000. */
  readonly maxEntries?: number;
  /** Maximum relative directory depth. Default 32. */
  readonly maxDepth?: number;
  /** Maximum returned files. Default 20000. */
  readonly maxFiles?: number;
}

export type DiscoveryDiagnosticCode =
  | "unreadable-directory" | "unreadable-entry" | "limit-reached" | "unsafe-path";
export interface DiscoveryDiagnostic {
  readonly code: DiscoveryDiagnosticCode;
  /** Normalized project-relative path; empty string denotes the root. */
  readonly path: string;
  /** Static, non-sensitive explanation; OS error bodies are not included. */
  readonly message: string;
}
export interface DiscoveryResult {
  readonly projectRoot: string;
  readonly files: readonly string[];
  readonly diagnostics: readonly DiscoveryDiagnostic[];
  /** False whenever any subtree is unreadable, unsafe, or truncated. */
  readonly complete: boolean;
  readonly entriesVisited: number;
}

export class DiscoveryInputError extends Error {
  constructor(readonly code: "invalid-root" | "invalid-options" | "unreadable-root") {
    super(`Discovery cannot proceed: ${code}`);
    this.name = "DiscoveryInputError";
  }
}

function normalizePattern(pattern: string): string {
  if (typeof pattern !== "string" || !pattern.trim() || pattern.startsWith("/") || /^[A-Za-z]:/.test(pattern)) {
    throw new DiscoveryInputError("invalid-options");
  }
  const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.split("/").some(segment => segment === ".." || segment === "")) {
    throw new DiscoveryInputError("invalid-options");
  }
  return normalized;
}

function globRegex(glob: string): RegExp {
  const pattern = normalizePattern(glob);
  let regex = "^";
  for (let i = 0; i < pattern.length; i++) {
    const character = pattern[i];
    if (character === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") { regex += "(?:.*/)?"; i += 2; }
        else { regex += ".*"; i++; }
      } else regex += "[^/]*";
    } else if (character === "?") regex += "[^/]";
    else regex += character?.replace(/[|\\{}()[\]^$+?.]/g, "\\$&") ?? "";
  }
  return new RegExp(regex + "$");
}

function validateBound(value: number | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  if (!Number.isSafeInteger(value) || value < 1) throw new DiscoveryInputError("invalid-options");
  return value;
}

function forbiddenFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith(".env")) return true;
  if (FORBIDDEN_NAMES.has(lower)) return true;
  const dot = lower.lastIndexOf(".");
  return dot >= 0 && FORBIDDEN_EXTENSIONS.has(lower.slice(dot));
}

function supportedFile(name: string): boolean {
  if (forbiddenFile(name)) return false;
  if (name === "package.json" || SUPPORTED_LOCKFILES.includes(name as typeof SUPPORTED_LOCKFILES[number])) return true;
  const dot = name.lastIndexOf(".");
  return dot >= 0 && SOURCE_EXTENSIONS.has(name.slice(dot));
}

function insideRoot(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Discover paths without reading contents, resolving descendants' symlinks, or importing code. */
export async function discoverProjectFiles(options: DiscoveryOptions): Promise<DiscoveryResult> {
  if (!options || typeof options.projectRoot !== "string" || !options.projectRoot.trim()) {
    throw new DiscoveryInputError("invalid-root");
  }
  const maxEntries = validateBound(options.maxEntries, 100_000);
  const maxDepth = validateBound(options.maxDepth, 32);
  const maxFiles = validateBound(options.maxFiles, 20_000);
  if ((options.include !== undefined && !Array.isArray(options.include)) ||
      (options.exclude !== undefined && !Array.isArray(options.exclude))) {
    throw new DiscoveryInputError("invalid-options");
  }
  const include = options.include?.map(globRegex);
  const exclude = (options.exclude ?? []).map(globRegex);
  const root = resolve(options.projectRoot);
  let rootStat;
  try { rootStat = await lstat(root); }
  catch { throw new DiscoveryInputError("unreadable-root"); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new DiscoveryInputError("invalid-root");

  // Resolve the base once for comparisons; never follow links inside the project.
  let canonicalRoot: string;
  try { canonicalRoot = await realpath(root); }
  catch { throw new DiscoveryInputError("unreadable-root"); }

  const files: string[] = [];
  const diagnostics: DiscoveryDiagnostic[] = [];
  const stack: { absolute: string; relative: string; depth: number }[] = [
    { absolute: root, relative: "", depth: 0 }
  ];
  let entriesVisited = 0;
  let limited = false;
  while (stack.length && !limited) {
    const current = stack.pop();
    if (!current) break;
    let entries;
    try {
      // Defense against symlink replacement between queuing and visiting.
      const st = await lstat(current.absolute);
      if (!st.isDirectory() || st.isSymbolicLink() || !insideRoot(canonicalRoot, await realpath(current.absolute))) {
        diagnostics.push({ code: "unsafe-path", path: current.relative, message: "Skipped unsafe or changed directory" });
        continue;
      }
      entries = await readdir(current.absolute, { withFileTypes: true });
    } catch {
      diagnostics.push({ code: "unreadable-directory", path: current.relative, message: "Directory could not be read" });
      continue;
    }
    entries.sort((a, b) => comparePaths(a.name, b.name));
    const subdirectories: typeof stack = [];
    for (const entry of entries) {
      entriesVisited++;
      if (entriesVisited > maxEntries) {
        diagnostics.push({ code: "limit-reached", path: current.relative, message: "Maximum directory entries exceeded" });
        limited = true;
        break;
      }
      const rel = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      const absolute = resolve(current.absolute, entry.name);
      if (!insideRoot(root, absolute)) {
        diagnostics.push({ code: "unsafe-path", path: rel, message: "Entry outside project root was skipped" });
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase().startsWith(".env") || SKIP_DIRECTORIES.has(entry.name.toLowerCase()) ||
            exclude.some(pattern => pattern.test(rel) || pattern.test(rel + "/"))) continue;
        if (current.depth >= maxDepth) {
          diagnostics.push({ code: "limit-reached", path: rel, message: "Maximum traversal depth exceeded" });
          continue;
        }
        subdirectories.push({ absolute, relative: rel, depth: current.depth + 1 });
      } else if (entry.isFile() && supportedFile(entry.name) &&
        !exclude.some(pattern => pattern.test(rel)) &&
        (include === undefined || include.some(pattern => pattern.test(rel)))) {
        if (files.length >= maxFiles) {
          diagnostics.push({ code: "limit-reached", path: rel, message: "Maximum discovered files exceeded" });
          limited = true;
          break;
        }
        try {
          // Check accessibility without opening, reading, or following file symlinks.
          const stat = await lstat(absolute);
          if (!stat.isFile() || stat.isSymbolicLink()) {
            diagnostics.push({ code: "unsafe-path", path: rel, message: "Entry was replaced or is unsafe" });
            continue;
          }
          if ((stat.mode & 0o444) === 0) throw new Error("unreadable");
          await access(absolute, constants.R_OK);
        } catch {
          diagnostics.push({ code: "unreadable-entry", path: rel, message: "Source file could not be accessed" });
          continue;
        }
        files.push(rel);
      } else if (!entry.isFile() && !entry.isDirectory()) {
        // FIFOs/sockets/devices are skipped; they are never opened.
      }
    }
    // LIFO reversed push visits subdirectories in ascending order.
    for (let i = subdirectories.length - 1; i >= 0; i--) {
      const child = subdirectories[i];
      if (child) stack.push(child);
    }
  }
  files.sort(comparePaths);
  diagnostics.sort((a, b) => comparePaths(a.path, b.path) || comparePaths(a.code, b.code));
  return { projectRoot: canonicalRoot, files, diagnostics, complete: diagnostics.length === 0, entriesVisited };
}
