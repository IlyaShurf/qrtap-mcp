# Skill: one QR for reviews on 2GIS, Google and Yandex

## Job

One code on the table, at the till or on a card, where the guest picks the platform and
leaves a review there. One sticker instead of three, and no guessing where a given customer
prefers to write.

## How it works

A public page with `segment: "otzyvy"` renders platform buttons from `reviewLinks`. The QR
points at that page; the guest chooses and goes off to write. The set of platforms can change
at any time — the printed code stays the same.

Separately, the page has its own review form. Anything written there lands in a moderation
queue and stays invisible until the owner publishes it.

## Setup

`QRTAP_API_KEY`, plus direct review links, taken from each service: the 2GIS company card's
reviews tab; Google's "Share → review link" from the business profile; the Yandex Maps card's
reviews section; Flamp if you have a card there. Open each one by hand first — a broken link
here means a lost review.

## Steps

**1. Create the funnel page.** `reviewLinks` takes `twogis`, `google`, `yandex`, `flamp`; one
is enough.

MCP: `qrtap_create_page(content = { "name": …, "segment": "otzyvy", "reviewLinks": {…} })`

```bash
curl -s -X POST https://app.qrtap.kg/api/v1/pages \
  -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" \
  -d '{"content":{"name":"Tandem Coffee","segment":"otzyvy","theme":"terracotta",
       "phone":"0555 123 456",
       "reviewLinks":{"twogis":"https://2gis.kg/bishkek/firm/70000001234567890",
                      "google":"https://g.page/r/CXXXXXXXXXXXXXXX/review",
                      "yandex":"https://yandex.ru/maps/org/tandem/1234567890/reviews/"}}}'
```

`name` plus at least one contact is still required, or you get `422 invalid_content`.

**2. Make the QR.**

```
qrtap_create_code(url = "<public_url>", title = "Reviews, tables and till", external_ref = "reviews-main")
```

```bash
curl -H "Authorization: Bearer $QRTAP_API_KEY" \
  "https://app.qrtap.kg/api/v1/codes/$CODE_ID/qr?format=svg&caption=Reviews" -o reviews.svg
```

Captions are screened for promo wording: "review for a discount" is refused with 422. Paying
for reviews is a risk under both advertising law and the platforms' own rules — don't.

**3. Add or swap a platform later.** Read, edit, write back whole:
`qrtap_get_page(slug)` → edit `reviewLinks` → `qrtap_update_page(slug, content)`. A partial
`PATCH` erases the platforms you left out.

**4. Work the on-page review queue.** Status `pending` is the queue; nothing in it is public.

```bash
curl -s -H "Authorization: Bearer $QRTAP_API_KEY" \
  "https://app.qrtap.kg/api/v1/reviews?status=pending"
```

Each review carries `id`, `author_name`, `body` (max 600), `status`, `created_at` — and
nothing else: no IP, no device.

```bash
curl -s -X POST "https://app.qrtap.kg/api/v1/reviews/$REVIEW_ID/moderate" \
  -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" \
  -d '{"action":"publish"}'   # or "hide"
```

MCP: `qrtap_list_reviews(status = "pending")` → `qrtap_moderate_review(reviewId, action)`.

**This is publicly visible.** A published review is immediately live for everyone. Show the
user the text and the author, name the action, wait for a yes. Deciding what to publish or
bury is the owner's call and the owner's reputational risk — not the assistant's.

## Verify

1. `curl -sI <public_url>` returns `200`.
2. `GET /api/v1/pages/{slug}` shows `segment: "otzyvy"` and your `reviewLinks`.
3. Open each review link by hand — it should land on the review form, not the generic card.
4. `curl -sI <short_url>` points at the page.
5. `GET /api/v1/codes/{id}/stats` counts how often the review was asked for.
6. Leave a test review and find it under `?status=pending`.

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| No platform buttons | `segment` is not `otzyvy`, or `reviewLinks` is empty | Check both via `GET /api/v1/pages/{slug}` |
| Link opens the card, not the form | The plain company URL was used | Use the add-a-review link |
| Platforms vanished after an edit | Partial `content` in `PATCH` | Read first, send the whole object |
| A review is not on the page | It is still `pending` | Publish it — with the owner's consent |
| `422` on the QR caption | Promo wording | Keep it to "Reviews" |
