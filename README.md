# qrtap-mcp — QRTap for AI agents

An [MCP](https://modelcontextprotocol.io) stdio server that lets Claude, or any
MCP-compatible assistant, run a [QRTap](https://app.qrtap.kg) workspace: editable QR codes
and short links, public pages, guest reviews, booking requests and conditional redirects.

**Русская версия: [README.ru.md](./README.ru.md).**

## Why it exists

A QRTap code encodes a permanent short link, and the destination behind that link stays
editable forever. Print a code on a menu, a price list, a shop window or a business card
once — then change where it leads as often as you need. Nothing is reprinted.

That makes the product a good fit for an agent: "put a QR on the summer menu", "point the
sticker at the new price list", "issue 120 codes for the branches, one per branch", "are
there new bookings?" are all one or two tool calls.

## Install

```bash
npx -y qrtap-mcp        # run the stdio server
npm i -g qrtap-mcp      # or install the qrtap-mcp binary
```

Node 20 or newer, and nothing else: the package is compiled JavaScript with **zero runtime
dependencies**, so `npx` fetches about 22 kB and the server is up — no toolchain download on
first run. It speaks MCP on stdin/stdout and logs to stderr only.

## Configuration

| Variable | Meaning |
|---|---|
| `QRTAP_API_KEY` | **Required.** Workspace API key. |
| `QRTAP_API_URL` | API base. Default `https://app.qrtap.kg`. |

**Where to get a key.** The workspace owner issues it in the QRTap cabinet at
[app.qrtap.kg/workspace/api](https://app.qrtap.kg/workspace/api). The key is shown once,
carries the rights of the whole workspace, and can be revoked there at any time. A key can be
issued on **any plan, including the free one** — you can try the integration before paying.
What the plan changes is the budget and the batch endpoints, not the door; see
[Limits and plans](#limits-and-plans) below and
[app.qrtap.kg/pricing](https://app.qrtap.kg/pricing).

Treat the key like a password: keep it in the MCP client's `env` block, not in a prompt, a
repository or a shared document.

### Claude Desktop

Settings → Developer → Edit Config, then add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "qrtap": {
      "command": "npx",
      "args": ["-y", "qrtap-mcp"],
      "env": { "QRTAP_API_KEY": "qrtap_key_XXXX" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add qrtap --env QRTAP_API_KEY=qrtap_key_XXXX -- npx -y qrtap-mcp
```

### Cursor, Windsurf, VS Code and other MCP clients

The same entry works anywhere that accepts the standard `mcpServers` shape —
`.cursor/mcp.json`, `.mcp.json` at a project root, or the client's own settings file:

```json
{
  "mcpServers": {
    "qrtap": {
      "command": "npx",
      "args": ["-y", "qrtap-mcp"],
      "env": { "QRTAP_API_KEY": "qrtap_key_XXXX" }
    }
  }
}
```

## Tools

Twenty tools over the public REST API v1. Read operations are safe to call freely; the four
marked **public effect** change what real customers see, and their descriptions tell the
agent to confirm with the user first.

### Codes and short links

| Tool | Maps to |
|---|---|
| `qrtap_create_code(url, title?, external_ref?, group?, design_template_id?)` | `POST /api/v1/codes` |
| `qrtap_create_codes_bulk(items[])` | `POST /api/v1/codes/bulk` — up to 500, per-item results |
| `qrtap_list_codes(group?, external_ref?, include_stats?, limit?, offset?)` | `GET /api/v1/codes` |
| `qrtap_get_code(codeId)` | `GET /api/v1/codes/{id}` |
| `qrtap_change_destination(codeId, url)` — **public effect** | `PATCH /api/v1/codes/{id}` |
| `qrtap_code_history(codeId)` | `GET /api/v1/codes/{id}/history` |
| `qrtap_create_short_link(url)` | `POST /api/v1/codes` |
| `qrtap_list_design_templates()` | `GET /api/v1/design-templates` |

### Analytics

| Tool | Maps to |
|---|---|
| `qrtap_code_stats(codeId, from?, to?)` | `GET /api/v1/codes/{id}/stats` |
| `qrtap_group_stats(group, from?, to?)` | `GET /api/v1/groups/{group}/stats` |

Scan analytics are anonymous and aggregate by design: totals, a per-day series and a device
split. Bots are excluded, and no visitor IPs or user-agents are stored, so there are no
per-person records for an agent to ask for.

### Public pages (`/a/{slug}`)

| Tool | Maps to |
|---|---|
| `qrtap_list_pages()` | `GET /api/v1/pages` |
| `qrtap_get_page(slug)` | `GET /api/v1/pages/{slug}` |
| `qrtap_create_page(content)` | `POST /api/v1/pages` |
| `qrtap_update_page(slug, content)` | `PATCH /api/v1/pages/{slug}` |

### Reviews and bookings

| Tool | Maps to |
|---|---|
| `qrtap_list_reviews(status?)` | `GET /api/v1/reviews` (default `pending`) |
| `qrtap_moderate_review(reviewId, action)` — **public effect** | `POST /api/v1/reviews/{id}/moderate` |
| `qrtap_list_bookings(status?)` | `GET /api/v1/bookings` |
| `qrtap_set_booking_status(bookingId, status)` — **public effect** | `POST /api/v1/bookings/{id}/status` |

### Smart Links (conditional redirects)

| Tool | Maps to |
|---|---|
| `qrtap_get_smart_rules(codeId)` | `GET /api/v1/codes/{id}/smart-rules` |
| `qrtap_set_smart_rules(codeId, rules)` — **public effect** | `PUT /api/v1/codes/{id}/smart-rules` |

### Two rules an agent should know

**Read before you overwrite.** `qrtap_update_page` and `qrtap_set_smart_rules` replace their
payload wholesale — anything you omit is erased. Fetch the current state with
`qrtap_get_page` / `qrtap_get_smart_rules`, merge your change into it, send the whole object
back.

**Set `external_ref` on batches.** Creation is idempotent by `external_ref`, so a retried
call returns the existing code instead of minting a duplicate. It is what makes a partly
failed batch safe to re-run.

## Printable artifacts

`png_url` and `svg_url` come back on every code. For a print shop, request a PDF directly —
artifact endpoints need the same Bearer key:

```bash
curl -H "Authorization: Bearer $QRTAP_API_KEY" \
  "https://app.qrtap.kg/api/v1/codes/$CODE_ID/qr?format=pdf" -o code.pdf
```

`format` is `png` | `svg` | `pdf`; `size` sets PNG width (256–3000, ~2000 for print). PNG
output is decode-verified before it is returned. Rendering is not exposed as a tool because
the result is a binary file rather than text an agent can reason over.

## Ready-made agent skills

Step-by-step recipes for the common jobs — a menu you can change without reprinting, a
specialist's page in five minutes, one QR for reviews on 2GIS/Google/Yandex, issuing a batch
of codes, working the booking inbox — live in
[`skills/`](https://github.com/IlyaShurf/qrtap-mcp/tree/main/skills) in the
repository. Each one is a single self-contained markdown file you can hand to an assistant.

## Limits and plans

Two budgets apply to every `/api/v1` call: a per-minute brake and a per-day quota, both set
by the workspace plan.

| Plan | Per minute | Per day | Active keys | Bulk and scan webhooks |
|---|---|---|---|---|
| Free | 60 | 100 | 1 | no |
| Standard | 120 | 5,000 | 3 | yes |
| Full | 300 | 50,000 | 10 | yes |

The free tier exists so a developer or an agent can try the integration before buying: 100
calls a day is enough to build and demo, not to run a business on.

Over a budget the API answers `429` and says which one ran out — `{"error":"rate_limited",
"scope":"minute"}` means wait seconds, `{"error":"quota_exceeded","scope":"day"}` means wait
for UTC midnight. Both carry `Retry-After` and the `X-RateLimit-Limit` / `-Remaining` /
`-Reset` headers, and the tool result surfaces all of it verbatim so an agent can back off
instead of hammering.

Two calls are worth preferring on any plan: `qrtap_create_codes_bulk` over a loop, and
`qrtap_list_codes(include_stats=true)` over per-code stats requests.

`qrtap_create_codes_bulk` needs a paid plan. On a free workspace it answers `402
plan_required` with the current plan and an upgrade URL; the fallback is a loop of
`qrtap_create_code` within the daily quota. Current plan limits live in one place in the
platform — `API_PLAN_LIMITS` — and the table above tracks it.

## Errors

API failures come back as ordinary tool results with `isError: true`, carrying the HTTP
status and the response body as text, so the agent can read and explain them rather than
crash. Only an unknown tool name is a JSON-RPC error (`-32602`).

| Status | Meaning |
|---|---|
| `401` | Key missing, invalid or revoked |
| `402 plan_required` | The request is valid, the plan does not cover it (bulk, scan webhooks) |
| `404` | No such object in **your** workspace — another tenant's id looks identical to a typo, deliberately |
| `422` | Content rejected: a page with no contact, or a QR caption with promo wording |
| `429` | Budget exhausted; read `scope` and honour `Retry-After` |

## Licence and terms — where the line is

The **client code in this package is MIT-licensed**: read it, fork it, vendor it, ship it
inside your own product. The `LICENSE` file is the whole of the grant.

That licence covers this thin client and nothing else. **Access to the QRTap API is a
separate matter**, governed by your QRTap plan and the QRTap terms of use: the service, the
hosted platform and the data in your workspace remain QRTap's. An MIT licence on the client
is not an entitlement to the API — you still need a valid key on a plan that includes API
access, and the usual limits and terms apply.

## Development

All commands run from this package directory, in the monorepo and in the public mirror alike:

```bash
npm install          # first time only
npm test             # vitest: tool→HTTP mapping and MCP dispatch
npm run typecheck
```

Smoke test by hand — one JSON-RPC message per line:

```bash
npm run build    # dist/ must exist first
QRTAP_API_KEY=qrtap_key_XXXX node bin/qrtap-mcp.mjs <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
EOF
```

The published package is compiled JavaScript in `dist/` and has **zero runtime dependencies** —
`npx -y qrtap-mcp` downloads about 22 kB and starts on plain Node, with no toolchain to fetch
first. `prepack` rebuilds `dist/` on every `npm pack` and `npm publish`, so an unbuilt or stale
package cannot be shipped.

```bash
npm run build     # tsc -p tsconfig.build.json → dist/
```

TypeScript sources live in `src/` in the repository (MIT, see below) but are not in the
tarball. The MCP stdio protocol is implemented directly in `src/server.ts`; imports carry
explicit `.js` extensions because `tsc` does not rewrite specifiers and the emitted ESM has to
resolve under plain Node.

## About this repository

This is the published source of the `qrtap-mcp` npm package: the server, its tests and the
agent skills. The rest of the QRTap platform (web app, API, database) is closed and lives in
a private repository, so the history here starts at the first public release rather than at
the first commit.

One test is intentionally absent. `plan-limits.test.ts` reads the plan grid out of the
platform's database package and checks that the numbers in this README match what is actually
sold; it can only run where both halves exist, so it stays in the private repository.

Issues and pull requests about the server, the skills or the docs are welcome here.

## Links

- API reference and keys — [app.qrtap.kg/developers](https://app.qrtap.kg/developers)
- OpenAPI spec — [app.qrtap.kg/openapi.json](https://app.qrtap.kg/openapi.json)
- Plans and limits — [app.qrtap.kg/pricing](https://app.qrtap.kg/pricing)
- Issues — [github.com/IlyaShurf/qrtap-mcp/issues](https://github.com/IlyaShurf/qrtap-mcp/issues)

MIT © 2026 QRTap (ИП Шуренков И.П., Kyrgyz Republic)
