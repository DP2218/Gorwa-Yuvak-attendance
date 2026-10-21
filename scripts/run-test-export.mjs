import fs from 'node:fs';
if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
import { createClient } from '@supabase/supabase-js';
import { generateAttendanceWorkbook } from '../lib/excel-export.ts';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

async function test() {
  const { data: groups } = await supabase.from('groups').select('*').order('sort_order');
  const { data: yuvaks } = await supabase.from('yuvaks').select('*').order('id');
  const { data: attendance } = await supabase.from('attendance').select('session_date, yuvak_id');

  console.log(`Loaded ${groups.length} groups, ${yuvaks.length} yuvaks, ${attendance.length} attendance records`);

  const dates = ['2026-04-03', '2026-04-10', '2026-04-17'];

  // Test 1: All groups with details
  const wb1 = await generateAttendanceWorkbook({
    groups,
    yuvaks,
    dates,
    attendanceRecords: attendance,
    options: { mode: 'range', includeDetails: true, markAbsent: false },
  });
  await wb1.xlsx.writeFile('scratch/test-all-groups.xlsx');
  console.log('Saved scratch/test-all-groups.xlsx');

  // Test 2: Single group without details
  const wb2 = await generateAttendanceWorkbook({
    groups,
    yuvaks,
    dates: ['2026-04-03'],
    attendanceRecords: attendance,
    options: { mode: 'single', group: String(groups[0].id), includeDetails: false, markAbsent: true },
  });
  await wb2.xlsx.writeFile('scratch/test-single-group.xlsx');
  console.log('Saved scratch/test-single-group.xlsx');

  console.log('Tests generated successfully!');
}

test().catch(console.error);
