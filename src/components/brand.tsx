export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`brand${compact ? ' compact' : ''}`}><img src="/brand/logo.png" alt="" width={32} height={32}/>{!compact && <span>Свод</span>}</span>
}
