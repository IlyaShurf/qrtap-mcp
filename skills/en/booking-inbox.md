# Skill: taking booking requests and working through them

## Job

Take booking requests from a public page and work the queue: see what's new, call the person,
record the decision. A simple inbox — no CRM, no calendar.

## Three things to understand first

**The platform notifies nobody.** Neither confirming nor declining sends the guest an SMS or
an email. The status in QRTap is the business's own record of a decision. Somebody still has
to call. Say this plainly rather than leaving the impression the customer has been told.

**A request is personal data.** The reply carries a real person's name and phone. Use them to
serve that request — do not copy them into other services, mailing lists, or anywhere they
are not needed.

**Times are not parsed.** `preferred_at` is free text exactly as the guest typed it
("tomorrow after 2pm"). Nothing reads it, nothing goes into a calendar.

## Setup

`QRTAP_API_KEY` and a public page — see [specialist-page.md](specialist-page.md). The request
form lives on that page, and the `services` list is what the guest picks from.

## Steps

**1. Prepare the page.** Fill in `services` so requests come in legible:
`qrtap_get_page(slug)` → add services → `qrtap_update_page(slug, content)`. Remember `content`
is replaced wholesale. If booking runs in an external system, set `bookingUrl` instead — then
the guest leaves and no requests arrive in QRTap.

**2. Put a QR on the page.**
`qrtap_create_code(url = "<public_url>", title = "Booking, window", external_ref = "booking-window")`

**3. Read the inbox.** Status `new`:

```bash
curl -s -H "Authorization: Bearer $QRTAP_API_KEY" \
  "https://app.qrtap.kg/api/v1/bookings?status=new"
```

MCP: `qrtap_list_bookings(status = "new")`. Each request has `id`, `service`, `preferred_at`,
`guest_name`, `guest_phone`, `status`, `created_at`. Omit the filter to see everything.

**4. Handle one request — in this order:**

1. Show the user the whole request: service, preferred time, name, phone.
2. The user decides — confirm or decline. **A person makes this call.**
3. The person rings the guest and agrees the time.
4. Only then record the status.

```bash
curl -s -X POST "https://app.qrtap.kg/api/v1/bookings/$BOOKING_ID/status" \
  -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"confirmed"}'   # or "declined"
```

MCP: `qrtap_set_booking_status(bookingId, status)`. A request cannot go back to `new` — the
status moves one way only.

**5. Work a backlog.** List everything under `new`, show it to the user as one list oldest
first, collect all the decisions in one message rather than one at a time, apply them, then
report "N confirmed, M declined" and remind the user that the calls are still theirs to make.

Do not infer statuses. A request that looks like spam, an odd phone number, an awkward time —
all reasons to ask, not to decide.

**6. Look back.** `?status=confirmed`, or no filter for all. How many people reached the page
at all: `GET /api/v1/codes/{id}/stats?from=…`. Scans against requests over the same period is
your window-to-booking conversion.

## Verify

1. Leave a test request on your own page and find it under `?status=new`.
2. It carries `service`, `guest_name`, `guest_phone`, and `preferred_at` matches what you typed.
3. After the call it leaves `?status=new` and appears under `?status=confirmed` or `?status=declined`.
4. The unfiltered count equals the sum of the three statuses.
5. Using your own number on a test request, confirm no message arrives — that is expected
   behaviour, not a fault.

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| No requests arrive | `bookingUrl` is set on the page | Remove it if booking should run through QRTap |
| Guest got no confirmation | The platform sends nothing | Call; warn the user in advance |
| Wrong status recorded | `new` cannot be restored | Set the correct final status, mention it on the call |
| Empty list | Filtered to `new` and all are handled | Query without the filter |
| `404` when setting status | Stale booking `id` | Take the id from a fresh `GET /api/v1/bookings` |
| Services vanished from the page | Partial `content` in `PATCH` | Read first, send the whole object |
