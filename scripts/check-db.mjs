import fs from 'node:fs';
if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log('No supabase credentials in .env.local');
  process.exit(0);
}
const supabase = createClient(url, key);

async function run() {
  const { data: groups, error: gErr } = await supabase.from('groups').select('*').order('sort_order');
  if (gErr) console.error('gErr:', gErr);
  console.log('Groups in DB:', groups?.map(g => ({ id: g.id, code: g.code, leader: g.leader_name })));
  const { count: yuvakCount } = await supabase.from('yuvaks').select('id', { count: 'exact', head: true });
  console.log('Total yuvaks in DB:', yuvakCount);
  const { data: attendance } = await supabase.from('attendance').select('session_date').limit(10);
  console.log('Attendance sample dates:', attendance);
}

run();
