'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { companyInfo } from '@/lib/company-info'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password })
      if (signInError) {
        setError(signInError.message ?? 'Identifiants invalides.')
        return
      }
      router.push('/')
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--background)' }}>
      <div className="modal-panel" style={{ width: '100%', maxWidth: 360 }}>
        <div className="brand-lockup" style={{ paddingBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={companyInfo.logoPath} alt={companyInfo.shortName} className="brand-mark" />
          <div>
            <strong>{companyInfo.shortName}</strong>
            <span>{companyInfo.displayName}</span>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          {error && <p className="form-error">{error}</p>}
          <div className="form-field">
            <label>Adresse e-mail</label>
            <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="form-field">
            <label>Mot de passe</label>
            <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="form-actions" style={{ justifyContent: 'stretch' }}>
            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={submitting}>
              {submitting ? 'Connexion...' : 'Se connecter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
