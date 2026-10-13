export const settings = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3001),
  clientPort: Number(process.env.CLIENT_PORT || 5173),
  uploadBytes: Number(process.env.UPLOAD_MAX_MB || 15) * 1024 * 1024,
  maxRows: Number(process.env.IMPORT_MAX_ROWS || 10000),
  maxColumns: Number(process.env.IMPORT_MAX_COLUMNS || 80),
  maxPdfPages: Number(process.env.PDF_MAX_PAGES || 100),
  sessionDays: Number(process.env.SESSION_DAYS || 14),
  previewMinutes: Number(process.env.PREVIEW_MINUTES || 60),
  authAttempts: Number(process.env.AUTH_MAX_ATTEMPTS || 30),
  authWindowMinutes: Number(process.env.AUTH_WINDOW_MINUTES || 15),
  currency: 'RUB',
  locale: process.env.APP_LOCALE || 'ru-RU',
  timezone: process.env.APP_TIMEZONE || 'Europe/Moscow',
}
export const supplierColors = ['#007daf', '#40a8d0', '#667eaa', '#318d91', '#8499ad']
export function supplierColor(id) {
  const hash = [...id].reduce((result, char) => ((result * 31 + char.charCodeAt(0)) >>> 0), 0)
  return supplierColors[hash % supplierColors.length]
}
