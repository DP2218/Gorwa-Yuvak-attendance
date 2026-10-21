// Parses the GORWA YUVAK MASTER LIST workbook into groups + yuvaks.
// Layout it expects:
//   "Master" sheet  -> index only (ignored; group names come from each group sheet header)
//   "1".."15"       -> one sheet per group. Row 2 = "SK ID 01: LEADER NAME" (or "UK 01: ..").
//                      Row 3 = header (SR.NO, Form ID, YUVAK NAME, BIRTH DATE, ADDRESS,
//                      MOBILE, WHATSAPP, HOME PHONE, EDUCATION DETAIL, then weekly date columns).
//                      Rows 4+ = yuvaks. Weekly date columns are ignored (they were empty).
//   "New"           -> unassigned new yuvaks. Row 2 = header, rows 3+ = yuvaks (no Form ID column).
import XLSX from 'xlsx';

const clean = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
};

// Phone numbers come out of Excel as floats (9408150896.0)
const phone = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return String(Math.round(v));
  const digits = String(v).replace(/\D/g, '');
  return digits || clean(v);
};

// Birth dates are a mix of text ("23-04-2001") and real Excel dates.
const birth = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    const d = String(v.getDate()).padStart(2, '0');
    const m = String(v.getMonth() + 1).padStart(2, '0');
    return `${d}-${m}-${v.getFullYear()}`;
  }
  return clean(v);
};

const serial = (v) => (typeof v === 'number' ? Math.round(v) : null);
const formId = (v) => {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'number' ? String(Math.round(v)) : clean(v);
};

export function parseMaster(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const issues = [];
  const groups = [];
  const yuvaks = [];

  const groupSheets = wb.SheetNames.filter((n) => /^\d+$/.test(n));
  for (const sheetName of groupSheets) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    const title = clean(rows[1]?.[0]) || '';
    const m = title.match(/^(SK|UK)\s*(?:ID)?\s*0*(\d+)\s*[:\-]*\s*(.*)$/i);
    if (!m) {
      issues.push(`Sheet "${sheetName}": could not read group header "${title}"`);
      continue;
    }
    const code = `${m[1].toUpperCase()} ${Number(m[2])}`;
    const leader = clean(m[3]);
    groups.push({ code, leader_name: leader, sort_order: groups.length + 1, sheet: sheetName });

    for (let i = 3; i < rows.length; i++) {
      const r = rows[i] || [];
      const name = clean(r[2]);
      const sr = serial(r[0]);
      if (!name) {
        // rows with other data but no name are worth a look
        if (r.slice(3, 9).some((x) => x !== null)) issues.push(`Sheet "${sheetName}" row ${i + 1}: details but no name, skipped`);
        continue;
      }
      if (sr === null) issues.push(`Sheet "${sheetName}" row ${i + 1}: "${name}" has no SR.NO`);
      yuvaks.push({
        group_code: code,
        serial_no: sr,
        form_id: formId(r[1]),
        name,
        birth_date: birth(r[3]),
        address: clean(r[4]),
        mobile: phone(r[5]),
        whatsapp: phone(r[6]),
        home_phone: phone(r[7]),
        education: clean(r[8]),
        remarks: null,
        source: 'excel',
        sheet: sheetName,
      });
    }
  }

  // Unassigned "New" sheet: NAME in column B, no Form ID column
  if (wb.Sheets['New']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['New'], { header: 1, defval: null, raw: true });
    groups.push({ code: 'NEW', leader_name: 'New yuvaks (not yet assigned to a group)', sort_order: 100, sheet: 'New' });
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i] || [];
      const name = clean(r[1]);
      if (!name) continue;
      yuvaks.push({
        group_code: 'NEW',
        serial_no: serial(r[0]),
        form_id: null,
        name,
        birth_date: birth(r[2]),
        address: clean(r[3]),
        mobile: phone(r[4]),
        whatsapp: phone(r[5]),
        home_phone: phone(r[6]),
        education: clean(r[7]),
        remarks: clean(r[8]),
        source: 'excel',
        sheet: 'New',
      });
    }
  }

  // Duplicate names across groups
  const seen = new Map();
  for (const y of yuvaks) {
    const key = y.name.toUpperCase().replace(/[^A-Z]/g, '');
    if (seen.has(key)) issues.push(`Possible duplicate: "${y.name}" in ${seen.get(key)} and ${y.sheet}`);
    else seen.set(key, y.sheet);
  }

  return { groups, yuvaks, issues };
}
