/** Protocol 30 / CAP-84 W-address candidate reviews; never claims all G-only rules are bugs. */
import ts from "typescript";
import {
  makeFinding, parseSource, propName, sdkImports, sdkSymbol, walk,
  type SdkImports, type SourceRuleFinding, type SourceRuleInput
} from "./source.js";

const GUIDE = "https://stellar.org/blog/developers/bell-protocol-30-upgrade-guide";

// These are intentional account-only workflows, not universal address validators.
const ACCOUNT_ONLY = /(?:create.?account|account.?creation|base.?account|classic.?account|g.?only|ed25519|issuer.?account|account.?id|account.?public.?key|account.?only)/i;
const GENERIC_ADDRESS = /(?:address|recipient|destination)/i;
const WORKFLOW = /(?:validate|valid|check|accept|support|parse|format|display|store|route|resolve|normaliz|handle|render|read|isStellar|isPayment|isTransfer|regex|pattern)/i;
const STELLAR_CONTEXT = /(?:stellar|strkey|payment|transfer|contract|recipient|destination)/i;

function isGeneric(name: string, imports: SdkImports): boolean {
  return GENERIC_ADDRESS.test(name) && WORKFLOW.test(name) && !ACCOUNT_ONLY.test(name)
    && (STELLAR_CONTEXT.test(name) || imports.names.size > 0 || imports.namespaces.size > 0);
}

function isAccountOnly(name: string, text: string): boolean {
  return ACCOUNT_ONLY.test(name) || /\bOperation\s*\.\s*createAccount\s*\(/.test(text);
}

function hasWHandling(node: ts.Node): boolean {
  let aware = false;
  walk(node, item => {
    if (ts.isCallExpression(item) && propName(item.expression)
        && /^(?:isValid(?:Muxed)?Contract(?:Address)?|isValidMuxedContractAddress)$/.test(propName(item.expression)!)) {
      if (/muxed/i.test(propName(item.expression)!)) aware = true;
    }
    if (ts.isRegularExpressionLiteral(item) && /W/.test(item.text)) aware = true;
    if (ts.isStringLiteral(item) && item.text === "W") aware = true;
    if (ts.isCaseClause(item) && ts.isStringLiteral(item.expression) && item.expression.text === "W") aware = true;
    if (ts.isIdentifier(item) && /(?:MuxedContract|WAddress)/.test(item.text)) aware = true;
  });
  return aware;
}

function isStellarStrKeyValidation(node: ts.CallExpression, imports: SdkImports): boolean {
  const symbol = sdkSymbol(node.expression, imports);
  return symbol !== undefined && /^StrKey\.isValid(?:Ed25519PublicKey|Med25519PublicKey|Contract)$/.test(symbol);
}

function isKnownWChecker(node: ts.CallExpression, imports: SdkImports): boolean {
  const symbol = sdkSymbol(node.expression, imports);
  return symbol !== undefined && /^(?:StrKey\.)?isValidMuxedContract(?:Address)?$/.test(symbol);
}

/** Accepts /[GMC]/, /(?:G|M|C)/, and anchored bare G/M/C alternatives only. */
function oldPrefixPattern(node: ts.RegularExpressionLiteral): boolean {
  const raw = node.text;
  const trailingSlash = raw.lastIndexOf("/");
  const pattern = raw.slice(1, trailingSlash);
  if (!pattern.startsWith("^")) return false;
  // Recognize address-prefix alternatives and character classes, not arbitrary
  // unrelated regexes mentioning G/M/C later in the expression.
  const prefix = pattern.slice(1);
  const charClass = /^\[([GMC]{2,3})\]/.exec(prefix);
  if (charClass) return new Set(charClass[1]).size >= 2;
  const alternatives = /^(?:\(\?:|\()?([GMC](?:\|[GMC]){1,2})\)?/.exec(prefix);
  if (!alternatives) return false;
  const letters = alternatives[1]!.split("|");
  return new Set(letters).size >= 2;
}

function isPrefixSwitch(node: ts.SwitchStatement, file: ts.SourceFile): boolean {
  const switchExpr = node.expression.getText(file);
  if (!/(?:\[\s*0\s*\]|\.charAt\(\s*0\s*\)|\.slice\(\s*0\s*,\s*1\s*\)|\.substring\(\s*0\s*,\s*1\s*\))/.test(switchExpr)) return false;
  const cases = new Set<string>();
  for (const clause of node.caseBlock.clauses) {
    if (ts.isCaseClause(clause) && ts.isStringLiteral(clause.expression)) cases.add(clause.expression.text);
  }
  return cases.size >= 2 && ["G", "M", "C"].filter(value => cases.has(value)).length >= 2 && !cases.has("W");
}

interface Candidate { readonly node: ts.Node; readonly kind: "strkey" | "regex" | "switch"; }

function findCandidate(node: ts.Node, file: ts.SourceFile, imports: SdkImports): Candidate | undefined {
  if (hasWHandling(node)) return undefined;
  let strkey: ts.Node | undefined;
  let regex: ts.Node | undefined;
  let switchNode: ts.Node | undefined;
  let explicitW: boolean = false;
  walk(node, item => {
    if (ts.isCallExpression(item)) {
      if (isKnownWChecker(item, imports)) explicitW = true;
      if (!strkey && isStellarStrKeyValidation(item, imports)) strkey = item.expression;
    }
    if (!regex && ts.isRegularExpressionLiteral(item) && oldPrefixPattern(item)) regex = item;
    if (!switchNode && ts.isSwitchStatement(item) && isPrefixSwitch(item, file)) switchNode = item.expression;
  });
  if (explicitW) return undefined;
  if (strkey) return {node:strkey,kind:"strkey"};
  if (regex) return {node:regex,kind:"regex"};
  if (switchNode) return {node:switchNode,kind:"switch"};
  return undefined;
}

const MESSAGES = {
  strkey: {
    ruleId: "protocol-30/w-address-strkey-validator",
    message: "Generic Stellar address validation uses legacy StrKey G/M/C checks without evidence of W-address handling.",
    suggestion: "Review whether this flow should accept muxed contract W addresses; use an SDK that supports Protocol 30, then add the appropriate W variant only for supported operations."
  },
  regex: {
    ruleId: "protocol-30/w-address-prefix-regex",
    message: "Generic Stellar address-prefix regex appears limited to legacy G/M/C addresses.",
    suggestion: "Review validation, storage and display expectations for CAP-84 W-addresses; prefer the upgraded SDK parser over hard-coded prefixes."
  },
  switch: {
    ruleId: "protocol-30/w-address-prefix-switch",
    message: "Generic Stellar address-prefix switch handles G/M/C-style branches but not W.",
    suggestion: "Review the W variant for supported transfer destinations and wallet/explorer flows; preserve deliberately account-only branches."
  }
} as const;

/** Analyze a single in-memory JS/TS file, with no network, target imports, or code execution. */
export function scanWAddressSource(input: SourceRuleInput): SourceRuleFinding[] {
  const file = parseSource(input);
  const imports = sdkImports(file);
  const findings: SourceRuleFinding[] = [];
  const recognized = new Set<number>();
  function record(declaration: ts.Node, name: string, body: ts.Node): void {
    if (!isGeneric(name, imports) || isAccountOnly(name, body.getText(file))) return;
    const candidate = findCandidate(body, file, imports);
    if (!candidate || recognized.has(candidate.node.getStart(file))) return;
    recognized.add(candidate.node.getStart(file));
    const spec = MESSAGES[candidate.kind];
    findings.push(makeFinding(input, file, candidate.node, {
      ...spec, evidenceUrl: GUIDE,
      affectedVersions: "Stellar Protocol 30 / CAP-84 compatibility (network activation dependent)"
    }));
  }
  // Visit function declarations, method bodies and function-valued variables,
  // including nested modules/classes. A candidate location is emitted at most once.
  walk(file, statement => {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      record(statement, statement.name.text, statement.body);
    }
    if (ts.isMethodDeclaration(statement) && statement.body
        && (ts.isIdentifier(statement.name) || ts.isStringLiteral(statement.name))) {
      record(statement, statement.name.text, statement.body);
    }
    if (ts.isVariableDeclaration(statement) && ts.isIdentifier(statement.name) && statement.initializer) {
      const name = statement.name.text;
      if (ts.isArrowFunction(statement.initializer) || ts.isFunctionExpression(statement.initializer)) {
        record(statement, name, statement.initializer.body);
      } else if (ts.isRegularExpressionLiteral(statement.initializer)
          && isGeneric(name, imports) && !isAccountOnly(name, "") && oldPrefixPattern(statement.initializer)) {
        const candidate = statement.initializer;
        if (!recognized.has(candidate.getStart(file))) {
          recognized.add(candidate.getStart(file));
          findings.push(makeFinding(input, file, candidate, {
            ...MESSAGES.regex, evidenceUrl: GUIDE,
            affectedVersions: "Stellar Protocol 30 / CAP-84 compatibility (network activation dependent)"
          }));
        }
      }
    }
  });
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));
}
