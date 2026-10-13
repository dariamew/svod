import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMapping, numberValue, normalizeRows, normalizeUnit, productKey } from '../server/normalize.mjs';
test('Localized prices, separators and discounts', () => {
  assert.equal(numberValue('1 234,50 ₽'), 1234.5);
  assert.equal(numberValue('1.234,50 руб.'), 1234.5);
  assert.equal(numberValue('1,234.50 RUB'), 1234.5);
  assert.ok(Number.isNaN(numberValue('по запросу')));
  const result = normalizeRows([['Цемент', '1 000,50', 'kg', '10%'], ['Клей', 100, 'шт', '']], { name: 0, price: 1, unit: 2, discount: 3 }, 5);
  assert.equal(result.items[0].effectivePrice, 900.45);
  assert.equal(result.items[1].effectivePrice, 95);
  assert.equal(result.items[0].unit, 'кг');
});
test('Invalid prices, currencies, discounts and duplicates are reported', () => {
  const { items, errors } = normalizeRows([['Цемент', 100, 'шт', 0, 'RUB'], ['цемент', 120, 'pcs', 0, 'RUB'], ['Клей', 0, 'шт', 0, 'RUB'], ['Штукатурка', 20, 'шт', 100, 'RUB'], ['Краска', 10, 'шт', 0, 'USD']], { name: 0, price: 1, unit: 2, discount: 3, currency: 4 });
  assert.equal(items.length, 1); assert.equal(errors.length, 4); assert.equal(errors[0].row, 3);
  assert.equal(normalizeRows([['Слишком мало', 0.001, 0], ['Обнуление скидкой', 1, 99.99]], { name: 0, price: 1, discount: 2 }).errors.length, 2);
});
test('Product keys preserve specifications and normalize equivalent notation', () => {
  assert.equal(productKey(' Саморез 3,5 × 35 ', 'шт.'), productKey('саморез 3,5x35', 'pcs'));
  assert.notEqual(productKey('Цемент М500, 50 кг', 'мешок'), productKey('Цемент М500, 25 кг', 'мешок'));
  assert.notEqual(productKey('Краска', 'л'), productKey('Краска', 'шт'));
  assert.equal(normalizeUnit('м2'), 'м²');
});
test('Russian and English headers are mapped', () => {
  assert.deepEqual(detectMapping(['Артикул', 'Наименование', 'Цена (₽)', 'Ед. изм.', 'Скидка %']), { name: 1, price: 2, unit: 3, sku: 0, discount: 4, category: -1, currency: -1 });
});
