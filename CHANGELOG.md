# Changelog

## 0.1.2

- Hardened progress-only mode so the visual rail has a stable track height.
- Added package consumer, TypeScript surface, CSS token, demo version, SSR, and browser layout checks.
- Added a CI workflow that runs the release check on pushes and pull requests.
- Clarified SSR/hydration usage, option docs, and runtime/read-only CSS tokens.

## 0.1.1

- Added the GitHub Pages demo entry and public demo homepage metadata.
- Fixed the public demo to load the published package module on GitHub Pages.
- Exposed `data-toc-rail-progress` and `--toc-rail-progress` on the root rail for easier debugging.
- Avoided the demo favicon 404 and stabilized the browser smoke fixture layout.

## 0.1.0

- Initial release.
- Sticky reading rail with table-of-contents links, scroll progress, active heading state, and responsive hiding.
- Vanilla ESM package with zero runtime dependencies.

Until 1.0, breaking changes may ship in minor versions.
