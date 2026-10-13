export const fields = {
  name: ['наименование', 'название', 'товар', 'номенклатура', 'наименование товара', 'product', 'name', 'product name', 'description'],
  price: ['цена', 'стоимость', 'цена руб', 'цена за единицу', 'price', 'cost', 'unit price', 'цена с ндс'],
  unit: ['ед', 'ед изм', 'единица', 'единица измерения', 'unit', 'uom'],
  sku: ['артикул', 'код', 'sku', 'код товара', 'article'],
  discount: ['скидка', 'скидка %', 'discount', 'discount %'],
  category: ['категория', 'группа', 'category', 'специализация'],
  currency: ['валюта', 'currency'],
};
export const clean = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const headerKey = value => clean(value).toLowerCase().replace(/[.()₽]/g, '').replace(/\s+/g, ' ').trim();
export function detectMapping(headers) {
  return Object.fromEntries(Object.entries(fields).map(([field, aliases]) => [field, headers.findIndex(h => aliases.includes(headerKey(h)))]));
}
export function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let text = clean(value).replace(/(?:руб\.?|rub|rur|₽|%)/gi, '').replace(/[\s\u00a0\u202f]/g, '');
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else text = text.replace(',', '.');
  return /^[+-]?\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
}
export function normalizeUnit(value) {
  const unit = clean(value).toLowerCase().replace(/\.$/, '');
  return ({ 'шт': 'шт', 'штука': 'шт', 'штук': 'шт', 'pcs': 'шт', 'pc': 'шт', 'кг': 'кг', 'kg': 'кг', 'килограмм': 'кг', 'м': 'м', 'm': 'м', 'метр': 'м', 'м2': 'м²', 'м²': 'м²', 'm2': 'м²', 'м3': 'м³', 'м³': 'м³', 'л': 'л', 'l': 'л', 'уп': 'упак', 'упак': 'упак', 'упаковка': 'упак', 'pack': 'упак', 'меш': 'мешок', 'мешок': 'мешок' })[unit] ?? (unit || 'шт');
}
export function productKey(name, unit) {
  // Preserve sizes, brands and model numbers. No fuzzy matching of incompatible products.
  return clean(name).toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”]/g, '').replace(/\s*([×xх])\s*(?=\d)/g, 'x').replace(/\s+/g, ' ').trim() + '|' + normalizeUnit(unit);
}
export function normalizeRows(rows, mapping, supplierDiscount = 0) {
  if (!Number.isInteger(mapping.name) || mapping.name < 0 || !Number.isInteger(mapping.price) || mapping.price < 0) throw new Error('Укажите колонки с наименованием и ценой.');
  const items = [], errors = [], seen = new Set();
  for (const [index, row] of rows.entries()) {
    if (row.every(cell => !clean(cell))) continue;
    const read = field => mapping[field] >= 0 ? row[mapping[field]] : '';
    const name = clean(read('name')), price = numberValue(read('price'));
    const rawDiscount = read('discount');
    const discount = clean(rawDiscount) === '' ? supplierDiscount : numberValue(rawDiscount);
    const currency = clean(read('currency')).toUpperCase();
    const unit = normalizeUnit(read('unit'));
    const roundedPrice = Math.round(price * 100) / 100;
    const effectivePrice = Math.round(roundedPrice * (1 - discount / 100) * 100) / 100;
    let reason;
    if (!name || name.length > 300) reason = 'Название отсутствует или длиннее 300 символов';
    else if (!Number.isFinite(price) || price <= 0 || price > 1e10) reason = 'Цена должна быть положительным числом';
    else if (!Number.isFinite(discount) || discount < 0 || discount >= 100) reason = 'Скидка должна быть от 0 до 99,99%';
    else if (roundedPrice <= 0 || effectivePrice <= 0) reason = 'Цена после округления и скидки должна быть не меньше 0,01 ₽';
    else if (currency && !['RUB', 'RUR', 'РУБ', 'РУБ.', '₽', 'РОССИЙСКИЙ РУБЛЬ'].includes(currency)) reason = 'Укажите цену в рублях';
    const key = productKey(name, unit);
    if (!reason && seen.has(key)) reason = 'Дублирующийся товар с той же единицей измерения';
    if (reason) { errors.push({ row: index + 2, name: name || 'Без названия', reason }); continue; }
    seen.add(key);
    items.push({ name, key, price: roundedPrice, unit, discount, effectivePrice, sku: clean(read('sku')).slice(0, 100), category: clean(read('category')).slice(0, 100) || 'Без категории', currency: 'RUB', sourceRow: index + 2 });
  }
  return { items, errors, totalRows: items.length + errors.length };
}
