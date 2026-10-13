import test from 'node:test';
import assert from 'node:assert/strict';
import { groupProducts } from '../src/lib/data.ts';
const suppliers = [{ id: 'a', reliability: 80 }, { id: 'b', reliability: 95 }, { id: 'c', reliability: 90 }];
const offer = (id, supplier, amount, product = 'cement|шт') => ({ id, supplier_id: supplier, product_key: product, name: 'Цемент', category: 'Смеси', unit: 'шт', price: 1000, discount: 10, effective_price: amount });
test('Best price uses effective price; ties prefer reliability; selection is preserved', () => {
  const products = groupProducts([offer('oa', 'a', 500), offer('ob', 'b', 500), offer('oc', 'c', 600)], [{ product_key: 'cement|шт', offer_id: 'oc' }], suppliers);
  assert.equal(products[0].best.id, 'ob'); assert.equal(products[0].selected.id, 'oc'); assert.equal(products[0].max, 600); assert.equal(products[0].median, 500);
});
test('Even-sized medians and units do not create false savings or matches', () => {
  const products = groupProducts([offer('oa', 'a', 500), offer('ob', 'b', 600), offer('oc', 'c', 100, 'cement|кг')], [], suppliers);
  assert.equal(products.length, 2); const piece = products.find(p => p.key === 'cement|шт'); assert.equal(piece.median, 550); assert.equal(piece.median - piece.best.effective_price, 50);
  const single = products.find(p => p.key === 'cement|кг'); assert.equal(single.median - single.best.effective_price, 0);
});
