# Horizon-to-RPC migration review rule (issue #12)

The module `src/rules/horizon.ts` exports `analyzeHorizonSource(source, file)`. It parses JS/TS source **offline** with TypeScript's AST, never evaluating the scanned code, loading its dependencies, or requesting URLs.

## Coverage

- SDK origin must be a named/namespace/default import from `@stellar/stellar-sdk` or `stellar-sdk`, or an equivalent static CommonJS `require`. Unrelated `Server` classes are ignored.
- Calls on statically identified `new Horizon.Server(...)` variables: account lookups, transaction lookups and transaction submissions. `Horizon.Server` alone is advisory when no known historical-only operation is found.
- Literal `fetch(...)` and `axios.get/post(...)` URLs to SDF-hosted `horizon.stellar.org`, `horizon-testnet.stellar.org`, or `horizon-futurenet.stellar.org`, for `/accounts` and `/transactions` paths.
- Calls such as `trades()`, `effects()`, `offers()`, `operations()` and other indexed/historical collections are deliberately *not* labeled as direct RPC equivalents.

Findings use stable `stellar/horizon-rpc-*` rule IDs, source-relative file and 1-based line, `review-required` confidence, a specific suggestion, and evidence containing the official mapping URL. A review finding **does not mean that Horizon usage is broken**.

## API mapping caveats

- Horizon `GET /accounts/{address}` may be reviewed against RPC `getLedgerEntries`. Horizon joins account and trustline data; RPC does not. Responses and absent-entry semantics differ.
- Horizon `GET /transactions/{hash}` may be reviewed against RPC `getTransaction`, for transactions within the RPC provider's retention window. Recent transaction lists use `getTransactions`; old or curated data needs other indexing arrangements.
- Horizon `POST /transactions` can be reviewed against RPC `sendTransaction`, but must account for the request/response and subsequent status polling.
- The official mapping **does not** give a one-to-one RPC equivalent to most Horizon historical/curated collections. Horizon, independent indexers or other data services may be intentional and appropriate.

## Limitations and integration

This is a source rule module, **not an end-to-end CLI scanner**. Source discovery (#6), registry (#8), and CLI integration (#13) are not part of issue #12 and are not claimed implemented. The existing CLI therefore correctly continues to return its unavailable status.

The rule does not trace imports across files, variable aliases, dynamic computed properties or runtime-built URLs; it does not determine deployed network protocol state, provider settings, authentication, versions, or whether any migration is required. Direct REST URL detection deliberately uses a narrow known-host allowlist to avoid false positives. The parser uses syntax-only semantics; all findings require a human review.

## Testing

With Node.js 22+:

```sh
npm ci
npm run build
node --test tests/horizon.test.mjs
npm test
npm run check:repo
```

The tests cover SDK imports, CommonJS and namespaces, transaction submission, direct REST endpoints, unrelated libraries and hosts, RPC-only code, source comments, stable locations and evidence, and deliberate exemption of historical queries.

References:
- https://developers.stellar.org/docs/data/apis/migrate-from-horizon-to-rpc
- https://developers.stellar.org/docs/data/apis
