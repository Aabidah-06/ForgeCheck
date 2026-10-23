/** Read-only JS/TS source-rule adapter, independent of discovery and the rule registry. */
import ts from "typescript";
import type { ScanFinding } from "../contracts.js";

export interface SourceRuleInput {
  /** Normalized project-relative file path supplied by a future discovery module. */
  readonly file: string;
  /** Source text is parsed only; it is never imported, evaluated or executed. */
  readonly source: string;
  /** An exact resolved version, if dependency analysis can establish one. */
  readonly resolvedSdkVersion?: string;
}

export interface SourceRuleFinding extends ScanFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly confidence: "review-required";
  readonly evidenceUrl: string;
  readonly suggestion: string;
  readonly affectedVersions: string;
  readonly versionContext: string;
}

export function parseSource(input: SourceRuleInput): ts.SourceFile {
  const path = input.file.toLowerCase();
  const scriptKind = path.endsWith(".tsx") ? ts.ScriptKind.TSX
    : path.endsWith(".jsx") ? ts.ScriptKind.JSX
    : path.endsWith(".ts") || path.endsWith(".mts") || path.endsWith(".cts") ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;
  return ts.createSourceFile(input.file, input.source, ts.ScriptTarget.Latest, true, scriptKind);
}

export function isStellarSdkModule(moduleName: string): boolean {
  return /^(?:@stellar\/(?:stellar-sdk|stellar-base)|stellar-sdk|stellar-base)(?:\/.*)?$/.test(moduleName);
}

export function propName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

export function receiver(node: ts.Node): ts.Expression | undefined {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return node.expression;
  return undefined;
}

export interface SdkImports {
  readonly namespaces: ReadonlySet<string>;
  readonly names: ReadonlyMap<string, string>;
}

/** Supports ESM named/aliased and namespace imports, and static CommonJS require. */
export function sdkImports(file: ts.SourceFile): SdkImports {
  const namespaces = new Set<string>();
  const names = new Map<string, string>();
  function registerBindings(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) { namespaces.add(name.text); return; }
    if (!ts.isObjectBindingPattern(name)) return;
    for (const element of name.elements) {
      if (!ts.isIdentifier(element.name)) continue;
      const imported = element.propertyName;
      const original = imported && (ts.isIdentifier(imported) || ts.isStringLiteral(imported))
        ? imported.text : element.name.text;
      names.set(element.name.text, original);
    }
  }
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
        && isStellarSdkModule(statement.moduleSpecifier.text)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
      else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) names.set(element.name.text, element.propertyName?.text ?? element.name.text);
      }
      // A legacy default import is a namespace-like object in older versions.
      if (statement.importClause?.name) namespaces.add(statement.importClause.name.text);
    }
    if (ts.isImportEqualsDeclaration(statement) && ts.isExternalModuleReference(statement.moduleReference)
        && statement.moduleReference.expression && ts.isStringLiteral(statement.moduleReference.expression)
        && isStellarSdkModule(statement.moduleReference.expression.text)) namespaces.add(statement.name.text);
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const init = declaration.initializer;
      if (init && ts.isCallExpression(init) && ts.isIdentifier(init.expression)
        && init.expression.text === "require" && init.arguments.length === 1
        && ts.isStringLiteral(init.arguments[0]!) && isStellarSdkModule(init.arguments[0]!.text)) {
        registerBindings(declaration.name);
      }
    }
  }
  return { namespaces, names };
}

/** Recognize a member imported from Stellar, not a coincidentally named local. */
export function sdkSymbol(node: ts.Node, bindings: SdkImports): string | undefined {
  if (ts.isIdentifier(node)) return bindings.names.get(node.text);
  const member = propName(node);
  const object = receiver(node);
  if (member && object) {
    if (ts.isIdentifier(object) && bindings.namespaces.has(object.text)) return member;
    const nested = sdkSymbol(object, bindings);
    if (nested) return `${nested}.${member}`;
  }
  return undefined;
}

export function makeFinding(
  input: SourceRuleInput, file: ts.SourceFile, node: ts.Node,
  fields: Pick<SourceRuleFinding, "ruleId" | "message" | "evidenceUrl" | "suggestion" | "affectedVersions">
): SourceRuleFinding {
  const position = file.getLineAndCharacterOfPosition(node.getStart(file));
  const versionContext = input.resolvedSdkVersion
    ? `Resolved SDK version supplied by caller: ${input.resolvedSdkVersion}; verify package/API applicability.`
    : "SDK version not resolved; inspect project dependency/lockfile context before concluding impact.";
  return {
    ...fields, confidence: "review-required", file: input.file,
    line: position.line + 1, column: position.character + 1, versionContext
  };
}

export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, child => walk(child, visit));
}
