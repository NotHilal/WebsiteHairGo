import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarCheck, CalendarX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'

const DISMISSED_KEY = 'dayoff_dismissed_ids'

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') } catch { return [] }
}
function saveDismissed(id) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...getDismissed(), id])]))
}

const C = {
  border: 'rgba(var(--rgb-hi),0.07)', white: 'var(--col-text)', muted: 'var(--col-text)',
  success: '#4ade80', successBg: 'rgba(74,222,128,0.08)', successBorder: 'rgba(74,222,128,0.2)',
  danger: '#f87171',  dangerBg:  'rgba(248,113,113,0.08)', dangerBorder:  'rgba(248,113,113,0.2)',
}

export default function DayOffAlert() {
  const { user, profile } = useAuth()
  const [notes, setNotes]   = useState([])
  const [open,  setOpen]    = useState(false)

  const isEmployee = profile?.role === 'artist'

  async function fetch() {
    if (!user || !isEmployee) return
    const { data: stylist } = await supabase
      .from('stylists').select('id').eq('profile_id', user.id).maybeSingle()
    if (!stylist) return

    const { data } = await supabase
      .from('blocked_dates')
      .select('id, date, reason, status')
      .eq('stylist_id', stylist.id)
      .in('status', ['approved', 'rejected'])
      .order('date')

    const dismissed = getDismissed()
    setNotes((data || []).filter(n => !dismissed.includes(n.id)))
  }

  useEffect(() => {
    fetch()
    const sub = supabase.channel('dayoff-alert-sub')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'blocked_dates' }, fetch)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [user?.id, isEmployee])

  function dismiss(id) {
    saveDismissed(id)
    setNotes(p => p.filter(n => n.id !== id))
  }

  function dismissAll() {
    notes.forEach(n => saveDismissed(n.id))
    setNotes([])
    setOpen(false)
  }

  if (!isEmployee || notes.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes dayoff-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(96,165,250,0.55); transform: scale(1); }
          50%      { box-shadow: 0 0 0 7px rgba(96,165,250,0); transform: scale(1.06); }
        }
        .doa-dismiss:hover { background: rgba(var(--rgb-hi),0.06) !important; color: ${C.white} !important; }
      `}</style>

      {/* Bell button */}
      <button onClick={() => setOpen(p => !p)}
        style={{ position: 'relative', width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#60a5fa,#3b82f6)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'dayoff-pulse 2s ease-in-out infinite', flexShrink: 0 }}>
        <CalendarCheck size={14} color="#fff" strokeWidth={2.5} />
        {notes.length > 1 && (
          <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: 'var(--col-acc)', border: '2px solid var(--col-bg)', fontSize: 8, fontWeight: 700, color: 'var(--col-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans,sans-serif' }}>
            {notes.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }} />

            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: -8 }}
              animate={{ opacity: 1, scale: 1,    y:  0 }}
              exit={{    opacity: 0, scale: 0.94, y: -8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              style={{ position: 'fixed', top: '3.5rem', right: '1.5rem', zIndex: 120, width: 320, maxWidth: 'calc(100vw - 2rem)', background: 'var(--col-modal)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>

              {/* Header */}
              <div style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(96,165,250,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 6px #60a5fa88' }} />
                  <span style={{ fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, color: C.white }}>
                    Day-off update{notes.length > 1 ? 's' : ''}
                  </span>
                </div>
                <button onClick={() => setOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* List */}
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {notes.map((n, i) => {
                  const ok  = n.status === 'approved'
                  const col = ok ? C.success  : C.danger
                  const bg  = ok ? C.successBg  : C.dangerBg
                  const bdr = ok ? C.successBorder : C.dangerBorder
                  const Icon = ok ? CalendarCheck : CalendarX
                  return (
                    <div key={n.id} style={{ padding: '0.75rem 1rem', borderBottom: i < notes.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <div style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: 10, padding: '0.625rem 0.75rem', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <Icon size={13} color={col} />
                          <span style={{ fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: col }}>
                            {ok ? 'Day off approved' : 'Day off not approved'}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)' }}>
                          {format(new Date(n.date + 'T00:00:00'), 'EEEE, MMMM d')}
                        </p>
                        {n.reason && (
                          <p style={{ fontSize: '0.7rem', fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)', marginTop: 2 }}>{n.reason}</p>
                        )}
                      </div>
                      <button onClick={() => dismiss(n.id)} className="doa-dismiss"
                        style={{ width: '100%', padding: '5px 0', borderRadius: 8, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, transition: 'all .15s' }}>
                        Dismiss
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: '0.625rem 1rem', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                <button onClick={dismissAll}
                  style={{ fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Dismiss all
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
