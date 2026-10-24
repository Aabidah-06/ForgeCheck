# Project-root path policy (issue #20)

`resolveProjectPath(root, candidate)` classifies paths as `inside`, `symlink-internal`, `escaped`, `nonexistent`, or `unreadable`, returning a stable diagnostic and, only on success, a canonical real path and canonical relative path.

The helper rejects absolute paths, parent traversal and NULs; uses `realpath` and path-aware containment (rather than string-prefix checks); and resolves each lexical component to reject directory symlinks leaving the root. It does not read file contents, execute project code or modify the filesystem.

Build with `npm run build` and run `node --test tests/path-policy.test.mjs`. This API is standalone and separate from discovery and bounded-file reading.

**Limitations:** Filesystem paths and permissions can change between checks (TOCTOU), making returned real paths advisory rather than permanent capabilities. Do not use this alone as a security boundary against concurrent adversarial filesystem changes. Symlink-loop error codes and Windows junction/reparse-point details may vary by OS. The helper's root is trusted and should not itself be adversarially replaced.
