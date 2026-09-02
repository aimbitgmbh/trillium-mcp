# TriliumNext MCP Server

[![npm version](https://img.shields.io/npm/v/@aimbitgmbh/trillium-mcp)](https://www.npmjs.com/package/@aimbitgmbh/trillium-mcp)
[![CI](https://github.com/aimbitgmbh/trillium-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/aimbitgmbh/trillium-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A compact, model-neutral [Model Context Protocol](https://modelcontextprotocol.io/) server for [TriliumNext Notes](https://github.com/TriliumNext/Trilium). It exposes notes, revisions, attachments, branches, attributes, calendar notes, and inbox access through Trilium's ETAPI.

Version 0.2.0 is validated against TriliumNext 0.105.0 and with a Qwen 3.8 27B model. It does not depend on any particular model vendor.

## Requirements

- Node.js 22.19 or newer
- A reachable TriliumNext instance
- An ETAPI token from Trilium's settings

## Run with npx

```json
{
  "mcpServers": {
    "trilium": {
      "command": "npx",
      "args": ["-y", "@aimbitgmbh/trillium-mcp@latest"],
      "env": {
        "TRILLIUM_API_URL": "https://notes.example.com/etapi",
        "TRILLIUM_API_TOKEN": "your-etapi-token",
        "TRILLIUM_PERMISSIONS": "READ"
      }
    }
  }
}
```

The server only connects to Trilium. A model base URL, model name, and model API key belong in your MCP host or model gateway configuration, not in this server.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRILLIUM_API_URL` | required | Full ETAPI base URL ending in `/etapi` |
| `TRILLIUM_API_TOKEN` | required | ETAPI token; keep it secret |
| `TRILLIUM_PERMISSIONS` | `READ` | Exactly `READ` or `READ;WRITE` |
| `TRILLIUM_VERIFY_SSL` | `true` | Set to `false` only for a trusted self-signed endpoint |
| `TRILLIUM_REQUEST_TIMEOUT_MS` | `30000` | Request timeout, 100–300000 ms |
| `TRILLIUM_MAX_ATTACHMENT_BYTES` | `26214400` | Maximum upload size, 25 MiB by default |
| `TRILLIUM_EXPORTS_DIR` | `~/Downloads/trillium-exports` | Destination for downloaded attachment/revision bytes |

See [.env.example](.env.example). `READ` is the safe default. Calendar and inbox GET endpoints can create notes and are therefore only exposed with `READ;WRITE`.

## Tools

The complete `READ;WRITE` surface contains 38 tools:

- Notes and content: `notes_search`, `note_get`, `note_create`, `note_overwrite`, `note_delete`, `note_undelete`, `note_create_revision`, `note_reorder`, `note_list_children`, `note_reorder_children`, `note_edit`, `note_prepend`, `note_append`, `note_grep`, `note_get_lines`
- History and revisions: `notes_history`, `note_list_revisions`, `revision_get`
- Attachments: `note_list_attachments`, `attachments_get`, `attachments_get_content`, `attachments_create`, `attachments_update`, `attachments_update_content`, `attachments_delete`
- Tree branches: `branches_get`, `branches_create`, `branches_update`, `branches_delete`
- Attributes: `attributes_get`, `attributes_create`, `attributes_update`, `attributes_delete`
- Calendar and inbox: `calendar_get_day`, `calendar_get_week`, `calendar_get_month`, `calendar_get_year`, `inbox_get`

With `READ`, 13 non-mutating Trilium tools are exposed. Attachment downloads write only to the configured local export directory. Week notes require Trilium's `enableWeekNote` calendar-root label.

Deletion follows Trilium semantics: `note_delete` soft-deletes the note and its descendants. Deleting a note's last strong branch can do the same. `note_undelete` restores a deleted note.

## Development

```bash
npm install
npm test
npm run build
npm audit --omit=dev
```

Live and model tests are opt-in and never run in CI:

```bash
TRILLIUM_API_URL=... TRILLIUM_API_TOKEN=... TRILLIUM_PERMISSIONS=READ\;WRITE npm run test:live
OPENAI_BASE_URL=... OPENAI_API_KEY=... OPENAI_MODEL=... npm run test:model
```

The model test uses the common OpenAI-compatible chat-completions interface only as an evaluation harness. No credentials are stored.

## Reliability and security

- Request bodies use explicit JSON, text, or binary content types.
- Attachment bytes are preserved exactly and download paths are sanitized.
- Requests time out; only transport-failed GET requests are retried once. Writes are never retried automatically.
- API error bodies are capped before being returned.
- TLS certificate validation is enabled by default.

## License

MIT © [aimbit GmbH](https://aimbit.de). The vendored Trilium ETAPI OpenAPI document retains its upstream license metadata.
