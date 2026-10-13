import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, User, Phone, Scissors, ArrowRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function Register() {
  const [form, setForm]     = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' })
  const [show, setShow]     = useState(false)
  const [loading, setLoad]  = useState(false)
  const { signUp }          = useAuth()
  const navigate            = useNavigate()

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) return toast.error('Passwords do not match')
    if (form.password.length < 8)       return toast.error('Password must be at least 8 characters')
    setLoad(true)
    try {
      await signUp(form.email, form.password, form.fullName, form.phone)
      toast.success('Account created!')
      navigate('/')
    } catch (err) {
      toast.error(err.message || 'Failed to create account')
    } finally {
      setLoad(false)
    }
  }

  const inp = {
    width: '100%', background: 'rgba(var(--rgb-hi),0.04)',
    border: '1px solid rgba(var(--rgb-hi),0.08)', borderRadius: 13,
    padding: '13px 13px 13px 44px',
    fontSize: '0.85rem', color: 'var(--col-text)', outline: 'none',
    fontFamily: 'DM Sans,sans-serif', fontWeight: 300,
    transition: 'border-color 0.3s, background 0.3s',
  }
  const lbl = {
    display: 'block', fontSize: 12, letterSpacing: '0.22em',
    textTransform: 'uppercase', color: 'var(--col-text)',
    marginBottom: 7, fontFamily: 'DM Sans,sans-serif',
  }
  const onFocus = e => { e.target.style.borderColor = 'var(--col-acc)'; e.target.style.background = 'rgba(var(--rgb-hi),0.06)' }
  const onBlur  = e => { e.target.style.borderColor = 'rgba(var(--rgb-hi),0.08)'; e.target.style.background = 'rgba(var(--rgb-hi),0.04)' }

  return (
    <div style={{ minHeight: 'calc(100vh - 72px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', overflowY: 'auto' }}>
      {/* Ambient glow */}
      <div style={{ position: 'fixed', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 560, height: 420, background: 'radial-gradient(circle, rgba(var(--rgb-acc),0.06) 0%, transparent 70%)', pointerEvents: 'none', borderRadius: '50%' }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 460, position: 'relative' }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,var(--col-acc),var(--col-acc2))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px auto', boxShadow: '0 8px 36px rgba(var(--rgb-acc),0.38)' }}>
            <Scissors size={21} color="var(--col-bg)" style={{ transform: 'rotate(45deg)' }} />
          </div>
          <h1 className="font-display font-light" style={{ fontSize: '2.6rem', color: 'var(--col-text)', textAlign: 'center', marginBottom: '0.8rem', lineHeight: 1 }}>
            Join HairGo
          </h1>
          <div className="gold-bar" style={{ margin: '0 auto' }} />
        </div>

        {/* Card */}
        <div className="glass" style={{ borderRadius: 26, padding: '2.25rem' }}>
          <form onSubmit={submit}>

            {/* Row 1 — Name + Phone side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: 14 }}>
              <div>
                <label style={lbl}>Full Name</label>
                <div style={{ position: 'relative' }}>
                  <User size={13} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-text)', pointerEvents: 'none' }} />
                  <input type="text" value={form.fullName} onChange={set('fullName')} required placeholder="Your name" style={inp} onFocus={onFocus} onBlur={onBlur} />
                </div>
              </div>
              <div>
                <label style={lbl}>
                  Phone <span style={{ color: 'var(--col-text)', fontSize: 11 }}>(opt.)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Phone size={13} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-text)', pointerEvents: 'none' }} />
                  <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+64 ..." style={inp} onFocus={onFocus} onBlur={onBlur} />
                </div>
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={13} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-text)', pointerEvents: 'none' }} />
                <input type="email" value={form.email} onChange={set('email')} required placeholder="your@email.com" style={inp} onFocus={onFocus} onBlur={onBlur} />
              </div>
            </div>

            {/* Row 2 — Password + Confirm side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: 24 }}>
              <div>
                <label style={lbl}>Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={13} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-text)', pointerEvents: 'none' }} />
                  <input type={show ? 'text' : 'password'} value={form.password} onChange={set('password')} required placeholder="Min. 8 chars" style={{ ...inp, paddingRight: 38 }} onFocus={onFocus} onBlur={onBlur} />
                  <button type="button" onClick={() => setShow(!show)} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {show ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
              <div>
                <label style={lbl}>Confirm</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={13} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-text)', pointerEvents: 'none' }} />
                  <input type="password" value={form.confirm} onChange={set('confirm')} required placeholder="Repeat" style={inp} onFocus={onFocus} onBlur={onBlur} />
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-gold" style={{ width: '100%' }}>
              {loading
                ? <div style={{ width: 15, height: 15, border: '2px solid rgba(0,0,0,0.25)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                : <>Create Account <ArrowRight size={14} /></>
              }
            </button>
          </form>

          <div style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid rgba(var(--rgb-hi),0.06)', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--col-text)' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ color: 'var(--col-acc)', textDecoration: 'none', fontWeight: 400 }}
                onMouseEnter={e => e.currentTarget.style.color = '#E8D5A3'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--col-acc)'}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
