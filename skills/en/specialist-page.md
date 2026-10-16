# Skill: a specialist's business-card page in five minutes

## Job

Build a public page for a specialist or small business — name, speciality, contacts, price
list, social links — served at `https://app.qrtap.kg/a/<slug>` and built for phones. Then
put a QR on it for a business card or shop window.

## When to use it

The specialist has no website but needs a link to hand out; a business card should open
straight into phone, WhatsApp and prices; the price list changes and nobody will rebuild a
site for two lines.

## Setup

`QRTAP_API_KEY`, plus a name and **at least one contact** — `phone`, `whatsapp`, `instagram`
or `bookingUrl`. Without a contact the write is refused with `422 invalid_content`.

## Steps

**1. Assemble the content.** Only `name` is required.

| Field | Meaning |
|---|---|
| `name` | Page heading, max 80 — required |
| `segment` | `master`, `vrach`, `psiholog`, `otzyvy`. Default `master` |
| `theme` | `emerald`, `ocean`, `plum`, `terracotta`, `graphite` |
| `specialty` / `bio` | Subtitle (120) / description (1200) |
| `phone` / `whatsapp` / `instagram` | Stored normalised: `+digits`, a `wa.me` link, a profile URL |
| `twogis` / `bookingUrl` | 2GIS card; external booking link |
| `hours` / `address` / `licenseNumber` | One line each |
| `services` | Up to 12: `[{"name":"…","price":"…"}]`, price is free text |
| `reviewLinks` | `twogis`, `google`, `yandex`, `flamp` |
| `socialLinks` | `tiktok`, `telegram`, `website`, `youtube` |

Everything is sanitised server-side: unknown keys are dropped, phones normalised, only
`http`/`https` links survive. Inventing fields does not work.

**2. Publish.**

MCP: `qrtap_create_page(content = {...})`

```bash
curl -s -X POST https://app.qrtap.kg/api/v1/pages \
  -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" \
  -d '{"content":{"name":"Aigul Osmonova","segment":"master","theme":"plum",
       "specialty":"Nail technician","phone":"0555 123 456","whatsapp":"0555 123 456",
       "services":[{"name":"Manicure","price":"1500 KGS"}]}}'
```

The reply carries `slug` and `public_url`. Safe to repeat: it updates the same page as a new
version rather than creating a second one, and the slug never changes.

**3. Put a QR on it.** `qrtap_create_code(url = "<public_url>", title = "Business card", external_ref = "card-aigul")`,
then `GET /api/v1/codes/{id}/qr?format=pdf` for the print file.

**4. Edit later — read first.** `PATCH` replaces `content` **wholesale**; any omitted field
is erased.

```bash
curl -s -H "Authorization: Bearer $QRTAP_API_KEY" "https://app.qrtap.kg/api/v1/pages/$SLUG"
# change one field in the returned content object, then send the whole object back
curl -s -X PATCH "https://app.qrtap.kg/api/v1/pages/$SLUG" \
  -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" \
  -d '{"content": { ...the complete object... }}'
```

MCP: `qrtap_get_page(slug)` → edit → `qrtap_update_page(slug, content)`. `qrtap_list_pages`
will not do — it deliberately omits `content`. Slug and `public_url` survive, so printed
cards keep working.

## Verify

1. Reply has `slug`, `public_url`, `published: true`.
2. `curl -sI <public_url>` returns `200`.
3. `GET /api/v1/pages/{slug}` shows what you sent, with `whatsapp` rewritten to `https://wa.me/…`.
4. `version` increments on each update.
5. `curl -sI <short_url>` points at the page.

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `422 invalid_content` | No contact field | Add `phone`, `whatsapp`, `instagram` or `bookingUrl` |
| Services vanished after an edit | Partial `content` in `PATCH` | Read first, send the whole object |
| A custom field was not saved | Unknown keys are dropped | Use only the fields above |
| "A second page appeared" | A workspace has one page | Repeated `POST` updates it — expected |
| A social link disappeared | Not an `http`/`https` URL | Give the full URL with scheme |

Next: [review-router.md](review-router.md), [booking-inbox.md](booking-inbox.md).
