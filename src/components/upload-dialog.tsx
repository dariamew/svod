import { useEffect, useRef, useState } from 'react'
import { UploadCloud, FileSpreadsheet, FileText, Check, ArrowRight, ArrowLeft, Loader2, X, AlertTriangle, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, post } from '@/lib/api'
import { money, downloadCsv, type Supplier, type ImportError } from '@/lib/data'

interface NormalizedItem { name: string; price: number; unit: string; discount: number; effectivePrice: number; category: string; sku: string; sourceRow: number }
interface Preview { id: string; filename: string; headers: string[]; rows: unknown[][]; mapping: Record<string, number>; sheet: string | null; sheets?: { name: string; headers: string[]; rows: unknown[][]; mapping: Record<string, number> }[]; normalized: { items: NormalizedItem[]; errors: ImportError[]; totalRows: number } }
const mappingFields = [['name', 'Наименование *'], ['price', 'Цена *'], ['unit', 'Единица'], ['discount', 'Скидка, %'], ['sku', 'Артикул'], ['category', 'Категория'], ['currency', 'Валюта']];
interface UploadLimits { uploadBytes: number; maxRows: number; maxColumns: number }

export function UploadDialog({ open, onOpenChange, suppliers, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; suppliers: Supplier[]; onSaved: () => Promise<void> }) {
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [dragging, setDragging] = useState(false), [file, setFile] = useState<File | null>(null);
  const [supplierId, setSupplierId] = useState('new'), [name, setName] = useState(''), [specialization, setSpecialization] = useState(''), [reliability, setReliability] = useState(''), [discount, setDiscount] = useState('0');
  const [limits, setLimits] = useState<UploadLimits | null>(null);
  useEffect(() => { api<UploadLimits>('/config').then(setLimits).catch(() => setError('Не удалось получить параметры загрузки. Откройте форму повторно.')); }, [open]);
  const [preview, setPreview] = useState<Preview | null>(null), [mapping, setMapping] = useState<Record<string, number>>({}), [sheet, setSheet] = useState('');
  const [items, setItems] = useState<NormalizedItem[]>([]), [page, setPage] = useState(0), [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const supplier = suppliers.find(s => s.id === supplierId);
  function close(v: boolean) { if (busy) return; onOpenChange(v); if (!v) { setStep(0); setFile(null); setPreview(null); setItems([]); setName(''); setSpecialization(''); setReliability(''); setDiscount('0'); setSupplierId('new'); setError(''); setPage(0); } }
  function chooseFile(candidate?: File) {
    if (!candidate) return;
    if (!/\.(pdf|csv|xlsx)$/i.test(candidate.name)) { setError('Выберите PDF, CSV или Excel (.xlsx). Для .xls сохраните файл в .xlsx.'); return; }
    if (!limits) { setError('Параметры загрузки ещё не получены. Повторите выбор файла.'); return; }
    if (candidate.size > limits.uploadBytes) { setError(`Файл больше ${limits.uploadBytes / 1024 / 1024} МБ.`); return; }
    setFile(candidate); setError('');
  }
  async function parse() {
    if (!file) return;
    if (supplierId === 'new' && !name.trim()) { setError('Укажите название поставщика.'); return; }
    if (supplierId === 'new' && (reliability === '' || Number(reliability) < 0 || Number(reliability) > 100)) { setError('Укажите надёжность от 0 до 100%.'); return; }
    setBusy(true); setError('');
    try { const form = new FormData(); form.append('file', file); const result = await api<Preview>('/uploads/preview', { method: 'POST', body: form }); setPreview(result); setMapping(result.mapping); setSheet(result.sheet ?? ''); setStep(1); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function normalize() {
    setBusy(true); setError('');
    try { const result = await post<Preview>(`/uploads/${preview!.id}/normalize`, { mapping, sheet, discount: supplier?.discount ?? Number(discount) }); setPreview(result); setItems(result.normalized.items); setPage(0); setStep(2); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError('');
    try { const result = await post<{ count: number }>('/imports', { previewId: preview!.id, supplierId: supplierId === 'new' ? undefined : supplierId, supplier: { name, specialization, reliability: Number(reliability), discount: Number(discount) }, items }); await onSaved(); onOpenChange(false); setStep(0); setFile(null); setPreview(null); setItems([]); setName(''); setSpecialization(''); setReliability(''); setDiscount('0'); setSupplierId('new'); setPage(0); toast.success(`Загружено позиций: ${result.count}`); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function update(index: number, field: keyof NormalizedItem, value: string | number) { setItems(previous => previous.map((item, i) => i === index ? { ...item, [field]: value } : item)); }
  const errors = preview?.normalized.errors ?? [];
  return <Dialog open={open} onOpenChange={close}><DialogContent className="upload-dialog"><DialogHeader><DialogTitle>Загрузить прайс</DialogTitle><DialogDescription className="sr-only">Файл, колонки и проверка строк</DialogDescription></DialogHeader>
    <div className="upload-steps">{['Файл', 'Колонки', 'Проверка'].map((label, index) => <div key={label} className={step >= index ? 'active' : ''}><span>{step > index ? <Check size={14}/> : index + 1}</span>{label}</div>)}</div>
    <div className="upload-body">
    {step === 0 && <div className="grid gap-5"><div role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }} onClick={() => fileInput.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files[0]); }} className={`dropzone ${dragging ? 'dragging' : ''}`} aria-label="Выбрать прайс-лист"><span className="drop-icon">{file ? <FileSpreadsheet size={28}/> : <UploadCloud size={28}/>}</span><strong>{file ? file.name : 'Выберите или перетащите файл'}</strong><p>{file ? `${(file.size / 1024).toFixed(0)} КБ` : `PDF, CSV, XLSX${limits ? ` · до ${limits.uploadBytes / 1024 / 1024} МБ` : ''}`}</p></div><input ref={fileInput} className="sr-only" type="file" accept=".pdf,.csv,.xlsx" aria-label="Файл прайс-листа" onChange={e => chooseFile(e.target.files?.[0])}/>
      <div className="grid gap-2"><Label htmlFor="upload-supplier">Поставщик</Label><Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger id="upload-supplier" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="new">Новый поставщик</SelectItem>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
      {supplierId === 'new' ? <><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label htmlFor="upload-name">Название поставщика *</Label><Input id="upload-name" value={name} onChange={e => setName(e.target.value)} maxLength={100}/></div><div className="grid gap-2"><Label htmlFor="upload-spec">Специализация</Label><Input id="upload-spec" value={specialization} onChange={e => setSpecialization(e.target.value)} maxLength={100}/></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label htmlFor="upload-rel">Надёжность, % *</Label><Input id="upload-rel" type="number" value={reliability} min={0} max={100} onChange={e => setReliability(e.target.value)}/></div><div className="grid gap-2"><Label htmlFor="upload-discount">Скидка по умолчанию, %</Label><Input id="upload-discount" type="number" value={discount} min={0} max={99.99} step="0.01" onChange={e => setDiscount(e.target.value)}/></div></div></> : <p className="info-note"><AlertTriangle size={16}/> Прайс заменит текущие позиции поставщика.</p>}
      <p className="field-hint">Цены в рублях. PDF с текстовой таблицей.</p>
    </div>}
    {step === 1 && preview && <div className="grid gap-5"><div className="file-summary"><FileText size={21}/><div><strong>{preview.filename}</strong><p>Строк: {preview.rows.length} · Колонок: {preview.headers.length}</p></div></div>
      {(preview.sheets?.length ?? 0) > 1 && <div className="grid gap-2"><Label>Лист Excel</Label><Select value={sheet} onValueChange={v => { setSheet(v); const s = preview.sheets!.find(s => s.name === v)!; setMapping(s.mapping); setPreview({ ...preview, headers: s.headers, rows: s.rows, sheet: s.name }); }}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{preview.sheets!.map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}</SelectContent></Select></div>}
      <p className="field-hint">Укажите колонки наименования и цены.</p><div className="mapping-grid">{mappingFields.map(([key, label]) => <div key={key} className="grid gap-2"><Label htmlFor={`mapping-${key}`}>{label}</Label><Select value={String(mapping[key] ?? -1)} onValueChange={v => setMapping({ ...mapping, [key]: Number(v) })}><SelectTrigger id={`mapping-${key}`} className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="-1">Не использовать</SelectItem>{preview.headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}</SelectContent></Select></div>)}</div>
      <div><h4 className="text-sm font-semibold mb-2">Исходные данные · первые 3 строки</h4><div className="rounded-lg border overflow-auto"><Table><TableHeader><TableRow>{preview.headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{preview.rows.slice(0, 3).map((row, i) => <TableRow key={i}>{row.map((cell, j) => <TableCell key={j} className="max-w-64 truncate">{String(cell ?? '')}</TableCell>)}</TableRow>)}</TableBody></Table></div></div></div>}
    {step === 2 && preview && <div className="grid gap-4"><div className="review-summary"><span><Check size={17}/>Позиций: <strong>{items.length}</strong></span>{errors.length > 0 && <span className="warning-badge"><AlertTriangle size={16}/>Пропущено: {errors.length}</span>}</div>
      <p className="field-hint">Для сравнения товаров должны совпадать названия и единицы.</p>
      <div className="rounded-lg border overflow-auto"><Table><TableHeader><TableRow><TableHead>Наименование</TableHead><TableHead>Ед.</TableHead><TableHead>Цена, ₽</TableHead><TableHead>Скидка, %</TableHead><TableHead>Итого</TableHead><TableHead/></TableRow></TableHeader><TableBody>{items.slice(page * 25, page * 25 + 25).map((item, localIndex) => { const index = page * 25 + localIndex; return <TableRow key={`${page}-${localIndex}`}><TableCell className="min-w-64"><Input aria-label={`Название строки ${index + 1}`} value={item.name} onChange={e => update(index, 'name', e.target.value)}/></TableCell><TableCell><Input className="w-16" aria-label={`Единица строки ${index + 1}`} value={item.unit} onChange={e => update(index, 'unit', e.target.value)}/></TableCell><TableCell><Input className="w-25" aria-label={`Цена строки ${index + 1}`} type="number" min={0.01} step="0.01" value={item.price} onChange={e => update(index, 'price', Number(e.target.value))}/></TableCell><TableCell><Input className="w-20" aria-label={`Скидка строки ${index + 1}`} type="number" min={0} max={99.99} step="0.01" value={item.discount} onChange={e => update(index, 'discount', Number(e.target.value))}/></TableCell><TableCell className="whitespace-nowrap font-medium">{money(Math.round(item.price * (1 - item.discount / 100) * 100) / 100)}</TableCell><TableCell><Button variant="ghost" size="icon" aria-label={`Убрать строку ${index + 1}`} onClick={() => { setItems(items.filter((_, i) => i !== index)); setPage(Math.min(page, Math.max(0, Math.ceil((items.length - 1) / 25) - 1))); }}><X size={14}/></Button></TableCell></TableRow>})}</TableBody></Table></div>
      {items.length > 25 && <div className="flex justify-between items-center text-xs muted"><span>Страница {page + 1} из {Math.ceil(items.length / 25)}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Назад</Button><Button size="sm" variant="outline" disabled={(page + 1) * 25 >= items.length} onClick={() => setPage(page + 1)}>Далее</Button></div></div>}
      {errors.length > 0 && <details className="error-details"><summary>Ошибки: {errors.length}</summary><div className="max-h-40 overflow-auto mt-2">{errors.slice(0, 50).map(e => <p key={e.row}>Строка {e.row}: {e.name} — {e.reason}</p>)}</div><Button variant="ghost" size="sm" onClick={() => downloadCsv('ошибки.csv', [['Строка', 'Наименование', 'Причина'], ...errors.map(e => [e.row, e.name, e.reason])])}><Download size={14}/>Скачать ошибки</Button></details>}
      {supplierId !== 'new' && <p className="info-note"><AlertTriangle size={16}/> Будут заменены позиции «{supplier?.name}» и их сохранённый выбор.</p>}
    </div>}
    {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
    </div><div className="upload-footer"><Button variant="outline" disabled={busy} onClick={() => step === 0 ? close(false) : setStep(step - 1)}>{step > 0 && <ArrowLeft size={15}/>} {step === 0 ? 'Отмена' : 'Назад'}</Button><Button disabled={busy || !limits || (step === 0 && (!file || (supplierId === 'new' && (!name.trim() || reliability === '')))) || (step === 1 && (mapping.name < 0 || mapping.price < 0)) || (step === 2 && !items.length)} onClick={() => void (step === 0 ? parse() : step === 1 ? normalize() : confirm())}>{busy ? <Loader2 className="animate-spin"/> : step === 2 ? <Check size={16}/> : <ArrowRight size={16}/>} {busy ? 'Обработка…' : step === 0 ? 'Далее' : step === 1 ? 'Проверить' : `Загрузить · ${items.length}`}</Button></div>
  </DialogContent></Dialog>
}
