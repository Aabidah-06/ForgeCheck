/** Conservative, AST-based Stellar SDK v17 XDR/byte migration checks. */
import ts from "typescript";
import {
  makeFinding, parseSource, propName, receiver, sdkImports, sdkSymbol,
  type SdkImports, type SourceRuleFinding, type SourceRuleInput
} from "./source.js";

const XDR_GUIDE = "https://stellar.github.io/js-stellar-sdk/migration/xdr-migration/";
const BYTES_GUIDE = "https://stellar.github.io/js-stellar-sdk/migration/uint8array-migration/";
const RENAMED: Readonly<Record<string, string>> = {
  toXDR: "toXdr", fromXDR: "fromXdr", validateXDR: "validateXdr",
  toXDRObject: "toXdrObject", fromXDRObject: "fromXdrObject",
  toChangeTrustXDRObject: "toChangeTrustXdrObject",
  toTrustLineXDRObject: "toTrustLineXdrObject"
};
const BUFFER_METHODS = new Set([
  "toString", "equals", "compare", "readUInt32BE", "readUInt32LE",
  "readBigUInt64BE", "readBigUInt64LE", "readUInt16BE", "readUInt16LE",
  "readInt32BE", "readInt32LE", "readInt16BE", "readInt16LE"
]);
const BYTE_METHODS = new Set([
  "sign", "signMessage", "rawPublicKey", "rawSecretKey", "signatureHint",
  "hash", "signatureBase", "toBuffer"
]);
const STRKEY_DECODE = /^decode(?:Ed25519|Med25519|PreAuthTx|Sha256Hash|SignedPayload|Contract|ClaimableBalance|LiquidityPool)/;

type Origin = "keypair" | "tx-builder" | "transaction" | "sdk-xdr" | "sdk-type" | "sdk-bytes" | "native-buffer" | "unknown";

function scopedSymbol(node: ts.Node, imports: SdkImports, vars: ReadonlyMap<string, Origin>): string | undefined {
  let root = node;
  while (receiver(root)) root = receiver(root)!;
  if (ts.isIdentifier(root) && vars.has(root.text)
      && (imports.names.has(root.text) || imports.namespaces.has(root.text))) return undefined;
  return sdkSymbol(node, imports);
}

function infer(
  node: ts.Expression, imports: SdkImports, vars: ReadonlyMap<string, Origin>, depth = 0
): Origin {
  if (depth > 12) return "unknown";
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
      || ts.isNonNullExpression(node) || ts.isAwaitExpression(node)) {
    return infer(node.expression, imports, vars, depth + 1);
  }
  if (ts.isIdentifier(node)) {
    if (vars.has(node.text)) return vars.get(node.text)!;
    const original = imports.names.get(node.text);
    if (original === "Keypair") return "keypair";
    if (original === "Transaction" || original === "FeeBumpTransaction") return "transaction";
    if (original === "TransactionBuilder") return "tx-builder";
    if (original === "xdr") return "sdk-xdr";
    if (original === "Address" || original === "Memo" || original === "Asset" || original === "Operation" || original === "StrKey") return "sdk-type";
    return "unknown";
  }
  if (ts.isNewExpression(node)) {
    const symbol = scopedSymbol(node.expression, imports, vars);
    if (symbol === "Keypair") return "keypair";
    if (symbol === "TransactionBuilder") return "tx-builder";
    if (symbol === "Transaction" || symbol === "FeeBumpTransaction") return "transaction";
    if (symbol?.startsWith("xdr.")) return "sdk-xdr";
    if (symbol && /^(?:Address|Memo|Asset|Operation)$/.test(symbol)) return "sdk-type";
    if (symbol === "rpc.Server") return "sdk-type";
    return "unknown";
  }
  if (ts.isCallExpression(node)) {
    const symbol = scopedSymbol(node.expression, imports, vars);
    const method = propName(node.expression);
    const object = receiver(node.expression);
    if (symbol === "hash" || symbol === "sign" || symbol === "getLiquidityPoolId") return "sdk-bytes";
    if (symbol?.startsWith("StrKey.decode") && STRKEY_DECODE.test(symbol.split(".").at(-1)!)) return "sdk-bytes";
    if (symbol === "Keypair.random" || symbol === "Keypair.fromSecret" || symbol === "Keypair.fromPublicKey" || symbol === "Keypair.fromRawEd25519Seed") return "keypair";
    if (symbol === "TransactionBuilder.fromXDR" || symbol === "TransactionBuilder.fromXdr") return "transaction";
    if (symbol?.startsWith("xdr.") && (/\.fromX[Dd][Rr]$/.test(symbol) || /\.[a-z]/.test(symbol))) return "sdk-xdr";
    if (object && method) {
      const origin = infer(object, imports, vars, depth + 1);
      if (origin === "tx-builder" && method === "build") return "transaction";
      if (origin === "keypair" && BYTE_METHODS.has(method)) return "sdk-bytes";
      if (origin === "transaction" && (method === "hash" || method === "signatureBase")) return "sdk-bytes";
      if (origin === "sdk-type" && method === "toBuffer") return "sdk-bytes";
      if (origin === "sdk-xdr" && method.startsWith("fromX")) return "sdk-xdr";
      if (ts.isIdentifier(object) && object.text === "Buffer" && (method === "from" || method === "alloc")) return "native-buffer";
    }
    return "unknown";
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const symbol = scopedSymbol(node, imports, vars);
    if (symbol === "Keypair") return "keypair";
    if (symbol === "TransactionBuilder") return "tx-builder";
    if (symbol === "Transaction") return "transaction";
    if (symbol === "StrKey" || symbol === "Address" || symbol === "Memo" || symbol === "Operation") return "sdk-type";
    if (symbol === "xdr" || symbol?.startsWith("xdr.")) return "sdk-xdr";
  }
  return "unknown";
}

/**
 * Standalone adapter for the registry in #8. Only SDK-linked syntax is inspected;
 * unknown aliases/data flow are not guessed. No file-system/network interaction.
 */
export function scanSdkV17Source(input: SourceRuleInput): SourceRuleFinding[] {
  const file = parseSource(input);
  const imports = sdkImports(file);
  if (!imports.names.size && !imports.namespaces.size) return [];
  const findings: SourceRuleFinding[] = [];
  // Interpret lexical bindings in source order. Function parameters and local
  // declarations shadow SDK imports/outer aliases instead of creating false matches.
  function visit(node: ts.Node, incoming: Map<string, Origin>): void {
    let vars = incoming;
    if (ts.isBlock(node) || ts.isClassDeclaration(node) || ts.isFunctionLike(node)) {
      vars = new Map(incoming);
      if (ts.isFunctionLike(node)) {
        for (const param of node.parameters) {
          if (ts.isIdentifier(param.name)) vars.set(param.name.text, "unknown");
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      // Track only syntactically understood origins, keeping all other bindings
      // as explicit unknowns so they cannot inherit unrelated imported names.
      const importedNamespaceRequire = imports.namespaces.has(node.name.text)
        && node.initializer && ts.isCallExpression(node.initializer)
        && ts.isIdentifier(node.initializer.expression)
        && node.initializer.expression.text === "require";
      if (!importedNamespaceRequire) {
        const origin = node.initializer ? infer(node.initializer, imports, vars) : "unknown";
        vars.set(node.name.text, origin);
      }
    }
    if (ts.isCallExpression(node)) {
      const name = propName(node.expression);
      const object = receiver(node.expression);
      if (name && object) {
        const origin = infer(object, imports, vars);
        if (Object.hasOwn(RENAMED, name) && (origin === "sdk-xdr" || origin === "transaction"
            || origin === "tx-builder" || origin === "sdk-type" || origin === "keypair")) {
          findings.push(makeFinding(input, file, node.expression, {
            ruleId: "stellar-sdk-v17/xdr-method-rename",
            message: `Stellar SDK '${name}' call should be reviewed for the v17 '${RENAMED[name]}' naming/API transition.`,
            suggestion: `Check this SDK object and migrate to '${RENAMED[name]}' as appropriate; v17 provides deprecated aliases for several methods, but the XDR byte semantics can differ.`,
            evidenceUrl: XDR_GUIDE, affectedVersions: "Stellar JS SDK v17 migration (from v16 and earlier)"
          }));
        } else if (origin === "sdk-bytes" && BUFFER_METHODS.has(name)) {
          const first = node.arguments[0];
          if (name !== "toString" || (first && ts.isStringLiteralLike(first)
              && /^(?:hex|base64|base64url|utf8|utf-8|ascii|latin1|binary)$/.test(first.text))) {
            findings.push(makeFinding(input, file, node.expression, {
              ruleId: "stellar-sdk-v17/byte-buffer-method",
              message: `Buffer-specific '${name}' used on a known Stellar SDK byte-returning API result.`,
              suggestion: name === "toString"
                ? "Use xdr.encodeBytes(bytes, 'hex'/'base64') or an explicit Uint8Array text decoder; do not assume Uint8Array.toString accepts a Buffer encoding."
                : "Use a Uint8Array-compatible comparison or DataView operation; check the official v17 byte migration recipes.",
              evidenceUrl: BYTES_GUIDE, affectedVersions: "Stellar JS SDK >=17.0.0"
            }));
          }
        }
      }
    }
    ts.forEachChild(node, child => visit(child, vars));
  }
  visit(file, new Map());
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));
}
