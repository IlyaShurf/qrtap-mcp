# Skill: a menu or price list you can change without reprinting

## Job

Put a QR on a menu, price list or poster, print it once, and change the content as often as
you like. The code on the table or in the window never changes — only where it leads.

## When to use it

A café that swaps menus by season; a workshop updating its price list quarterly; a poster
that must always point at the current event. Any case of "we printed it and then everything
changed". For a one-off link that will never be printed, a plain short link is enough.

## Setup

`QRTAP_API_KEY` from [app.qrtap.kg/workspace/api](https://app.qrtap.kg/workspace/api), and a
destination — a PDF in cloud storage, a web page, anything `http`/`https`.

## Steps

**1. Create the code.** The reply carries `id` (to retarget later), `short_url` (the
permanent link the QR encodes) and `png_url`.

MCP: `qrtap_create_code(url = "https://example.com/menu-summer.pdf", title = "Hall tables", external_ref = "menu-hall", group = "event_menu")`

```bash
curl -s -X POST https://app.qrtap.kg/api/v1/codes \
  -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" \
  -d '{"target_url":"https://example.com/menu-summer.pdf","label":"Hall tables","external_ref":"menu-hall","group":"event_menu"}'
```

Always set `external_ref`: creation is idempotent by it, so a repeated call returns the
existing code instead of a duplicate.

**2. Get the print file.**

```bash
curl -H "Authorization: Bearer $QRTAP_API_KEY" \
  "https://app.qrtap.kg/api/v1/codes/$CODE_ID/qr?format=pdf" -o menu-qr.pdf
```

`format` is `png` (set `size`, ~2000 for print), `svg` (vector, supports `caption`) or `pdf`.
Captions are screened against Kyrgyz advertising law — discount, bonus, gift and promo-code
wording is refused with 422. Keep it to "Menu" or "Price list".

**3. Print `short_url`.** It never changes.

**4. Change the content later.** Leave the print alone, move the destination:

MCP: `qrtap_change_destination(codeId, url = "https://example.com/menu-autumn.pdf")`

```bash
curl -s -X PATCH "https://app.qrtap.kg/api/v1/codes/$CODE_ID" \
  -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" \
  -d '{"target_url":"https://example.com/menu-autumn.pdf"}'
```

Live on the next scan. This is publicly visible — show the user the old and new URL and wait
for confirmation before calling.

**5. Lost the id?** `GET /api/v1/codes?external_ref=menu-hall`, or
`GET /api/v1/codes?include=stats` for everything with scan counts.

## Verify

1. Reply contains `short_url`.
2. `curl -sI <short_url>` returns a redirect to the current destination.
3. After step 4, the same command shows the new `location` while `short_url` is unchanged.
4. `GET /api/v1/codes/{id}/history` lists both versions — also how to recover a wrong retarget.
5. `GET /api/v1/codes/{id}/stats` gives totals, per-day and per-device. Anonymous and
   aggregate by design: no IPs or user-agents are stored, so "who scanned" does not exist.

## Going further

Different menus at different times, via Smart Links (max 5 rules, first match wins):

```bash
curl -s -X PUT "https://app.qrtap.kg/api/v1/codes/$CODE_ID/smart-rules" \
  -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" \
  -d '{"rules":[{"if":{"kind":"hours","tz":"Asia/Bishkek","from":"08:00","to":"12:00"},"to":"https://example.com/breakfast.pdf"}]}'
```

Rules are replaced wholesale — read `GET .../smart-rules` first, send the complete set, `[]`
clears them. Many codes at once: see [bulk-codes.md](bulk-codes.md).

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `401 unauthorized` | Key missing, invalid or revoked | Check `QRTAP_API_KEY` |
| `422` on an artifact with a caption | Promo wording in `caption` | Use neutral text |
| `429` | A budget ran out: `scope=minute` or `scope=day` | Read `scope` and `Retry-After`; the daily one resets at UTC midnight |
| Two codes for one menu | No `external_ref` | Always set it |
| QR unreadable after branding | Logo covered the pattern | Platform shrinks or drops it; check the `X-QRTap-QA` header |
