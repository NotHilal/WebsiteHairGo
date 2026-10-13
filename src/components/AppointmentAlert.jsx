import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'

const C = {
  gold: 'var(--col-acc)', border: 'rgba(var(--rgb-hi),0.07)',
  white: 'var(--col-text)', muted: 'var(--col-text)',
}

export default function AppointmentAlert() {
  const { user, profile, isAdmin, isManager } = useAuth()
  const [dueAppts,   setDueAppts]   = useState([])
  const [alertOpen,  setAlertOpen]  = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  async function checkDueAppts() {
    const now   = new Date()
    // Local date — toISOString() is UTC, which is still "yesterday" on NZ mornings
    const today = format(now, 'yyyy-MM-dd')

    const { data: linked } = await supabase
      .from('stylists').select('id').eq('profile_id', user?.id).maybeSingle()

    if (!linked && !isAdmin && !isManager) { setDueAppts([]); return }

    let query = supabase
      .from('appointments')
      .select('id, date, time, status, profiles(full_name), services(name), stylists(name)')
      .in('status', ['pending', 'confirmed'])
      .lte('date', today)
    if (linked) query = query.eq('stylist_id', linked.id)

    const { data } = await query
    const due = (data || []).filter(a => {
      const [h, m] = (a.time || '00:00').split(':').map(Number)
      const start  = new Date(`${a.date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
      return start <= now
    })
    setDueAppts(due)
  }

  async function markStatus(appt, status) {
    setUpdatingId(appt.id)
    const { error } = await supabase.from('appointments').update({ status }).eq('id', appt.id)
    if (!error) setDueAppts(prev => prev.filter(a => a.id !== appt.id))
    setUpdatingId(null)
  }

  const isStaff = profile?.role === 'admin' || profile?.role === 'artist' || profile?.role === 'manager'

  useEffect(() => {
    if (!user || !isStaff) return
    checkDueAppts()
    const interval = setInterval(checkDueAppts, 60_000)
    return () => clearInterval(interval)
  }, [user?.id, isStaff])

  if (!isStaff || dueAppts.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes appt-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251,146,60,0.6), 0 4px 20px rgba(251,146,60,0.35); transform: scale(1); }
          50%       { box-shadow: 0 0 0 8px rgba(251,146,60,0), 0 4px 20px rgba(251,146,60,0.35); transform: scale(1.06); }
        }
      `}</style>

      {/* Trigger button */}
      <button onClick={() => setAlertOpen(p => !p)}
        style={{ position: 'relative', width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#fb923c,#f97316)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'appt-pulse 1.8s ease-in-out infinite', flexShrink: 0 }}>
        <AlertTriangle size={14} color="#fff" strokeWidth={2.5} />
        {dueAppts.length > 1 && (
          <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: C.gold, border: '2px solid var(--col-bg)', fontSize: 8, fontWeight: 700, color: 'var(--col-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans,sans-serif' }}>
            {dueAppts.length}
          </span>
        )}
      </button>

      {/* Popup */}
      <AnimatePresence>
        {alertOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setAlertOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }} />
            <motion.div initial={{ opacity: 0, scale: 0.94, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: -8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              style={{ position: 'fixed', top: '3.5rem', right: '1.5rem', zIndex: 120, width: 340, maxWidth: 'calc(100vw - 2rem)', background: 'var(--col-modal)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
              {/* Header */}
              <div style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(251,146,60,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fb923c', boxShadow: '0 0 6px #fb923c', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, color: C.white }}>
                    {dueAppts.length} appointment{dueAppts.length > 1 ? 's' : ''} need{dueAppts.length === 1 ? 's' : ''} a status update
                  </span>
                </div>
                <button onClick={() => setAlertOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              {/* List */}
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {dueAppts.map((a, i) => (
                  <div key={a.id} style={{ padding: '0.75rem 1rem', borderBottom: i < dueAppts.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, color: C.white, marginBottom: 2 }}>
                        {a.profiles?.full_name || 'Client'}
                      </p>
                      <p style={{ fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', color: C.muted }}>
                        {a.services?.name || 'Service'} · {a.stylists?.name || ''} · {(a.time || '').slice(0, 5)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {a.status === 'pending' && (
                        <button disabled={updatingId === a.id} onClick={() => markStatus(a, 'confirmed')}
                          style={{ flex: 1, padding: '5px 0', borderRadius: 8, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: updatingId === a.id ? 'not-allowed' : 'pointer', border: '1px solid rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.08)', color: '#34d399', opacity: updatingId === a.id ? 0.5 : 1, transition: 'opacity .15s' }}>
                          ✓ Confirm
                        </button>
                      )}
                      <button disabled={updatingId === a.id} onClick={() => markStatus(a, 'completed')}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 8, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: updatingId === a.id ? 'not-allowed' : 'pointer', border: 'none', background: 'linear-gradient(135deg,#B8D4E8,#7AAFC9)', color: 'var(--col-bg)', opacity: updatingId === a.id ? 0.5 : 1, transition: 'opacity .15s' }}>
                        ✓ Done
                      </button>
                      <button disabled={updatingId === a.id} onClick={() => markStatus(a, 'cancelled')}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 8, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: updatingId === a.id ? 'not-allowed' : 'pointer', border: '1px solid rgba(248,113,113,0.22)', background: 'rgba(248,113,113,0.07)', color: 'rgba(248,113,113,0.75)', opacity: updatingId === a.id ? 0.5 : 1, transition: 'opacity .15s' }}>
                        ✕ Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Footer */}
              <div style={{ padding: '0.625rem 1rem', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                <button onClick={() => setAlertOpen(false)}
                  style={{ fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
