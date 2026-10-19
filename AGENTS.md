# Agent map

Preact + TypeScript/TSX + Vite; Russian AI exam trainer. Load only task-relevant references.

- Overview and workflow: [README](README.md), [contributing](CONTRIBUTING.md).
- Commands and dependencies: [package.json](package.json), [Vite config](vite.config.ts), [braces patch](vendor/braces/README.md).
- Question bank: [contract](docs/CONTENT_CONTRACT.md), [sources](docs/SOURCE_REVIEW.md), [data](src/data/), `docs/research-domain-{1..6}.md`.
- Attempts and scoring: [exam](src/core/exam.ts), [app](src/app.tsx).
- Progress and import: [storage](src/core/storage.ts), [core tests](tests/core.test.ts).
- UI and themes: [design system](DESIGN.md), [components](src/components/), [styles](src/styles.css), [theme](src/theme.css), [HIG plan](docs/plans/audit-apple-hig.md).
- Result previews: [dev fixtures](src/dev/); `npm run dev:results`.
- Design assets: [public assets](public/).
- Verification: [tests](tests/).
- Plans and publication: [plans](docs/plans/), [publication guide](docs/GITHUB_PUBLICATION.md).

Code changes: `npm run check`. Browser verification: global `/pw` (Playwright MCP).

## Browser verification scope

- For interface checks, select specific questions that represent the required types and states. Do not traverse the question bank, all 180 questions, half the bank, or another bulk subset, including during a site-wide UI audit.
- Use the existing result fixtures and `npm run dev:results` to inspect statistics, scores, and result states. Do not complete or skip questions to manufacture these states.
- Keep browser checks tied to the requested changes and relevant responsive/theme variants. A broader page audit does not authorize a question-by-question run.

## Shared palette contract

Read [DESIGN.md](DESIGN.md) before changing UI colors. `public/theme-controls.css` is the single runtime source for level primitives and general `--ui-*` tokens. General links, active navigation, progress and primary actions use solid expert purple (`--level-3-accent`, #6841AB) in light theme, and the composite three-level gradient with neutral text/focus fallbacks in dark theme; do not add private color copies or a fourth accent. The standalone HTML export in `src/core/report.ts` must mirror these values.

- `#004C59` is reserved exclusively for the Yandex AI Studio logo badge, identical in both themes.
- Individual lime, teal and lilac level palettes retain the corresponding test identity. Light general controls intentionally share expert purple; dark general controls use the approved composite gradient of all three levels. These are explicit UI role exceptions.
- Lilac is also intentional for Materials, the six knowledge domains and the home learning-steps panel. Preserve their scoped `--lilac-*` tokens in both themes.
- Semantic success, error and information colors keep their roles. The footer is a separate entity: its surfaces and CTA retain their original gray-green light/dark palettes, scoped by `--footer-*` tokens in `src/styles.css` and `src/theme.css`.
- Recolor existing elements through tokens; do not add fills, change geometry or spread other level colors into general controls beyond the explicit light expert-purple exception. Preserve concurrent edits from other chats.
