# Local file discovery (issue #6)

`src/discovery.ts` exports the **read-only** `discoverProjectFiles()` API. It returns normalized, slash-separated relative paths in stable lexical order. It is a standalone library component for later CLI integration; it does **not** claim to perform compatibility checks.

```ts
import { discoverProjectFiles } from "@soraforge/forgecheck/discovery";

const result = await discoverProjectFiles({
  projectRoot: "/absolute/path/to/project",
  include: ["apps/**/*.ts", "apps/**/*.tsx", "**/package.json"],
  exclude: ["apps/old/**"],
  maxDepth: 32,
  maxEntries: 100_000,
  maxFiles: 20_000
});
if (!result.complete) {
  // Report diagnostics and stop claiming complete scan coverage.
  console.warn(result.diagnostics);
}
console.log(result.files);
```

The `projectRoot` may be relative. The module rejects a symlink root, and does **not** follow links inside the root (including dangling, looping or escaping symlinks). Files are not opened, evaluated, imported, transmitted, or executed. The library makes no network calls and never runs package scripts. It checks file accessibility without reading content.

**Included by default:** `.js`, `.jsx`, `.ts`, `.tsx`, any nested `package.json`, and `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`. `bun.lockb` is a binary format and is deliberately unsupported. Only regular files are included.

**Always excluded:** `.git`, `.hg`, `.svn`, `node_modules`, `.pnpm-store`, `vendor`, `dist`, `build`, `out`, `coverage`, `.next`, `.nuxt`, `.svelte-kit`, `.output`, `.turbo`, `.cache`, `target`, `tmp`, `temp` directories; `.env*`, `.npmrc`, credential/key filenames and `.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore`, `.der`, `.asc` files; binary and other non-supported formats. These security exclusions cannot be overridden by an `include` pattern.

`include` and `exclude` are optional project-relative glob lists; patterns use `/` (Windows `\` separators are accepted in patterns). `*` matches within one segment, `**` matches across segments, and `?` matches a single character within a segment. `**/name` also matches `name` at the root. If `include` is omitted, all supported, non-excluded files qualify. An explicit empty `include` selects no files. `exclude` adds exclusions on top of built-in safety policy. Patterns must not be absolute or contain `..` segments.

**Bounded traversal:** Default limits are 32 nested directory levels, 100,000 encountered entries (including excluded entries), and 20,000 returned files. Supply positive integer overrides. The module does not walk into a directory that exceeds the depth budget; it reports an explicit `limit-reached` diagnostic instead. Unreadable directories/files, paths that change unsafely during enumeration, and entry/file limits cause `complete: false` and non-sensitive diagnostics. OS error text and file contents are never embedded in diagnostics. Ignored symlinks and intentionally excluded folders are outside the advertised coverage and do not count as errors.

This module does not parse JavaScript/TypeScript, resolve package dependencies, or decide compatibility. It only returns an inventory. Discovery is not a replacement for the separate context extraction and engine-integration issues.
