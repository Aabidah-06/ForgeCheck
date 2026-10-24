/**
 * A deliberately documented gitignore subset, independent from file discovery.
 * Later matching rules override earlier ones; ! unignores matching paths.
 */
function normalizePath(input) {
  if (typeof input !== "string" || !input || input.includes("\0")) throw new TypeError("Invalid relative path");
  const path = input.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (path.startsWith("/") || /^[a-z]:\//i.test(path)) throw new TypeError("Absolute paths are not allowed");
  const parts = path.split("/").filter(x => x && x !== ".");
  if (parts.includes("..") || parts.length === 0) throw new TypeError("Traversal or empty path");
  return parts.join("/");
}
function escapeRegExp(c) { return c.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"); }
function globRegex(glob) {
  let result = "";
  for (let i=0; i<glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i+1] === "*") {
        if (glob[i+2] === "/") {result += "(?:.*/)?"; i += 2;}
        else {result += ".*"; i++;}
      } else result += "[^/]*";
    } else if (ch === "?") result += "[^/]";
    else result += escapeRegExp(ch);
  }
  return result;
}
export function compileIgnorePatterns(patterns) {
  if (!Array.isArray(patterns) || patterns.some(x => typeof x !== "string")) throw new TypeError("Expected array of patterns");
  const compiled = [];
  for (const raw of patterns) {
    if (!raw || raw.startsWith("#")) continue;
    let source=raw, negated=false;
    if (source.startsWith("\\#") || source.startsWith("\\!")) source = source.slice(1);
    else if (source.startsWith("!")) {negated=true; source=source.slice(1);}
    const directory=source.endsWith("/");
    const anchored=source.startsWith("/");
    source=source.replace(/^\/|\/$/g, "");
    if (!source || source.includes("\0") || source.includes("\\") || source.split("/").includes("..") ||
        /[\[\]{}]/.test(source) || /(^|[^*])\*{3,}/.test(source))
      throw new TypeError("Unsupported or unsafe ignore pattern");
    const hasSlash=source.includes("/");
    const prefix=anchored || hasSlash ? "^" : "(?:^|.*/)";
    const body=globRegex(source);
    compiled.push({ negated, directory, matcher:new RegExp(prefix + body + (directory ? "(?:/.*)?$" : "(?:$|/.*$)")) });
  }
  return Object.freeze({
    shouldIgnore(relativePath, isDirectory=false) {
      if (typeof isDirectory !== "boolean") throw new TypeError("isDirectory must be boolean");
      const path=normalizePath(relativePath);
      let ignored=false;
      for (const rule of compiled) if (rule.matcher.test(path)) ignored=!rule.negated;
      return ignored;
    }
  });
}
