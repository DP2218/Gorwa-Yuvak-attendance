import ExcelJS from 'exceljs';
import type { Group, Yuvak } from './data';

export type ExportOptions = {
  mode: 'single' | 'range' | 'year';
  date?: string;
  from?: string;
  to?: string;
  year?: number;
  group?: string; // 'all' or numeric group_id as string
  includeDetails?: boolean; // default true - includes all yuvak detail columns
  markAbsent?: boolean; // if true put 'A', otherwise blank
};

/** Convert 1-based column index to Excel letter (A, B, ... Z, AA, ...) */
export function colLetter(colIdx: number): string {
  let temp = colIdx;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format ISO date as "21-Oct" for column header */
export function formatHeaderDate(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return isoDate;
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return `${d}-${MONTH_NAMES[m - 1] ?? parts[1]}`;
}

/** Convert birth date to dd-mm-yyyy text string */
export function formatBirthDate(val: string | null): string {
  if (!val) return '';
  const s = val.trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  return s;
}

/** Map group DB record to Excel sheet name */
export function getSheetName(group: Group): string {
  const code = (group.code || '').trim().toUpperCase();
  const skMatch = code.match(/^SK\s*0*(\d+)$/i);
  if (skMatch) return skMatch[1];
  const ukMatch = code.match(/^UK\s*0*(\d+)$/i);
  if (ukMatch) return '15';
  if (code === 'NEW') return 'New';
  return String(group.sort_order);
}

/** Build the A2 subtitle cell text for a group sheet */
export function getGroupTitle(group: Group): string {
  const code = (group.code || '').trim().toUpperCase();
  const leader = group.leader_name ? group.leader_name.trim() : '';
  const skMatch = code.match(/^SK\s*0*(\d+)$/i);
  if (skMatch) {
    const num = String(Number(skMatch[1])).padStart(2, '0');
    return `SK ID ${num}: ${leader}`;
  }
  const ukMatch = code.match(/^UK\s*0*(\d+)$/i);
  if (ukMatch) return `UK 01:- ${leader}`;
  if (code === 'NEW') return 'NEW YUVAK LIST ';
  return `${group.code}: ${leader}`;
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  left:   { style: 'thin', color: { argb: 'FF000000' } },
  right:  { style: 'thin', color: { argb: 'FF000000' } },
};

function applyBorder(row: ExcelJS.Row, startCol: number, endCol: number) {
  for (let c = startCol; c <= endCol; c++) {
    row.getCell(c).border = THIN_BORDER;
  }
}

function styleHeaderCell(
  cell: ExcelJS.Cell,
  value: ExcelJS.CellValue,
  fgArgb: string,
  size = 14,
  hAlign: ExcelJS.Alignment['horizontal'] = 'center',
) {
  cell.value = value;
  cell.font = { name: 'Calibri', size, bold: true, color: { argb: 'FF000000' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgArgb } };
  cell.alignment = { horizontal: hAlign, vertical: 'middle' };
}

type GroupStats = {
  group: Group;
  sheetName: string;
  firstDataRow: number;
  lastDataRow: number;
  bottomRow: number;
  dateStartCol: number; // 1-based column index of the first date column in this sheet
};

/** Main entry point – builds a complete ExcelJS workbook */
export async function generateAttendanceWorkbook({
  groups,
  yuvaks,
  dates,
  attendanceRecords,
  options,
}: {
  groups: Group[];
  yuvaks: Yuvak[];
  dates: string[];
  attendanceRecords: { session_date: string; yuvak_id: number }[];
  options: ExportOptions;
}): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gorwa Yuvak Mandal';
  wb.created = new Date();

  const includeDetails = options.includeDetails !== false;
  const markAbsent = Boolean(options.markAbsent);

  // Quick lookup: "yuvak_id|session_date" → present
  const presentSet = new Set(attendanceRecords.map((r) => `${r.yuvak_id}|${r.session_date}`));

  // Sabha year for titles
  const refDate = dates[0] || options.date || `${options.year ?? new Date().getFullYear()}-01-01`;
  const sabhaYear = Number(refDate.slice(0, 4)) || new Date().getFullYear();
  const yearRangeText = `${sabhaYear}-${String(sabhaYear + 1).slice(-2)}`;

  // Filter groups if admin picked one
  const singleGroupId = options.group && options.group !== 'all' ? Number(options.group) : null;
  const includedGroups = singleGroupId !== null
    ? groups.filter((g) => g.id === singleGroupId)
    : groups;

  // Map group_id → sheet name for yuvak bucketing
  const sheetNameByGroupId = new Map(groups.map((g) => [g.id, getSheetName(g)]));

  // Bucket yuvaks by sheet name
  const yuvaksBySheet = new Map<string, Yuvak[]>();
  for (const g of groups) yuvaksBySheet.set(getSheetName(g), []);
  if (!yuvaksBySheet.has('New')) yuvaksBySheet.set('New', []);

  for (const y of yuvaks) {
    const sName = y.group_id != null ? (sheetNameByGroupId.get(y.group_id) ?? 'New') : 'New';
    yuvaksBySheet.get(sName)?.push(y);
  }

  // Collect stats while building sheets, then build Master at the end
  const groupStatsBySheet = new Map<string, GroupStats>();

  // ─── 1. Group sheets ─────────────────────────────────────────────────────────
  for (const group of includedGroups) {
    const sheetName = getSheetName(group);
    const isNew = sheetName === 'New';

    const ws = wb.addWorksheet(sheetName, {
      properties: { defaultRowHeight: 20 },
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const members = [...(yuvaksBySheet.get(sheetName) ?? [])].sort((a, b) => {
      if (a.serial_no !== null && b.serial_no !== null) return a.serial_no - b.serial_no;
      if (a.serial_no !== null) return -1;
      if (b.serial_no !== null) return 1;
      return a.name.localeCompare(b.name);
    });

    // ── Column layout ──────────────────────────────────────────────────────────
    // Standard:  A=SR.NO, B=FormID, C=Name, D=BirthDate, E=Address, F=Mobile,
    //            G=WhatsApp, H=HomePhone, I=Education  → then dates → then TOTAL PRESENT
    // No-detail: A=SR.NO, B=FormID, C=Name → then dates → then TOTAL PRESENT
    // New-sheet: A=SR.NO, B=Name, C=BirthDate, D=Addr, E=Mobile,
    //            F=WhatsApp, G=HomePhone, H=Education, I=Remarks → then dates → TOTAL PRESENT
    // New no-detail: A=SR.NO, B=Name → then dates → TOTAL PRESENT

    let baseColCount: number;
    if (isNew) {
      baseColCount = includeDetails ? 9 : 2;
    } else {
      baseColCount = includeDetails ? 9 : 3;
    }
    const dateStartCol = baseColCount + 1; // 1-based
    const totalColIdx  = dateStartCol + dates.length; // 1-based TOTAL PRESENT col
    const totalCols    = totalColIdx;

    // Column widths
    if (isNew) {
      if (includeDetails) {
        ws.getColumn(1).width = 9.57;   // SR.NO
        ws.getColumn(2).width = 46.0;   // YUVAK NAME
        ws.getColumn(3).width = 18.29;  // BIRTH DATE
        ws.getColumn(4).width = 25.43;  // ADDRESS
        ws.getColumn(5).width = 20.14;  // MOBILE
        ws.getColumn(6).width = 16.57;  // WHATSAPP
        ws.getColumn(7).width = 17.14;  // HOME PHONE
        ws.getColumn(8).width = 16.86;  // EDUCATION DETAIL
        ws.getColumn(9).width = 54.29;  // REMARKS
      } else {
        ws.getColumn(1).width = 9.57;
        ws.getColumn(2).width = 46.0;
      }
    } else {
      if (includeDetails) {
        ws.getColumn(1).width = 9.29;   // SR.NO
        ws.getColumn(2).width = 10.14;  // Form ID
        ws.getColumn(3).width = 42.29;  // YUVAK NAME
        ws.getColumn(4).width = 14.86;  // BIRTH DATE
        ws.getColumn(5).width = 35.14;  // ADDRESS
        ws.getColumn(6).width = 15.86;  // MOBILE
        ws.getColumn(7).width = 14.57;  // WHATSAPP
        ws.getColumn(8).width = 17.57;  // HOME PHONE
        ws.getColumn(9).width = 15.71;  // EDUCATION DETAIL
      } else {
        ws.getColumn(1).width = 9.29;
        ws.getColumn(2).width = 10.14;
        ws.getColumn(3).width = 42.29;
      }
    }
    for (let i = 0; i < dates.length; i++) ws.getColumn(dateStartCol + i).width = 11.57;
    ws.getColumn(totalColIdx).width = 15;

    // ── Row 1: Main title ──────────────────────────────────────────────────────
    if (isNew) {
      const c = ws.getCell('A1');
      styleHeaderCell(c, 'NEW YUVAK LIST ', 'FFFFFFCC', 16, 'center');
    } else {
      const c = ws.getCell('A1');
      styleHeaderCell(c, `YUVAK SAMPARK LIST ${yearRangeText}`, 'FF8DB3E2', 18, 'center');
    }
    ws.mergeCells(1, 1, 1, totalCols);
    ws.getRow(1).height = 36;
    applyBorder(ws.getRow(1), 1, totalCols);

    // ── Row 2: Subtitle (group-sheet only) ────────────────────────────────────
    let headerRow: ExcelJS.Row;
    let dataStartRow: number;

    if (!isNew) {
      const c = ws.getCell('A2');
      styleHeaderCell(c, getGroupTitle(group), 'FFFFFFCC', 16, 'left');
      ws.mergeCells(2, 1, 2, totalCols);
      ws.getRow(2).height = 30;
      applyBorder(ws.getRow(2), 1, totalCols);
      headerRow = ws.getRow(3);
      dataStartRow = 4;
    } else {
      headerRow = ws.getRow(2);
      dataStartRow = 3;
    }

    // ── Header row ─────────────────────────────────────────────────────────────
    headerRow.height = 28;

    let baseHeaders: string[];
    if (isNew) {
      baseHeaders = includeDetails
        ? ['SR.NO', 'YUVAK NAME', 'BIRTH DATE', 'ADDRESS', 'MOBILE', 'WHATSAPP', 'HOME PHONE', 'EDUCATION DETAIL', 'REMARKS']
        : ['SR.NO', 'YUVAK NAME'];
    } else {
      baseHeaders = includeDetails
        ? ['SR.NO', 'Form ID', 'YUVAK NAME', 'BIRTH DATE', 'ADDRESS', 'MOBILE', 'WHATSAPP', 'HOME PHONE', 'EDUCATION DETAIL']
        : ['SR.NO', 'Form ID', 'YUVAK NAME'];
    }

    baseHeaders.forEach((h, idx) => {
      styleHeaderCell(headerRow.getCell(idx + 1), h, 'FFCCFFFF', 14, idx === (isNew ? 1 : 2) ? 'left' : 'center');
    });
    dates.forEach((d, idx) => {
      styleHeaderCell(headerRow.getCell(dateStartCol + idx), formatHeaderDate(d), 'FFD4FAFE', 14, 'center');
    });
    styleHeaderCell(headerRow.getCell(totalColIdx), 'TOTAL PRESENT', 'FFCCFFFF', 14, 'center');
    applyBorder(headerRow, 1, totalCols);

    // Freeze panes
    if (isNew) {
      ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
    } else {
      ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 3 }];
    }

    // ── Data rows ──────────────────────────────────────────────────────────────
    const firstDataRow = dataStartRow;
    let currRowIdx = firstDataRow;
    const firstDateColL = dates.length > 0 ? colLetter(dateStartCol) : 'A';
    const lastDateColL  = dates.length > 0 ? colLetter(dateStartCol + dates.length - 1) : 'A';
    const totalColL     = colLetter(totalColIdx);

    for (let mi = 0; mi < members.length; mi++) {
      const y = members[mi];
      const r = ws.getRow(currRowIdx);
      r.height = 24;

      if (isNew) {
        r.getCell(1).value = mi + 1;
        r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        if (includeDetails) {
          r.getCell(2).value = y.name;
          r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
          r.getCell(3).value = formatBirthDate(y.birth_date);
          r.getCell(3).numFmt = '@';
          r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
          r.getCell(4).value = y.address ?? '';
          r.getCell(4).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          r.getCell(5).value = y.mobile ?? '';
          r.getCell(5).numFmt = '@';
          r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
          r.getCell(6).value = y.whatsapp ?? '';
          r.getCell(6).numFmt = '@';
          r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
          r.getCell(7).value = y.home_phone ?? '';
          r.getCell(7).numFmt = '@';
          r.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
          r.getCell(8).value = y.education ?? '';
          r.getCell(8).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          r.getCell(9).value = y.remarks ?? '';
          r.getCell(9).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        } else {
          r.getCell(2).value = y.name;
          r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
        }
      } else {
        r.getCell(1).value = mi + 1;
        r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        r.getCell(2).value = y.form_id ?? '';
        r.getCell(2).numFmt = '@';
        r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        r.getCell(3).value = y.name;
        r.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
        if (includeDetails) {
          r.getCell(4).value = formatBirthDate(y.birth_date);
          r.getCell(4).numFmt = '@';
          r.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
          r.getCell(5).value = y.address ?? '';
          r.getCell(5).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          r.getCell(6).value = y.mobile ?? '';
          r.getCell(6).numFmt = '@';
          r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
          r.getCell(7).value = y.whatsapp ?? '';
          r.getCell(7).numFmt = '@';
          r.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
          r.getCell(8).value = y.home_phone ?? '';
          r.getCell(8).numFmt = '@';
          r.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
          r.getCell(9).value = y.education ?? '';
          r.getCell(9).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
      }

      // Attendance marks
      for (let dIdx = 0; dIdx < dates.length; dIdx++) {
        const c = r.getCell(dateStartCol + dIdx);
        const isPres = presentSet.has(`${y.id}|${dates[dIdx]}`);
        if (isPres) {
          c.value = 'P';
          c.font  = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF155724' } };
          c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        } else if (markAbsent) {
          c.value = 'A';
          c.font  = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF721C24' } };
          c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        } else {
          c.value = '';
        }
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // Per-row TOTAL PRESENT formula
      const rtc = r.getCell(totalColIdx);
      rtc.value = dates.length > 0
        ? { formula: `COUNTIF(${firstDateColL}${currRowIdx}:${lastDateColL}${currRowIdx},"P")` }
        : 0;
      rtc.font = { name: 'Calibri', size: 12, bold: true };
      rtc.alignment = { horizontal: 'center', vertical: 'middle' };

      for (let col = 1; col <= totalCols; col++) {
        const cell = r.getCell(col);
        if (!cell.font) cell.font = { name: 'Calibri', size: 12 };
      }
      applyBorder(r, 1, totalCols);
      currRowIdx++;
    }

    const lastDataRow = currRowIdx - 1;
    const bottomRow   = currRowIdx;

    // ── Bottom total row ───────────────────────────────────────────────────────
    const bRow = ws.getRow(bottomRow);
    bRow.height = 26;

    const totLabelCol = isNew ? 2 : 3;
    bRow.getCell(totLabelCol).value = 'TOTAL PRESENT';
    bRow.getCell(totLabelCol).font  = { name: 'Calibri', size: 14, bold: true };
    bRow.getCell(totLabelCol).alignment = { horizontal: 'left', vertical: 'middle' };

    for (let dIdx = 0; dIdx < dates.length; dIdx++) {
      const colL = colLetter(dateStartCol + dIdx);
      const c = bRow.getCell(dateStartCol + dIdx);
      c.value = members.length > 0
        ? { formula: `COUNTIF(${colL}${firstDataRow}:${colL}${lastDataRow},"P")` }
        : 0;
      c.font  = { name: 'Calibri', size: 14, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6D9F0' } };
    }

    const btc = bRow.getCell(totalColIdx);
    btc.value = members.length > 0
      ? { formula: `SUM(${totalColL}${firstDataRow}:${totalColL}${lastDataRow})` }
      : 0;
    btc.font  = { name: 'Calibri', size: 14, bold: true };
    btc.alignment = { horizontal: 'center', vertical: 'middle' };
    btc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6D9F0' } };

    applyBorder(bRow, 1, totalCols);

    groupStatsBySheet.set(sheetName, {
      group,
      sheetName,
      firstDataRow,
      lastDataRow: members.length > 0 ? lastDataRow : firstDataRow - 1,
      bottomRow,
      dateStartCol,
    });
  }

  // ─── 2. Master Sheet (built last so it can reference group sheets) ───────────
  //   ExcelJS addWorksheet always appends; we insert Master at position 0 later
  //   using the internal _worksheets array.
  const masterWs = wb.addWorksheet('Master', {
    properties: { defaultRowHeight: 20 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Move Master to first position in the internal ordered list
  // ExcelJS stores worksheets in wb._worksheets (1-indexed array, slot 0 is null)
  // We can use the public API: workbook reorder trick via orderId manipulation
  // Simpler: swap positions in the _worksheets array
  const ws_arr = (wb as unknown as { _worksheets: (ExcelJS.Worksheet | undefined)[] })._worksheets;
  const mPos = ws_arr.findIndex((w) => w && w.name === 'Master');
  if (mPos > 1) {
    // shift everything up by one, put Master at slot 1
    const mSheet = ws_arr[mPos];
    ws_arr.splice(mPos, 1);
    ws_arr.splice(1, 0, mSheet);
    // Re-assign orderNo so XML order is correct
    ws_arr.forEach((ws, i) => {
      if (ws) (ws as unknown as { orderNo: number }).orderNo = i;
    });
  }

  // Master columns:
  //   A(1) spacer | B(2) SR.NO | C(3) ID | D(4) NAME | E(5) TOTAL | F+(6+) dates
  masterWs.getColumn(1).width = 8.71;
  masterWs.getColumn(2).width = 9.0;
  masterWs.getColumn(3).width = 9.0;
  masterWs.getColumn(4).width = 36.0;
  masterWs.getColumn(5).width = 12.0;
  for (let i = 0; i < dates.length; i++) masterWs.getColumn(6 + i).width = 11.57;
  const masterEndCol = Math.max(8, 5 + dates.length); // min 8 to match template

  // Row 2: Title "SARVEXAN 2026-27"
  const mTitleCell = masterWs.getCell('B2');
  mTitleCell.value = `SARVEXAN ${sabhaYear} -${String(sabhaYear + 1).slice(-2)}`;
  mTitleCell.font  = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF000000' } };
  mTitleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5DFEC' } };
  mTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  masterWs.mergeCells(2, 2, 2, masterEndCol);
  masterWs.getRow(2).height = 32;
  applyBorder(masterWs.getRow(2), 2, masterEndCol);

  // Row 3: Headers
  const mHdr = masterWs.getRow(3);
  mHdr.height = 26;
  [null, 'SR. NO.', 'ID', 'NAME', 'TOTAL'].forEach((v, i) => {
    if (v === null) return;
    const cell = mHdr.getCell(i + 1); // B=2,C=3,D=4,E=5 → indices 2..5
    styleHeaderCell(cell, v, 'FFB8CCE4', 12, i === 3 ? 'left' : 'center');
  });
  for (let i = 0; i < dates.length; i++) {
    const cell = mHdr.getCell(6 + i);
    styleHeaderCell(cell, formatHeaderDate(dates[i]), 'FFB8CCE4', 12, 'center');
  }
  applyBorder(mHdr, 2, masterEndCol);

  // Rows 4+: one per group
  let mRowIdx = 4;
  const startMRow = 4;

  for (let gi = 0; gi < includedGroups.length; gi++) {
    const group = includedGroups[gi];
    const sName = getSheetName(group);
    const stats = groupStatsBySheet.get(sName);
    const r = masterWs.getRow(mRowIdx);
    r.height = 22;

    r.getCell(2).value = gi + 1;
    r.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(3).value = group.code;
    r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(4).value = group.leader_name ? group.leader_name.trim() : '';
    r.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };

    // TOTAL = count of yuvaks in that group sheet
    if (stats && stats.lastDataRow >= stats.firstDataRow) {
      r.getCell(5).value = {
        formula: `COUNT('${sName}'!A${stats.firstDataRow}:A${stats.lastDataRow})`,
      };
    } else {
      r.getCell(5).value = 0;
    }
    r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

    // Per-date present totals: link to group sheet's bottom row date columns
    for (let dIdx = 0; dIdx < dates.length; dIdx++) {
      const c = r.getCell(6 + dIdx);
      if (stats) {
        const groupDateColL = colLetter(stats.dateStartCol + dIdx);
        c.value = { formula: `'${sName}'!${groupDateColL}${stats.bottomRow}` };
      } else {
        c.value = 0;
      }
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    for (let c = 2; c <= masterEndCol; c++) {
      r.getCell(c).font = { name: 'Calibri', size: 12, bold: true };
    }
    applyBorder(r, 2, masterEndCol);
    mRowIdx++;
  }

  const lastMRow = mRowIdx - 1;
  const totalMRowIdx = mRowIdx;

  // Bottom TOTAL row
  const mTotRow = masterWs.getRow(totalMRowIdx);
  mTotRow.height = 26;

  mTotRow.getCell(2).value = 'TOTAL';
  masterWs.mergeCells(totalMRowIdx, 2, totalMRowIdx, 4);
  mTotRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

  if (includedGroups.length > 0) {
    mTotRow.getCell(5).value = { formula: `SUM(E${startMRow}:E${lastMRow})` };
  } else {
    mTotRow.getCell(5).value = 0;
  }
  mTotRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

  for (let dIdx = 0; dIdx < dates.length; dIdx++) {
    const colL = colLetter(6 + dIdx);
    const c = mTotRow.getCell(6 + dIdx);
    c.value = includedGroups.length > 0
      ? { formula: `SUM(${colL}${startMRow}:${colL}${lastMRow})` }
      : 0;
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  for (let c = 2; c <= masterEndCol; c++) {
    const cell = mTotRow.getCell(c);
    cell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6D9F0' } };
  }
  applyBorder(mTotRow, 2, masterEndCol);

  return wb;
}
