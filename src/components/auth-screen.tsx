import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { post } from '@/lib/api'
import type { User } from '@/lib/data'
import { Brand } from '@/components/brand'

export function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  async function submit() {
    setBusy(true); setError('')
    try { onLogin(await post<User>(register ? '/auth/register' : '/auth/login', { name, email, password })) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <main className="auth-layout">
    <div className="auth-brand"><Brand/><span>Закупки</span></div>
    <section className="auth-form" aria-labelledby="auth-title">
      <h1 id="auth-title">{register ? 'Регистрация' : 'Вход'}</h1>
      <form onSubmit={e => { e.preventDefault(); void submit() }}>
        {register && <div className="field"><Label htmlFor="name">Имя</Label><Input id="name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required maxLength={100}/></div>}
        <div className="field"><Label htmlFor="email">Рабочая почта</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254}/></div>
        <div className="field"><Label htmlFor="password">Пароль</Label><Input id="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} maxLength={200} value={password} onChange={e => setPassword(e.target.value)} required/>{register && <p className="field-hint">От 8 символов</p>}</div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <Button disabled={busy} type="submit" className="w-full">{busy && <Loader2 className="animate-spin"/>}{register ? 'Создать аккаунт' : 'Войти'}</Button>
      </form>
      <button className="auth-switch" disabled={busy} onClick={() => { setRegister(!register); setError('') }}>{register ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт'}</button>
    </section>
  </main>
}
