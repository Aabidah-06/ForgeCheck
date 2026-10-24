# Standalone ignore matcher (#21)

```js
import { compileIgnorePatterns } from "./index.mjs";
const matcher = compileIgnorePatterns(["node_modules/", "*.log", "!keep.log", "/dist/"]);
matcher.shouldIgnore("src/debug.log"); // true
```

Supported: comments, leading escaped `#` / `!`, `*`, `?`, `**`, negation, anchored leading slash, directory trailing slash, slash-separated and basename patterns. Patterns are checked in input order. Paths may use POSIX or Windows separators; absolute and traversing candidates are rejected.

Limitations: this is a documented subset, **not a complete gitignore parser**. Bracket ranges, brace patterns, escaped characters beyond the first leading `#`/`!`, and other extended constructs are rejected. A caller traversing directories must ensure it considers excluded ancestors; this matcher does not read the filesystem.
