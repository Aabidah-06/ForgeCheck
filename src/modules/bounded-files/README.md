# Bounded text reader (issue #18)

`readProjectTextFile(root, relativePath, { maxBytes })` is an offline, read-only API returning either `{ok:true,text,bytes,relativePath}` or `{ok:false,code}`.

The function rejects absolute paths, parent traversal, NULs, symlink resolutions outside the canonical root, directories, non-UTF-8 text, embedded NUL/control bytes, and files exceeding the caller's cap. To prevent unexpectedly large allocations, `maxBytes` must be a safe integer between 0 and 16 MiB. The reader never logs or includes file contents in error responses and does not execute any project code.

Build with `npm run build` and run `node --test tests/bounded-files.test.mjs`. The module is standalone; wiring it into discovery is a separate contribution.

**Limitations:** Opening already-resolved paths has a time-of-check/time-of-use race if untrusted processes can replace parents or symbolic links simultaneously. The leaf uses `O_NOFOLLOW` where supported, but that does not atomically secure parent directories. For hostile concurrent mutation use an OS-enforced sandbox or directory-fd-based confinement. Windows junction/reparse-point behavior, inaccessible file modes, and highly unusual encodings vary by platform. No binary detection is guaranteed beyond NUL and common control bytes.
