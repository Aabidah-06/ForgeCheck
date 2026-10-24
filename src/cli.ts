#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runCli, textReporter } from "./application.js";
import { projectScanEngine } from "./scanner.js";

function getVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
  if (typeof pkg.version !== "string") throw new Error("Missing package version");
  return pkg.version;
}
const code = await runCli(process.argv.slice(2), {
  engine: projectScanEngine, reporter: textReporter,
  cwd: process.cwd(), version: getVersion(),
  io: {
    out(line) { process.stdout.write(line.endsWith("\n") ? line : line + "\n"); },
    err(line) { process.stderr.write(line.endsWith("\n") ? line : line + "\n"); }
  }
});
process.exitCode = code;
