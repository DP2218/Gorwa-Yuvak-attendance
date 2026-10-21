# Prompt for Google Antigravity

Copy everything inside the block below into Antigravity (Agent / chat) with this project folder open.

```
You are working on "yuvak-attendance", a Next.js (App Router, TypeScript) + Supabase attendance portal for a weekly sabha (religious gathering) run by the GORWA yuvak groups. It is deployed on Vercel. Read README.md and supabase/schema.sql first; they are the source of truth.

## Goal
Volunteers mark attendance for a sabha by tapping yuvak names. An admin can see attendance and download Excel-openable CSV files. The sabha is held on FRIDAY every week, but the weekday must be changeable without code changes.

## Stack (keep it)
- Next.js 16 App Router, React 19, TypeScript strict, plain CSS in app/globals.css (no Tailwind needed).
- Supabase Postgres via @supabase/supabase-js, using the SERVICE ROLE key on the server only. Row level security is enabled with no public policies. Never expose the service key to client components.
- Hosting: Vercel. Environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, ADMIN_SESSION_SECRET.
- Timezone for "today" is Asia/Kolkata (IST). Vercel runs in UTC, so always compute "today" in IST (see lib/dates.ts).

## Data model (supabase/schema.sql)
- groups(id, code, leader_name, sort_order): SK 1..SK 14, UK 1, and NEW (unassigned).
- yuvaks(id, group_id, serial_no, form_id, name, birth_date text DD-MM-YYYY, address, mobile, whatsapp, home_phone, education, remarks, source 'excel' | 'added').
- attendance(id, session_date date, yuvak_id, marked_at, UNIQUE(session_date, yuvak_id)). A row means PRESENT. No row means absent.
- settings(key, value). key 'sabha_day' holds a weekday name, default 'friday'.
- supabase/seed.sql holds the 169 real yuvaks and 16 groups from the Excel master list. Do not change the data without asking.

## Features already built (keep working)
1. Home (/): shows the sabha day and the date being marked, a live name/mobile search across all yuvaks, an "add new yuvak" form when a name is not found (group defaults to NEW), and the list of groups with counts.
2. Group page (/group/[id]?date=YYYY-MM-DD): tap a name to toggle present (optimistic update, rolls back on error). Search filter. Date dropdown listing every sabha-day date of the year, defaulting to the most recent sabha on or before today. An "Other date" picker for special sabhas. "+ Add new yuvak to this group" saves to Supabase and marks them present.
3. POST /api/attendance {yuvak_id, session_date, present}. Validates input; upsert or delete.
4. POST /api/yuvaks adds a yuvak with source 'added'. Returns 409 with the existing group if the normalised name already exists anywhere.
5. Admin (/admin): password login (POST /api/admin/login sets an httpOnly signed cookie, 12h). Dashboard with date and group filters, summary stats, a per-group table, a per-yuvak table with Present/Absent and sabhas attended this year, and a sabha-day settings form (POST /api/admin/settings).
6. Exports (admin only): GET /api/admin/export?date=YYYY-MM-DD (one day) and ?year=YYYY (one row per yuvak, one column per sabha date, P = present, totals row). CSV has a UTF-8 BOM and CRLF so Excel opens it cleanly.
7. Mobile first. Must render with no horizontal scroll at 390px wide.

## Rules
- Keep the sabha weekday configurable. Never hard-code Friday in logic; Friday is only the default in settings.
- Keep attendance keyed by the real calendar date, so changing the sabha day never rewrites history.
- Never log, return or bundle the service key, admin password or session secret.
- Validate every API input on the server. Keep the 401 check on every /api/admin/* route.
- Keep the code small and readable. Do not add a database ORM or UI library unless asked.

## Tasks for you now
[Describe the change here, for example: "Add a volunteer PIN to the public marking pages", "Add an edit screen for yuvak name/mobile in admin", "Add a per-yuvak attendance history page", or "Show a monthly summary chart".]

## How to work
1. Make a short plan first and list the files you will change.
2. Make the change with small, focused edits. Keep the existing behaviour.
3. Run `npm install` then `npm run lint` (tsc) and `npm run build`. Both must pass.
4. If you add a database change, add it as a new SQL file under supabase/migrations/ with a number prefix. Do not edit schema.sql in place for existing deployments.
5. Explain what changed, which env vars (if any) are needed, and the manual steps for Supabase or Vercel.
```
