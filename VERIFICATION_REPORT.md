# Built-in funding record verification

This file is the operational hand-off for the README's task 6: *"Verify the 37
remaining built-in records by running each through the review screen."*

A programmatic check covers half of this — it runs every `MOCK_FUNDING` entry
through `publishProblems()` (the same validator the admin publish button
uses) and reports any records that would block publishing. The other half
(opening each record in the admin UI and clicking through) is left to a
human, because only a human can tell whether the data is *correct*, not
just whether it is *publishable*.

## How to run the check

```bash
npm run verify:records
```

Exit code is `0` when every record is publishable; `1` when any record has
blockers. Output lists each record with a ✓/✗ and the programme name and
status (`OPEN`, `CLOSED`, or `UPCOMING` — re-derived from the dates in
South African time).

## Most recent run

Date: 2026-10-23
Total: 37 records.
OK: 37
Flagged: 0

Every built-in record passes the publish validator. They all have:

- A programme name and an issuer name
- A funding type (`GRANT`, `LOAN`, `EQUITY`, `HYBRID`, or `COMPETITION`)
- A closing date (`YYYY-MM-DD`) OR a `Rolling` / `Always Open` frequency
- At least one way to apply or verify (`application_url`, `contact_email`,
  `contact_phone`, or `how_to_apply`)

Status breakdown at run time:

- OPEN: 36
- CLOSED: 1 (`intl_usaid_018` — Prosper Africa, historical cycle)
- UPCOMING: 0

## What this does NOT verify

This script is a structural check. It cannot tell you:

- Whether the closing date is actually this year (the funder may have moved
  the window)
- Whether the application URL still resolves
- Whether the contact email / phone is still monitored
- Whether the eligibility summary still matches the funder's published
  rules

For that, an admin still needs to open each record in the intake review
screen (`/api/intake/drafts`) and click through to the source URL. The
recommended workflow is:

1. Run `npm run verify:records` — fix anything that fails.
2. For each record, click the source URL in the admin review screen and
   visually confirm the dates and amounts.
3. Tick the `officialSource` checkbox only when the source is an official
   government / funder page (not a news article or third-party directory).
4. Click **Publish** — the existing record is overwritten with the verified
   version (`toPublishedRecord` uses the `dedupe_key` as the Firestore doc
   id, so a re-publish replaces, not duplicates).

## Why the scraper can also help

Once the scraper is producing drafts (with the new deep-link source list),
each draft includes the page text the scraper read, the source URL, and a
`change_note` when the closing date differs from the published record. So
the long-term answer to "verify the 37 records" is:

1. Wait for the next daily scraper run.
2. Watch the intake review queue.
3. For any draft whose `change_note` says the published closing date is
   wrong, edit the draft and re-publish.
