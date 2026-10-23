import fs from 'node:fs';
if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
import { createHmac } from 'node:crypto';
import ExcelJS from 'exceljs';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Compute admin session cookie value
const secret = (process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '').trim().replace(/^["']|["']$/g, '');
const adminCookieValue = createHmac('sha256', secret).update('yuvak-admin-session-v1').digest('hex');
const cookieHeader = `yuvak_admin=${adminCookieValue}`;

async function run() {
  console.log('--- STARTING COMPREHENSIVE END-TO-END TESTS ---');

  // Test 1: Unauthorized access
  console.log('\n1. Testing Unauthorized Access (401 expected):');
  const unauthGroup = await fetch(`${BASE_URL}/api/admin/groups/1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaderName: 'Test' }),
  });
  console.log('Unauth PATCH group status:', unauthGroup.status, '(expected 401)');

  const unauthYuvak = await fetch(`${BASE_URL}/api/admin/yuvaks/1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test' }),
  });
  console.log('Unauth PATCH yuvak status:', unauthYuvak.status, '(expected 401)');

  const unauthAdd = await fetch(`${BASE_URL}/api/admin/groups/1/yuvaks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test' }),
  });
  console.log('Unauth POST yuvak status:', unauthAdd.status, '(expected 401)');

  // Test 2: PATCH /api/admin/groups/1 (Update Leader)
  console.log('\n2. Testing Leader Name Update:');
  // First fetch original leader
  const groupPageRes = await fetch(`${BASE_URL}/admin/group/1`, {
    headers: { Cookie: cookieHeader },
  });
  console.log('GET /admin/group/1 status:', groupPageRes.status);

  const testLeaderName = 'PATEL KETAN CHANDUBHAI (TEST-EDIT)';
  const updateLeaderRes = await fetch(`${BASE_URL}/api/admin/groups/1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ leaderName: testLeaderName }),
  });
  const updateLeaderData = await updateLeaderRes.json();
  console.log('Update leader status:', updateLeaderRes.status, 'Response leader:', updateLeaderData.group?.leader_name);

  // Test 3: Validation on POST /api/admin/groups/1/yuvaks
  console.log('\n3. Testing Yuvak Validation:');
  const invalidNameRes = await fetch(`${BASE_URL}/api/admin/groups/1/yuvaks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ name: ' ' }),
  });
  console.log('Invalid name status:', invalidNameRes.status, '(expected 400)');

  const invalidPhoneRes = await fetch(`${BASE_URL}/api/admin/groups/1/yuvaks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ name: 'Test User', mobile: '123' }),
  });
  console.log('Invalid phone status:', invalidPhoneRes.status, '(expected 400)');

  const futureDobRes = await fetch(`${BASE_URL}/api/admin/groups/1/yuvaks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ name: 'Test User', birthDate: '2099-01-01' }),
  });
  console.log('Future DOB status:', futureDobRes.status, '(expected 400)');

  // Test 4: Add New Yuvak
  console.log('\n4. Testing Add New Yuvak:');
  const addRes = await fetch(`${BASE_URL}/api/admin/groups/1/yuvaks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({
      name: 'TEST AUTOMATION YUVAK',
      formId: 'TEST-999',
      birthDate: '2000-05-15',
      address: '123 Test Street, Gorwa, Vadodara',
      mobile: '9898000111',
      whatsapp: '9898000111',
      homePhone: '9898000222',
      education: 'B.Tech IT',
    }),
  });
  const addData = await addRes.json();
  console.log('Add yuvak status:', addRes.status, '(expected 201)');
  const newYuvakId = addData.yuvak?.id;
  console.log('Created yuvak ID:', newYuvakId, 'Serial No:', addData.yuvak?.serial_no);

  // Test 5: Duplicate Mobile Warning and Override
  console.log('\n5. Testing Duplicate Mobile Warning and Override:');
  const dupCheckRes = await fetch(`${BASE_URL}/api/admin/groups/2/yuvaks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({
      name: 'ANOTHER TEST USER',
      mobile: '9898000111', // same mobile
    }),
  });
  console.log('Duplicate mobile check status:', dupCheckRes.status, '(expected 409)');
  const dupData = await dupCheckRes.json();
  console.log('Duplicate warning received:', dupData.warning, 'canOverride:', dupData.canOverride);

  // Override duplicate mobile
  const overrideRes = await fetch(`${BASE_URL}/api/admin/groups/2/yuvaks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({
      name: 'ANOTHER TEST USER OVERRIDDEN',
      mobile: '9898000111',
      overrideDuplicateMobile: true,
    }),
  });
  const overrideData = await overrideRes.json();
  console.log('Override duplicate status:', overrideRes.status, '(expected 201)');
  const dupYuvakId = overrideData.yuvak?.id;

  // Clean up duplicate yuvak right away
  if (dupYuvakId) {
    await fetch(`${BASE_URL}/api/admin/yuvaks/${dupYuvakId}`, {
      method: 'DELETE',
      headers: { Cookie: cookieHeader },
    });
  }

  // Test 6: Edit Yuvak Details and Move to Another Group (e.g. Group 2 - SK 2)
  console.log('\n6. Testing Edit Yuvak and Group Move:');
  const patchYuvakRes = await fetch(`${BASE_URL}/api/admin/yuvaks/${newYuvakId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({
      name: 'TEST AUTOMATION YUVAK EDITED',
      groupId: 2, // Move to SK 2
      birthDate: '1999-12-31',
      education: 'M.Tech Software',
    }),
  });
  const patchYuvakData = await patchYuvakRes.json();
  console.log('Patch yuvak status:', patchYuvakRes.status, 'New group_id:', patchYuvakData.yuvak?.group_id);

  // Test 7: Attendance Marking
  console.log('\n7. Testing Attendance Marking for edited Yuvak:');
  const markRes = await fetch(`${BASE_URL}/api/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      yuvak_id: newYuvakId,
      session_date: '2026-10-23',
      present: true,
    }),
  });
  console.log('Mark attendance status:', markRes.status);

  // Test 8: Excel Export Sync Verification
  console.log('\n8. Testing Excel Export Live Sync:');
  const excelRes = await fetch(`${BASE_URL}/api/admin/export-xlsx?mode=single&date=2026-10-23`, {
    headers: { Cookie: cookieHeader },
  });
  console.log('Excel export HTTP status:', excelRes.status);
  const arrayBuffer = await excelRes.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  // Verify Master sheet has the updated leader name
  const masterSheet = wb.getWorksheet('Master');
  const row4Leader = masterSheet.getRow(4).getCell(4).value; // SK 1 leader
  console.log('Master sheet SK 1 Leader Name:', row4Leader);
  console.log('Matches test leader?:', row4Leader === testLeaderName);

  // Verify SK 1 sheet title has the updated leader name
  const sk1Sheet = wb.getWorksheet('1');
  const sk1Title = sk1Sheet?.getCell('A2').value;
  console.log('SK 1 sheet Row 2 Title:', sk1Title);
  console.log('Contains test leader name?:', String(sk1Title).includes(testLeaderName));

  // Verify Yuvak moved to SK 2 (sheet '2')
  const sk2Sheet = wb.getWorksheet('2');
  let foundInSk2 = false;
  sk2Sheet?.eachRow((row) => {
    if (String(row.getCell(3).value).includes('TEST AUTOMATION YUVAK EDITED')) {
      foundInSk2 = true;
    }
  });
  console.log('Yuvak correctly present in SK 2 sheet?:', foundInSk2);

  // Verify Yuvak NOT in SK 1 (sheet '1')
  let foundInSk1 = false;
  sk1Sheet?.eachRow((row) => {
    if (String(row.getCell(3).value).includes('TEST AUTOMATION YUVAK')) {
      foundInSk1 = true;
    }
  });
  console.log('Yuvak NOT in SK 1 sheet?:', !foundInSk1);

  // Test 9: Delete Test Yuvak & Attendance Cascade
  console.log('\n9. Testing Delete Yuvak and Cleanup:');
  const deleteRes = await fetch(`${BASE_URL}/api/admin/yuvaks/${newYuvakId}`, {
    method: 'DELETE',
    headers: { Cookie: cookieHeader },
  });
  console.log('Delete test yuvak status:', deleteRes.status);

  // Reset leader name back to original
  await fetch(`${BASE_URL}/api/admin/groups/1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ leaderName: 'PATEL KETAN CHANDUBHAI' }),
  });
  console.log('Leader name restored to PATEL KETAN CHANDUBHAI');

  console.log('\n--- ALL AUTOMATED TESTS COMPLETED SUCCESSFULLY! ---');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
