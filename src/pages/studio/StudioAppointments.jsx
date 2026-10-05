import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X, Calendar, User, Tag, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLogAction } from '../../hooks/useLogAction'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameDay, isBefore, startOfDay,
  parseISO, startOfWeek, endOfWeek, isSameMonth,
} from 'date-fns'
import toast from 'react-hot-toast'

const C = {
  card: 'var(--col-modal)', modal: 'var(--col-modal)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)', subtle: 'rgba(var(--rgb-hi),0.06)',
  border: 'rgba(var(--rgb-hi),0.07)',
}

const STATUS = {
  pending:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.22)'  },
  confirmed: { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.22)'  },
  cancelled: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.22)' },
  completed: { color: 'var(--col-acc)', bg: 'rgba(var(--rgb-acc),0.12)',  border: 'rgba(var(--rgb-acc),0.22)' }  },
}

const ALL_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled']
const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PERIOD_TABS = [
  { key: 'day',   label: 'Today'      },
  { key: 'week',  label: 'This Week'  },
  { key: 'month', label: 'This Month' },
  { key: 'all',   label: 'All Time'   },
]

export default function StudioAppointments() {
  const log = useLogAction()
  const [appointments, setAppointments] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [viewTab,      setViewTab]      = useState('list')
  const [month,        setMonth]        = useState(new Date())
  const [selectedDay,  setSelectedDay]  = useState(null)
  const [filter,       setFilter]       = useState('all')
  const [page,         setPage]         = useState(0)
  const [periodFilter, setPeriodFilter] = useState('all')
  const [listPage,     setListPage]     = useState(0)
  const [cancelModal,  setCancelModal]  = useState(null)
  const [cancelling,   setCancelling]   = useState(false)
  const [perPage,      setPerPage]      = useState(() => window.innerWidth <= 640 ? 4 : 5)

  const PAGE_SIZE = 3

  useEffect(() => {
    const handler = () => setPerPage(window.innerWidth <= 640 ? 4 : 5)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('appointments')
      .select('*, profiles(full_name, phone), services(name, price, duration), stylists(name)')
      .order('date', { ascending: true })
      .order('time', { ascending: true })
    setAppointments(data || [])
    setLoading(false)
  }

  async function cancelWithCredit(appt) {
    setCancelling(true)
    try {
      const { data, error } = await supabase.functions.invoke('process-refund', {
        body: { type: 'cancel-with-credit', id: appt.id },
      })
      if (error) throw error
      setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'cancelled' } : a))
      log('appointment.status_changed', {
        entityType: 'appointment', entityId: appt.id,
        details: { message: `cancelled ${appt.profiles?.full_name || 'client'}'s "${appt.services?.name || 'appointment'}" — store credit issued${data?.couponCode ? `: ${data.couponCode} ($${data?.creditAmount})` : ''}` },
      })
      toast.success(data?.couponCode
        ? `Cancelled · Store credit ${data.couponCode} ($${data.creditAmount}) sent to client`
        : 'Appointment cancelled (no payment on file — no credit issued)')
      setCancelModal(null)
    } catch (err) {
      toast.error(err.message || 'Failed to cancel')
    } finally {
      setCancelling(false)
    }
  }

  async function cancelOnly(appt) {
    setCancelling(true)
    try {
      await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id)
      setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'cancelled' } : a))
      log('appointment.status_changed', {
        entityType: 'appointment', entityId: appt.id,
        details: { message: `cancelled ${appt.profiles?.full_name || 'client'}'s "${appt.services?.name || 'appointment'}" (no credit)` },
      })
      toast.success('Appointment cancelled')
      setCancelModal(null)
    } catch (err) {
      toast.error(err.message || 'Failed to cancel')
    } finally {
      setCancelling(false)
    }
  }

  async function updateStatus(id, newStatus) {
    const appt = appointments.find(a => a.id === id)

    if (newStatus === 'cancelled') {
      setCancelModal(appt)
      return
    }

    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id)
    if (error) { toast.error(error.message); return }

    const clientName = appt?.profiles?.full_name || 'client'
    const service    = appt?.services?.name || 'appointment'
    log('appointment.status_changed', {
      entityType: 'appointment', entityId: id,
      details: { message: `changed ${clientName}'s "${service}" appointment status → ${newStatus}` },
    })

    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a))

    if (newStatus === 'completed' && appt?.status !== 'completed' && appt?.user_id) {
      const { data: prof } = await supabase.from('profiles').select('points').eq('id', appt.user_id).single()
      const newCount = (prof?.points || 0) + 1
      await supabase.from('profiles').update({ points: newCount }).eq('id', appt.user_id)

      if (newCount % 5 === 0) {
        const code = `REWARD${Math.random().toString(36).slice(2, 7).toUpperCase()}`
        const expiry = new Date()
        expiry.setMonth(expiry.getMonth() + 3)
        const { data: coupon } = await supabase.from('coupons').insert({
          code,
          discount_type: 'percentage',
          discount_value: 30,
          min_points_required: 0,
          expiry_date: expiry.toISOString().split('T')[0],
          max_uses: 1,
          active: true,
          is_public: false,
        }).select().single()

        if (coupon) {
          await supabase.from('user_coupons').insert({ user_id: appt.user_id, coupon_id: coupon.id, used: false })
          toast.success(`Visit ${newCount} — 30% reward coupon sent to ${appt.profiles?.full_name || 'client'}`)
        }
      } else {
        const remaining = 5 - (newCount % 5)
        toast.success(`Visit ${newCount % 5}/5 — ${remaining} more to unlock 30% off`)
      }
    } else {
      toast.success(`Marked as ${newStatus}`)
    }
  }

  // calendar
  const days     = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startPad = getDay(startOfMonth(month))

  const byDate = appointments.reduce((acc, a) => {
    if (!acc[a.date]) acc[a.date] = []
    acc[a.date].push(a)
    return acc
  }, {})

  const allDayAppts   = selectedDay ? (byDate[format(selectedDay, 'yyyy-MM-dd')] || []) : []
  const filteredAppts = allDayAppts.filter(a => filter === 'all' || a.status === filter)
  const totalPages    = Math.ceil(filteredAppts.length / PAGE_SIZE)
  const dayAppts      = filteredAppts.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const dayCounts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = allDayAppts.filter(a => a.status === s).length
    return acc
  }, {})

  const totalAppts   = appointments.length
  const pendingCount = appointments.filter(a => a.status === 'pending').length

  // list view
  const periodAppts = (() => {
    const now = new Date()
    if (periodFilter === 'all')   return [...appointments]
    if (periodFilter === 'day')   return appointments.filter(a => a.date === format(now, 'yyyy-MM-dd'))
    if (periodFilter === 'week') {
      const ws = startOfWeek(now, { weekStartsOn: 1 })
      const we = endOfWeek(now,   { weekStartsOn: 1 })
      return appointments.filter(a => { const d = parseISO(a.date); return d >= ws && d <= we })
    }
    if (periodFilter === 'month') return appointments.filter(a => isSameMonth(parseISO(a.date), now))
    return []
  })()
  const listTotalPages = Math.ceil(periodAppts.length / perPage)
  const listPageAppts  = periodAppts.slice(listPage * perPage, (listPage + 1) * perPage)

  return (
    <div className="appts-outer" style={{ display: 'flex', flexDirection: 'column', height: viewTab === 'calendar' ? '100%' : 'auto', overflowY: viewTab === 'calendar' ? 'hidden' : 'auto', minHeight: 0 }}>
      <style>{`
        @keyframes dot-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.4)} }
        .dot-pulse { animation: dot-pulse 1.6s ease-in-out infinite; }
        .cal-day-appt:hover { border-color: ${C.goldBorder} !important; background: rgba(var(--rgb-acc),0.04) !important; cursor: pointer; }
        .cal-day-appt.has-appts:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .cal-day-empty-hover:hover { border-color: ${C.border} !important; }
        .bd-nav:hover { background: ${C.goldBg} !important; border-color: ${C.goldBorder} !important; color: ${C.gold} !important; }
        .st-btn-pending:hover   { background: rgba(245,158,11,0.2) !important; }
        .st-btn-confirmed:hover { background: rgba(52,211,153,0.2) !important; }
        .st-btn-completed:hover { background: rgba(var(--rgb-acc),0.2) !important; }
        .st-btn-cancelled:hover { background: rgba(248,113,113,0.2) !important; }
        .appt-card-row:hover { border-color: rgba(var(--rgb-acc),0.15) !important; }
        .filter-pill:hover { border-color: ${C.goldBorder} !important; color: ${C.goldDim} !important; }
        .modal-x:hover { background: rgba(var(--rgb-hi),0.08) !important; color: ${C.white} !important; }
        .pg-btn:not(:disabled):hover { background: ${C.goldBg} !important; }
        .period-tab:hover { border-color: ${C.goldBorder} !important; color: ${C.gold} !important; background: ${C.goldBg} !important; }
        .view-tab-btn:hover { background: rgba(var(--rgb-hi),0.06) !important; }
        @media (max-width: 1199px) {
          .appts-outer { height: auto !important; overflow: visible !important; padding-bottom: 2rem !important; }
        }
        @media (max-width: 640px) {
          .cal-day-appt { min-height: 54px !important; padding: 5px 4px 4px !important; border-radius: 7px !important; }
          .cal-appt-preview { display: none !important; }
          .cal-appt-badge { padding: 1px 4px !important; font-size: 7px !important; }
          .cal-day-num { font-size: 0.82rem !important; }
          .cal-month-header { flex-wrap: wrap !important; gap: 8px !important; }
          .cal-month-label { font-size: 0.9rem !important; min-width: 110px !important; }
          .cal-today-btn { display: none !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, marginBottom: '1.25rem', paddingBottom: '1.1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.6rem,2.5vw,2.2rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.15rem' }}>Appointments</h1>
          <p style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
            {totalAppts} total
            {pendingCount > 0 && <span style={{ color: '#f59e0b', marginLeft: 8 }}>· {pendingCount} pending</span>}
          </p>
        </div>

        {/* View tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 3 }}>
          {[{ key: 'list', label: 'List' }, { key: 'calendar', label: 'Calendar' }].map(({ key, label }) => {
            const active = viewTab === key
            return (
              <button key={key} onClick={() => setViewTab(key)} className={active ? '' : 'view-tab-btn'}
                style={{ padding: '6px 18px', borderRadius: 9, border: `1px solid ${active ? C.goldBorder : 'transparent'}`, background: active ? C.goldBg : 'transparent', color: active ? C.gold : C.muted, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', fontWeight: active ? 700 : 500, cursor: 'pointer', transition: 'all .15s', letterSpacing: '0.04em' }}>
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── List view ── */}
      {viewTab === 'list' && (
        <div style={{ flex: 1 }}>
          {/* Period filter tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: '0.875rem', flexWrap: 'wrap', padding: '2px 0' }}>
            {PERIOD_TABS.map(({ key, label }) => {
              const active = periodFilter === key
              return (
                <button key={key}
                  onClick={() => { setPeriodFilter(key); setListPage(0) }}
                  className="period-tab"
                  style={{
                    padding: '7px 16px', borderRadius: 20,
                    border: `1px solid ${active ? C.goldBorder : 'rgba(var(--rgb-hi),0.14)'}`,
                    background: active ? C.goldBg : 'rgba(var(--rgb-hi),0.05)',
                    color: active ? C.gold : 'var(--col-text)',
                    fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: active ? 700 : 500,
                    cursor: 'pointer', transition: 'all .15s', letterSpacing: '0.04em',
                  }}>
                  {label}
                  {active && periodAppts.length > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.8 }}>· {periodAppts.length}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* List */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {Array.from({ length: perPage }).map((_, i) => (
                <div key={i} style={{ height: 64, borderRadius: 12, background: C.subtle, border: `1px solid ${C.border}` }} />
              ))}
            </div>
          ) : periodAppts.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 8 }}>
              <Calendar size={28} color={C.border} />
              <p style={{ color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif' }}>No appointments for this period</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {listPageAppts.map(appt => {
                const s        = STATUS[appt.status] || STATUS.pending
                const initials = appt.profiles?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
                return (
                  <div key={appt.id} className="appt-card-row"
                    style={{ background: 'rgba(var(--rgb-hi),0.025)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 12, transition: 'border-color .2s' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.goldBg, border: `1px solid ${C.goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.72rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{initials}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: C.white, fontSize: '0.88rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 2 }}>{appt.profiles?.full_name || 'Unknown'}</p>
                      <p style={{ color: C.muted, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[appt.date && format(parseISO(appt.date), 'MMM d'), appt.time?.slice(0,5), appt.services?.name, appt.stylists?.name].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {appt.services?.price && (
                      <span style={{ fontSize: '0.78rem', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>${appt.services.price}</span>
                    )}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.color }} className={appt.status === 'pending' ? 'dot-pulse' : ''} />
                      <span style={{ fontSize: 9, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'capitalize' }}>{appt.status}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* List pagination */}
          {listTotalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: '0.875rem', marginTop: '0.25rem' }}>
              <button onClick={() => setListPage(p => Math.max(0, p - 1))} disabled={listPage === 0}
                style={{ width: 28, height: 28, borderRadius: '50%', background: C.subtle, border: `1px solid ${listPage === 0 ? C.border : C.goldBorder}`, color: listPage === 0 ? C.muted : C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: listPage === 0 ? 'default' : 'pointer', opacity: listPage === 0 ? 0.35 : 1, transition: 'all .18s' }}
                className="pg-btn">
                <ChevronLeft size={13} />
              </button>
              <div style={{ display: 'flex', gap: 5 }}>
                {Array.from({ length: listTotalPages }).map((_, i) => (
                  <button key={i} onClick={() => setListPage(i)}
                    style={{ width: i === listPage ? 20 : 7, height: 7, borderRadius: 4, background: i === listPage ? C.gold : C.border, border: 'none', cursor: 'pointer', transition: 'all .2s ease', padding: 0 }} />
                ))}
              </div>
              <button onClick={() => setListPage(p => Math.min(listTotalPages - 1, p + 1))} disabled={listPage === listTotalPages - 1}
                style={{ width: 28, height: 28, borderRadius: '50%', background: C.subtle, border: `1px solid ${listPage === listTotalPages - 1 ? C.border : C.goldBorder}`, color: listPage === listTotalPages - 1 ? C.muted : C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: listPage === listTotalPages - 1 ? 'default' : 'pointer', opacity: listPage === listTotalPages - 1 ? 0.35 : 1, transition: 'all .18s' }}
                className="pg-btn">
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Calendar view ── */}
      {viewTab === 'calendar' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Month nav */}
          <div className="cal-month-header" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: '1rem' }}>
            <button onClick={() => setMonth(subMonths(month, 1))} className="bd-nav"
              style={{ width: 34, height: 34, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted, transition: 'all .18s' }}>
              <ChevronLeft size={14} />
            </button>
            <span className="font-display cal-month-label" style={{ fontSize: '1.15rem', color: C.white, minWidth: 160, textAlign: 'center' }}>
              {format(month, 'MMMM yyyy')}
            </span>
            <button onClick={() => setMonth(addMonths(month, 1))} className="bd-nav"
              style={{ width: 34, height: 34, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted, transition: 'all .18s' }}>
              <ChevronRight size={14} />
            </button>
            <button onClick={() => setMonth(new Date())}
              style={{ padding: '5px 14px', borderRadius: 20, background: 'transparent', border: `1px solid ${C.goldBorder}`, color: C.goldDim, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .18s' }}
              className="bd-nav cal-today-btn">
              Today
            </button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 5, flexShrink: 0 }}>
            {WDAYS.map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: i === 0 || i === 6 ? C.goldDim : C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, padding: '4px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, flex: 1, minHeight: 0, alignContent: 'start' }}>
            {Array.from({ length: startPad }).map((_, i) => <div key={`p${i}`} />)}

            {loading
              ? days.map((_, i) => (
                  <div key={i} style={{ minHeight: 88, borderRadius: 10, background: C.subtle, border: `1px solid ${C.border}` }} />
                ))
              : days.map(day => {
                  const key      = format(day, 'yyyy-MM-dd')
                  const appts    = byDate[key] || []
                  const isToday  = isSameDay(day, new Date())
                  const isPast   = isBefore(day, startOfDay(new Date()))
                  const isWeekend = getDay(day) === 0 || getDay(day) === 6
                  const hasAppts = appts.length > 0

                  const counts = ALL_STATUSES.reduce((acc, s) => {
                    acc[s] = appts.filter(a => a.status === s).length
                    return acc
                  }, {})

                  return (
                    <div key={key}
                      onClick={() => { if (hasAppts) { setSelectedDay(day); setFilter('all'); setPage(0) } }}
                      className={`cal-day-appt ${hasAppts ? 'has-appts' : 'cal-day-empty-hover'}`}
                      style={{
                        minHeight: 88, borderRadius: 10, padding: '8px 9px 7px',
                        border: `1.5px solid ${isToday ? C.goldBorder : C.border}`,
                        background: isToday ? C.goldBg : isWeekend ? 'rgba(var(--rgb-hi),0.015)' : 'rgba(var(--rgb-hi),0.02)',
                        opacity: isPast && !hasAppts ? 0.35 : 1,
                        cursor: hasAppts ? 'pointer' : 'default',
                        display: 'flex', flexDirection: 'column',
                        transition: 'all .18s ease',
                      }}>

                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span className="font-display cal-day-num" style={{ fontSize: '1.05rem', color: isToday ? C.gold : isPast ? C.muted : C.white, fontWeight: 700, lineHeight: 1 }}>
                          {format(day, 'd')}
                        </span>
                        {hasAppts && (
                          <span className="cal-appt-badge" style={{ fontSize: 9, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: C.goldDim, background: C.goldBg, border: `1px solid ${C.goldBorder}`, borderRadius: 20, padding: '1px 6px', lineHeight: 1.6 }}>
                            {appts.length}
                          </span>
                        )}
                      </div>

                      {hasAppts && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 'auto' }}>
                          {ALL_STATUSES.map(st => counts[st] > 0 && (
                            <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS[st].color, flexShrink: 0 }}
                                className={st === 'pending' ? 'dot-pulse' : ''} />
                              {counts[st] > 1 && (
                                <span style={{ fontSize: 8, color: STATUS[st].color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{counts[st]}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {hasAppts && appts[0] && (
                        <p className="cal-appt-preview" style={{ fontSize: 8, color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {appts[0].time?.slice(0, 5)} {appts[0].profiles?.full_name?.split(' ')[0] || ''}
                        </p>
                      )}
                    </div>
                  )
                })
            }
          </div>

          {/* Legend */}
          <div style={{ flexShrink: 0, display: 'flex', gap: 18, paddingTop: '0.875rem', marginTop: '0.5rem', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
            {ALL_STATUSES.map(st => (
              <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS[st].color, flexShrink: 0 }} />
                {st.charAt(0).toUpperCase() + st.slice(1)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cancel confirmation modal ── */}
      {cancelModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
          onClick={() => !cancelling && setCancelModal(null)}>
          <div style={{ width: '100%', maxWidth: 400, background: 'var(--col-modal)', borderRadius: 20, overflow: 'hidden', border: `1px solid rgba(var(--rgb-acc),0.18)`, boxShadow: '0 40px 100px rgba(0,0,0,0.7)' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#f87171', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, marginBottom: 6 }}>Cancel Appointment</p>
                  <p className="font-display font-light" style={{ fontSize: '1.4rem', color: C.white, lineHeight: 1.15, marginBottom: 4 }}>{cancelModal.services?.name || '—'}</p>
                  <p style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                    {cancelModal.profiles?.full_name || 'Client'}
                    {cancelModal.date ? ` · ${cancelModal.date}` : ''}
                    {cancelModal.time ? ` at ${cancelModal.time.slice(0, 5)}` : ''}
                  </p>
                </div>
                <button onClick={() => !cancelling && setCancelModal(null)}
                  style={{ width: 30, height: 30, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <X size={13} />
                </button>
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginBottom: 4 }}>
                How would you like to handle this cancellation?
              </p>

              <button onClick={() => cancelWithCredit(cancelModal)} disabled={cancelling}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, background: C.goldBg, border: `1px solid ${C.goldBorder}`, cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.6 : 1, transition: 'all 0.18s', textAlign: 'left', width: '100%' }}>
                <Tag size={16} color={C.gold} style={{ flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: '0.88rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, margin: 0 }}>Issue Store Credit</p>
                  <p style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', margin: '3px 0 0' }}>
                    Cancel &amp; generate a coupon for 100% of the amount paid — assigned to client's account
                  </p>
                </div>
              </button>

              <button onClick={() => cancelOnly(cancelModal)} disabled={cancelling}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.6 : 1, transition: 'all 0.18s', textAlign: 'left', width: '100%' }}>
                <AlertTriangle size={16} color="#f87171" style={{ flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: '0.88rem', color: '#f87171', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, margin: 0 }}>Cancel Only</p>
                  <p style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', margin: '3px 0 0' }}>
                    Mark as cancelled without issuing credit — use if client is rescheduling
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Day modal ── */}
      {selectedDay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
          onClick={() => setSelectedDay(null)}>
          <div style={{ width: '100%', maxWidth: 580, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--col-modal)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.7)', border: `1px solid rgba(var(--rgb-acc),0.2)` }}
            onClick={e => e.stopPropagation()}>

            <div style={{ padding: '1.75rem 1.75rem 1.25rem', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, background: 'radial-gradient(circle, rgba(var(--rgb-acc),0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, marginBottom: 6 }}>
                    {format(selectedDay, 'MMMM yyyy')}
                  </p>
                  <h2 className="font-display font-light" style={{ fontSize: '2.4rem', color: C.white, lineHeight: 1, marginBottom: 6 }}>
                    {format(selectedDay, 'EEEE d')}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <div style={{ width: 28, height: 1, background: `linear-gradient(90deg,${C.gold},transparent)` }} />
                    <span style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                      {allDayAppts.length} appointment{allDayAppts.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedDay(null)}
                  style={{ width: 32, height: 32, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .2s', flexShrink: 0 }}
                  className="modal-x">
                  <X size={14} />
                </button>
              </div>

              {allDayAppts.length > 0 && (
                <div style={{ display: 'flex', gap: 5, marginTop: '1.1rem', flexWrap: 'wrap' }}>
                  <button onClick={() => { setFilter('all'); setPage(0) }}
                    style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${filter === 'all' ? C.goldBorder : C.border}`, background: filter === 'all' ? C.goldBg : 'transparent', color: filter === 'all' ? C.gold : C.muted, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', letterSpacing: '0.05em' }}
                    className="filter-pill">
                    All · {allDayAppts.length}
                  </button>
                  {ALL_STATUSES.filter(s => dayCounts[s] > 0).map(s => {
                    const opt = STATUS[s]
                    return (
                      <button key={s} onClick={() => { setFilter(s); setPage(0) }}
                        style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${filter === s ? opt.border : C.border}`, background: filter === s ? opt.bg : 'transparent', color: filter === s ? opt.color : C.muted, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 5 }}
                        className="filter-pill">
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: filter === s ? opt.color : 'var(--col-text)' }} />
                        {s} · {dayCounts[s]}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ height: 1, background: `linear-gradient(90deg, ${C.goldBorder}, transparent)`, flexShrink: 0 }} />

            <div style={{ flex: 1, minHeight: 0, padding: '0.75rem', overflowY: 'auto' }}>
              {dayAppts.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 10 }}>
                  <Calendar size={28} color={C.border} />
                  <p style={{ color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif' }}>No appointments for this filter</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dayAppts.map(appt => {
                    const s = STATUS[appt.status] || STATUS.pending
                    const initials = appt.profiles?.full_name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() || '?'
                    return (
                      <div key={appt.id}
                        style={{ background: 'rgba(var(--rgb-hi),0.025)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '1rem 1.1rem', transition: 'border-color .2s' }}
                        className="appt-card-row">

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.875rem' }}>
                          <div style={{ width: 38, height: 38, borderRadius: '50%', background: C.goldBg, border: `1px solid ${C.goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.78rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{initials}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: C.white, fontSize: '0.88rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 2 }}>
                              {appt.profiles?.full_name || 'Unknown'}
                            </p>
                            <p style={{ color: C.muted, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {[appt.services?.name, appt.stylists?.name].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div style={{ padding: '4px 12px', borderRadius: 20, background: C.goldBg, border: `1px solid ${C.goldBorder}`, flexShrink: 0 }}>
                            <span style={{ fontSize: '0.78rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>
                              {appt.time?.slice(0, 5)}
                            </span>
                          </div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.color }} className={appt.status === 'pending' ? 'dot-pulse' : ''} />
                            <span style={{ fontSize: 9, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.05em' }}>{appt.status}</span>
                          </div>
                        </div>

                        {(appt.services?.duration || appt.services?.price || appt.profiles?.phone) && (
                          <div style={{ display: 'flex', gap: 12, marginBottom: '0.875rem', paddingLeft: 50 }}>
                            {appt.services?.duration && (
                              <span style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>⏱ {appt.services.duration} min</span>
                            )}
                            {appt.services?.price && (
                              <span style={{ fontSize: '0.72rem', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>${appt.services.price}</span>
                            )}
                            {appt.profiles?.phone && (
                              <span style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>{appt.profiles.phone}</span>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 5, paddingLeft: 50 }}>
                          {ALL_STATUSES.map(st => {
                            const opt = STATUS[st]
                            const isCurrent = appt.status === st
                            return (
                              <button key={st}
                                disabled={isCurrent}
                                onClick={() => updateStatus(appt.id, st)}
                                style={{
                                  padding: '5px 13px', borderRadius: 8,
                                  background: isCurrent ? C.subtle : opt.bg,
                                  border: `1px solid ${isCurrent ? C.border : opt.border}`,
                                  color: isCurrent ? 'var(--col-text)' : opt.color,
                                  fontSize: 10, fontFamily: 'DM Sans,sans-serif',
                                  fontWeight: isCurrent ? 400 : 600,
                                  cursor: isCurrent ? 'default' : 'pointer',
                                  textTransform: 'capitalize', transition: 'all .15s',
                                }}
                                className={isCurrent ? '' : `st-btn-${st}`}>
                                {st}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0.875rem 1.5rem', borderTop: `1px solid ${C.border}` }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  style={{ width: 32, height: 32, borderRadius: '50%', background: C.subtle, border: `1px solid ${page === 0 ? C.border : C.goldBorder}`, color: page === 0 ? C.muted : C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.35 : 1, transition: 'all .18s' }}
                  className="pg-btn">
                  <ChevronLeft size={14} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button key={i} onClick={() => setPage(i)}
                      style={{ width: i === page ? 24 : 8, height: 8, borderRadius: 4, background: i === page ? C.gold : C.border, border: 'none', cursor: 'pointer', transition: 'all .2s ease', padding: 0 }} />
                  ))}
                </div>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                  style={{ width: 32, height: 32, borderRadius: '50%', background: C.subtle, border: `1px solid ${page === totalPages - 1 ? C.border : C.goldBorder}`, color: page === totalPages - 1 ? C.muted : C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: page === totalPages - 1 ? 'default' : 'pointer', opacity: page === totalPages - 1 ? 0.35 : 1, transition: 'all .18s' }}
                  className="pg-btn">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
