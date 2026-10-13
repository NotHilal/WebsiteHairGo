import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { apptFinalPrice } from '../../lib/price'
import { fetchAll } from '../../lib/fetchAll'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameDay, isBefore, startOfDay,
  startOfWeek, addDays, addWeeks, subWeeks, subDays,
} from 'date-fns'

const C = {
  card: 'var(--col-modal)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)', subtle: 'rgba(var(--rgb-hi),0.06)',
  border: 'rgba(var(--rgb-hi),0.07)',
}

const STATUS = {
  pending:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.22)'  },
  confirmed: { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.22)'  },
  cancelled: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.22)' },
  completed: { color: 'var(--col-acc)', bg: 'rgba(var(--rgb-acc),0.12)',  border: 'rgba(var(--rgb-acc),0.22)' },
}

const PAY_IN_STORE_STYLE = { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.22)' }
const apptStyle = a => a.payment_status === 'pay_in_store' ? PAY_IN_STORE_STYLE : (STATUS[a.status] || STATUS.pending)

const ALL_STATUSES = ['confirmed', 'completed', 'cancelled']
const ARTIST_COLORS = ['#a78bfa','#34d399','#f59e0b','#60a5fa','#f87171','#fb923c','#e879f9','#2dd4bf']
const WDAYS_SHORT  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WDAYS_SUN    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }

const HOUR_HEIGHT = 72
const GRID_START  = 9
const GRID_END    = 19
const GRID_HOURS  = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i)

function timeToMin(t) {
  if (!t) return GRID_START * 60
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function apptTop(time)   { return (timeToMin(time) - GRID_START * 60) * (HOUR_HEIGHT / 60) }
function apptHeight(dur) { return Math.max((dur || 30) * (HOUR_HEIGHT / 60), 22) }

function layoutAppts(appts) {
  if (!appts.length) return []
  const items = appts
    .map(a => ({ ...a, _s: timeToMin(a.time?.slice(0, 5)), _e: timeToMin(a.time?.slice(0, 5)) + (a.services?.duration || 30) }))
    .sort((a, b) => a._s - b._s)
  const colEnds = []
  const withCol = items.map(item => {
    let col = colEnds.findIndex(e => e <= item._s)
    if (col === -1) { col = colEnds.length; colEnds.push(0) }
    colEnds[col] = item._e
    return { ...item, _col: col }
  })
  return withCol.map(item => ({
    ...item,
    _n: withCol.filter(b => b._s < item._e && b._e > item._s)
               .reduce((mx, b) => Math.max(mx, b._col + 1), item._col + 1),
  }))
}

function StatusDropdown({ appt, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, right: 0 })
  const btnRef      = useRef(null)
  const dropdownRef = useRef(null)
  const cfg = STATUS[appt.status] || STATUS.pending

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (btnRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    setOpen(o => !o)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button ref={btnRef} onClick={handleOpen}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 8px', borderRadius: 8, cursor: 'pointer', background: cfg.bg, border: `1px solid ${open ? cfg.color : cfg.border}`, transition: 'all .15s' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: cfg.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'capitalize' }}>{appt.status}</span>
        <ChevronDown size={10} style={{ color: cfg.color, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div ref={dropdownRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, background: 'var(--col-modal)', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', minWidth: 140, boxShadow: '0 12px 40px rgba(0,0,0,0.55)' }}>
          {ALL_STATUSES.filter(s => s !== appt.status).map(s => {
            const c = STATUS[s]
            return (
              <button key={s} onClick={() => { onUpdate(appt.id, s); setOpen(false) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', transition: 'background .12s', textAlign: 'left' }}
                className={`st-btn-${s}`}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: c.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, textTransform: 'capitalize' }}>{s}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function StudioSchedule() {
  const { user, isAdmin, isManager } = useAuth()
  const [appointments,  setAppointments]  = useState([])
  const [stylists,      setStylists]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [view,          setView]          = useState('daily')
  const [stylistFilter, setStylistFilter] = useState(null)
  const [month,         setMonth]         = useState(new Date())
  const [weekDate,      setWeekDate]      = useState(new Date())
  const [dayDate,       setDayDate]       = useState(new Date())
  const [selectedAppt,  setSelectedAppt]  = useState(null)

  useEffect(() => {
    load()
    let debounce = null
    const sub = supabase.channel('schedule-appointments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        clearTimeout(debounce)
        debounce = setTimeout(load, 800)
      })
      .subscribe()
    return () => { clearTimeout(debounce); supabase.removeChannel(sub) }
  }, [])

  // Auto-select own stylist for workers once auth + stylist list are ready
  useEffect(() => {
    if (isAdmin || isManager || !user || stylists.length === 0) return
    supabase.from('stylists').select('id').eq('profile_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setStylistFilter(data.id) })
  }, [user, stylists, isAdmin, isManager])

  async function load() {
    const [{ data: allAppts }, { data: stylistList }] = await Promise.all([
      fetchAll(() => supabase.from('appointments')
        .select('*, profiles(full_name, phone), services(name, price, duration), stylists(name, photo_url)')
        .neq('status', 'cancelled')
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .order('id')),
      supabase.from('stylists').select('id, name, photo_url').order('display_order'),
    ])
    setAppointments(allAppts || [])
    setStylists(stylistList || [])
    setLoading(false)
  }

  async function updateStatus(id, newStatus) {
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a))
    if (selectedAppt?.id === id) setSelectedAppt(prev => ({ ...prev, status: newStatus }))
  }

  // ── Derived ──
  const visibleAppts = stylistFilter ? appointments.filter(a => a.stylist_id === stylistFilter) : appointments
  const byDate = visibleAppts.reduce((acc, a) => {
    if (!acc[a.date]) acc[a.date] = []
    acc[a.date].push(a)
    return acc
  }, {})

  // Stable color map: stylist id → color, stylist name → color (fallback)
  const stylistColorById   = {}
  const stylistColorByName = {}
  stylists.forEach((s, i) => {
    const c = ARTIST_COLORS[i % ARTIST_COLORS.length]
    stylistColorById[s.id]     = c
    stylistColorByName[s.name] = c
  })

  const monthDays = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startPad  = getDay(startOfMonth(month))
  const weekStart = startOfWeek(weekDate, { weekStartsOn: 1 })
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const dayStr      = format(dayDate, 'yyyy-MM-dd')
  const dayApptList = (byDate[dayStr] || []).sort((a, b) => a.time.localeCompare(b.time))

  const navLabel = view === 'monthly'
    ? format(month, 'MMMM yyyy')
    : view === 'weekly'
      ? `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
      : format(dayDate, 'EEEE, MMMM d')

  function navPrev() {
    if (view === 'monthly') setMonth(m => subMonths(m, 1))
    else if (view === 'weekly') setWeekDate(d => subWeeks(d, 1))
    else setDayDate(d => subDays(d, 1))
  }
  function navNext() {
    if (view === 'monthly') setMonth(m => addMonths(m, 1))
    else if (view === 'weekly') setWeekDate(d => addWeeks(d, 1))
    else setDayDate(d => addDays(d, 1))
  }
  function navToday() {
    const now = new Date()
    setMonth(now); setWeekDate(now); setDayDate(now)
  }

  function openDay(day) {
    setDayDate(day)
    setView('daily')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: '0.6rem', paddingBottom: '0.6rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.3rem,2vw,1.7rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.1rem' }}>Schedule</h1>
          <p style={{ fontSize: '0.7rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>{appointments.length} total appointments</p>
        </div>
        <div style={{ display: 'flex', background: C.subtle, borderRadius: 10, padding: 3, gap: 2, flexShrink: 0 }}>
          {['daily', 'weekly', 'monthly'].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.05em', transition: 'all .18s',
                background: view === v ? C.goldBg : 'transparent',
                color: view === v ? C.gold : C.muted,
                outline: view === v ? `1px solid ${C.goldBorder}` : 'none',
              }}>
              <span className="sched-view-label-full">{v.charAt(0).toUpperCase() + v.slice(1)}</span>
              <span className="sched-view-label-short">{{ daily: 'Day', weekly: 'Wk', monthly: 'Mo' }[v]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Calendar card */}
      <div style={{ ...card, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 1rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={navPrev} className="d-nav"
            style={{ width: 30, height: 30, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted, transition: 'all .18s' }}>
            <ChevronLeft size={13} />
          </button>
          <span className="font-display" style={{ fontSize: '1.05rem', color: C.white, flex: 1, textAlign: 'center' }}>{navLabel}</span>
          <button onClick={navToday} className="d-today-btn"
            style={{ padding: '5px 14px', borderRadius: 20, background: 'transparent', border: `1px solid ${C.goldBorder}`, color: C.goldDim, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .18s' }}>
            Today
          </button>
          <button onClick={navNext} className="d-nav"
            style={{ width: 30, height: 30, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted, transition: 'all .18s' }}>
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Stylist filter */}
        {stylists.length > 0 && (
          <div style={{ display: 'flex', gap: 6, padding: '0.35rem 1rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, overflowX: 'auto' }}>
            <button onClick={() => setStylistFilter(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 20, border: `1px solid ${!stylistFilter ? C.goldBorder : C.border}`, background: !stylistFilter ? C.goldBg : 'transparent', color: !stylistFilter ? C.gold : C.muted, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', flexShrink: 0 }}>
              All stylists
            </button>
            {stylists.map(s => {
              const active = stylistFilter === s.id
              return (
                <button key={s.id} onClick={() => setStylistFilter(active ? null : s.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 12px 4px 5px', borderRadius: 20, border: `1px solid ${active ? C.goldBorder : C.border}`, background: active ? C.goldBg : 'transparent', color: active ? C.gold : C.muted, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {s.photo_url
                    ? <img src={s.photo_url} alt={s.name} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', border: `1.5px solid ${active ? C.gold : 'rgba(var(--rgb-hi),0.12)'}` }} />
                    : <div style={{ width: 24, height: 24, borderRadius: '50%', background: active ? C.goldBg : C.subtle, border: `1.5px solid ${active ? C.goldBorder : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: active ? C.gold : C.muted, fontWeight: 700 }}>{s.name.charAt(0)}</div>
                  }
                  {s.name.split(' ')[0]}
                </button>
              )
            })}
          </div>
        )}

        {/* ── MONTHLY ── */}
        {view === 'monthly' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Horizontally scrollable calendar */}
            <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto' }}>
              <div style={{ minWidth: 780, padding: '0.4rem 0.75rem 0.5rem', display: 'flex', flexDirection: 'column', minHeight: '100%', boxSizing: 'border-box' }}>
                {/* Weekday headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 5, flexShrink: 0 }}>
                  {WDAYS_SUN.map((d, i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: i === 0 || i === 6 ? C.goldDim : C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, padding: '5px 0' }}>{d}</div>
                  ))}
                </div>
                {/* Day grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, alignContent: 'start' }}>
                  {Array.from({ length: startPad }).map((_, i) => <div key={`p${i}`} />)}
                  {loading
                    ? monthDays.map((_, i) => <div key={i} style={{ minHeight: 110, borderRadius: 9, background: C.subtle, border: `1px solid ${C.border}` }} />)
                    : monthDays.map(day => {
                        const key = format(day, 'yyyy-MM-dd')
                        const appts = byDate[key] || []
                        const isToday = isSameDay(day, new Date())
                        const isPast = isBefore(day, startOfDay(new Date()))
                        const isWeekend = getDay(day) === 0 || getDay(day) === 6
                        const hasAppts = appts.length > 0

                        // Count per artist — key is id (preferred) or name (fallback)
                        const artistMap = new Map() // key → { count, color }
                        let fallbackIdx = 0
                        for (const a of appts) {
                          const key2 = a.stylist_id || a.stylists?.name || `__anon${fallbackIdx++}`
                          if (!artistMap.has(key2)) {
                            const color = stylistColorById[a.stylist_id]
                              || stylistColorByName[a.stylists?.name]
                              || ARTIST_COLORS[artistMap.size % ARTIST_COLORS.length]
                            artistMap.set(key2, { count: 0, color })
                          }
                          artistMap.get(key2).count++
                        }

                        return (
                          <div key={key} onClick={() => hasAppts && openDay(day)}
                            className={`d-cal-day ${hasAppts ? 'has-appts' : ''}`}
                            style={{ minHeight: 110, borderRadius: 9, padding: '8px 9px 7px', border: `1.5px solid ${isToday ? C.goldBorder : C.border}`, background: isToday ? C.goldBg : isWeekend ? 'rgba(var(--rgb-hi),0.015)' : 'rgba(var(--rgb-hi),0.02)', opacity: isPast && !hasAppts ? 0.35 : 1, cursor: hasAppts ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', transition: 'all .18s ease' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span className="font-display" style={{ fontSize: '1.1rem', color: isToday ? C.gold : isPast ? C.muted : C.white, fontWeight: 700, lineHeight: 1 }}>{format(day, 'd')}</span>
                              {hasAppts && <span style={{ fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: C.goldDim, background: C.goldBg, border: `1px solid ${C.goldBorder}`, borderRadius: 20, padding: '1px 7px', lineHeight: 1.6 }}>{appts.length}</span>}
                            </div>
                            {hasAppts && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'auto' }}>
                                {[...artistMap.entries()].map(([k, { count, color }]) => (
                                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                    <span style={{ fontSize: 11, color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{count}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })
                  }
                </div>
              </div>
            </div>
            {/* Legend — per artist */}
            {stylists.length > 0 && (
              <div style={{ flexShrink: 0, display: 'flex', gap: 14, padding: '0.35rem 0.75rem', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                {stylists.map((s, idx) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ARTIST_COLORS[idx % ARTIST_COLORS.length], flexShrink: 0 }} />
                    {s.name.split(' ')[0]}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── WEEKLY ── */}
        {view === 'weekly' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {/* Horizontal scroll wrapper on mobile */}
            <div className="week-scroll-wrap" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
            {/* Inner div — min-width forces horizontal scroll on mobile */}
            <div className="week-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Day headers */}
            <div style={{ display: 'flex', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: 48, flexShrink: 0 }} />
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, new Date())
                return (
                  <div key={i} style={{ flex: 1, textAlign: 'center', padding: '0.35rem 0.25rem', borderLeft: `1px solid ${C.border}`, background: isToday ? C.goldBg : 'transparent' }}>
                    <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: isToday ? C.gold : C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, marginBottom: 2 }}>{WDAYS_SHORT[i]}</p>
                    <p className="font-display" style={{ fontSize: '1.15rem', color: isToday ? C.gold : C.white, lineHeight: 1, fontWeight: 700 }}>{format(day, 'd')}</p>
                  </div>
                )
              })}
            </div>

            {/* Scrollable time grid */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div style={{ display: 'flex', height: (GRID_END - GRID_START) * HOUR_HEIGHT }}>

                {/* Time axis */}
                <div style={{ width: 48, flexShrink: 0, position: 'relative' }}>
                  {GRID_HOURS.map((h, i) => (
                    <div key={h} style={{ position: 'absolute', top: i * HOUR_HEIGHT + 4, right: 8, fontSize: '0.75rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>
                      {String(h).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {weekDays.map((day, i) => {
                  const key = format(day, 'yyyy-MM-dd')
                  const laidOut = layoutAppts(byDate[key] || [])
                  const isToday = isSameDay(day, new Date())
                  return (
                    <div key={i} style={{ flex: 1, position: 'relative', borderLeft: `1px solid ${C.border}`, background: isToday ? C.goldBg : 'transparent' }}>
                      {/* Hour lines */}
                      {GRID_HOURS.map((h, j) => (
                        <div key={h} style={{ position: 'absolute', top: j * HOUR_HEIGHT, left: 0, right: 0, height: 1, background: 'rgba(var(--rgb-hi),0.05)', pointerEvents: 'none' }} />
                      ))}
                      {/* Appointments */}
                      {laidOut.map(appt => {
                        const s   = apptStyle(appt)
                        const top = apptTop(appt.time?.slice(0, 5))
                        const h   = apptHeight(appt.services?.duration)
                        const pct = 100 / appt._n
                        return (
                          <div key={appt.id} onClick={() => setSelectedAppt(appt)} className="d-week-chip"
                            style={{ position: 'absolute', top: top + 1, height: h - 2, left: `calc(${appt._col * pct}% + 2px)`, width: `calc(${pct}% - 3px)`, borderRadius: 6, background: s.bg, border: `1px solid ${s.border}`, cursor: 'pointer', overflow: 'hidden', padding: '4px 5px', boxSizing: 'border-box', transition: 'filter .15s' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              {appt.stylists?.photo_url
                                ? <img src={appt.stylists.photo_url} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0 }} />
                                : <div style={{ width: 14, height: 14, borderRadius: '50%', background: `${s.color}22`, border: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: s.color, fontWeight: 700, flexShrink: 0 }}>{appt.stylists?.name?.charAt(0) || '?'}</div>
                              }
                              <p style={{ fontSize: 11, color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, lineHeight: 1.2 }}>
                                {appt.stylists?.name?.split(' ')[0] || '—'}
                              </p>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} className={appt.status === 'pending' ? 'dot-pulse' : ''} />
                            </div>
                            {h >= 44 && appt.services?.name && (
                              <p style={{ fontSize: 10, color: C.muted, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2, marginTop: 2 }}>
                                {appt.services.name}
                              </p>
                            )}
                            {h >= 60 && (
                              <p style={{ fontSize: 10, color: s.color, fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>
                                {appt.services?.duration ? `${appt.services.duration} min` : ''}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Legend */}
            <div style={{ flexShrink: 0, display: 'flex', gap: 14, padding: '0.3rem 1rem', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
              {ALL_STATUSES.map(st => (
                <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS[st].color, flexShrink: 0 }} />
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: PAY_IN_STORE_STYLE.color, flexShrink: 0 }} />
                Pay in store
              </div>
            </div>
            </div>{/* end week-inner */}
            </div>{/* end week-scroll-wrap */}
          </div>
        )}

        {/* ── DAILY ── */}
        {view === 'daily' && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div className="sched-day-grid" style={{ height: (GRID_END - GRID_START) * HOUR_HEIGHT }}>

              {/* Time axis */}
              <div style={{ width: 48, flexShrink: 0, position: 'relative' }}>
                {GRID_HOURS.map((h, i) => (
                  <div key={h} style={{ position: 'absolute', top: i * HOUR_HEIGHT + 4, right: 8, fontSize: '0.75rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Single day column */}
              <div style={{ flex: 1, position: 'relative', borderLeft: `1px solid ${C.border}` }}>
                {/* Hour lines */}
                {GRID_HOURS.map((h, i) => (
                  <div key={h} style={{ position: 'absolute', top: i * HOUR_HEIGHT, left: 0, right: 0, height: 1, background: 'rgba(var(--rgb-hi),0.05)', pointerEvents: 'none' }} />
                ))}
                {/* Appointments */}
                {loading ? null : layoutAppts(dayApptList).map(appt => {
                  const s   = apptStyle(appt)
                  const top = apptTop(appt.time?.slice(0, 5))
                  const h   = apptHeight(appt.services?.duration)
                  const pct = 100 / appt._n
                  return (
                    <div key={appt.id} onClick={() => setSelectedAppt(appt)} className="d-day-chip"
                      style={{ position: 'absolute', top: top + 1, height: h - 2, left: `calc(${appt._col * pct}% + 6px)`, width: `calc(${pct}% - 10px)`, borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, cursor: 'pointer', overflow: 'hidden', padding: '6px 10px', boxSizing: 'border-box', transition: 'filter .15s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {appt.stylists?.photo_url
                          ? <img src={appt.stylists.photo_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: `1.5px solid ${s.border}` }} />
                          : <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${s.color}22`, border: `1.5px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: s.color, fontWeight: 700, flexShrink: 0 }}>{appt.stylists?.name?.charAt(0) || '?'}</div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: C.white, fontSize: '0.92rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                            {appt.stylists?.name || 'Stylist'}
                          </p>
                          {h >= 44 && (
                            <p style={{ color: C.muted, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                              {[appt.services?.name, appt.profiles?.full_name].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                          <span style={{ fontSize: '0.8rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{appt.time?.slice(0, 5)}</span>
                          {h >= 44 && (
                            <div style={{ padding: '2px 8px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}` }}>
                              <span style={{ fontSize: 10, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'capitalize' }}>{appt.status}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {h >= 56 && appt.services?.duration && (
                        <p style={{ fontSize: 11, color: s.color, fontFamily: 'DM Sans,sans-serif', marginTop: 4 }}>⏱ {appt.services.duration} min</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Mobile daily list (hidden on desktop) ── */}
            <div className="sched-day-mobile" style={{ flexDirection: 'column', gap: '0.5rem', padding: '0.75rem' }}>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ height: 84, borderRadius: 12, background: C.subtle, border: `1px solid ${C.border}`, animationDelay: `${i * 0.08}s` }} className="sched-shimmer" />
                ))
              ) : dayApptList.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', gap: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.4rem', color: C.muted }}>📅</span>
                  </div>
                  <p style={{ color: C.muted, fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif' }}>No appointments today</p>
                </div>
              ) : dayApptList.map(appt => {
                const s = apptStyle(appt)
                return (
                  <div key={appt.id} onClick={() => setSelectedAppt(appt)} className="sched-mobile-card"
                    style={{ background: s.bg, border: `1px solid ${s.border}`, borderLeft: `3px solid ${s.color}`, borderRadius: 12, padding: '0.875rem 1rem', cursor: 'pointer', transition: 'all .15s' }}>

                    {/* Top row: avatar + stylist + time + status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      {appt.stylists?.photo_url
                        ? <img src={appt.stylists.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: `1.5px solid ${s.border}` }} />
                        : <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${s.color}22`, border: `1.5px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: s.color, fontWeight: 700, flexShrink: 0 }}>{appt.stylists?.name?.charAt(0) || '?'}</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: C.white, fontSize: '1rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {appt.stylists?.name || 'Stylist'}
                        </p>
                        {appt.services?.name && (
                          <p style={{ color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {appt.services.name}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <span style={{ fontSize: '1.3rem', color: s.color, fontFamily: '"Cormorant Garamond",serif', fontWeight: 700, lineHeight: 1 }}>
                          {appt.time?.slice(0, 5)}
                        </span>
                        <div style={{ padding: '3px 10px', borderRadius: 20, background: `${s.color}18`, border: `1px solid ${s.border}` }}>
                          <span style={{ fontSize: 10, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{appt.status}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom row: client + duration + price */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: '0.5rem', borderTop: `1px solid ${s.color}28` }}>
                      {appt.profiles?.full_name && (
                        <span style={{ flex: 1, fontSize: '0.85rem', color: C.dim, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {appt.profiles.full_name}
                        </span>
                      )}
                      {appt.services?.duration && (
                        <span style={{ fontSize: '0.8rem', color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>
                          ⏱ {appt.services.duration} min
                        </span>
                      )}
                      {appt.services?.price && (
                        <span style={{ fontSize: '0.85rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, flexShrink: 0 }}>
                          ${apptFinalPrice(appt).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Appointment detail modal */}
      {selectedAppt && (() => {
        const a = selectedAppt
        const s = apptStyle(a)
        const rows = [
          { label: 'Date',     value: a.date ? format(new Date(a.date), 'EEEE, MMMM d, yyyy') : '—' },
          { label: 'Time',     value: a.time?.slice(0, 5) || '—' },
          { label: 'Client',   value: a.profiles?.full_name || '—' },
          { label: 'Phone',    value: a.profiles?.phone || '—' },
          { label: 'Service',  value: a.services?.name || '—' },
          { label: 'Duration', value: a.services?.duration ? `${a.services.duration} min` : '—' },
          { label: 'Price',    value: `$${apptFinalPrice(a).toFixed(2)}`, gold: true },
          { label: 'Stylist',  value: a.stylists?.name || '—' },
          ...(a.payment_status === 'pay_in_store' ? [{ label: 'Payment', value: 'Pay in store', blue: true }] : []),
          ...(a.notes ? [{ label: 'Notes', value: a.notes }] : []),
        ]
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
            onMouseDown={e => { if (e.target === e.currentTarget) setSelectedAppt(null) }}>
            <div
              style={{ width: '100%', maxWidth: 420, background: 'var(--col-modal)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.7)', border: `1px solid ${s.border}` }}
              onClick={e => e.stopPropagation()}>

              {/* Coloured top bar */}
              <div style={{ height: 3, background: `linear-gradient(90deg, ${s.color}, transparent)` }} />

              {/* Header */}
              <div style={{ padding: '1.25rem 1.25rem 1rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {a.stylists?.photo_url
                    ? <img src={a.stylists.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: `2px solid ${s.border}` }} />
                    : <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${s.color}18`, border: `1.5px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '1.1rem', color: s.color, fontFamily: '"Cormorant Garamond",serif', fontWeight: 600 }}>{a.stylists?.name?.charAt(0) || '?'}</span>
                      </div>
                  }
                  <div>
                    <p className="font-display" style={{ color: C.white, fontSize: '1.3rem', lineHeight: 1.1, marginBottom: 4 }}>
                      {a.profiles?.full_name || 'Client'}
                    </p>
                    <StatusDropdown appt={a} onUpdate={updateStatus} />
                  </div>
                </div>
                <button onClick={() => setSelectedAppt(null)} className="modal-x"
                  style={{ width: 30, height: 30, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all .2s' }}>
                  <X size={13} />
                </button>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: C.border, margin: '0 1.25rem' }} />

              {/* Info rows */}
              <div style={{ padding: '0.875rem 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {rows.map(({ label, value, gold, blue }, i) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.45rem 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <span style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0, marginRight: 16 }}>{label}</span>
                    <span style={{ fontSize: '0.82rem', color: blue ? PAY_IN_STORE_STYLE.color : gold ? C.gold : C.dim, fontFamily: 'DM Sans,sans-serif', fontWeight: blue || gold ? 600 : 300, textAlign: 'right' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      <style>{`
        @keyframes dot-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.4)} }
        .dot-pulse { animation: dot-pulse 1.6s ease-in-out infinite; }
        .d-nav:hover       { background: ${C.goldBg} !important; border-color: ${C.goldBorder} !important; color: ${C.gold} !important; }
        .d-today-btn:hover { background: ${C.gold} !important; color: var(--col-bg) !important; }
        .d-cal-day.has-appts:hover { border-color: ${C.goldBorder} !important; background: rgba(var(--rgb-acc),0.04) !important; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .d-week-hdr:hover  { background: rgba(var(--rgb-hi),0.04) !important; border-color: rgba(var(--rgb-hi),0.1) !important; }
        .d-week-chip:hover { filter: brightness(1.15); transform: translateY(-1px); }
        .d-day-chip:hover  { filter: brightness(1.12); transform: translateX(2px); }
        .modal-x:hover     { background: rgba(var(--rgb-hi),0.08) !important; color: ${C.white} !important; }
        .filter-pill:hover { border-color: ${C.goldBorder} !important; color: ${C.goldDim} !important; }
        .appt-card-row:hover { border-color: rgba(var(--rgb-acc),0.15) !important; }
        .st-btn-pending:hover   { background: rgba(245,158,11,0.2) !important; }
        .st-btn-confirmed:hover { background: rgba(52,211,153,0.2) !important; }
        .st-btn-completed:hover { background: rgba(var(--rgb-acc),0.2) !important; }
        .st-btn-cancelled:hover { background: rgba(248,113,113,0.2) !important; }
        .del-appt-btn:hover { background: rgba(248,113,113,0.2) !important; border-color: rgba(248,113,113,0.4) !important; }
        .pg-btn:not(:disabled):hover { background: ${C.goldBg} !important; }
        /* Daily view: grid (desktop) vs card list (mobile) */
        .sched-day-grid   { display: flex; }
        .sched-day-mobile { display: none; }
        .sched-mobile-card:hover { filter: brightness(1.1); transform: translateX(2px); }
        @keyframes sched-shimmer {
          0%   { background-position: -400px 0 }
          100% { background-position:  400px 0 }
        }
        .sched-shimmer {
          background: linear-gradient(90deg, rgba(var(--rgb-hi),0.04) 25%, rgba(var(--rgb-hi),0.08) 50%, rgba(var(--rgb-hi),0.04) 75%);
          background-size: 400px 100%;
          animation: sched-shimmer 1.6s ease-in-out infinite;
        }
        @media (max-width: 767px) {
          .week-scroll-wrap { overflow-x: auto !important; overflow-y: hidden !important; height: 100%; }
          .week-inner { min-width: 600px; }
          /* Switch daily view: hide time grid, show card list */
          .sched-day-grid   { display: none !important; }
          .sched-day-mobile { display: flex !important; }
          /* Bigger fonts across the board on mobile */
          .sched-mobile-card p  { font-size: 1rem !important; }
          .sched-mobile-card span { font-size: 0.85rem !important; }
          /* Toolbar: hide full labels, show short ones */
          .sched-view-label-full { display: none; }
          .sched-view-label-short { display: inline; }
        }
        @media (min-width: 768px) {
          .sched-view-label-full { display: inline; }
          .sched-view-label-short { display: none; }
        }
      `}</style>
    </div>
  )
}
