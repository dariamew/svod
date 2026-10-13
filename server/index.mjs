import express from 'express';
import multer from 'multer';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { openDatabase } from './database.mjs';
import { parseFile } from './parsers.mjs';
import { clean, normalizeRows } from './normalize.mjs';
import { settings, supplierColor } from '../shared/config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = settings.port;
const db = openDatabase(process.env.DATA_DIR || path.join(root, 'data'));
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    const allowed = new Set(process.env.ALLOWED_ORIGINS?.split(',').map(value => value.trim()) || [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://127.0.0.1:${settings.clientPort}`, `http://localhost:${settings.clientPort}`]);
    if (!allowed.has(req.headers.origin)) return res.status(403).json({ error: 'Запрос с другого сайта запрещён.' });
  }
  next();
});
app.use(express.json({ limit: '8mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: settings.uploadBytes, files: 1, fields: 5 } });
const hash = value => createHash('sha256').update(value).digest('hex');
function passwordHash(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
function verifyPassword(password, stored) { const [salt, encoded] = stored.split(':'); const key = Buffer.from(encoded, 'hex'); return key.length === 64 && timingSafeEqual(key, scryptSync(password, salt, 64)); }
const publicUser = user => ({ id: user.id, name: user.name, email: user.email });
function session(res, user) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), user.id, Date.now() + settings.sessionDays * 86400000);
  res.cookie('svod_session', token, { httpOnly: true, sameSite: 'strict', maxAge: settings.sessionDays * 86400000, path: '/' });
  return publicUser(user);
}
function auth(req, res, next) {
  const token = req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith('svod_session='))?.slice(13);
  const user = token && db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(hash(token), Date.now());
  if (!user) return res.status(401).json({ error: 'Войдите в аккаунт.' });
  req.user = user; req.sessionToken = token; next();
}
const attempts = new Map();
function rateLimit(req, res, next) {
  const key = req.ip, now = Date.now();
  for (const [ip, value] of attempts) if (value.until < now) attempts.delete(ip);
  const attempt = attempts.get(key) ?? { count: 0, until: now + settings.authWindowMinutes * 60000 };
  attempt.count++; attempts.set(key, attempt);
  if (attempt.count > settings.authAttempts) return res.status(429).json({ error: `Слишком много попыток. Повторите через ${settings.authWindowMinutes} мин.` });
  next();
}
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/config', (_req, res) => res.json({ uploadBytes: settings.uploadBytes, maxRows: settings.maxRows, maxColumns: settings.maxColumns, currency: settings.currency, locale: settings.locale, timezone: settings.timezone }));
app.post('/api/auth/register', rateLimit, (req, res) => {
  const name = clean(req.body.name), email = clean(req.body.email).toLowerCase(), password = req.body.password;
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Укажите имя, корректный email и пароль от 8 до 200 символов.' });
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Этот email уже зарегистрирован.' });
  const user = { id: randomUUID(), name, email };
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(user.id, name, email, passwordHash(password), new Date().toISOString());
  res.status(201).json(session(res, user));
});
app.post('/api/auth/login', rateLimit, (req, res) => {
  const email = clean(req.body.email).toLowerCase(), password = req.body.password;
  if (typeof password !== 'string' || password.length > 200) return res.status(400).json({ error: 'Некорректный пароль.' });
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: 'Неверный email или пароль.' });
  res.json(session(res, user));
});
app.get('/api/auth/me', auth, (req, res) => res.json(publicUser(req.user)));
app.post('/api/auth/logout', auth, (req, res) => { db.prepare('DELETE FROM sessions WHERE token=?').run(hash(req.sessionToken)); res.clearCookie('svod_session', { path: '/' }); res.json({ ok: true }); });
app.use('/api', auth);
app.get('/api/data', (req, res) => {
  const id = req.user.id;
  const suppliers = db.prepare('SELECT * FROM suppliers WHERE user_id=? ORDER BY created_at').all(id);
  const offers = db.prepare('SELECT * FROM offers WHERE user_id=? ORDER BY name').all(id);
  const imports = db.prepare('SELECT imports.*, suppliers.name AS supplier_name FROM imports JOIN suppliers ON imports.supplier_id=suppliers.id WHERE imports.user_id=? ORDER BY imports.created_at DESC').all(id).map(row => ({ ...row, errors: JSON.parse(row.errors) }));
  const selections = db.prepare('SELECT product_key,offer_id FROM selections WHERE user_id=?').all(id);
  res.json({ suppliers, offers, imports, selections });
});
function supplierData(body) {
  const name = clean(body.name), specialization = clean(body.specialization) || 'Без специализации';
  if (body.reliability === undefined || body.reliability === null || clean(body.reliability) === '') throw new Error('Укажите оценку надёжности от 0 до 100%.');
  const reliability = Number(body.reliability), discount = Number(body.discount ?? 0);
  if (!name || name.length > 100 || specialization.length > 100 || !Number.isFinite(reliability) || reliability < 0 || reliability > 100 || !Number.isFinite(discount) || discount < 0 || discount >= 100) throw new Error('Проверьте имя поставщика, надёжность (0–100) и скидку (0–99,99%).');
  return { name, specialization, reliability, discount };
}
function createSupplier(userId, body) {
  const data = supplierData(body);
  if (db.prepare('SELECT id FROM suppliers WHERE user_id=? AND name=? COLLATE NOCASE').get(userId, data.name)) throw new Error('Поставщик с таким названием уже существует. Выберите его из списка.');
  const id = randomUUID();
  db.prepare('INSERT INTO suppliers VALUES (?,?,?,?,?,?,?,?)').run(id, userId, data.name, data.specialization, data.reliability, data.discount, supplierColor(id), new Date().toISOString());
  return id;
}
app.post('/api/suppliers', (req, res) => { try { const id = createSupplier(req.user.id, req.body); res.status(201).json({ id }); } catch (e) { res.status(400).json({ error: e.message }); } });
app.patch('/api/suppliers/:id', (req, res) => {
  if (!db.prepare('SELECT id FROM suppliers WHERE id=? AND user_id=?').get(req.params.id, req.user.id)) return res.status(404).json({ error: 'Поставщик не найден.' });
  try { const s = supplierData(req.body); db.prepare('UPDATE suppliers SET name=?,specialization=?,reliability=?,discount=? WHERE id=? AND user_id=?').run(s.name, s.specialization, s.reliability, s.discount, req.params.id, req.user.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/uploads/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Выберите файл.' });
  try {
    db.prepare('DELETE FROM previews WHERE expires<?').run(Date.now());
    const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    if (!filename.includes('�')) req.file.originalname = filename;
    const parsed = await parseFile(req.file), id = randomUUID();
    const normalized = parsed.mapping.name >= 0 && parsed.mapping.price >= 0 ? normalizeRows(parsed.rows, parsed.mapping) : { items: [], errors: [], totalRows: parsed.rows.length };
    const data = { ...parsed, normalized };
    db.prepare('INSERT INTO previews VALUES (?,?,?,?,?)').run(id, req.user.id, clean(req.file.originalname).slice(0, 200), JSON.stringify(data), Date.now() + settings.previewMinutes * 60000);
    res.json({ id, filename: req.file.originalname, ...data });
  } catch (e) { res.status(400).json({ error: e.message || 'Не удалось прочитать файл.' }); }
});
app.post('/api/uploads/:id/normalize', (req, res) => {
  const preview = db.prepare('SELECT * FROM previews WHERE id=? AND user_id=? AND expires>?').get(req.params.id, req.user.id, Date.now());
  if (!preview) return res.status(404).json({ error: 'Предпросмотр истёк. Загрузите файл заново.' });
  try {
    const data = JSON.parse(preview.data);
    const sheet = req.body.sheet && data.sheets?.find(s => s.name === req.body.sheet);
    if (sheet) { data.headers = sheet.headers; data.rows = sheet.rows; data.sheet = sheet.name; }
    const mapping = req.body.mapping;
    if (!mapping || Object.values(mapping).some(index => !Number.isInteger(index) || index < -1 || index >= data.headers.length)) throw new Error('Некорректное сопоставление колонок.');
    const discount = Number(req.body.discount || 0);
    if (!Number.isFinite(discount) || discount < 0 || discount >= 100) throw new Error('Некорректная скидка.');
    data.mapping = mapping; data.normalized = normalizeRows(data.rows, mapping, discount);
    db.prepare('UPDATE previews SET data=? WHERE id=?').run(JSON.stringify(data), preview.id);
    res.json({ id: preview.id, filename: preview.filename, ...data });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/imports', (req, res) => {
  const preview = db.prepare('SELECT * FROM previews WHERE id=? AND user_id=? AND expires>?').get(req.body.previewId, req.user.id, Date.now());
  if (!preview) return res.status(404).json({ error: 'Предпросмотр истёк или уже импортирован.' });
  try {
    const data = JSON.parse(preview.data);
    if (!Array.isArray(req.body.items) || !req.body.items.length || req.body.items.length > data.rows.length) throw new Error('Нет корректных строк для загрузки.');
    const { items, errors } = normalizeRows(req.body.items.map(i => [i.name, i.price, i.unit, i.discount, i.category, i.sku]), { name: 0, price: 1, unit: 2, discount: 3, category: 4, sku: 5 });
    if (errors.length) throw new Error(`Исправьте данные: ${errors[0].name} — ${errors[0].reason}.`);
    let supplierId = req.body.supplierId;
    if (supplierId && !db.prepare('SELECT id FROM suppliers WHERE id=? AND user_id=?').get(supplierId, req.user.id)) throw new Error('Поставщик не найден.');
    const importId = randomUUID(), now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      if (!supplierId) supplierId = createSupplier(req.user.id, req.body.supplier);
      const skipped = data.normalized.totalRows - items.length;
      db.prepare('INSERT INTO imports VALUES (?,?,?,?,?,?,?,?,?)').run(importId, req.user.id, supplierId, preview.filename, path.extname(preview.filename).slice(1).toUpperCase(), items.length, Math.max(0, skipped), JSON.stringify(data.normalized.errors), now);
      // A confirmed new price list replaces the active catalogue for this supplier atomically.
      db.prepare('DELETE FROM offers WHERE user_id=? AND supplier_id=?').run(req.user.id, supplierId);
      const insert = db.prepare('INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const item of items) insert.run(randomUUID(), req.user.id, supplierId, importId, item.key, item.name, item.sku, item.category, item.unit, item.price, item.discount, item.effectivePrice, 'RUB', now);
      db.prepare('DELETE FROM previews WHERE id=?').run(preview.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.status(201).json({ id: importId, count: items.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/selections', (req, res) => {
  const offer = db.prepare('SELECT * FROM offers WHERE id=? AND user_id=?').get(req.body.offerId, req.user.id);
  if (!offer) return res.status(404).json({ error: 'Предложение не найдено.' });
  db.prepare('INSERT INTO selections VALUES (?,?,?) ON CONFLICT(user_id,product_key) DO UPDATE SET offer_id=excluded.offer_id').run(req.user.id, offer.product_key, offer.id);
  res.json({ ok: true });
});
app.post('/api/selections/best', (req, res) => {
  if (!Array.isArray(req.body.offerIds) || req.body.offerIds.length > settings.maxRows) return res.status(400).json({ error: 'Некорректный список предложений.' });
  const find = db.prepare('SELECT * FROM offers WHERE id=? AND user_id=?'), insert = db.prepare('INSERT INTO selections VALUES (?,?,?) ON CONFLICT(user_id,product_key) DO UPDATE SET offer_id=excluded.offer_id');
  const offers = req.body.offerIds.map(id => find.get(id, req.user.id));
  if (offers.some(offer => !offer)) return res.status(400).json({ error: 'Предложение не найдено.' });
  db.exec('BEGIN'); try { for (const offer of offers) insert.run(req.user.id, offer.product_key, offer.id); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ count: offers.length });
});
const dist = path.join(root, 'dist');
app.use('/api', (_req, res) => res.status(404).json({ error: 'Метод не найден.' }));
if (existsSync(dist)) {
  const escapeAttribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const publicUrl = new URL(process.env.PUBLIC_URL || `http://${settings.host}:${port}`).origin;
  if (!['http:', 'https:'].includes(new URL(publicUrl).protocol)) throw new Error('PUBLIC_URL must use HTTP or HTTPS');
  const page = (_req, res) => {
    const html = readFileSync(path.join(dist, 'index.html'), 'utf8')
      .replaceAll('content="/brand/og.png"', `content="${escapeAttribute(publicUrl)}/brand/og.png"`)
      .replace('</head>', `<meta property="og:url" content="${escapeAttribute(publicUrl)}/"/></head>`);
    res.type('html').send(html);
  };
  app.get('/', page);
  app.use(express.static(dist, { index: false }));
  app.get('/{*path}', page);
}
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Файл больше ${settings.uploadBytes / 1024 / 1024} МБ.` : 'Загрузите один файл.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Объём данных слишком большой.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный запрос.' });
  console.error('Request failed:', err.message);
  res.status(500).json({ error: 'Ошибка сервера. Попробуйте ещё раз.' });
});
const server = app.listen(port, settings.host, () => console.log(`Свод: http://${settings.host}:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
