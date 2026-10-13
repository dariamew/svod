import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseFile } from '../server/parsers.mjs';
import { textPdf } from './support/pdf.mjs';
test('CSV with BOM, quoted product names and decimal comma', async () => {
  const buffer = Buffer.from('\uFEFFНаименование;Цена;Ед. изм.\r\n"Цемент, 50 кг";"1 234,50";мешок');
  const parsed = await parseFile({ originalname: 'price.csv', buffer });
  assert.equal(parsed.rows[0][0], 'Цемент, 50 кг'); assert.equal(parsed.mapping.price, 1);
});
test('CP1251 CSV decoding', async () => {
  const buffer = Buffer.from([0xcd,0xe0,0xe8,0xec,0xe5,0xed,0xee,0xe2,0xe0,0xed,0xe8,0xe5,0x3b,0xd6,0xe5,0xed,0xe0,0x0a,0xd2,0xee,0xe2,0xe0,0xf0,0x3b,0x31,0x32,0x30]);
  const parsed = await parseFile({ originalname: 'price.csv', buffer }); assert.equal(parsed.rows[0][0], 'Товар');
});
test('XLSX skips intro and empty sheets, supports worksheet selection and formula results', async () => {
  const wb = new ExcelJS.Workbook(); wb.addWorksheet('Пустой');
  const sheet = wb.addWorksheet('Прайс'); sheet.addRow(['Прайс поставщика']); sheet.addRow(['Наименование', 'Цена']); sheet.addRow(['Клей', { formula: '100*2', result: 200 }]);
  wb.addWorksheet('Второй').addRows([['Name', 'Price'], ['Paint', 500]]);
  const parsed = await parseFile({ originalname: 'price.xlsx', buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
  assert.equal(parsed.rows[0][1], 200); assert.equal(parsed.sheet, 'Прайс'); assert.equal(parsed.sheets.length, 2);
});
test('Text PDF table is extracted', async () => {
  const buffer = textPdf(['Name;Price;Unit;Discount', 'Item A;510;pcs;5', 'Item B;345;pcs;0', 'Item C;680;pcs;7']);
  const parsed = await parseFile({ originalname: 'price.pdf', buffer });
  assert.equal(parsed.rows.length, 3); assert.equal(parsed.mapping.price, 1); assert.equal(parsed.rows[0][0], 'Item A');
});
test('Unsupported format, invalid signatures and empty input fail clearly', async () => {
  await assert.rejects(parseFile({ originalname: 'price.exe', buffer: Buffer.from('test') }), /Поддерживаются/);
  await assert.rejects(parseFile({ originalname: 'price.xlsx', buffer: Buffer.from('test') }), /корректным XLSX/);
  await assert.rejects(parseFile({ originalname: 'price.pdf', buffer: Buffer.from('test') }), /корректным PDF/);
  await assert.rejects(parseFile({ originalname: 'price.csv', buffer: Buffer.from('') }), /не содержит/);
});
