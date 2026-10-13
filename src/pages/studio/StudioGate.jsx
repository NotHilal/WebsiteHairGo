import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Eye, EyeOff, Mail, Smartphone, ArrowRight, Sun, Moon } from 'lucide-react'
import hairgoLogo from '../../assets/hairgo.png'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function StudioGate() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [digits,   setDigits]   = useState(['', '', '', '', '', ''])
  const [loading,  setLoading]  = useState(false)
  const inputRefs = useRef([])
  const { user, signIn, loading: authLoading, profile } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && user && sessionStorage.getItem('studio_access') === 'true' && (profile?.role === 'admin' || profile?.role === 'artist' || profile?.role === 'manager')) {
      navigate('/studio/dashboard')
    }
  }, [authLoading, user, profile])

  function handleDigit(i, val) {
    const v = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = v
    setDigits(next)
    if (v && i < 5) inputRefs.current[i + 1]?.focus()
  }

  function handleDigitKey(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus()
    }
    if (e.key === 'Enter') handleSubmit(e)
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigits(pasted.split(''))
      inputRefs.current[5]?.focus()
    }
  }

  async function handleSubmit(e) {
    e?.preventDefault()
    const otp = digits.join('')
    if (otp.length < 6) return toast.error('Enter the 6-digit code from your authenticator app')
    setLoading(true)
    try {
      let currentUser = user
      let role = profile?.role
      if (!currentUser) {
        const data = await signIn(email, password)
        currentUser = data.user
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single()
        role = prof?.role
      }
      if (role !== 'admin' && role !== 'artist' && role !== 'manager') {
        toast.error('This account does not have studio access')
        setLoading(false)
        return
      }

      const { data, error } = await supabase.functions.invoke('verify-studio-otp', {
        body: { token: otp },
      })
      if (error || !data?.valid) {
        toast.error('Invalid code — check your authenticator app')
        setDigits(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
        setLoading(false)
        return
      }

      sessionStorage.setItem('studio_access', 'true')
      navigate('/studio/dashboard')
    } catch (err) {
      toast.error(err.message || 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) return null

  const inputStyle = {
    width: '100%',
    background: 'rgba(var(--rgb-hi),0.03)',
    border: '1px solid rgba(var(--rgb-hi),0.08)',
    borderRadius: 14,
    padding: '16px 18px 16px 48px',
    fontSize: '0.95rem',
    color: 'var(--col-text)',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
    fontWeight: 300,
    transition: 'border-color 0.3s, background 0.3s',
    boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block',
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'var(--col-text)',
    marginBottom: 10,
    fontFamily: 'DM Sans, sans-serif',
  }

  const iconStyle = {
    position: 'absolute',
    left: 18,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--col-text)',
    pointerEvents: 'none',
  }

  return (
    <div className="sg-outer" style={{ minHeight: '100vh', background: 'var(--col-bg)', display: 'flex', overflow: 'hidden' }}>

      {/* ── Theme toggle ── */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 100,
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(var(--rgb-hi),0.06)',
          border: '1px solid rgba(var(--rgb-hi),0.12)',
          color: 'var(--col-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.3s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--col-acc)'; e.currentTarget.style.borderColor = 'var(--col-acc)'; e.currentTarget.style.color = 'var(--col-bg)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--rgb-hi),0.06)'; e.currentTarget.style.borderColor = 'rgba(var(--rgb-hi),0.12)'; e.currentTarget.style.color = 'var(--col-text)' }}
      >
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      {/* ── Left panel ── */}
      <div className="sg-left" style={{ width: 400, flexShrink: 0, position: 'relative', flexDirection: 'column', justifyContent: 'space-between', padding: '56px 52px', borderRight: '1px solid rgba(var(--rgb-hi),0.05)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(var(--rgb-acc),0.04) 0%, transparent 60%)' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 320, height: 320, background: 'radial-gradient(circle, rgba(var(--rgb-acc),0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, opacity: 0.025, backgroundImage: 'linear-gradient(rgba(var(--rgb-acc),1) 1px,transparent 1px),linear-gradient(90deg,rgba(var(--rgb-acc),1) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

        <div style={{ position: 'relative' }}>
          <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <img src={hairgoLogo} alt="HairGo" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(184,212,232,0.4)', boxShadow: '0 8px 24px rgba(var(--rgb-acc),0.3)', flexShrink: 0 }} />
            <span className="font-display" style={{ fontSize: '1.6rem', color: 'var(--col-text)' }}>Hair<span style={{ color: 'var(--col-acc)' }}>Go</span></span>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <h2 className="font-display font-light" style={{ color: 'var(--col-text)', fontSize: '3.5rem', lineHeight: 1.05, marginBottom: 24 }}>
            Welcome<br />
            <span className="gold-gradient" style={{ fontStyle: 'italic' }}>back.</span>
          </h2>
          <div style={{ width: 36, height: 1, background: 'linear-gradient(90deg,var(--col-acc),transparent)', marginBottom: 20 }} />
          <p style={{ color: 'var(--col-text)', fontSize: '0.88rem', lineHeight: 1.9, maxWidth: 280, fontFamily: 'DM Sans, sans-serif', fontWeight: 300 }}>
            The HairGo Studio is your private management hub — restricted to authorised administrators only.
          </p>
        </div>

        <div style={{ position: 'relative' }}>
          <p style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans, sans-serif' }}>
            HairGo Studio · Auckland, NZ
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="sg-right" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="sg-card"
          style={{ width: '100%', maxWidth: 480 }}
        >
          {/* Mobile logo */}
          <div className="sg-mobile-logo" onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36, cursor: 'pointer' }}>
            <img src={hairgoLogo} alt="HairGo" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(184,212,232,0.4)', boxShadow: '0 6px 18px rgba(var(--rgb-acc),0.3)', flexShrink: 0 }} />
            <span className="font-display" style={{ fontSize: '1.45rem', color: 'var(--col-text)' }}>Hair<span style={{ color: 'var(--col-acc)' }}>Go</span></span>
          </div>

          {/* Header */}
          <div className="sg-header" style={{ marginBottom: 44 }}>
            <p style={{ fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--col-acc)', marginBottom: 14, fontFamily: 'DM Sans, sans-serif' }}>
              Studio Access
            </p>
            <h1 className="font-display font-light sg-title" style={{ color: 'var(--col-text)', lineHeight: 1.1, marginBottom: 0 }}>
              {user ? 'Welcome back' : 'Sign in to continue'}
            </h1>
            {user && (
              <p style={{ color: 'var(--col-text)', fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif', marginTop: 8 }}>
                Signed in as <span style={{ color: 'var(--col-acc)' }}>{user.email}</span>
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit}>

            {/* Email + Password — only when not signed in */}
            {!user && (
              <>
                <div style={{ marginBottom: 22 }}>
                  <label style={labelStyle}>Email</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} style={iconStyle} />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="admin@hairgo.com"
                      required
                      style={inputStyle}
                      onFocus={e => { e.target.style.borderColor = 'var(--col-acc)'; e.target.style.background = 'rgba(var(--rgb-hi),0.05)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(var(--rgb-hi),0.08)'; e.target.style.background = 'rgba(var(--rgb-hi),0.03)' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={iconStyle} />
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      style={{ ...inputStyle, paddingRight: 50 }}
                      onFocus={e => { e.target.style.borderColor = 'var(--col-acc)'; e.target.style.background = 'rgba(var(--rgb-hi),0.05)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(var(--rgb-hi),0.08)'; e.target.style.background = 'rgba(var(--rgb-hi),0.03)' }}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--col-text)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--col-text)'}
                    >
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: user ? '0 0 28px 0' : '28px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(var(--rgb-hi),0.06)' }} />
              <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
                Authenticator Code
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(var(--rgb-hi),0.06)' }} />
            </div>

            {/* OTP boxes */}
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <Smartphone size={13} color="rgba(var(--rgb-acc),0.6)" />
                <label style={{ ...labelStyle, marginBottom: 0 }}>6-digit code from your authenticator app</label>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }} onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => inputRefs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleDigitKey(i, e)}
                    style={{
                      width: 52, height: 62, textAlign: 'center',
                      fontSize: '1.6rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
                      background: d ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.03)',
                      border: d ? '1px solid rgba(var(--rgb-acc),0.45)' : '1px solid rgba(var(--rgb-hi),0.1)',
                      borderRadius: 14, color: d ? 'var(--col-bg)' : 'var(--col-text)', outline: 'none',
                      transition: 'all 0.2s', caretColor: 'var(--col-acc)',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--col-acc)'; e.target.style.background = 'var(--col-acc)'; e.target.style.color = 'var(--col-bg)' }}
                    onBlur={e => {
                      const filled = e.target.value !== ''
                      e.target.style.borderColor = filled ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.1)'
                      e.target.style.background = filled ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.03)'
                      e.target.style.color = filled ? 'var(--col-bg)' : 'var(--col-text)'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || digits.join('').length < 6}
              className="sg-submit"
              style={{
                width: '100%',
                borderRadius: 14,
                background: 'linear-gradient(135deg, var(--grad-c) 0%, var(--grad-bar) 50%, var(--grad-b) 100%)',
                color: 'var(--col-bg)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                fontFamily: 'DM Sans, sans-serif',
                border: 'none',
                cursor: (loading || digits.join('').length < 6) ? 'not-allowed' : 'pointer',
                opacity: (loading || digits.join('').length < 6) ? 0.5 : 1,
                boxShadow: '0 12px 40px rgba(var(--rgb-acc),0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                transition: 'opacity 0.2s, transform 0.2s',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
              {loading
                ? <div style={{ width: 18, height: 18, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                : <><span>Enter Studio</span><ArrowRight size={15} /></>
              }
            </button>

          </form>

          <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--col-text)', marginTop: 28, fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.08em' }}>
            Unauthorised access is strictly prohibited
          </p>

        </motion.div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .sg-left { display: none; }
        @media (min-width: 1024px) { .sg-left { display: flex; } }
        .sg-mobile-logo { display: flex; }
        @media (min-width: 1024px) { .sg-mobile-logo { display: none; } }
        .sg-right { padding: 40px 24px; }
        @media (min-width: 640px) { .sg-right { padding: 60px 48px; } }
        .sg-title { font-size: 2rem; }
        @media (min-width: 480px) { .sg-title { font-size: 2.4rem; } }
        @media (min-width: 1024px) { .sg-title { font-size: 2.6rem; } }
        .sg-header { margin-bottom: 32px !important; }
        @media (min-width: 640px) { .sg-header { margin-bottom: 44px !important; } }
        .sg-submit { padding: 16px 24px; }
        @media (min-width: 640px) { .sg-submit { padding: 18px 32px; } }
      `}</style>
    </div>
  )
}
