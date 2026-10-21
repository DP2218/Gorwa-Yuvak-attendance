import XLSX from 'xlsx';

const wb = XLSX.readFile('templates/GORWA_YUVAK_MASTER_LIST_2026.xlsx', { cellStyles: true, cellNF: true, cellDates: true, cellFormula: true });

console.log('--- MASTER SHEET ---');
const mWs = wb.Sheets['Master'];
console.log('Merges:', mWs['!merges']);
for (let r = 1; r <= 25; r++) {
  const row = [];
  for (let c = 0; c <= 10; c++) {
    const addr = XLSX.utils.encode_cell({ r: r - 1, c });
    const cell = mWs[addr];
    if (cell) {
      row.push(`${addr}: ${cell.f ? '=' + cell.f : cell.v}`);
    }
  }
  if (row.length) console.log(`Row ${r}:`, row.join(' | '));
}

console.log('\n--- SHEET 1 ---');
const ws1 = wb.Sheets['1'];
console.log('Merges:', ws1['!merges']);
for (let r = 1; r <= 7; r++) {
  const row = [];
  for (let c = 0; c <= 15; c++) {
    const addr = XLSX.utils.encode_cell({ r: r - 1, c });
    const cell = ws1[addr];
    if (cell) {
      row.push(`${addr}: ${cell.f ? '=' + cell.f : cell.v}`);
    }
  }
  if (row.length) console.log(`Row ${r}:`, row.join(' | '));
}

console.log('\n--- SHEET NEW ---');
const wsNew = wb.Sheets['New'];
console.log('Merges:', wsNew['!merges']);
for (let r = 1; r <= 7; r++) {
  const row = [];
  for (let c = 0; c <= 15; c++) {
    const addr = XLSX.utils.encode_cell({ r: r - 1, c });
    const cell = wsNew[addr];
    if (cell) {
      row.push(`${addr}: ${cell.f ? '=' + cell.f : cell.v}`);
    }
  }
  if (row.length) console.log(`Row ${r}:`, row.join(' | '));
}
