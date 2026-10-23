import * as ts from "typescript";
import type { ScanFinding } from "../contracts.js";

export const HORIZON_MIGRATION_GUIDE =
  "https://developers.stellar.org/docs/data/apis/migrate-from-horizon-to-rpc";
export const STELLAR_DATA_GUIDE = "https://developers.stellar.org/docs/data/apis";

/** A review suggestion, not proof that any Horizon call is broken. */
export interface HorizonFinding extends ScanFinding {
  readonly confidence: "review-required";
  readonly suggestion: string;
  readonly evidence: readonly string[];
}

type Kind = "account" | "transaction" | "submit";
const migration: Record<Kind, { rule: string; message: string; suggestion: string }> = {
  account: {
    rule: "stellar/horizon-rpc-account",
    message: "Horizon account lookup may require a migration review.",
    suggestion: "For current ledger state, assess RPC getLedgerEntries. It does not aggregate trustlines or return Horizon's response shape; historical/curated queries may still require an indexer."
  },
  transaction: {
    rule: "stellar/horizon-rpc-transaction",
    message: "Horizon transaction lookup may require a migration review.",
    suggestion: "For recent transactions, assess RPC getTransaction or getTransactions. RPC has a bounded history window and different response shapes; retain an indexer for older history."
  },
  submit: {
    rule: "stellar/horizon-rpc-submit",
    message: "Horizon transaction submission may require a migration review.",
    suggestion: "Assess RPC sendTransaction, including its asynchronous submission and status-polling behavior. This is not a drop-in response replacement."
  }
};

const sdkPackages = new Set(["@stellar/stellar-sdk", "stellar-sdk"]);
const historyOnly = new Set([
  "effects", "trades", "offers", "liquidityPools", "claimableBalances",
  "payments", "operations", "orderbook", "assets"
]);
function literal(node: ts.Node | undefined): string | undefined {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text : undefined;
}
function member(node: ts.Node): string | undefined {
  return ts.isPropertyAccessExpression(node) ? node.name.text : undefined;
}
function root(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
    current = ts.isCallExpression(current) ? current.expression : current.expression;
  }
  return current;
}
function expressionIsHorizon(
  node: ts.Expression, horizonNames: ReadonlySet<string>, sdkNames: ReadonlySet<string>
): boolean {
  if (ts.isIdentifier(node)) return horizonNames.has(node.text);
  return ts.isPropertyAccessExpression(node) && node.name.text === "Horizon"
    && ts.isIdentifier(node.expression) && sdkNames.has(node.expression.text);
}
function isHorizonServer(
  node: ts.Expression, horizonNames: ReadonlySet<string>, sdkNames: ReadonlySet<string>
): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === "Server"
    && expressionIsHorizon(node.expression, horizonNames, sdkNames);
}
function kindForMethod(name: string): Kind | undefined {
  if (name === "accounts" || name === "accountId" || name === "loadAccount") return "account";
  if (name === "transactions" || name === "transaction") return "transaction";
  if (name === "submitTransaction" || name === "submitTransactionXDR") return "submit";
  return undefined;
}

/**
 * Pure AST analysis. Never imports, evaluates, or contacts the target program.
 * This module is consumed by the scanner registry when discovery (#6) and
 * integration (#13) are available.
 */
export function analyzeHorizonSource(source: string, file: string): HorizonFinding[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const horizonNames = new Set<string>();
  const sdkNames = new Set<string>();
  const serverNames = new Set<string>();
  const serverDeclarations: ts.NewExpression[] = [];

  function sdkRequire(node: ts.Expression): boolean {
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === "require"
      && sdkPackages.has(literal(node.arguments[0]) ?? "");
  }
  function collect(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && sdkPackages.has(literal(node.moduleSpecifier) ?? "")) {
      const clause = node.importClause;
      if (clause?.name) sdkNames.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) sdkNames.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const spec of bindings.elements) {
          if ((spec.propertyName?.text ?? spec.name.text) === "Horizon") horizonNames.add(spec.name.text);
        }
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (sdkRequire(node.initializer)) {
        if (ts.isIdentifier(node.name)) sdkNames.add(node.name.text);
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if ((element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text : element.name.getText(ast)) === "Horizon"
              && ts.isIdentifier(element.name)) horizonNames.add(element.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, collect);
  }
  collect(ast);
  function collectServers(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
        && ts.isNewExpression(node.initializer)
        && isHorizonServer(node.initializer.expression, horizonNames, sdkNames)) {
      serverNames.add(node.name.text);
      serverDeclarations.push(node.initializer);
    }
    ts.forEachChild(node, collectServers);
  }
  collectServers(ast);

  const results: HorizonFinding[] = [];
  const seen = new Set<string>();
  function add(node: ts.Node, kind: Kind, detail: string): void {
    const location = ast.getLineAndCharacterOfPosition(node.getStart(ast));
    const item = migration[kind];
    const key = `${item.rule}:${location.line}:${location.character}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      ruleId: item.rule, message: item.message,
      confidence: "review-required", file, line: location.line + 1,
      suggestion: item.suggestion,
      evidence: [HORIZON_MIGRATION_GUIDE, STELLAR_DATA_GUIDE, detail]
    });
  }
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const origin = root(node.expression.expression);
      if (ts.isIdentifier(origin) && serverNames.has(origin.text)) {
        const kind = kindForMethod(method);
        // A historical/curated Horizon endpoint is deliberately not diagnosed
        // as directly replaceable by RPC.
        if (kind && !historyOnly.has(method)) add(node, kind, `Horizon.Server method: ${method}`);
      }
      const url = literal(node.arguments[0]);
      const isRequest = ts.isIdentifier(node.expression.expression)
        && ["axios"].includes(node.expression.expression.text)
        && ["get", "post"].includes(method);
      if (isRequest && url) checkUrl(node, url);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === "fetch") {
      const url = literal(node.arguments[0]);
      if (url) checkUrl(node, url);
    }
    ts.forEachChild(node, visit);
  }
  function checkUrl(node: ts.Node, url: string): void {
    const matched = /^https:\/\/(?:horizon(?:-testnet|-futurenet)?\.stellar\.org)\/(accounts|transactions)(?:\/([^/?#]+))?(?:[?#]|$)/.exec(url);
    if (!matched) return;
    const endpoint = matched[1];
    // Only scoped Stellar-hosted Horizon endpoints, not arbitrary unrelated URLs.
    const kind: Kind = endpoint === "accounts" ? "account" : "transaction";
    add(node, kind, `Horizon REST endpoint: /${endpoint}`);
  }
  visit(ast);
  // A standalone SDK Horizon.Server integration is also a migration review
  // location. Avoid suggesting RPC where it is explicitly used only for
  // historical/curated Horizon collection endpoints.
  const hasHistoricalOnlyUsage = (node: ts.Node): boolean => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && historyOnly.has(node.expression.name.text)) {
      const origin = root(node.expression.expression);
      if (ts.isIdentifier(origin) && serverNames.has(origin.text)) return true;
    }
    return ts.forEachChild(node, hasHistoricalOnlyUsage) ?? false;
  };
  if (results.length === 0 && serverDeclarations.length && !hasHistoricalOnlyUsage(ast)) {
    const where = serverDeclarations[0];
    if (where) {
      const pos = ast.getLineAndCharacterOfPosition(where.getStart(ast));
      results.push({
        ruleId: "stellar/horizon-rpc-server",
        message: "Stellar Horizon.Server integration may warrant an RPC migration review.",
        confidence: "review-required", file, line: pos.line + 1,
        suggestion: "Inspect Horizon endpoint usage and compare the official mapping. RPC is not a drop-in replacement for historical, curated or aggregated Horizon data.",
        evidence: [HORIZON_MIGRATION_GUIDE, STELLAR_DATA_GUIDE, "Stellar SDK Horizon.Server constructor"]
      });
    }
  }
  return results.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.ruleId.localeCompare(b.ruleId));
}
