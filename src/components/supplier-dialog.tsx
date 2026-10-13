import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { api, post } from '@/lib/api'
import type { Supplier } from '@/lib/data'
export function SupplierDialog({ open, onOpenChange, supplier, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; supplier?: Supplier; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(''), [specialization, setSpecialization] = useState(''), [reliability, setReliability] = useState(''), [discount, setDiscount] = useState('0'), [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(supplier?.name ?? ''); setSpecialization(supplier?.specialization ?? ''); setReliability(supplier ? String(supplier.reliability) : ''); setDiscount(String(supplier?.discount ?? 0)); } }, [open, supplier]);
  async function save() {
    setBusy(true); try { const body = { name, specialization, reliability: Number(reliability), discount: Number(discount) }; if (supplier) await api(`/suppliers/${supplier.id}`, { method: 'PATCH', body: JSON.stringify(body) }); else await post('/suppliers', body); await onSaved(); onOpenChange(false); toast.success(supplier ? 'Поставщик обновлён' : 'Поставщик добавлен'); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={v => !busy && onOpenChange(v)}><DialogContent><DialogHeader><DialogTitle>{supplier ? 'Поставщик' : 'Новый поставщик'}</DialogTitle><DialogDescription className="sr-only">Данные поставщика</DialogDescription></DialogHeader><form onSubmit={e => { e.preventDefault(); void save(); }} className="grid gap-5">
    <div className="grid gap-2"><Label htmlFor="supplier-name">Название</Label><Input id="supplier-name" value={name} onChange={e => setName(e.target.value)} required maxLength={100}/></div>
    <div className="grid gap-2"><Label htmlFor="supplier-specialization">Специализация</Label><Input id="supplier-specialization" value={specialization} onChange={e => setSpecialization(e.target.value)} maxLength={100}/></div>
    <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label htmlFor="reliability">Надёжность, %</Label><Input id="reliability" type="number" min={0} max={100} step="0.1" required value={reliability} onChange={e => setReliability(e.target.value)}/></div><div className="grid gap-2"><Label htmlFor="discount">Скидка по умолчанию, %</Label><Input id="discount" type="number" min={0} max={99.99} step="0.01" required value={discount} onChange={e => setDiscount(e.target.value)}/></div></div>
    <p className="field-hint">Надёжность — ваша оценка. Скидка действует при следующей загрузке, если в прайсе не указана другая.</p>
    <DialogFooter><Button variant="outline" type="button" disabled={busy} onClick={() => onOpenChange(false)}>Отмена</Button><Button disabled={busy}>{busy && <Loader2 className="animate-spin"/>}Сохранить</Button></DialogFooter>
  </form></DialogContent></Dialog>
}
