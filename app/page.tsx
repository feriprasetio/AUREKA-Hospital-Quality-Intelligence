'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export default function Home() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [message, setMessage] = useState('Memeriksa koneksi Supabase…')

  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        const { error } = await supabase.auth.getSession()
        if (!mounted) return
        if (error) {
          setStatus('error')
          setMessage(error.message)
          return
        }
        setStatus('connected')
        setMessage('Supabase terhubung. Fondasi AUREKA siap dikembangkan.')
      } catch (error) {
        if (!mounted) return
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Koneksi gagal.')
      }
    }

    void check()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <main className="shell">
      <section className="card">
        <div className="eyebrow">AUREKA</div>
        <h1>Hospital Quality Intelligence</h1>
        <p className="lead">
          Fondasi aplikasi: GitHub sebagai source of truth, Vercel sebagai deployment,
          dan Supabase sebagai backend.
        </p>

        <div className={`status ${status}`}>
          <span className="dot" />
          <div>
            <strong>{status === 'connected' ? 'Supabase Connected' : status === 'error' ? 'Connection Error' : 'Checking Connection'}</strong>
            <p>{message}</p>
          </div>
        </div>

        <div className="grid">
          <div><span>GitHub</span><strong>AUREKA-Hospital-Quality-Intelligence</strong></div>
          <div><span>Supabase</span><strong>fwgdbddrsstzjlyfeqzl</strong></div>
          <div><span>Architecture</span><strong>Next.js + Supabase</strong></div>
        </div>
      </section>
    </main>
  )
}
