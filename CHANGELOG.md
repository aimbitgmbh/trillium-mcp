# Changelog

All notable changes are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-09-02

### Added

- Full 38-tool surface, including attachments, calendar, inbox, recent history, revisions, attachment listing, and note restore support from TriliumNext 0.105.
- Model-neutral compact schemas validated with Qwen 3.8 27B.
- MCP tool annotations, automated tests, CI, Dependabot, live ETAPI testing, and model tool-selection evaluation.
- Configurable request timeout, attachment-size limit, export directory, and TLS verification.

### Changed

- Requires Node.js 22.19 or newer and uses native ESM.
- Upgraded MCP SDK and runtime dependencies; production dependency audit is clean.
- Correct Trilium soft-delete and last-branch semantics in tool descriptions.
- Reduced model context overhead and removed unnecessary note-tree follow-up requests.

### Fixed

- Preserve binary attachment content and send correct content types.
- Retry one failed transport request only for GET; never retry mutations.
- Honor TLS verification configuration and cap ETAPI error bodies.
- Support ISO week routes (`YYYY-Www`), negative note line ranges, HTML-aware grep, replace-all HTML edits, and safe export filenames.

## [0.1.0] - 2026-01-20

- Initial npm release.

[0.2.0]: https://github.com/aimbitgmbh/trillium-mcp/releases/tag/v0.2.0
[0.1.0]: https://www.npmjs.com/package/@aimbitgmbh/trillium-mcp/v/0.1.0
