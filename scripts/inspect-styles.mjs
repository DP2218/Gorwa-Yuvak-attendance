import ExcelJS from 'exceljs';

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('templates/GORWA_YUVAK_MASTER_LIST_2026.xlsx');

  console.log('Worksheet names:', wb.worksheets.map(ws => ws.name));

  const master = wb.getWorksheet('Master');
  console.log('--- MASTER ---');
  console.log('Master views:', master.views);
  console.log('Master B2 fill:', JSON.stringify(master.getCell('B2').fill));
  console.log('Master B2 font:', JSON.stringify(master.getCell('B2').font));
  console.log('Master B2 alignment:', JSON.stringify(master.getCell('B2').alignment));
  console.log('Master B2 border:', JSON.stringify(master.getCell('B2').border));
  console.log('Master B3 (header) fill:', JSON.stringify(master.getCell('B3').fill));
  console.log('Master B3 (header) font:', JSON.stringify(master.getCell('B3').font));
  console.log('Master B3 (header) border:', JSON.stringify(master.getCell('B3').border));
  console.log('Master B4 font:', JSON.stringify(master.getCell('B4').font));
  console.log('Master B4 border:', JSON.stringify(master.getCell('B4').border));
  console.log('Master B19 (total) fill:', JSON.stringify(master.getCell('B19').fill));
  console.log('Master B19 (total) font:', JSON.stringify(master.getCell('B19').font));
  console.log('Master B19 (total) border:', JSON.stringify(master.getCell('B19').border));

  for (let c = 1; c <= 8; c++) {
    const col = master.getColumn(c);
    console.log(`Master Col ${c} (${col.letter}): width=${col.width}`);
  }

  const s1 = wb.getWorksheet('1');
  console.log('\n--- SHEET 1 ---');
  console.log('Sheet 1 views:', JSON.stringify(s1.views));
  console.log('Sheet 1 A1 fill:', JSON.stringify(s1.getCell('A1').fill));
  console.log('Sheet 1 A1 font:', JSON.stringify(s1.getCell('A1').font));
  console.log('Sheet 1 A1 alignment:', JSON.stringify(s1.getCell('A1').alignment));
  console.log('Sheet 1 A2 fill:', JSON.stringify(s1.getCell('A2').fill));
  console.log('Sheet 1 A2 font:', JSON.stringify(s1.getCell('A2').font));
  console.log('Sheet 1 A2 alignment:', JSON.stringify(s1.getCell('A2').alignment));

  console.log('Sheet 1 A3 (header SR.NO) fill:', JSON.stringify(s1.getCell('A3').fill));
  console.log('Sheet 1 A3 font:', JSON.stringify(s1.getCell('A3').font));
  console.log('Sheet 1 A3 border:', JSON.stringify(s1.getCell('A3').border));
  console.log('Sheet 1 C3 (header NAME) fill:', JSON.stringify(s1.getCell('C3').fill));
  console.log('Sheet 1 J3 (header Date) fill:', JSON.stringify(s1.getCell('J3').fill));
  console.log('Sheet 1 J3 font:', JSON.stringify(s1.getCell('J3').font));
  console.log('Sheet 1 J3 numFmt:', JSON.stringify(s1.getCell('J3').numFmt));

  console.log('Sheet 1 A4 (data) border:', JSON.stringify(s1.getCell('A4').border));
  console.log('Sheet 1 A4 font:', JSON.stringify(s1.getCell('A4').font));
  console.log('Sheet 1 E4 (ADDRESS) alignment:', JSON.stringify(s1.getCell('E4').alignment));

  for (let c = 1; c <= 15; c++) {
    const col = s1.getColumn(c);
    console.log(`Sheet 1 Col ${c} (${col.letter}): width=${col.width}`);
  }

  const sNew = wb.getWorksheet('New');
  console.log('\n--- SHEET NEW ---');
  console.log('Sheet New views:', JSON.stringify(sNew.views));
  console.log('Sheet New A1 fill:', JSON.stringify(sNew.getCell('A1').fill));
  console.log('Sheet New A1 font:', JSON.stringify(sNew.getCell('A1').font));
  console.log('Sheet New A2 (header) fill:', JSON.stringify(sNew.getCell('A2').fill));
  console.log('Sheet New A2 font:', JSON.stringify(sNew.getCell('A2').font));
  for (let c = 1; c <= 12; c++) {
    const col = sNew.getColumn(c);
    console.log(`Sheet New Col ${c} (${col.letter}): width=${col.width}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
