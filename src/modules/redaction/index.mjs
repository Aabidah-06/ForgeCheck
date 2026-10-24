/** Defense-in-depth redaction for the public ScanResult contract. */
const MASK = "[REDACTED]";
const secretKey = /(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key)/i;
export function redactDiagnostic(text) {
  if (typeof text !== "string") throw new TypeError("Diagnostic must be a string");
  return text
    .replace(/-----BEGIN (?:[A-Z0-9 ]* )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]* )?PRIVATE KEY-----/g, MASK)
    .replace(/(Authorization\s*:\s*Bearer\s+)[^\s,;]+/gi, "$1" + MASK)
    .replace(/(\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi, "$1" + MASK)
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+)@/gi, (match, scheme, credentials) =>
      credentials.includes(":") ? scheme + MASK + "@" : match)
    .replace(/([?&])([^=&\s?#]+)=([^&#\s]*)/g, (match, sep, key) =>
      secretKey.test(key) ? sep + key + "=" + MASK : match);
}
export function redactReport(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new TypeError("Invalid scan report");
  if (result.status === "unavailable" && typeof result.reason === "string")
    return { status: "unavailable", reason: redactDiagnostic(result.reason) };
  if (result.status !== "complete" || !Array.isArray(result.findings)) throw new TypeError("Invalid scan report");
  return { status: "complete", findings: result.findings.map(finding => {
    if (!finding || typeof finding.ruleId !== "string" || typeof finding.message !== "string" ||
        !["confirmed-failure", "review-required", "not-evaluated"].includes(finding.confidence))
      throw new TypeError("Invalid scan finding");
    return { ...finding, message: redactDiagnostic(finding.message),
      ...(typeof finding.file === "string" ? { file: redactDiagnostic(finding.file) } : {}) };
  }) };
}
