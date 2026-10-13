import path from 'node:path';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { clean, detectMapping } from './normalize.mjs';
import { settings } from '../shared/config.mjs';

function table(matrix) {
  const populated = matrix.filter(row => row.some(cell => clean(cell)));
  if (!populated.length) throw new Error('Файл не содержит табличных данных.');
  const headerIndex = populated.slice(0, 30).findIndex(row => { const m = detectMapping(row); return m.name >= 0 && m.price >= 0; });
  const start = Math.max(0, headerIndex);
  const headers = populated[start].map((cell, index) => clean(cell) || `Колонка ${index + 1}`);
  if (headers.length > settings.maxColumns) throw new Error(`В файле больше ${settings.maxColumns} колонок.`);
  const rows = populated.slice(start + 1).map(row => headers.map((_, index) => row[index] ?? ''));
  if (!rows.length) throw new Error('После заголовков нет строк с товарами.');
  if (rows.length > settings.maxRows) throw new Error(`В файле больше ${settings.maxRows} строк. Разделите прайс.`);
  return { headers, rows, mapping: detectMapping(headers) };
}
function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result ?? '';
    if ('richText' in value) return value.richText.map(part => part.text).join('');
    if ('text' in value) return value.text;
  }
  return value ?? '';
}
async function parsePdf(buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false });
  let doc;
  try { doc = await task.promise; }
  catch (error) { throw new Error(error.name === 'PasswordException' ? 'Снимите пароль с PDF и загрузите файл повторно.' : 'Не удалось прочитать PDF. Проверьте файл.'); }
  try {
    if (doc.numPages > settings.maxPdfPages) throw new Error(`В PDF больше ${settings.maxPdfPages} страниц.`);
    const matrix = [];
    let columnPositions;
    for (let pageIndex = 1; pageIndex <= doc.numPages; pageIndex++) {
      const page = await doc.getPage(pageIndex);
      const content = await page.getTextContent();
      const lines = [];
      for (const item of content.items.filter(item => 'str' in item && clean(item.str))) {
        const y = item.transform[5];
        let line = lines.find(line => Math.abs(line.y - y) < 3);
        if (!line) { line = { y, parts: [] }; lines.push(line); }
        line.parts.push({ text: item.str, x: item.transform[4], width: item.width });
      }
      for (const line of lines.sort((a, b) => b.y - a.y)) {
        const parts = line.parts.sort((a, b) => a.x - b.x);
        const joined = parts.map(p => p.text).join(' ');
        if (/[;|\t]/.test(joined)) { matrix.push(joined.split(/[;|\t]/).map(clean)); continue; }
        const chunks = [];
        for (const part of parts) {
          const last = chunks.at(-1);
          if (last && part.x - last.end < 12) { last.text += ' ' + part.text; last.end = part.x + part.width; }
          else chunks.push({ text: part.text, x: part.x, end: part.x + part.width });
        }
        const candidate = chunks.map(c => clean(c.text));
        const detected = detectMapping(candidate);
        if (detected.name >= 0 && detected.price >= 0) {
          if (!columnPositions) { columnPositions = chunks.map(c => c.x); matrix.push(candidate); }
          continue;
        }
        if (columnPositions) {
          const row = columnPositions.map(() => '');
          for (const part of parts) {
            let col = 0;
            for (let i = 1; i < columnPositions.length; i++) if (part.x >= columnPositions[i] - 8) col = i;
            row[col] = clean(row[col] + ' ' + part.text);
          }
          matrix.push(row);
        } else if (candidate.length > 1) matrix.push(candidate);
      }
    }
    if (!matrix.length) throw new Error('В PDF нет текстовой таблицы. Распознайте скан или загрузите Excel.');
    return table(matrix);
  } finally { await doc.destroy(); }
}
export async function parseFile(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension === '.csv') {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer); }
    catch { text = new TextDecoder('windows-1251').decode(file.buffer); }
    const result = Papa.parse(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
    if (result.errors.some(e => e.type === 'Quotes')) throw new Error('Повреждён CSV: проверьте кавычки и разделители.');
    return { ...table(result.data), sheet: null };
  }
  if (extension === '.xlsx') {
    if (file.buffer.subarray(0, 2).toString() !== 'PK') throw new Error('Файл не является корректным XLSX.');
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(file.buffer); }
    catch { throw new Error('Не удалось прочитать Excel. Сохраните файл в формате XLSX.'); }
    const sheets = [];
    for (const sheet of workbook.worksheets) {
      if (sheet.rowCount > settings.maxRows + 40 || sheet.columnCount > settings.maxColumns) throw new Error(`Файл превышает лимит: ${settings.maxRows} строк и ${settings.maxColumns} колонок.`);
      const matrix = [];
      sheet.eachRow(row => { const cells = []; row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cellValue(cell); }); matrix.push(cells); });
      try { sheets.push({ name: sheet.name, ...table(matrix) }); } catch { /* Empty and non-tabular worksheets are not price lists. */ }
    }
    if (!sheets.length) throw new Error('В Excel не найдено таблиц с товарами.');
    return { ...sheets[0], sheet: sheets[0].name, sheets };
  }
  if (extension === '.pdf') {
    if (!file.buffer.subarray(0, 5).toString().startsWith('%PDF-')) throw new Error('Файл не является корректным PDF.');
    return { ...await parsePdf(file.buffer), sheet: null };
  }
  throw new Error('Поддерживаются PDF, CSV и Excel (.xlsx). Для .xls сохраните файл в .xlsx.');
}
