# Yuvak Attendance Portal (GORWA)

Next.js + Supabase attendance portal, built from `GORWA_YUVAK_MASTER_LIST_2026.xlsx`.

- **Volunteers** pick a group, tap names to mark present for a sabha date, and add anyone missing from the list.
- **Sabha day is Friday by default** for the whole year. Admin can change it (for example to Saturday) and any special date can be picked on the group page.
- **Admin** (password protected) sees attendance by date, by group, per yuvak, and downloads Excel (CSV) files.
- Hosted on **Vercel**, data in **Supabase**.

---

## 1. What is in this folder

| Path | What it is |
|---|---|
| `app/` | Pages (home, group marking, admin) and API routes |
| `components/` | Client-side interactive parts (tap list, search, admin settings) |
| `lib/` | Date logic (Friday default, IST time), admin auth, Supabase access, CSV |
| `supabase/schema.sql` | Creates the tables. Run first. |
| `supabase/seed.sql` | All 169 yuvaks and 16 groups from your Excel. Run second. |
| `scripts/parse-master.mjs` | Reads the Excel file |
| `scripts/import-excel.mjs` | Builds `seed.sql` from an Excel file (and can insert directly) |
| `ANTIGRAVITY_PROMPT.md` | Ready-to-paste prompt for Google Antigravity |

---

## 2. One-time setup (about 20 minutes)

### Step A: Supabase (database)

1. Go to https://supabase.com, sign in, click **New project**. Choose a name (e.g. `gorwa-yuvak`), set a database password (save it), pick the region closest to India (Mumbai `ap-south-1`), click **Create**.
2. Wait until the project is ready. Click **SQL Editor** on the left, then **New query**.
3. Open `supabase/schema.sql` from this folder, copy everything, paste it in, click **Run**. It should say *Success*.
4. New query again. Open `supabase/seed.sql`, copy everything, paste, click **Run**. This loads the 16 groups and 169 yuvaks.
5. To check: click **Table Editor**, open `yuvaks`. You should see 169 rows.
6. Get your keys: **Project Settings (gear icon) → API**. Copy:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role** key (under "Project API keys", click *Reveal*) → this is `SUPABASE_SERVICE_ROLE_KEY`

   > The **service_role** key has full access to your database. Never put it in a browser file, a chat, or a public GitHub repo. It is only used on the server (Vercel).

### Step B: Run it on your computer (optional but useful for testing)

Needs Node.js 20.9 or newer (https://nodejs.org, choose LTS).

```bash
cd yuvak-attendance
npm install
cp .env.example .env.local
```

Open `.env.local` and fill in:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   (the service_role key)
ADMIN_PASSWORD=choose-a-password-for-admin
ADMIN_SESSION_SECRET=any-long-random-text-at-least-32-characters
```

Then:

```bash
npm run dev
```

Open http://localhost:3000. The admin page is at http://localhost:3000/admin.

### Step C: Put it on Vercel (live link for everyone)

1. Put this folder on GitHub: create a new repository, upload these files (do **not** upload `node_modules`, `.next` or `.env.local`; the `.gitignore` already skips them).
2. Go to https://vercel.com, sign in with GitHub, click **Add New → Project**, choose the repository.
3. Framework preset: **Next.js** (it is detected automatically). Build settings: leave default.
4. Open **Environment Variables** and add the four variables from Step B (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`). Set them for *Production* (and *Preview* if you want).
5. Click **Deploy**. In about a minute you get a link like `https://gorwa-yuvak.vercel.app`.
6. Share the link with volunteers. Share the admin password only with admins.

Every time you change code and push to GitHub, Vercel redeploys automatically.

---

## 3. How to use it

### Volunteers (marking attendance)

1. Open the link. The home page shows the sabha day and the date being marked (the most recent Friday, or the sabha you pick).
2. **Find a yuvak:** type a name or mobile in the search box. Tap the result to open their group.
3. **Or pick a group:** tap a card (SK 1 ... SK 14, UK 1, NEW).
4. Tap a name to mark them **present** (it turns green and saves at once). Tap again to undo.
5. Wrong date? On the group page choose another Friday from the list, or use **Other date** for a special sabha.
6. **Not in the list?** Tap **+ Add new yuvak**. Fill the name (required) and whatever else you have. The yuvak is saved in Supabase and marked present for that date. If the name already exists, the app tells you which group they are in, so you don't create a duplicate.

### Admin (seeing attendance)

1. Open `/admin` and sign in with `ADMIN_PASSWORD`.
2. **Sabha settings:** the sabha day is Friday. Change it to another weekday if the day moves. All attendance pages then list that weekday for the whole year. Past attendance is kept as it was.
3. Pick a **date** and optionally a **group**. You see present count, total, percentage, and a table of every yuvak with Present/Absent and how many sabhas they attended in the year.
4. **Downloads (open in Excel):**
   - **This date (.csv)**: one row per yuvak with Present/Absent for that date.
   - **Whole year (.csv)**: one row per yuvak, one column per sabha date, `P` where present, plus totals. This mirrors your original Excel layout.
5. Sign out when finished (button at the top).

---

## 4. Excel to database: how the data maps

The Excel file has three kinds of sheet:

| Excel sheet | Meaning | Goes to |
|---|---|---|
| `Master` | Index of all groups with counts | Not imported. Group names are taken from each group sheet, which is the more accurate source (see data notes). |
| `1` ... `14`, `15` | One group each. Row 2 = `SK ID 01: LEADER NAME` (sheet 15 = `UK 01`). Row 3 = column headers. Rows 4+ = yuvaks. | `groups` table (one row per sheet) and `yuvaks` table (one row per yuvak) |
| `New` | Newly joined yuvaks, not yet assigned to a group | Group `NEW` |

Column mapping for group sheets:

| Excel column | Database field |
|---|---|
| SR.NO | `serial_no` |
| Form ID | `form_id` |
| YUVAK NAME | `name` |
| BIRTH DATE | `birth_date` (kept as DD-MM-YYYY text) |
| ADDRESS | `address` |
| MOBILE | `mobile` (digits only) |
| WHATSAPP | `whatsapp` |
| HOME PHONE | `home_phone` |
| EDUCATION DETAIL | `education` |

The `New` sheet has the same fields, plus REMARKS, and no Form ID.

**Weekly date columns (`03-04-2026`, `10-04-2026` ...):** these were Friday attendance columns in Excel. They were all empty, so no old attendance was imported. The app creates attendance for every Friday of the year (or whichever day you set), so you don't need those columns any more. If you want the old attendance loaded, tell me and I will add an importer for it.

### When the Excel list changes

- **Small change (one or two people):** add them in the app with **+ Add new yuvak**, or in Supabase **Table Editor → yuvaks → Insert row**.
- **Whole list updated:** the importer rebuilds `supabase/seed.sql` from the new file:

  ```bash
  npm run import:excel -- path/to/GORWA_YUVAK_MASTER_LIST_2026.xlsx
  ```

  This only writes `supabase/seed.sql`. To load it, empty the `yuvaks` table first (SQL Editor: `delete from yuvaks;`, which also removes attendance linked to them), then run `seed.sql` again. The importer also has `--apply`, which inserts straight into Supabase using `.env.local`. It refuses to run if `yuvaks` already has rows, so duplicates cannot happen by accident.

### Opening the CSV in Excel

- Double-click the downloaded `.csv`. Names in Gujarati/Hindi and English show correctly (the file has the UTF-8 marker Excel needs).
- If Excel puts everything in one column, use **Data → Text to Columns → Delimited → Comma**.
- To save as a real Excel file: **File → Save As → Excel Workbook (.xlsx)**.

---

## 5. Data notes (please check)

The importer found these and did not change them. Please review:

1. **Master index names differ from the group sheets** for two groups. The app uses the group sheet headers.
   - SK 3: Master says `AMIN YAGNESH RASHMIKANT`, sheet says `PATEL DHRUV ANILBHAI`.
   - SK 11: Master says `VYAS MEHULKUMAR KANUBHAI`, sheet says `PARMAR SHASHANK`.
   - SK 5 is spelled `PRAGNESHBHAI` in Master and `PRAGANESHBHAI` in the sheet. The sheet spelling is used.
2. **Parekh Naitik Vimalkumar** (SK 13, row 19) has no SR.NO. He is imported.
3. **Duplicates were imported as they appear**, not merged:
   - `Parekh Tushar Sunilbhai` appears twice in UK 1.
   - `Patel Vandan Mittalbhai` is in SK 3 and in `New`.
4. **The `New` sheet has incomplete entries**, such as `gautam`, `darshan`, `shidhraj gohil`, `Dhruv Patel - shahyog`. They are imported as yuvaks with no details. Remove any that are not people, in Supabase Table Editor.
5. **The Excel date header `03-04-2026` appears twice** (two columns). This is only a header issue and does not affect the app.
6. **Totals:** 153 yuvaks in SK/UK groups plus 16 in New = **169**.

---

## 6. Security and limits (read this)

- **Marking is open to anyone with the link.** That is how volunteers work it. If you want only volunteers to mark, tell me and I will add a volunteer PIN.
- **Admin** is one shared password (`ADMIN_PASSWORD`). The session cookie lasts 12 hours. To change the password, update it in Vercel's environment variables and redeploy. To force everyone to sign in again right away, also change `ADMIN_SESSION_SECRET`.
- The **service_role** key is only read on the server. Nothing in the browser can read the database directly (row-level security is on, with no public policies).
- There is **no delete or edit screen** in the app. Use Supabase **Table Editor** to fix a name or remove a wrong entry.
- Attendance is one row per present yuvak per date. A yuvak who is not in the table for a date is absent.

---

## 7. Changing the sabha day

- Default: **Friday** (set in `supabase/schema.sql`, row `sabha_day`).
- Change it in **Admin → Sabha settings**. Dates on volunteer and admin pages update for the whole year.
- Records already saved keep their real dates, so history stays correct when the day changes.
- For a one-off special sabha on another day, use **Other date** on the group page. No setting change needed.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| Home page shows an error | Check the four environment variables on Vercel (or `.env.local`). `SUPABASE_URL` must start with `https://`. |
| "Missing SUPABASE_URL..." in the logs | A variable is missing or misspelled. Redeploy after adding it. |
| Admin password says "Wrong password" | Check `ADMIN_PASSWORD` in Vercel (no spaces around it), then redeploy. |
| Tap does not save | Phone has no connection. The name turns back, and an error is shown. Tap again when online. |
| Names look wrong in Excel | Use Data → From Text/CSV and choose UTF-8, or open the file in Google Sheets. |
