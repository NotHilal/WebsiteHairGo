import { useState, useEffect } from 'react'
import { Clock, AlertCircle, ChevronLeft, ChevronRight, Info, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { sheetMins, breakLabel } from '../../lib/pay'
import { fetchAll } from '../../lib/fetchAll'
import { useAuth } from '../../contexts/AuthContext'
import {
  format,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isSameMonth,
  addMonths, subMonths,
} from 'date-fns'

const C = {
  card: 'var(--col-modal)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', muted: 'var(--col-text)', subtle: 'rgba(var(--rgb-hi),0.06)',
  border: 'rgba(var(--rgb-hi),0.07)',
  green: '#34d399', greenBg: 'rgba(52,211,153,0.08)', greenBorder: 'rgba(52,211,153,0.18)',
  red: '#f87171', redBg: 'rgba(248,113,113,0.08)', redBorder: 'rgba(248,113,113,0.18)',
}

const TABLE_PER_PAGE = 15
const TABLE_COLS = '1fr 58px 70px 66px 28px'


function fmtMins(mins) {
  if (!mins || mins <= 0) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

const fmt = n => `$${(n || 0).toFixed(2)}`

// ── Session / Day info modal ──────────────────────────────────────
function SessionModal({ sessions, rate, onClose }) {
  if (!sessions || sessions.length === 0) return null
  const single    = sessions.length === 1
  const t0        = sessions[0]
  const totalMins = sessions.reduce((a, t) => a + sheetMins(t), 0)
  const paidMins  = sessions.filter(t => t.paid_at).reduce((a, t) => a + sheetMins(t), 0)
  const totalOwed = ((totalMins - paidMins) / 60) * rate

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 201, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ background: 'var(--col-modal)', border: `1px solid ${C.border}`, borderRadius: 18, width: '100%', maxWidth: 360, maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
            <div>
              <p style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, margin: '0 0 3px' }}>
                {single ? 'Session Details' : `${sessions.length} Sessions`}
              </p>
              <h3 style={{ margin: 0, color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, fontSize: '1rem' }}>
                {format(new Date(t0.clock_in), 'EEEE, MMM d, yyyy')}
              </h3>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: single ? '0.875rem' : '0.5rem' }}>
            {single ? (
              [
                ['Clock In',  format(new Date(t0.clock_in),  'HH:mm'), C.green ],
                ['Clock Out', format(new Date(t0.clock_out), 'HH:mm'), C.red   ],
                ['Break',     breakLabel(t0) === 'None' ? 'None' : `${breakLabel(t0)} (auto)`, C.muted],
                ['Net Time',  fmtMins(sheetMins(t0)), C.gold ],
                ['Earned',    rate > 0 ? fmt((sheetMins(t0) / 60) * rate) : 'No rate set', C.white],
                ['Status',    t0.paid_at ? `Paid · ${format(new Date(t0.paid_at), 'MMM d, yyyy')}` : 'Unpaid', t0.paid_at ? C.green : C.red],
              ].map(([label, value, color]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>{label}</span>
                  <span style={{ fontSize: '0.85rem', color, fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>{value}</span>
                </div>
              ))
            ) : (
              <>
                {sessions.map(t => {
                  const net  = sheetMins(t)
                  const earn = (net / 60) * rate
                  return (
                    <div key={t.id} style={{ padding: '0.6rem 0.875rem', borderRadius: 10, background: t.paid_at ? 'rgba(52,211,153,0.05)' : 'rgba(248,113,113,0.05)', border: `1px solid ${t.paid_at ? C.greenBorder : C.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <p style={{ margin: 0, color: C.white, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>
                          {format(new Date(t.clock_in), 'HH:mm')} → {format(new Date(t.clock_out), 'HH:mm')}
                        </p>
                        <p style={{ margin: '2px 0 0', color: C.muted, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif' }}>
                          {fmtMins(net)}{t.break_minutes ? ` · ${t.break_minutes}m break` : ''}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ margin: 0, color: C.white, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>{rate > 0 ? fmt(earn) : '—'}</p>
                        <span style={{ fontSize: 9, color: t.paid_at ? C.green : C.red, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{t.paid_at ? 'Paid' : 'Unpaid'}</span>
                      </div>
                    </div>
                  )
                })}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '0.75rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>Day total</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{fmtMins(totalMins)}</span>
                    {rate > 0 && (
                      <span style={{ fontSize: '0.85rem', color: totalOwed > 0 ? C.red : C.green, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
                        {totalOwed > 0 ? `${fmt(totalOwed)} owed` : 'All paid'}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Simplified table row ──────────────────────────────────────────
function PayRow({ t, rate, onInfo, last }) {
  const net  = sheetMins(t)
  const earn = (net / 60) * rate
  return (
    <div className="ps-row" style={{ display: 'grid', gridTemplateColumns: TABLE_COLS, padding: '0.65rem 1rem', borderBottom: last ? 'none' : `1px solid ${C.border}`, gap: '0.5rem', alignItems: 'center' }}>
      <div style={{ color: C.white, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {format(new Date(t.clock_in), 'EEE, MMM d')}
      </div>
      <div style={{ color: C.gold, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>{fmtMins(net)}</div>
      <div style={{ color: rate > 0 ? C.white : C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>
        {rate > 0 ? fmt(earn) : '—'}
      </div>
      <div>
        {t.paid_at
          ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 99, background: C.greenBg, border: `1px solid ${C.greenBorder}`, color: C.green, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, whiteSpace: 'nowrap' }}>Paid</span>
          : <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 99, background: C.redBg,   border: `1px solid ${C.redBorder}`,   color: C.red,   fontFamily: 'DM Sans,sans-serif', fontWeight: 600, whiteSpace: 'nowrap' }}>Unpaid</span>
        }
      </div>
      <button onClick={() => onInfo(t)} className="ps-info-btn"
        style={{ width: 28, height: 28, borderRadius: 7, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0, transition: 'all .15s' }}>
        <Info size={12} />
      </button>
    </div>
  )
}

// ── Pagination ────────────────────────────────────────────────────
function Pagination({ page, total, onChange }) {
  const pages = []
  if (total <= 7) {
    for (let i = 0; i < total; i++) pages.push(i)
  } else {
    pages.push(0)
    if (page > 2) pages.push(-1)
    for (let i = Math.max(1, page - 1); i <= Math.min(total - 2, page + 1); i++) pages.push(i)
    if (page < total - 3) pages.push(-2)
    pages.push(total - 1)
  }
  const nav = d => ({ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, color: d ? 'var(--col-text)' : 'var(--col-text)', cursor: d ? 'not-allowed' : 'pointer', fontSize: '1rem', fontFamily: 'DM Sans,sans-serif', transition: 'all .15s' })
  const num = a => ({ minWidth: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', background: a ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${a ? 'var(--col-acc)' : C.border}`, color: a ? 'var(--col-acc)' : 'var(--col-text)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', fontWeight: a ? 600 : 400, transition: 'all .15s' })
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0.25rem 0' }}>
      <button onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0} style={nav(page === 0)}>‹</button>
      {pages.map((p, i) =>
        p < 0
          ? <span key={`e${i}`} style={{ color: C.muted, fontSize: '0.78rem', padding: '0 2px', fontFamily: 'DM Sans,sans-serif' }}>…</span>
          : <button key={p} onClick={() => onChange(p)} style={num(p === page)}>{p + 1}</button>
      )}
      <button onClick={() => onChange(Math.min(total - 1, page + 1))} disabled={page === total - 1} style={nav(page === total - 1)}>›</button>
    </div>
  )
}

// ── Calendar view ─────────────────────────────────────────────────
function PayCalendar({ sheets, rate, calDate, setCalDate, onDayClick }) {
  const monthStart = startOfMonth(calDate)
  const monthEnd   = endOfMonth(calDate)
  const calDays    = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end:   endOfWeek(monthEnd,     { weekStartsOn: 1 }),
  })
  const weeks = []
  for (let i = 0; i < calDays.length; i += 7) weeks.push(calDays.slice(i, i + 7))

  const monthSheets = sheets.filter(t => isSameMonth(new Date(t.clock_in), calDate))
  const monthMins   = monthSheets.reduce((a, t) => a + sheetMins(t), 0)
  const monthPaidM  = monthSheets.filter(t => t.paid_at).reduce((a, t) => a + sheetMins(t), 0)
  const monthEarned = (monthMins / 60) * rate
  const monthOwed   = ((monthMins - monthPaidM) / 60) * rate

  const nbtn = { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', flexShrink: 0, padding: 0, transition: 'all .15s' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <style>{`.cal-day:hover { background: rgba(var(--rgb-hi),0.045) !important; } .ps-cal-nav:hover { color: ${C.white} !important; }`}</style>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button onClick={() => setCalDate(d => subMonths(d, 1))} style={nbtn} className="ps-cal-nav"><ChevronLeft size={14} /></button>
        <span style={{ color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, fontSize: '0.92rem' }}>
          {format(calDate, 'MMMM yyyy')}
        </span>
        <button onClick={() => setCalDate(d => addMonths(d, 1))} style={nbtn} className="ps-cal-nav"><ChevronRight size={14} /></button>
      </div>

      {/* Calendar grid */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'rgba(var(--rgb-hi),0.025)', borderBottom: `1px solid ${C.border}` }}>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} style={{ padding: '0.45rem 0.25rem', textAlign: 'center', fontSize: 9, color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => {
          const wSessions = week.flatMap(d => sheets.filter(t => isSameDay(new Date(t.clock_in), d)))
          const wMins     = wSessions.reduce((a, t) => a + sheetMins(t), 0)
          const wPaidM    = wSessions.filter(t => t.paid_at).reduce((a, t) => a + sheetMins(t), 0)
          const wEarned   = (wMins / 60) * rate
          const wOwed     = ((wMins - wPaidM) / 60) * rate
          const wInMonth  = wSessions.some(t => isSameMonth(new Date(t.clock_in), calDate))
          const isLast    = wi === weeks.length - 1

          return (
            <div key={wi} style={{ borderBottom: isLast ? 'none' : `1px solid ${C.border}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {week.map((day, di) => {
                  const inMonth  = isSameMonth(day, calDate)
                  const daySess  = sheets.filter(t => isSameDay(new Date(t.clock_in), day))
                  const hasWork  = daySess.length > 0
                  const allPaid  = hasWork && daySess.every(t => t.paid_at)
                  const isActive = inMonth && hasWork

                  return (
                    <div key={di}
                      onClick={() => isActive && onDayClick(daySess)}
                      className={isActive ? 'cal-day' : undefined}
                      style={{
                        padding: '0.55rem 0.25rem',
                        textAlign: 'center',
                        borderRight: di < 6 ? `1px solid ${C.border}` : 'none',
                        cursor: isActive ? 'pointer' : 'default',
                        background: isActive ? (allPaid ? 'rgba(52,211,153,0.05)' : 'rgba(248,113,113,0.05)') : 'transparent',
                        opacity: inMonth ? 1 : 0.28,
                        transition: 'background .15s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        minHeight: 46, justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: '0.82rem', color: isActive ? C.white : C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: isActive ? 600 : 400, lineHeight: 1 }}>
                        {format(day, 'd')}
                      </span>
                      {isActive && (
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: allPaid ? C.green : C.red, flexShrink: 0 }} />
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Week summary */}
              {wInMonth && wMins > 0 && (
                <div style={{ padding: '0.3rem 1rem', background: 'rgba(var(--rgb-hi),0.015)', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>This week</span>
                  <span style={{ fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif' }}>
                    <span style={{ color: C.gold }}>{fmtMins(wMins)}</span>
                    {rate > 0 && <span style={{ color: C.muted }}> · <span style={{ color: C.white }}>{fmt(wEarned)}</span></span>}
                    {wOwed > 0 && <span style={{ color: C.red }}> · {fmt(wOwed)} owed</span>}
                    {wOwed === 0 && wMins > 0 && <span style={{ color: C.green }}> · paid</span>}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Month summary */}
      <div style={{ background: C.card, border: `1px solid ${monthOwed > 0 ? C.redBorder : monthMins > 0 ? C.greenBorder : C.border}`, borderRadius: 12, padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {format(calDate, 'MMM')} total
        </span>
        {monthMins === 0 ? (
          <span style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>No sessions this month</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.85rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{fmtMins(monthMins)}</span>
            {rate > 0 && <span style={{ fontSize: '0.85rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>{fmt(monthEarned)} earned</span>}
            {monthOwed > 0
              ? <span style={{ fontSize: '0.85rem', color: C.red, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{fmt(monthOwed)} owed</span>
              : <span style={{ fontSize: '0.85rem', color: C.green, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>All paid ✓</span>
            }
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
export default function StudioPaysheet() {
  const { user } = useAuth()
  const [stylist,    setStylist]    = useState(null)
  const [sheets,     setSheets]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [notLinked,  setNotLinked]  = useState(false)
  const [activeTab,  setActiveTab]  = useState('calendar')
  const [unpaidOnly, setUnpaidOnly] = useState(false)
  const [page,       setPage]       = useState(0)
  const [infoModal,  setInfoModal]  = useState(null)
  const [calDate,    setCalDate]    = useState(new Date())

  useEffect(() => { load() }, [user])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user])

  async function load() {
    if (!user) return
    setLoading(true)
    setError(null)
    const { data: linked } = await supabase
      .from('stylists').select('id, name').eq('profile_id', user.id).maybeSingle()
    if (!linked) { setNotLinked(true); setLoading(false); return }
    const { data: rate } = await supabase.from('stylist_rates').select('hourly_rate').eq('stylist_id', linked.id).maybeSingle()
    setStylist({ ...linked, hourly_rate: rate?.hourly_rate ?? null })
    setNotLinked(false)
    const { data, error: e } = await fetchAll(() => supabase
      .from('timesheets')
      .select('id, clock_in, clock_out, break_minutes, paid_at')
      .eq('stylist_id', linked.id)
      .not('clock_out', 'is', null)
      .order('clock_in', { ascending: false })
      .order('id'))
    if (e) { setError('Could not load sessions — check your connection.'); setLoading(false); return }
    setSheets(data || [])
    setLoading(false)
  }

  const rate        = parseFloat(stylist?.hourly_rate) || 0
  const allMins     = sheets.reduce((a, t) => a + sheetMins(t), 0)
  const paidMins    = sheets.filter(t =>  t.paid_at).reduce((a, t) => a + sheetMins(t), 0)
  const unpaidMins  = sheets.filter(t => !t.paid_at).reduce((a, t) => a + sheetMins(t), 0)
  const totalEarned = (allMins    / 60) * rate
  const totalPaid   = (paidMins   / 60) * rate
  const totalOwed   = (unpaidMins / 60) * rate
  const allSettled  = allMins > 0 && unpaidMins === 0

  const filteredSheets = unpaidOnly ? sheets.filter(t => !t.paid_at) : sheets
  const totalPages     = Math.max(1, Math.ceil(filteredSheets.length / TABLE_PER_PAGE))
  const visible        = filteredSheets.slice(page * TABLE_PER_PAGE, (page + 1) * TABLE_PER_PAGE)

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(var(--rgb-acc),0.18)', borderTopColor: 'var(--col-acc)', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <AlertCircle size={28} color={C.red} />
      <p style={{ color: C.muted, fontFamily: 'DM Sans,sans-serif', fontSize: '0.85rem', margin: 0, textAlign: 'center' }}>{error}</p>
      <button onClick={load} style={{ padding: '0.4rem 1.25rem', borderRadius: 8, background: C.subtle, border: `1px solid ${C.border}`, color: C.white, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
    </div>
  )

  if (notLinked) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <AlertCircle size={32} color={C.goldDim} />
      <p style={{ color: C.muted, fontFamily: 'DM Sans,sans-serif', fontSize: '0.9rem' }}>Your account is not linked to a stylist profile.</p>
      <p style={{ color: C.muted, fontFamily: 'DM Sans,sans-serif', fontSize: '0.8rem' }}>Ask an admin to link your account in the Stylists page.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%', overflowY: 'auto' }}>
      <style>{`
        .ps-row:hover      { background: rgba(var(--rgb-hi),0.025) !important; }
        .ps-info-btn:hover { background: rgba(var(--rgb-hi),0.08) !important; color: ${C.white} !important; }
      `}</style>

      {/* Header */}
      <div>
        <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, margin: 0 }}>Your Pay</p>
        <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.7rem,3vw,2.4rem)', color: C.white, lineHeight: 1.1, margin: '2px 0 4px' }}>My Paysheet</h1>
        {stylist && (
          <p style={{ fontSize: '0.78rem', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', margin: 0 }}>
            {stylist.name}{rate > 0 ? ` · $${rate.toFixed(2)}/h` : ' · No rate set — contact admin'}
          </p>
        )}
      </div>

      {/* Outstanding balance card */}
      <div style={{ background: C.card, border: `1px solid ${totalOwed > 0 ? C.redBorder : allSettled ? C.greenBorder : C.border}`, borderRadius: 16, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
        <div>
          <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', margin: '0 0 8px' }}>Outstanding balance</p>
          <p style={{ fontSize: 'clamp(1.8rem,3vw,2.6rem)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: totalOwed > 0 ? C.red : allSettled ? C.green : C.muted, margin: 0, lineHeight: 1 }}>
            {fmt(totalOwed)}
          </p>
          <p style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', margin: '8px 0 0' }}>
            {allSettled ? 'All sessions paid ✓' : unpaidMins > 0 ? `${fmtMins(unpaidMins)} not yet paid` : 'No hours recorded'}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 3px' }}>Total Earned</p>
            <p style={{ fontSize: '1.05rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, margin: 0 }}>{fmt(totalEarned)}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 3px' }}>Total Paid</p>
            <p style={{ fontSize: '1.05rem', color: C.green, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, margin: 0 }}>{fmt(totalPaid)}</p>
          </div>
        </div>
      </div>

      {/* Tab switcher: Table | Calendar */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 3, background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 3 }}>
        {[['calendar', 'Calendar'], ['table', 'Table']].map(([key, label]) => (
          <button key={key} onClick={() => { setActiveTab(key); setPage(0) }}
            style={{ flex: 1, padding: '0.42rem 0.625rem', borderRadius: 8, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', fontWeight: activeTab === key ? 600 : 400, cursor: 'pointer', background: activeTab === key ? 'var(--col-acc)' : 'transparent', color: activeTab === key ? 'var(--col-bg)' : C.muted, border: `1px solid ${activeTab === key ? 'var(--col-acc)' : 'transparent'}`, transition: 'all .18s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TABLE TAB ── */}
      {activeTab === 'table' && (
        <>
          {/* Unpaid filter + count */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => { setUnpaidOnly(v => !v); setPage(0) }}
              style={{ padding: '0.32rem 0.875rem', borderRadius: 8, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', background: unpaidOnly ? C.redBg : C.subtle, border: `1px solid ${unpaidOnly ? C.redBorder : C.border}`, color: unpaidOnly ? C.red : C.muted, transition: 'all .15s' }}>
              {unpaidOnly ? '✕ Unpaid only' : 'Unpaid only'}
            </button>
            <span style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
              {filteredSheets.length} session{filteredSheets.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Table */}
          {filteredSheets.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '2.5rem', textAlign: 'center' }}>
              <Clock size={28} style={{ margin: '0 auto 0.6rem', color: C.border, display: 'block' }} />
              <p style={{ color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', margin: 0 }}>
                {unpaidOnly ? 'No unpaid sessions — all settled ✓' : 'No completed sessions yet'}
              </p>
            </div>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: TABLE_COLS, padding: '0.55rem 1rem', background: 'rgba(var(--rgb-hi),0.025)', borderBottom: `1px solid ${C.border}`, gap: '0.5rem' }}>
                {['Date', 'Hours', 'Earned', 'Status', ''].map(h => (
                  <div key={h} style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>{h}</div>
                ))}
              </div>
              {visible.map((t, i) => (
                <PayRow key={t.id} t={t} rate={rate} last={i === visible.length - 1} onInfo={t => setInfoModal([t])} />
              ))}
            </div>
          )}

          {totalPages > 1 && filteredSheets.length > 0 && (
            <Pagination page={page} total={totalPages} onChange={setPage} />
          )}
        </>
      )}

      {/* ── CALENDAR TAB ── */}
      {activeTab === 'calendar' && (
        <PayCalendar
          sheets={sheets}
          rate={rate}
          calDate={calDate}
          setCalDate={setCalDate}
          onDayClick={sessions => setInfoModal(sessions)}
        />
      )}

      {/* Session info modal */}
      {infoModal && <SessionModal sessions={infoModal} rate={rate} onClose={() => setInfoModal(null)} />}
    </div>
  )
}
