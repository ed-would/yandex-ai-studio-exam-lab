# Local security patch for braces

This is a private, project-local fork of `braces@3.0.3`, not a published or official upstream release. Its MIT license and original source attribution are preserved in LICENSE. The root dev dependency uses a committed local tarball; npm `overrides` references `$braces` to install it wherever Stylelint's dependency tree requests `braces`.

GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 describes stack exhaustion through deeply nested patterns. At the time of this change, upstream npm has no fixed release.

## Provenance

- Base: npm `braces@3.0.3`, from the project's original integrity-pinned lockfile.
- Security patch: [upstream PR #72](https://github.com/micromatch/braces/pull/72), pinned commit [`28d440b5dd449dbf1fe6f3506cf94ecca4d02660`](https://github.com/micromatch/braces/commit/28d440b5dd449dbf1fe6f3506cf94ecca4d02660).
- `compile.js`, `expand.js`, `stringify.js`, and `constants.js` use that commit's security changes. Local review removed its debug console output and restored the parent-node argument in `stringify` so `escapeInvalid` remains compatible. `parse.js` applies only its nesting-limit changes to the npm 3.0.3 base; unrelated quote parsing changes are deliberately excluded. `index.js` and `utils.js` remain unchanged.
- Metadata preserves the compatible package identity `braces`, with the private local version `3.0.3-patch.2`, rather than pretending an official 3.0.4 release exists.

## Behavior

The callable function and `parse`, `compile`, `expand`, `stringify`, and `create` APIs remain available. Normal glob alternatives, ranges, quoting and escaping preserve their behavior. Parsing counts combined brace and parenthesis nesting, rejecting levels above 100 with a deliberate SyntaxError before recursive traversal. Direct AST walkers apply the same bound; `expand` also detects cyclic parent chains. A caller can set a stricter `maxDepth`, but cannot raise the ceiling above 100 or disable it with Infinity/NaN.

Regression coverage is in `tests/dependencies.test.mjs`; `npm run check` also executes the actual Stylelint glob over project CSS. A clean `npm ci` verifies that the override is reproducible. A zero npm audit result alone is not proof of a local patch's safety: these regression tests and source review are the justification.

To update this patch, edit the readable source, run `npm pack ./vendor/braces --pack-destination ./vendor/braces`, regenerate the root lockfile, and perform a clean install. The test compares the installed code and metadata with the readable source, so a stale tarball cannot silently ship different code. The tarball avoids relative directory-override resolution errors in npm and does not require symlink support.

Remove the local override and fork only after a compatible, fixed upstream release is published, then rerun the security regressions, clean install, full audit and project checks. This package is build tooling only and is not included in browser assets.
