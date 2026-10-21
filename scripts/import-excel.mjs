// Usage:
//   node scripts/import-excel.mjs path/to/GORWA_YUVAK_MASTER_LIST.xlsx
//     -> writes supabase/seed.sql (paste into Supabase SQL Editor, run once on an empty DB)
//   node scripts/import-excel.mjs path/to/file.xlsx --apply
//     -> inserts straight into Supabase using SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
//        (refuses if the yuvaks table already has rows. To re-import an updated list, clear the
//         yuvaks table in Supabase first, or edit rows in the Table Editor)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMaster } from './parse-master.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
if (!file) {
  console.error('Usage: node scripts/import-excel.mjs <file.xlsx> [--apply]');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { groups, yuvaks, issues } = parseMaster(file);

const lit = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined ? 'null' : String(v));

const groupSql = groups
  .map((g) => `  (${lit(g.code)}, ${lit(g.leader_name)}, ${num(g.sort_order)})`)
  .join(',\n');
const yuvakSql = yuvaks
  .map(
    (y) =>
      `    ((select id from groups where code = ${lit(y.group_code)}), ${num(y.serial_no)}, ${lit(y.form_id)}, ${lit(y.name)}, ${lit(y.birth_date)}, ${lit(y.address)}, ${lit(y.mobile)}, ${lit(y.whatsapp)}, ${lit(y.home_phone)}, ${lit(y.education)}, ${lit(y.remarks)}, 'excel')`
  )
  .join(',\n');

const sql = `-- Generated from ${path.basename(file)} by scripts/import-excel.mjs
-- Run AFTER supabase/schema.sql. Safe to run once; does nothing if yuvaks already has rows.
do $$
begin
  if not exists (select 1 from yuvaks) then
    insert into groups (code, leader_name, sort_order) values
${groupSql}
    on conflict (code) do nothing;

    insert into yuvaks (group_id, serial_no, form_id, name, birth_date, address, mobile, whatsapp, home_phone, education, remarks, source) values
${yuvakSql};
  end if;
end $$;
`;

const outPath = path.join(root, 'supabase', 'seed.sql');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, sql);
console.log(`Wrote ${outPath}: ${groups.length} groups, ${yuvaks.length} yuvaks`);
if (issues.length) {
  console.log('\nData issues to review (not blocking):');
  for (const i of issues) console.log(' - ' + i);
}

if (apply) {
  const envPath = path.join(root, '.env.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local) to use --apply');
    process.exit(1);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { count, error: countErr } = await supabase.from('yuvaks').select('id', { count: 'exact', head: true });
  if (countErr) throw countErr;
  if (count > 0) {
    console.error(`yuvaks already has ${count} rows, so nothing was inserted (this prevents duplicates).`);
    process.exit(1);
  }

  const { error: gErr } = await supabase.from('groups').upsert(
    groups.map((g) => ({ code: g.code, leader_name: g.leader_name, sort_order: g.sort_order })),
    { onConflict: 'code' }
  );
  if (gErr) throw gErr;
  const { data: groupRows, error: gsErr } = await supabase.from('groups').select('id, code');
  if (gsErr) throw gsErr;
  const idByCode = new Map(groupRows.map((g) => [g.code, g.id]));

  const rows = yuvaks.map((y) => ({
    group_id: idByCode.get(y.group_code),
    serial_no: y.serial_no,
    form_id: y.form_id,
    name: y.name,
    birth_date: y.birth_date,
    address: y.address,
    mobile: y.mobile,
    whatsapp: y.whatsapp,
    home_phone: y.home_phone,
    education: y.education,
    remarks: y.remarks,
    source: 'excel',
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('yuvaks').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  console.log(`Inserted ${groups.length} groups and ${rows.length} yuvaks into Supabase.`);
}
