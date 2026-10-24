# Stellar SDK dependency context and lifecycle (issues #7 and #9)

The standalone `resolveStellarDependencies(discoveryResult)` API consumes safe file discovery and reads only discovered package metadata. It does not execute scanned project code, install packages or make network requests.

npm package-lock.json and npm-shrinkwrap.json versions 2 and 3 are supported. Yarn, pnpm and Bun resolution is not implemented. Missing, stale and ambiguous installations are not represented as exact resolved versions. Declared ranges such as `^16.x` and `>=16` are not pinned installed versions. Nested manifests and npm aliases are examined; npm hoisting remains a best-effort inference, not proof of runtime bundling.

The separate `sdkLifecycleRule(dependencies)` can be registered with the existing `RuleRegistry`. It reports unsupported and legacy JavaScript SDK lines as review-required with links to official policy. This does not claim protocol compatibility or a demonstrated application failure. Keep the manifest paths in registry context for locations.

**Policy reference date:** 2026-10-24. Official [SDK docs](https://github.com/stellar/js-stellar-sdk) state that v16 and v17 are supported, with v16 supported through March 2027. See the [release policy](https://github.com/stellar/js-stellar-sdk/blob/master/RELEASE_POLICY.md). Re-check this dated rule before future use. Offline runtime never fetches policy.

This API does not wire the CLI, which is tracked by integration issue #13.
