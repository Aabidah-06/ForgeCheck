import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const required = [
  "README.md", "LICENSE", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md",
  "docs/ARCHITECTURE.md", "docs/ROADMAP.md", "docs/RULES.md",
  ".github/PULL_REQUEST_TEMPLATE.md", ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml", ".github/ISSUE_TEMPLATE/rule_proposal.yml",
  ".github/workflows/repository-checks.yml"
];

export function missing(root) {
  return required.filter(name => !fs.existsSync(path.join(root, name)));
}

export function brokenLinks(root) {
  const errors = [];
  for (const filename of required.filter(name => name.endsWith(".md"))) {
    const source = path.join(root, filename);
    if (!fs.existsSync(source)) continue;
    for (const match of fs.readFileSync(source, "utf8").matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#", 1)[0];
      if (!target || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
      const resolved = path.resolve(path.dirname(source), decodeURIComponent(target));
      if (resolved !== path.resolve(root) && !resolved.startsWith(path.resolve(root) + path.sep)) {
        errors.push(filename + ": path escapes project: " + target);
      } else if (!fs.existsSync(resolved)) {
        errors.push(filename + ": missing target: " + target);
      }
    }
  }
  return errors;
}

const current = path.resolve(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === current) {
  const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
  const failures = [...missing(root).map(name => "Missing: " + name), ...brokenLinks(root)];
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else console.log("ForgeCheck repository foundation passed.");
}
