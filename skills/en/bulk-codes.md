# Skill: issuing a batch of codes

## Job

Issue many codes at once — stickers for a print run, one per table, one per branch, one per
partner. Up to 500 in a single request, with print files and one report for the whole batch.

## Requires a paid plan

`POST /api/v1/codes/bulk` is a paid feature. On the free plan it answers `402` with
`{"error":"plan_required","plan":"FREE","upgrade_url":"…"}`. That is not a permission
refusal — the request is valid, the plan does not cover it.

Check the plan **before** preparing a 300-row file. The free-plan fallback is a loop of
plain `POST /api/v1/codes`, but the daily quota there is 100 requests, so a batch over a
hundred will not go through in one day. Say so up front rather than hitting the error
halfway through.

## Key concepts

**`external_ref`** — your identifier for a code: branch number, SKU, partner id, table
number. Max 200 chars, unique per organization. Creation is idempotent by it, so a repeated
call returns the existing code instead of a duplicate. That is what makes a partly failed
batch safe to re-run.

**`group`** — the analytics bucket, one of exactly five: `partner`, `equipment`,
`event_menu`, `bag_insert`, `training`. Codes sharing a group total up in one call. Custom
group names are not accepted — put non-standard attributes in `external_ref` (`shop-07`).

## Steps

**1. Prepare the list.** Each item needs `target_url`; in practice always add `external_ref`
and `group`, or the batch will not report as a unit.

```json
[
  {"target_url":"https://example.com/shop/07","external_ref":"shop-07","group":"partner","label":"Branch 07"},
  {"target_url":"https://example.com/shop/08","external_ref":"shop-08","group":"partner","label":"Branch 08"}
]
```

**2. Create the batch.** The body is the bare array, max 500 items.

MCP (fields are `url` and `title`; the server maps them to `target_url` and `label`):
`qrtap_create_codes_bulk(items = [...])`

```bash
curl -s -X POST https://app.qrtap.kg/api/v1/codes/bulk \
  -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" -d @batch.json
```

**3. Read the per-item reply.** One bad URL does not sink the batch:

```json
{"created":2,"failed":1,"data":[
  {"ok":true,"id":"…","external_ref":"shop-07","short_url":"https://app.qrtap.kg/a1b2"},
  {"ok":false,"external_ref":"shop-09","error":"invalid_url"}]}
```

If `failed > 0`, fix the causes (`invalid_url`, `unknown_design_template`) and resend **only
those items** — `external_ref` protects the successful ones from duplication. Save the reply
as CSV: it maps your `external_ref` to `short_url` and `id`.

**4. Fetch the print files.** One request per artifact, same key:

```bash
while IFS=, read -r ref id short err; do
  [ -z "$id" ] && continue
  curl -s -H "Authorization: Bearer $QRTAP_API_KEY" \
    "https://app.qrtap.kg/api/v1/codes/$id/qr?format=pdf" -o "qr-$ref.pdf"
  sleep 0.6   # per-minute budget: 60/120/300 depending on plan
done < <(tail -n +2 batch.csv)
```

The pause is not decoration — without it a hundred codes hit `429`.

**5. Brand the batch (optional).** `GET /api/v1/design-templates` for the id, then add
`"design_template_id": "<uuid>"` to each item. Templates are created by the owner in the
cabinet because they carry logo image data. At render time the platform verifies readability
and shrinks or drops the logo if needed; the `X-QRTap-QA` header reports `branded`,
`downgraded` or `plain`.

**6. Report on the whole batch.**

```bash
curl -s -H "Authorization: Bearer $QRTAP_API_KEY" \
  "https://app.qrtap.kg/api/v1/groups/partner/stats?from=2026-07-01T00:00:00Z"
curl -s -H "Authorization: Bearer $QRTAP_API_KEY" \
  "https://app.qrtap.kg/api/v1/codes?group=partner&include=stats&limit=500"
```

MCP: `qrtap_group_stats(group)` and `qrtap_list_codes(group, include_stats = true)` — not a
loop of `qrtap_code_stats`, which is hundreds of needless requests.

**7. Retarget the whole batch.** There is no bulk retarget; loop `PATCH /api/v1/codes/{id}`
with a `sleep 0.6`. This is a mass public change — hundreds of printed codes start leading
somewhere else. Tell the user the batch size and the new destination, and wait.

## Verify

1. `created + failed` equals the number of items sent.
2. `failed: 0`, or every cause resolved and resent.
3. `GET /api/v1/codes?group=partner&limit=500` returns exactly as many codes as you have
   points, with no repeated `external_ref`.
4. Re-running the same file returns the same `id`s rather than new codes.
5. Spot-check `curl -sI <short_url>` on a few codes.
6. The number of `qr-*.pdf` files matches the successful codes.
7. `GET /api/v1/groups/partner/stats` reports `codes` equal to the batch size.

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `400` on the whole batch | Not an array, empty, or over 500 | Check the shape, split into chunks of 500 |
| `invalid_url` on an item | No scheme, or over 2048 chars | Fix and resend that item only |
| `unknown_design_template` | Template belongs elsewhere or was deleted | Take a current id from `GET /api/v1/design-templates` |
| `429 scope=minute` while downloading files | Per-minute budget (60/120/300 by plan) | Sleep 0.5–1s, honour `Retry-After` |
| `429 scope=day` | Daily quota spent (100/5,000/50,000) | Resume after UTC midnight, or move up a plan |
| `402 plan_required` on `/codes/bulk` | Bulk is not on the free plan | Upgrade, or issue codes with a `POST /api/v1/codes` loop within the daily quota |
| Duplicate codes | Batch run without `external_ref` | Always set it; archive the extras in the cabinet |
| Group rejected | Value outside the five | Use the canonical five; put custom attributes in `external_ref` |
