# Read-only source rules: issues #10 and #11

These are independent, tested rule modules intended to plug into the source-file discovery (#6), SDK version resolver (#7) and rule registry (#8) when they exist. **They do not make the default CLI scanner functional.** Wiring them into `scan` and reporting is reserved for integration work (#13). No file is imported or executed and no network lookup is performed during detection.

## Public API

- `scanSdkV17Source({ file, source, resolvedSdkVersion? })` from `src/rules/sdk-v17.ts`
- `scanWAddressSource({ file, source, resolvedSdkVersion? })` from `src/rules/w-address.ts`

`file` is the project-relative JS/JSX/TS/TSX path (provided by future discovery); `source` is file contents read by the caller. `resolvedSdkVersion` should be an **exact installed version** verified by a dependency analyzer, not an npm range. Without it, findings explicitly explain that the installed SDK version is unknown. Both functions return deterministic `SourceRuleFinding[]` with rule ID, project-relative file, **1-based line/column**, `review-required` confidence, explanation, suggestion, affected-version context, and authoritative evidence URL. Each finding is informational and requires human verification; no code is rewritten.

## Rule IDs and rationale

| Rule ID | Static condition | Safe cases |
| --- | --- | --- |
| `stellar-sdk-v17/xdr-method-rename` | Known Stellar SDK imported object or tracked SDK-derived XDR value uses legacy `toXDR`, `fromXDR`, `fromXDRObject`, etc. | Unrelated objects, strings, comments, already migrated `toXdr` methods |
| `stellar-sdk-v17/byte-buffer-method` | Tracked byte output from Stellar `Keypair`, `StrKey`, transactions, SDK byte helpers uses Buffer-specific `.toString('hex'/'base64'/...)`, `.equals()`, `.compare()`, etc. | Ordinary Node Buffers, unknown data-flow, explicit `xdr.encodeBytes` |
| `protocol-30/w-address-strkey-validator` | Declared generic Stellar address or transfer-destination validator uses a legacy `StrKey.isValid...` check but no W handling | Create-account destinations, G-only/base-account operations, validators with W-aware handling |
| `protocol-30/w-address-prefix-regex` | Generic named Stellar address validation/storage/display path contains anchored G/M/C prefix regex without W | W-aware regexes, generic unrelated regexes, intentionally narrow account-only paths |
| `protocol-30/w-address-prefix-switch` | Generic named address handler switches on an address prefix G/M/C without W | Explicit W branch, account-only workflows, unrelated switches |

### Stellar JS SDK v17 nuance

SDK v17's class-based XDR API and Uint8Array return values require compatibility review when upgrading from earlier versions. For example, `Uint8Array.toString('hex')` does **not** encode hexadecimal. The detailed XDR guide currently describes some legacy method spellings as **deprecated aliases** with changed XDR return semantics; the rule therefore **does not falsely claim every `toXDR` invocation necessarily throws**. The analyzer recognizes syntactic SDK origins from static ESM imports and CommonJS `require`, locally bound instances and direct calls, but does not pretend to prove arbitrary data-flow or third-party wrapper return types.

References:
- [Stellar JS SDK v17 migration overview](https://stellar.github.io/js-stellar-sdk/migration/00-migration/)
- [XDR migration guide](https://stellar.github.io/js-stellar-sdk/migration/xdr-migration/)
- [Uint8Array migration guide](https://stellar.github.io/js-stellar-sdk/migration/uint8array-migration/)

### Protocol 30 / CAP-84 nuance

Protocol 30 introduces muxed contract **W** addresses. Address support is **operation-specific**: a valid create-account destination can intentionally be G-only, and a plain `Address` contract argument or a contract storage key does not automatically permit muxed addresses. The rules target **declared generic** address/destination validators, parsers, display paths, storage paths and prefix dispatches. These are **review candidates**, not confirmed failures. Prefix matching alone cannot establish whether the application or its SDK supports W or whether a network has activated Protocol 30.

The official upgrade guide (last updated October 20, 2026) describes upcoming **testnet and mainnet upgrade votes** on **November 3 and November 23, 2026**, respectively; votes are not a guarantee of network activation. Never infer the live protocol number from a code sample.

Reference: [Stellar Bell / Protocol 30 upgrade guide](https://stellar.org/blog/developers/bell-protocol-30-upgrade-guide).

## Detection limits and safety

This is a **syntax-only, scoped AST** implementation using the pinned TypeScript parser. It does not run the target, load target packages, compile target TypeScript, resolve aliases across imported files, infer dynamic assignments, follow complex interprocedural flows, or try to classify arbitrary regexes as Stellar logic. It may miss renamed APIs hidden behind unproven aliases, regexes assembled at runtime, or validators whose naming does not reveal general Stellar-address intent. It deliberately prefers missed cases to misleading matches. Only recognizable imported Stellar call origins and clearly declared generic address workflows are flagged. Upstream SDK/runtime compatibility must be verified separately with version context and tests.

Run the independent regression tests with `npm test` (builds TypeScript and runs Node tests) or specifically `npm run build && node --test tests/source-rules.test.mjs`. Fixtures cover positive and negative JS/TS patterns, file/line evidence, scope shadowing, ignored account-only paths, and offline/non-execution. The default CLI continues to return unavailable until #6–#8 and #13 integrate these modules.
