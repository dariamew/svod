export interface User { id: string; name: string; email: string }
export interface Supplier { id: string; name: string; specialization: string; reliability: number; discount: number; color: string; created_at: string }
export interface Offer { id: string; supplier_id: string; product_key: string; name: string; sku: string; category: string; unit: string; price: number; discount: number; effective_price: number; updated_at: string }
export interface ImportError { row: number; name: string; reason: string }
export interface ImportRecord { id: string; supplier_id: string; supplier_name: string; filename: string; format: string; count: number; skipped: number; errors: ImportError[]; created_at: string }
export interface AppData { suppliers: Supplier[]; offers: Offer[]; imports: ImportRecord[]; selections: { product_key: string; offer_id: string }[] }
export interface Product { key: string; name: string; category: string; unit: string; offers: Offer[]; best: Offer; max: number; median: number; selected?: Offer }
export function groupProducts(offers: Offer[], selections: AppData['selections'], suppliers: Supplier[]): Product[] {
  const groups = new Map<string, Offer[]>(), selectedMap = new Map(selections.map(s => [s.product_key, s.offer_id]));
  const supplierMap = new Map(suppliers.map(s => [s.id, s]));
  for (const offer of offers) { const group = groups.get(offer.product_key) ?? []; group.push(offer); groups.set(offer.product_key, group); }
  return [...groups.entries()].map(([key, group]) => {
    group.sort((a, b) => a.effective_price - b.effective_price || (supplierMap.get(b.supplier_id)?.reliability ?? 0) - (supplierMap.get(a.supplier_id)?.reliability ?? 0) || a.supplier_id.localeCompare(b.supplier_id));
    const mid = Math.floor(group.length / 2), median = group.length % 2 ? group[mid].effective_price : (group[mid - 1].effective_price + group[mid].effective_price) / 2;
    return { key, name: group[0].name, category: group[0].category, unit: group[0].unit, offers: group, best: group[0], max: group.at(-1)!.effective_price, median, selected: group.find(o => o.id === selectedMap.get(key)) };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
let locale = 'ru-RU', timezone = 'Europe/Moscow';
let formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
export function configureFormatting(config: { locale: string; timezone: string; currency: string }) {
  locale = config.locale; timezone = config.timezone;
  formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: config.currency, maximumFractionDigits: 2 });
}
export const money = (n: number) => formatter.format(n);
export const integer = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
export const date = (iso: string, full = false) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: full ? 'long' : 'short', ...(full ? { year: 'numeric' } : {}), timeZone: timezone }).format(new Date(iso));
export function downloadCsv(filename: string, rows: unknown[][]) {
  const escape = (value: unknown) => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
