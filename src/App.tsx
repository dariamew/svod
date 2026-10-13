import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LayoutDashboard, FileSpreadsheet, Building2, BookmarkCheck, Upload, ArrowUpRight, Search, SlidersHorizontal, Download, Plus, ShieldCheck, CircleHelp, LogOut, Menu, X, Check, Tag, TrendingDown, Package, Loader2, ChevronLeft, ChevronRight, Pencil, Info, RefreshCw } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { toast, Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Brand } from '@/components/brand'
import { AuthScreen } from '@/components/auth-screen'
import { SupplierDialog } from '@/components/supplier-dialog'
import { UploadDialog } from '@/components/upload-dialog'
import { api, post } from '@/lib/api'
import { configureFormatting, groupProducts, money, integer, date, downloadCsv, type AppData, type User, type Supplier, type ImportRecord } from '@/lib/data'

type View = 'overview' | 'catalog' | 'suppliers' | 'imports' | 'selected'
const navigation = [
  { id: 'overview' as View, title: 'Обзор', icon: LayoutDashboard },
  { id: 'catalog' as View, title: 'Сравнение цен', icon: FileSpreadsheet },
  { id: 'suppliers' as View, title: 'Поставщики', icon: Building2 },
  { id: 'imports' as View, title: 'Прайс-листы', icon: Upload },
  { id: 'selected' as View, title: 'Выбранные', icon: BookmarkCheck },
]
const emptyData: AppData = { suppliers: [], offers: [], imports: [], selections: [] }

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [data, setData] = useState<AppData>(emptyData)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState<View>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier>()
  const [comparisonKey, setComparisonKey] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [report, setReport] = useState<ImportRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [specFilter, setSpecFilter] = useState('all')
  const [reliabilityFilter, setReliabilityFilter] = useState('0')
  const [onlyDiscount, setOnlyDiscount] = useState(false)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(0)

  useEffect(() => {
    api<{ locale: string; timezone: string; currency: string }>('/config').then(configureFormatting).catch(() => {})
    api<User>('/auth/me').then(setUser).catch(() => {}).finally(() => setInitializing(false))
    const expired = () => { setUser(null); setData(emptyData); toast.error('Войдите повторно') }
    window.addEventListener('session-expired', expired)
    return () => window.removeEventListener('session-expired', expired)
  }, [])
  const refresh = useCallback(async () => {
    setLoading(true); setLoadError('')
    try { setData(await api<AppData>('/data')) }
    catch (e) { setLoadError((e as Error).message); throw e }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (user) void refresh().catch(() => {}) }, [user, refresh])
  useEffect(() => { setPage(0) }, [search, supplierFilter, specFilter, reliabilityFilter, onlyDiscount, minPrice, maxPrice, sort, view])

  const supplierMap = useMemo(() => new Map(data.suppliers.map(s => [s.id, s])), [data.suppliers])
  const allProducts = useMemo(() => groupProducts(data.offers, data.selections, data.suppliers), [data])
  const filteredSuppliers = data.suppliers.filter(s => (supplierFilter === 'all' || s.id === supplierFilter) && (specFilter === 'all' || s.specialization === specFilter) && s.reliability >= Number(reliabilityFilter))
  const allowedSupplierIds = new Set(filteredSuppliers.map(s => s.id))
  const filteredOffers = data.offers.filter(o => allowedSupplierIds.has(o.supplier_id) && (!onlyDiscount || o.discount > 0) && (!minPrice || o.effective_price >= Number(minPrice)) && (!maxPrice || o.effective_price <= Number(maxPrice)) && (!search || [o.name, o.sku, o.category, supplierMap.get(o.supplier_id)?.name].join(' ').toLowerCase().includes(search.toLowerCase())))
  const products = groupProducts(filteredOffers, data.selections, data.suppliers)
  const comparable = products.filter(p => p.offers.length > 1)
  const basket = products.reduce((sum, p) => sum + p.best.effective_price, 0)
  const medianBasket = products.reduce((sum, p) => sum + p.median, 0)
  const savings = medianBasket - basket
  const savedCount = allProducts.filter(p => p.selected).length
  const displayedProducts = (view === 'selected' ? products.filter(p => p.selected) : products).sort((a, b) => sort === 'price' ? a.best.effective_price - b.best.effective_price : sort === 'savings' ? (b.median - b.best.effective_price) - (a.median - a.best.effective_price) : a.name.localeCompare(b.name, 'ru'))
  const comparison = allProducts.find(p => p.key === comparisonKey)
  const chartData = filteredSuppliers.map(s => {
    const gaps = comparable.flatMap(p => { const o = p.offers.find(o => o.supplier_id === s.id); return o ? [100 * (o.effective_price / p.best.effective_price - 1)] : [] })
    return { name: s.name, gap: gaps.length ? Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1)) : 0, count: gaps.length, color: s.color }
  }).filter(s => s.count > 0)
  const activeFilterCount = Number(supplierFilter !== 'all') + Number(specFilter !== 'all') + Number(reliabilityFilter !== '0') + Number(onlyDiscount) + Number(!!minPrice || !!maxPrice)
  function resetFilters() { setSearch(''); setSupplierFilter('all'); setSpecFilter('all'); setReliabilityFilter('0'); setOnlyDiscount(false); setMinPrice(''); setMaxPrice('') }
  function navigate(next: View) { setView(next); setSidebarOpen(false); setSearch('') }
  async function chooseOffer(offerId: string) {
    setSaving(true)
    try { await post('/selections', { offerId }); await refresh(); toast.success('Предложение выбрано') }
    catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }
  async function chooseBest() {
    setSaving(true)
    try { await post('/selections/best', { offerIds: products.map(p => p.best.id) }); await refresh(); toast.success(`Выбрано предложений: ${products.length}`) }
    catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }
  function exportProducts() {
    downloadCsv(view === 'selected' ? 'выбранные.csv' : 'сравнение-цен.csv', [['Товар', 'Категория', 'Единица', 'Поставщик', 'Надёжность, %', 'Цена, ₽', 'Скидка, %', 'Цена со скидкой, ₽', 'Выбрано'], ...displayedProducts.map(p => {
      const o = view === 'selected' ? p.selected! : p.best, s = supplierMap.get(o.supplier_id)!
      return [p.name, p.category, p.unit, s.name, s.reliability, o.price, o.discount, o.effective_price, o.id === p.selected?.id ? 'Да' : 'Нет']
    })])
  }
  async function logout() {
    try { await post('/auth/logout', {}); setUser(null); setData(emptyData); resetFilters(); setView('overview') }
    catch (e) { toast.error((e as Error).message) }
  }
  if (initializing) return <div className="app-loading"><Brand/><Loader2 className="animate-spin" aria-label="Загрузка"/></div>
  if (!user) return <><AuthScreen onLogin={setUser}/><Toaster richColors position="bottom-right"/></>
  const pageSize = view === 'overview' ? 6 : 12
  const lastPage = Math.max(0, Math.ceil(displayedProducts.length / pageSize) - 1)
  const safePage = Math.min(page, lastPage)
  const title = navigation.find(n => n.id === view)!.title

  return <TooltipProvider><div className="app-shell">
    {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню"/>}
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <button className="brand-link" onClick={() => navigate('overview')} aria-label="Свод — обзор"><Brand/></button>
      <nav aria-label="Разделы">{navigation.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={18}/><span>{item.title}</span>{item.id === 'suppliers' && data.suppliers.length > 0 && <small>{data.suppliers.length}</small>}{item.id === 'selected' && savedCount > 0 && <small>{savedCount}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setHelpOpen(true)}><CircleHelp size={18}/>Справка</button>
        <div className="profile"><span className="profile-avatar">{user.name[0]?.toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><IconAction label="Выйти" onClick={() => void logout()}><LogOut size={17}/></IconAction></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="topbar-path"><Button className="mobile-menu" variant="ghost" size="icon" aria-label="Открыть меню" onClick={() => setSidebarOpen(true)}><Menu size={20}/></Button><span>Закупки</span><span className="path-divider">/</span><strong>{title}</strong></div><IconAction label="Справка" onClick={() => setHelpOpen(true)}><CircleHelp size={18}/></IconAction></header>
      <main className="main-content"><div className="page-heading"><h1>{title}</h1><Button onClick={() => view === 'suppliers' ? (setEditingSupplier(undefined), setSupplierOpen(true)) : setUploadOpen(true)}><Plus size={17}/>{view === 'suppliers' ? 'Добавить поставщика' : 'Загрузить прайс'}</Button></div>
        {loadError && <div role="alert" className="error-banner"><span>{loadError}</span><Button variant="outline" size="sm" onClick={() => void refresh().catch(() => {})}><RefreshCw size={14}/>Повторить</Button></div>}
        {loading && !data.offers.length && !loadError ? <div className="empty-state"><Loader2 className="animate-spin" aria-label="Загрузка"/></div> : <>
          {['overview', 'catalog', 'selected'].includes(view) && <>
            {view === 'overview' && <div className="stats-grid">
              <Stat title="Поставщики" value={integer(new Set(filteredOffers.map(o => o.supplier_id)).size)} icon={<Building2 size={18}/>} hint="Поставщики с предложениями по текущим фильтрам"/>
              <Stat title="Товары" value={integer(products.length)} icon={<Package size={18}/>} detail={`Для сравнения: ${comparable.length}`} hint="Товар считается сопоставимым при совпадении наименования и единицы"/>
              <Stat title="Разница с медианой" value={money(savings)} icon={<TrendingDown size={18}/>} detail={`${medianBasket ? (savings / medianBasket * 100).toFixed(1).replace('.', ',') : '0'}%`} accent hint="Разница медианной и минимальной стоимости корзины: по одной единице каждого товара, с учётом фильтров"/>
              <Stat title="Со скидкой" value={integer(filteredOffers.filter(o => o.discount > 0).length)} icon={<Tag size={18}/>} detail={`Предложений: ${filteredOffers.length}`} hint="Предложения со скидкой в текущей выборке"/>
            </div>}
            <section className="filter-panel" aria-label="Фильтры предложений"><div className="filter-main">
              <div className="search-box"><Search size={17}/><Input aria-label="Поиск товаров и поставщиков" value={search} onChange={e => setSearch(e.target.value)} placeholder="Товар, артикул, поставщик"/></div>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}><SelectTrigger className="supplier-filter" aria-label="Поставщик"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Все поставщики</SelectItem>{data.suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
              <Select value={specFilter} onValueChange={setSpecFilter}><SelectTrigger className="spec-filter" aria-label="Специализация"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Все специализации</SelectItem>{[...new Set(data.suppliers.map(s => s.specialization))].map(s => <SelectItem value={s} key={s}>{s}</SelectItem>)}</SelectContent></Select>
              <Button variant={filtersExpanded ? 'secondary' : 'outline'} aria-expanded={filtersExpanded} onClick={() => setFiltersExpanded(!filtersExpanded)}><SlidersHorizontal size={16}/>Фильтры{activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}</Button>
            </div>{filtersExpanded && <div className="filter-extra">
              <div className="price-range"><span>Цена, ₽</span><Input aria-label="Минимальная цена" type="number" min={0} placeholder="От" value={minPrice} onChange={e => setMinPrice(e.target.value)}/><span>—</span><Input aria-label="Максимальная цена" type="number" min={0} placeholder="До" value={maxPrice} onChange={e => setMaxPrice(e.target.value)}/></div>
              <div className="reliability-range"><ShieldCheck size={16}/><Input aria-label="Минимальная надёжность" type="number" min={0} max={100} value={reliabilityFilter === '0' ? '' : reliabilityFilter} placeholder="Надёжность от, %" onChange={e => setReliabilityFilter(e.target.value || '0')}/></div>
              <label className="discount-toggle"><Checkbox checked={onlyDiscount} onCheckedChange={v => setOnlyDiscount(v === true)}/>Со скидкой</label><Button variant="ghost" size="sm" onClick={resetFilters}>Сбросить<X size={14}/></Button>
            </div>}{minPrice && maxPrice && Number(minPrice) > Number(maxPrice) && <p className="form-error">Цена «от» превышает цену «до»</p>}</section>
            {view === 'overview' && products.length > 0 && <div className="insight-grid">
              <Card className="price-chart"><div className="panel-heading"><h2>Отклонение цен</h2><Hint text="Среднее отклонение от минимальной цены по сопоставимым товарам. Скидки учтены; ассортимент поставщиков может различаться."/></div>
                {chartData.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={230}><BarChart data={chartData} margin={{ top: 12, right: 8, left: -18, bottom: 5 }} barSize={38}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--border)"/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} interval={0} tickMargin={12}/><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickFormatter={value => `${value}%`}/><ChartTooltip cursor={{ fill: 'var(--muted)' }} content={({ active, payload }) => active && payload?.length ? <div className="chart-tooltip"><strong>{String(payload[0].payload.name)}</strong><p>+{String(payload[0].value)}%</p><small>Товаров: {String(payload[0].payload.count)}</small></div> : null}/><Bar dataKey="gap" radius={[3, 3, 0, 0]} minPointSize={3}>{chartData.map(s => <Cell key={s.name} fill={s.color}/>)}</Bar></BarChart></ResponsiveContainer></div> : <div className="chart-empty">Нет сопоставимых предложений</div>}
              </Card>
              <Card className="basket-card"><div className="panel-heading"><h2>Корзина</h2><Hint text="По одной единице каждого товара. Доставка и дополнительные условия не учтены."/></div><dl><div><dt>Минимальная стоимость</dt><dd>{money(basket)}</dd></div><div><dt>Медианная стоимость</dt><dd>{money(medianBasket)}</dd></div><div className="basket-difference"><dt>Разница</dt><dd>{money(savings)}</dd></div></dl><Button disabled={saving} onClick={() => void chooseBest()}>{saving ? <Loader2 className="animate-spin"/> : <BookmarkCheck size={16}/>}Выбрать минимальные цены</Button></Card>
            </div>}
            <Card className="products-panel"><div className="panel-heading"><div className="panel-title"><h2>{view === 'selected' ? 'Выбранные предложения' : 'Предложения'}</h2><span className="count-pill">{displayedProducts.length}</span></div><div className="panel-actions">
              {view === 'catalog' && <Button variant="outline" size="sm" disabled={saving || !products.length} onClick={() => void chooseBest()}><BookmarkCheck size={15}/>Выбрать минимум</Button>}
              <Button variant="outline" size="sm" disabled={!displayedProducts.length} onClick={exportProducts}><Download size={15}/>Экспорт</Button>
            </div></div>
              {displayedProducts.length > 0 ? <>
                <div className="table-toolbar"><span>Цены со скидкой, ₽ за единицу</span><Select value={sort} onValueChange={setSort}><SelectTrigger className="sort-select" aria-label="Сортировка"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="name">По названию</SelectItem><SelectItem value="price">По цене</SelectItem><SelectItem value="savings">По разнице с медианой</SelectItem></SelectContent></Select></div>
                <Table><TableHeader><TableRow><TableHead>Товар</TableHead><TableHead>Предложений</TableHead><TableHead>Диапазон цен</TableHead><TableHead>{view === 'selected' ? 'Выбрано' : 'Минимальная цена'}</TableHead><TableHead>К медиане, %</TableHead><TableHead/></TableRow></TableHeader><TableBody>{displayedProducts.slice(safePage * pageSize, safePage * pageSize + pageSize).map(p => {
                  const o = view === 'selected' ? p.selected! : p.best, s = supplierMap.get(o.supplier_id)!
                  return <TableRow key={p.key} className="product-row" onClick={() => setComparisonKey(p.key)}><TableCell><div className="product-name">{p.name}{p.selected && <Hint text="Предложение выбрано" icon={<Check size={14}/>}/>}</div><div className="product-meta">{p.category} · {p.unit}</div></TableCell><TableCell>{p.offers.length}</TableCell><TableCell className="price-range-cell">{p.offers.length > 1 ? `${money(p.best.effective_price)} — ${money(p.max)}` : money(p.best.effective_price)}</TableCell><TableCell><div className="offer-price">{money(o.effective_price)}{o.discount > 0 && <span className="mini-discount">−{o.discount}%</span>}</div><div className="product-meta">{s.name}</div></TableCell><TableCell>{p.offers.length > 1 ? <span className="saving-badge">{((p.median - o.effective_price) / p.median * 100).toFixed(1).replace('.', ',')}%</span> : <span className="muted">—</span>}</TableCell><TableCell><Button variant="ghost" size="icon-sm" aria-label={`Сравнить ${p.name}`}><ArrowUpRight size={16}/></Button></TableCell></TableRow>
                })}</TableBody></Table>
                <div className="table-footer"><span>{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, displayedProducts.length)} из {displayedProducts.length}</span><div><Button variant="outline" size="icon-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Предыдущая страница"><ChevronLeft size={16}/></Button><span>{safePage + 1}</span><Button variant="outline" size="icon-sm" disabled={safePage >= lastPage} onClick={() => setPage(safePage + 1)} aria-label="Следующая страница"><ChevronRight size={16}/></Button></div></div>
              </> : <Empty icon={<FileSpreadsheet size={26}/>} title={view === 'selected' ? 'Нет выбранных предложений' : data.offers.length ? 'Нет результатов' : 'Нет предложений'} description={view === 'selected' ? 'Выберите предложение в сравнении цен.' : data.offers.length ? 'Измените фильтры.' : 'Загрузите прайс-лист поставщика.'} action={<Button variant="outline" onClick={view === 'selected' ? () => navigate('catalog') : data.offers.length ? resetFilters : () => setUploadOpen(true)}>{view === 'selected' ? 'Сравнить цены' : data.offers.length ? 'Сбросить фильтры' : 'Загрузить прайс'}</Button>}/>}</Card>
            {view === 'selected' && displayedProducts.length > 0 && <div className="selection-total"><span>Итого · позиций: {displayedProducts.length}</span><strong>{money(displayedProducts.reduce((sum, p) => sum + p.selected!.effective_price, 0))}</strong><Hint text="Стоимость по одной единице каждой выбранной позиции"/></div>}
          </>}
          {view === 'suppliers' && <Card className="suppliers-panel"><div className="panel-heading"><div className="search-box"><Search size={17}/><Input aria-label="Поиск поставщиков" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поставщик или специализация"/></div><span className="count-pill">{data.suppliers.length}</span></div>
            {data.suppliers.length ? <Table><TableHeader><TableRow><TableHead>Поставщик</TableHead><TableHead>Специализация</TableHead><TableHead>Надёжность, %</TableHead><TableHead>Скидка, %</TableHead><TableHead>Позиций</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.suppliers.filter(s => `${s.name} ${s.specialization}`.toLowerCase().includes(search.toLowerCase())).map(s => {
              const offers = data.offers.filter(o => o.supplier_id === s.id)
              return <TableRow key={s.id}><TableCell className="supplier-name"><span className="supplier-avatar" style={{ color: s.color }}><Building2 size={19}/></span><strong>{s.name}</strong></TableCell><TableCell>{s.specialization}</TableCell><TableCell><span className="reliability-value"><ShieldCheck size={14}/>{s.reliability}</span></TableCell><TableCell>{s.discount || '—'}</TableCell><TableCell>{offers.length}</TableCell><TableCell><div className="row-actions"><IconAction label={`Сравнить предложения ${s.name}`} disabled={!offers.length} onClick={() => { resetFilters(); setSupplierFilter(s.id); navigate('catalog') }}><ArrowUpRight size={16}/></IconAction><IconAction label={`Редактировать ${s.name}`} onClick={() => { setEditingSupplier(s); setSupplierOpen(true) }}><Pencil size={15}/></IconAction></div></TableCell></TableRow>
            })}</TableBody></Table> : <Empty icon={<Building2 size={26}/>} title="Нет поставщиков" action={<Button variant="outline" onClick={() => { setEditingSupplier(undefined); setSupplierOpen(true) }}>Добавить поставщика</Button>}/>}</Card>}
          {view === 'imports' && <Card className="imports-panel"><div className="panel-heading"><div className="panel-title"><h2>Загрузки</h2><span className="count-pill">{data.imports.length}</span></div></div>
            {data.imports.length ? <Table><TableHeader><TableRow><TableHead>Файл</TableHead><TableHead>Поставщик</TableHead><TableHead>Дата</TableHead><TableHead>Позиций</TableHead><TableHead>Результат</TableHead><TableHead/></TableRow></TableHeader><TableBody>{data.imports.map(r => <TableRow key={r.id}><TableCell><div className="file-name"><FileSpreadsheet size={19}/><strong>{r.filename}</strong></div></TableCell><TableCell>{r.supplier_name}</TableCell><TableCell className="nowrap">{date(r.created_at, true)}</TableCell><TableCell>{integer(r.count)}</TableCell><TableCell><span className={r.skipped ? 'warning-badge' : 'status-badge'}>{r.skipped ? `Пропущено: ${r.skipped}` : 'Загружен'}</span></TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => setReport(r)}>Отчёт<ArrowUpRight size={14}/></Button></TableCell></TableRow>)}</TableBody></Table> : <Empty icon={<Upload size={26}/>} title="Нет прайс-листов" action={<Button variant="outline" onClick={() => setUploadOpen(true)}>Загрузить прайс</Button>}/>}</Card>}
        </>}
      </main>
    </div>
    <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} suppliers={data.suppliers} onSaved={refresh}/>
    <SupplierDialog open={supplierOpen} onOpenChange={setSupplierOpen} supplier={editingSupplier} onSaved={refresh}/>
    <Dialog open={!!comparison} onOpenChange={v => !v && setComparisonKey(null)}><DialogContent className="compare-dialog"><DialogHeader><DialogTitle>{comparison?.name}</DialogTitle><DialogDescription>Цена за {comparison?.unit} · Все предложения</DialogDescription></DialogHeader>{comparison && <><div className="compare-offers">{comparison.offers.map((o, index) => {
      const s = supplierMap.get(o.supplier_id)!
      return <div key={o.id} className={`compare-offer ${index === 0 ? 'best' : ''}`}><div className="compare-supplier"><strong>{s.name}</strong><small><ShieldCheck size={13}/>{s.reliability}%<Hint text="Оценка пользователя"/></small>{index === 0 && <span className="status-badge">Минимум</span>}</div><div className="compare-price"><div><strong>{money(o.effective_price)}</strong>{o.discount > 0 && <small><s>{money(o.price)}</s><span>−{o.discount}%</span></small>}</div><Button variant={comparison.selected?.id === o.id ? 'secondary' : index === 0 ? 'default' : 'outline'} size="sm" disabled={saving || comparison.selected?.id === o.id} onClick={() => void chooseOffer(o.id)}>{comparison.selected?.id === o.id ? <><Check size={14}/>Выбрано</> : 'Выбрать'}</Button></div></div>
    })}</div><p className="field-hint">Доставка не учтена. Здесь показаны все предложения по товару, независимо от фильтров.</p></>}</DialogContent></Dialog>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent><DialogHeader><DialogTitle>Правила сравнения</DialogTitle><DialogDescription className="sr-only">Форматы прайс-листов и расчёт стоимости</DialogDescription></DialogHeader><dl className="help-rules"><div><dt>Товары</dt><dd>Совпадают наименование и единица измерения. Разные названия можно исправить перед загрузкой.</dd></div><div><dt>Цена</dt><dd>В рублях, после скидки. НДС берётся из исходной цены. Доставка не учитывается.</dd></div><div><dt>Надёжность</dt><dd>Оценка пользователя. При одинаковой цене первым показан поставщик с более высокой оценкой.</dd></div><div><dt>Обновление прайса</dt><dd>Заменяет текущие позиции поставщика. История загрузок сохраняется.</dd></div><div><dt>PDF</dt><dd>Нужна текстовая таблица. Скан следует предварительно распознать.</dd></div></dl></DialogContent></Dialog>
    <Dialog open={!!report} onOpenChange={v => !v && setReport(null)}><DialogContent><DialogHeader><DialogTitle>Отчёт о загрузке</DialogTitle><DialogDescription>{report?.filename}</DialogDescription></DialogHeader>{report && <><div className="report-counts"><div><span>Загружено</span><strong>{report.count}</strong></div><div><span>Пропущено</span><strong>{report.skipped}</strong></div></div><dl className="report-details"><div><dt>Поставщик</dt><dd>{report.supplier_name}</dd></div><div><dt>Дата</dt><dd>{date(report.created_at, true)}</dd></div></dl>{report.errors.length > 0 && <><div className="report-errors">{report.errors.map(e => <p key={e.row}><strong>Строка {e.row}</strong> · {e.name}<br/>{e.reason}</p>)}</div><Button variant="outline" onClick={() => downloadCsv('ошибки.csv', [['Строка', 'Наименование', 'Причина'], ...report.errors.map(e => [e.row, e.name, e.reason])])}><Download size={15}/>Скачать ошибки</Button></>}{report.skipped > report.errors.length && <p className="field-hint">Удалено вручную: {report.skipped - report.errors.length}</p>}</>}</DialogContent></Dialog>
    <Toaster richColors position="bottom-right"/>
  </div></TooltipProvider>
}

function IconAction({ label, children, onClick, disabled }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}
function Hint({ text, icon = <Info size={14}/> }: { text: string; icon?: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild><button type="button" className="hint-icon" aria-label={text}>{icon}</button></TooltipTrigger><TooltipContent className="max-w-72">{text}</TooltipContent></Tooltip>
}
function Stat({ title, value, icon, detail, accent, hint }: { title: string; value: string; icon: ReactNode; detail?: string; accent?: boolean; hint: string }) {
  return <Card className={`stat-card ${accent ? 'accent' : ''}`}><div className="stat-top"><span>{title}</span><Hint text={hint} icon={icon}/></div><strong>{value}</strong>{detail && <p>{detail}</p>}</Card>
}
function Empty({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>
}
