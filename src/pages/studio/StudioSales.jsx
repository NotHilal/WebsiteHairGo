import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, TrendingUp, Scissors, Package, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Pager from '../../lib/Pager'
import { apptFinalPrice, linePrice } from '../../lib/price'
import { fetchAll } from '../../lib/fetchAll'
import {
  format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths,
  isToday, isSameWeek, isSameMonth, parseISO,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval,
} from 'date-fns'

const C = {
  card: 'var(--col-modal)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)', subtle: 'rgba(var(--rgb-hi),0.06)',
  border: 'rgba(var(--rgb-hi),0.07)',
}

const APPT_COLORS = {
  completed: 'var(--col-acc)', confirmed: '#34d399', cancelled: '#f87171',
}
const STATUS_APPT = {
  confirmed: { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.22)'  },
  cancelled: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.22)' },
  completed: { color: 'var(--col-acc)', bg: 'rgba(var(--rgb-acc),0.12)',  border: 'rgba(var(--rgb-acc),0.22)' },
}
const STATUS_ORDER = {
  active:    { color: 'var(--col-acc)', bg: 'rgba(var(--rgb-acc),0.12)', border: 'rgba(var(--rgb-acc),0.22)' },
  retrieved: { color: '#34d399', bg: 'rgba(52,211,153,0.12)',   border: 'rgba(52,211,153,0.22)'   },
  expired:   { color: 'var(--col-text)', bg: 'rgba(var(--rgb-hi),0.06)', border: 'rgba(var(--rgb-hi),0.1)' },
  cancelled: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.22)' },
}

const card  = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }
const TABS  = ['Appointments', 'Product Orders']
const MODES = ['Day', 'Week', 'Month', 'Yearly']
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17]

// Money that counts as taken: paid online (not refunded, credited or moved to
// a rescheduled booking), or paid at the salon once the visit/pickup happened
const apptCounts  = a => a.payment_status === 'paid' || (a.payment_status === 'pay_in_store' && a.status === 'completed')
const orderCounts = p => p.payment_status === 'paid' || (p.payment_status === 'pay_in_store' && p.status === 'retrieved')
const localDay    = ts => format(new Date(ts), 'yyyy-MM-dd')

// Adds _day (local booking day) and _revenue (what was actually charged) to each row
function withRevenue(appts, orders) {
  // A store discount applies once per order. Older orders repeated it on every
  // line, so keep only the first line's discount in each order.
  const discountOn = new Map()
  const seen = new Set()
  for (const p of orders) {
    const key = p.order_group_id ?? p.payment_intent_id ?? p.id
    const d = parseFloat(p.discount_amount) || 0
    if (d > 0 && !seen.has(key)) { seen.add(key); discountOn.set(p.id, d) }
  }
  return {
    appts: appts.map(a => ({ ...a, _day: localDay(a.created_at), _revenue: apptCounts(a) ? apptFinalPrice(a) : 0 })),
    orders: orders.map(p => ({
      ...p,
      _day: localDay(p.created_at),
      _revenue: orderCounts(p) ? Math.max(0, linePrice(p) * (p.quantity || 1) - (discountOn.get(p.id) || 0)) : 0,
    })),
  }
}

/* ── compute period boundaries ── */
function getPeriod(anchor, mode) {
  if (mode === 'yearly') {
    const s = new Date(anchor.getFullYear(), 0, 1)
    return { start: s, end: new Date(anchor.getFullYear() + 1, 0, 1) }
  }
  if (mode === 'day') {
    const s = new Date(anchor); s.setHours(0, 0, 0, 0)
    const e = addDays(s, 1)
    return { start: s, end: e }
  }
  if (mode === 'week') {
    const s = startOfWeek(anchor, { weekStartsOn: 1 })
    const e = endOfWeek(anchor,   { weekStartsOn: 1 })
    e.setHours(23, 59, 59, 999)
    return { start: s, end: addDays(s, 7) }
  }
  // month
  const s = startOfMonth(anchor)
  const e = endOfMonth(anchor); e.setHours(23, 59, 59, 999)
  return { start: s, end: addDays(endOfMonth(anchor), 1) }
}

function periodLabel(anchor, mode) {
  if (mode === 'yearly') return format(anchor, 'yyyy')
  if (mode === 'day')  return format(anchor, 'MMMM d, yyyy')
  if (mode === 'week') {
    const s = startOfWeek(anchor, { weekStartsOn: 1 })
    const e = endOfWeek(anchor,   { weekStartsOn: 1 })
    return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
  }
  return format(anchor, 'MMMM yyyy')
}

function isCurrent(anchor, mode) {
  if (mode === 'yearly') return anchor.getFullYear() === new Date().getFullYear()
  const now = new Date()
  if (mode === 'day')  return isToday(anchor)
  if (mode === 'week') return isSameWeek(anchor, now, { weekStartsOn: 1 })
  return isSameMonth(anchor, now)
}

function navigate(anchor, mode, dir) {
  if (mode === 'day')   return dir > 0 ? addDays(anchor, 1)   : subDays(anchor, 1)
  if (mode === 'week')  return dir > 0 ? addWeeks(anchor, 1)  : subWeeks(anchor, 1)
  if (mode === 'yearly') return new Date(anchor.getFullYear() + dir, 0, 1)
  return dir > 0 ? addMonths(anchor, 1) : subMonths(anchor, 1)
}

/* ──────────────────────────────────────────────────── */
export default function StudioSales() {
  const [anchor,       setAnchor]       = useState(new Date())
  const [mode,         setMode]         = useState('day')
  const [appointments, setAppointments] = useState([])
  const [preorders,    setPreorders]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [tab,          setTab]          = useState('Appointments')
  const [search,       setSearch]       = useState('')
  const [mobilePage,   setMobilePage]   = useState(0)
  const [desktopPage,  setDesktopPage]  = useState(0)
  const [salesMobileTab, setSalesMobileTab] = useState('values')

  const { start, end } = getPeriod(anchor, mode)
  const startISO = start ? start.toISOString() : null
  const endISO   = end   ? end.toISOString()   : null

  useEffect(() => { load() }, [startISO, endISO, mode])

  async function load() {
    setLoading(true)
    const apptQ  = () => {
      let q = supabase.from('appointments').select('*, profiles(full_name, phone), services(name, price, duration), stylists(name)').order('created_at', { ascending: false }).order('id')
      if (startISO && endISO) q = q.gte('created_at', startISO).lt('created_at', endISO)
      return q
    }
    const orderQ = () => {
      let q = supabase.from('preorders').select('*, products(name, price, image_url), profiles(full_name, phone)').order('created_at', { ascending: false }).order('id')
      if (startISO && endISO) q = q.gte('created_at', startISO).lt('created_at', endISO)
      return q
    }
    const [{ data: appts }, { data: orders }] = await Promise.all([fetchAll(apptQ), fetchAll(orderQ)])
    const rows = withRevenue(appts, orders)
    setAppointments(rows.appts)
    setPreorders(rows.orders)
    setLoading(false)
  }

  const paidAppts       = appointments.filter(apptCounts)
  const servicesRevenue = paidAppts.reduce((s, a) => s + a._revenue, 0)
  const paidOrders      = preorders.filter(orderCounts)
  const productsRevenue = paidOrders.reduce((s, p) => s + p._revenue, 0)
  const totalRevenue    = servicesRevenue + productsRevenue

  const filteredAppts  = appointments.filter(a => !search || a.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()))
  const filteredOrders = preorders.filter(p =>
    !search || p.products?.name?.toLowerCase().includes(search.toLowerCase()) || p.profiles?.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const MOBILE_PER_PAGE  = 5
  const DESKTOP_PER_PAGE = 6
  const activeList       = tab === 'Appointments' ? filteredAppts : filteredOrders
  const totalMobilePages = Math.ceil(activeList.length / MOBILE_PER_PAGE)
  const mobileAppts   = filteredAppts.slice(mobilePage  * MOBILE_PER_PAGE,  (mobilePage  + 1) * MOBILE_PER_PAGE)
  const mobileOrders  = filteredOrders.slice(mobilePage * MOBILE_PER_PAGE,  (mobilePage  + 1) * MOBILE_PER_PAGE)
  const desktopAppts  = filteredAppts.slice(desktopPage * DESKTOP_PER_PAGE, (desktopPage + 1) * DESKTOP_PER_PAGE)
  const desktopOrders = filteredOrders.slice(desktopPage * DESKTOP_PER_PAGE, (desktopPage + 1) * DESKTOP_PER_PAGE)

  const summaryCards = [
    { label: 'Total Revenue',  value: `$${totalRevenue.toFixed(2)}`,    sub: 'Online + in store',      color: C.gold,    icon: TrendingUp },
    { label: 'Services',       value: `$${servicesRevenue.toFixed(2)}`, sub: `${paidAppts.length} paid`,  color: '#34d399', icon: Scissors   },
    { label: 'Product Orders', value: `$${productsRevenue.toFixed(2)}`, sub: `${paidOrders.length} paid`, color: '#a78bfa', icon: Package    },
  ]

  const currentPeriod  = isCurrent(anchor, mode)
  const periodBadge    = mode === 'day' ? 'Today' : mode === 'week' ? 'This week' : mode === 'month' ? 'This month' : 'This year'
  const emptyText      = mode === 'yearly' ? 'this year' : mode === 'day' ? 'this day' : mode === 'week' ? 'this week' : 'this month'
  const backLabel      = mode === 'day' ? 'Back to Today' : mode === 'week' ? 'Back to This Week' : mode === 'month' ? 'Back to This Month' : 'Back to This Year'
  const backLabelShort = mode === 'day' ? 'Today' : mode === 'week' ? 'This week' : mode === 'month' ? 'This month' : 'This year'

  return (
    <div className="sales-outer" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', gap: '0.625rem', overflow: 'visible' }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0 }}>

        {/* Title row + mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.4rem,2vw,1.8rem)', color: C.white, lineHeight: 1 }}>Sales</h1>
            <p style={{ fontSize: '0.83rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: 3 }}>Revenue overview</p>
          </div>
          <div style={{ display: 'flex', background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, gap: 2 }}>
            {MODES.map(m => {
              const active = mode === m.toLowerCase()
              return (
                <button key={m} onClick={() => { setMode(m.toLowerCase()); setSearch(''); setMobilePage(0); setDesktopPage(0) }}
                  className="sales-mode-btn" style={{ padding: '5px 18px', borderRadius: 7, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: active ? 700 : 400, cursor: 'pointer', border: 'none', background: active ? C.goldBg : 'transparent', color: active ? C.gold : C.muted, outline: active ? `1px solid ${C.goldBorder}` : 'none', transition: 'all .18s' }}>
                  {m}
                </button>
              )
            })}
          </div>
        </div>

        {/* Date navigation */}
        {<div style={{ display: 'flex', alignItems: 'center', background: 'rgba(var(--rgb-hi),0.025)', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <button onClick={() => setAnchor(d => navigate(d, mode, -1))} className="s-nav-btn"
                style={{ padding: '0.6rem 1rem', background: 'none', border: 'none', borderRight: `1px solid ${C.border}`, cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .18s', flexShrink: 0 }}>
                <ChevronLeft size={15} strokeWidth={1.75} />
              </button>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0.5rem 1rem' }}>
                <p className="font-display" style={{ fontSize: '0.95rem', color: C.white, lineHeight: 1 }}>{periodLabel(anchor, mode)}</p>
                {currentPeriod
                  ? <span style={{ fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: C.goldBg, border: `1px solid ${C.goldBorder}`, flexShrink: 0 }}>{periodBadge}</span>
                  : <button onClick={() => setAnchor(new Date())} className="s-back-btn"
                      style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'transparent', border: `1px solid ${C.goldBorder}`, cursor: 'pointer', transition: 'all .18s', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      <span className="s-back-long">↩ {backLabel}</span>
                      <span className="s-back-short">↩ {backLabelShort}</span>
                    </button>
                }
              </div>
              <button onClick={() => setAnchor(d => navigate(d, mode, 1))} className="s-nav-btn"
                style={{ padding: '0.6rem 1rem', background: 'none', border: 'none', borderLeft: `1px solid ${C.border}`, cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .18s', flexShrink: 0 }}>
                <ChevronRight size={15} strokeWidth={1.75} />
              </button>
            </div>}
      </div>

      {/* ── Mobile tab bar ── */}
      <div className="sales-m-tab-bar">
        <button className={`sales-m-tab-btn${salesMobileTab === 'values' ? ' active' : ''}`} onClick={() => setSalesMobileTab('values')}>Values</button>
        <button className={`sales-m-tab-btn${salesMobileTab === 'graphs' ? ' active' : ''}`} onClick={() => setSalesMobileTab('graphs')}>Graphs</button>
      </div>

      {/* ── Stats + Status in one row ── */}
      <div className={`sales-kpi${salesMobileTab !== 'values' ? ' sales-m-hide' : ''}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.625rem', flexShrink: 0 }}>
        {summaryCards.map(({ label, value, sub, color, icon: Icon }) => (
          <div key={label} style={{ ...card, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}14`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={14} color={color} strokeWidth={1.5} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="font-display" style={{ fontSize: '1.5rem', color: loading ? C.border : C.white, lineHeight: 1, marginBottom: 3 }}>
                {loading ? '—' : value}
              </div>
              <p style={{ fontSize: 13, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{label}</p>
              <p style={{ fontSize: '0.79rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', marginTop: 1 }}>{loading ? '…' : sub}</p>
            </div>
          </div>
        ))}
        <div style={{ ...card, padding: '0.875rem 1.25rem', gridColumn: '1 / -1' }}>
          <p style={{ fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: '0.75rem' }}>Status</p>
          {loading
            ? <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div className="sk" style={{ height: 7, borderRadius: 4 }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                  {[0,1,2,3].map(i => <div key={i} className="sk" style={{ height: 36, borderRadius: 8, animationDelay: `${i*0.08}s` }} />)}
                </div>
              </div>
            : <StatusBreakdown appointments={appointments} horizontal />
          }
        </div>
      </div>

      {/* ── Chart + revenue split ── */}
      <div className={`sales-chart-card${salesMobileTab !== 'graphs' ? ' sales-m-hide' : ''}`} style={{ ...card, flexShrink: 0, padding: '1rem 1.5rem' }}>
        <div className="sales-chart-row" style={{ display: 'flex', gap: '1.75rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: '0.75rem' }}>
              {mode === 'day' ? 'Appointments by Hour' : mode === 'yearly' ? 'Revenue by Month' : 'Revenue by Day'}
            </p>
            {loading
              ? <div className="sk chart-bars" style={{ borderRadius: 8 }} />
              : mode === 'day'
                ? <HourlyChart appointments={appointments} hours={HOURS} />
                : mode === 'yearly'
                  ? <YearlyChart appointments={appointments} preorders={preorders} anchor={anchor} />
                  : <PeriodChart appointments={appointments} preorders={preorders} start={start} end={end} mode={mode} />
            }
          </div>
          {!loading && totalRevenue > 0 && (
            <div className="sales-chart-split" style={{ width: 200, flexShrink: 0, paddingLeft: '1.75rem', borderLeft: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <p style={{ fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Revenue Split</p>
                <span className="font-display" style={{ color: C.gold, fontSize: '1rem' }}>${totalRevenue.toFixed(2)}</span>
              </div>
              <RevenueSplit servicesRevenue={servicesRevenue} productsRevenue={productsRevenue} total={totalRevenue} />
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs + table (fills remaining height, scrolls internally) ── */}
      <div className={`sales-bottom-card${salesMobileTab !== 'values' ? ' sales-m-hide' : ''}`} style={{ ...card, minHeight: 400, display: 'flex', flexDirection: 'column', overflow: 'visible' }}>

        <div className="sales-tab-bar" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, padding: '0 1.25rem', flexWrap: 'wrap', gap: '0.25rem' }}>
          <div style={{ display: 'flex' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setSearch(''); setMobilePage(0); setDesktopPage(0) }} style={{
                padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: 'DM Sans,sans-serif',
                fontWeight: tab === t ? 600 : 400, color: tab === t ? C.gold : C.muted,
                borderBottom: `2px solid ${tab === t ? C.gold : 'transparent'}`, marginBottom: -1, transition: 'color .2s',
              }}>
                {t}
                <span style={{ marginLeft: 6, fontSize: 13, padding: '1px 7px', borderRadius: 20, background: tab === t ? C.goldBg : 'rgba(var(--rgb-hi),0.05)', color: tab === t ? C.goldDim : 'var(--col-text)' }}>
                  {t === 'Appointments' ? appointments.length : preorders.length}
                </span>
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
            <input value={search} onChange={e => { setSearch(e.target.value); setMobilePage(0); setDesktopPage(0) }} autoComplete="off"
              placeholder={tab === 'Appointments' ? 'Search client…' : 'Search product or client…'}
              style={{ background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.4rem 0.75rem 0.4rem 2rem', fontSize: '0.95rem', color: C.white, outline: 'none', fontFamily: 'DM Sans,sans-serif', width: 200, maxWidth: '100%', transition: 'border-color .2s' }}
              className="s-search" />
          </div>
        </div>

        <div className="sales-bottom-inner" style={{ overflow: 'visible' }}>

          {tab === 'Appointments' && (
            loading ? <Skeleton rows={5} /> :
            filteredAppts.length === 0 ? <Empty icon={Scissors} text={`No appointments for ${emptyText}`} /> : (<>
              {/* Desktop table */}
              <table className="s-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(var(--rgb-hi),0.02)', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0 }}>
                    {['Booked', 'Appt. Date', 'Client', 'Service', 'Stylist', 'Status', 'Payment', 'Price'].map(h => (
                      <th key={h} style={{ padding: '0.55rem 1.1rem', fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, textAlign: 'left', fontFamily: 'DM Sans,sans-serif', background: 'var(--col-modal)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {desktopAppts.map((appt, i) => {
                    const s = STATUS_APPT[appt.status] || STATUS_APPT.confirmed
                    return (
                      <tr key={appt.id} style={{ borderBottom: i < desktopAppts.length - 1 ? `1px solid ${C.border}` : 'none' }} className="s-row">
                        <td style={{ padding: '0.6rem 1.1rem', fontFamily: 'DM Sans,sans-serif', fontSize: '0.85rem', color: C.muted, whiteSpace: 'nowrap' }}>
                          {appt.created_at ? format(new Date(appt.created_at), mode === 'day' ? 'HH:mm' : 'MMM d HH:mm') : '—'}
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', fontFamily: 'DM Sans,sans-serif', fontSize: '0.85rem', color: C.gold, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {appt.date ? format(parseISO(appt.date), 'MMM d') : '—'} {appt.time?.slice(0, 5)}
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem' }}>
                          <p style={{ color: C.white, fontSize: '0.95rem', fontFamily: 'DM Sans,sans-serif' }}>{appt.profiles?.full_name || '—'}</p>
                          {appt.profiles?.phone && <p style={{ color: C.muted, fontSize: '0.79rem', fontFamily: 'DM Sans,sans-serif' }}>{appt.profiles.phone}</p>}
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', color: C.dim, fontSize: '0.86rem', fontFamily: 'DM Sans,sans-serif' }}>
                          {appt.services?.name || '—'}
                          {appt.services?.duration && <span style={{ color: C.muted, fontSize: '0.79rem', marginLeft: 5 }}>{appt.services.duration}min</span>}
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', color: C.muted, fontSize: '0.86rem', fontFamily: 'DM Sans,sans-serif' }}>{appt.stylists?.name || '—'}</td>
                        <td style={{ padding: '0.6rem 1.1rem' }}>
                          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, textTransform: 'capitalize' }}>{appt.status}</span>
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem' }}>
                          {appt.payment_status === 'paid'
                            ? <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Paid online</span>
                            : appt.payment_status === 'pay_in_store' && appt.status === 'completed'
                              ? <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Paid in store</span>
                              : appt.payment_status === 'pay_in_store'
                                ? <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Pay in store</span>
                                : <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Unpaid</span>
                          }
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', fontFamily: 'DM Sans,sans-serif', fontSize: '0.95rem', color: (appt.payment_status === 'paid' || (appt.payment_status === 'pay_in_store' && appt.status === 'completed')) ? C.gold : C.muted, fontWeight: (appt.payment_status === 'paid' || (appt.payment_status === 'pay_in_store' && appt.status === 'completed')) ? 600 : 400 }}>
                          {appt.services ? `$${apptFinalPrice(appt).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {paidAppts.length > 0 && !search && (
                  <tfoot>
                    <tr style={{ borderTop: `1px solid ${C.goldBorder}`, background: C.goldBg }}>
                      <td colSpan={7} style={{ padding: '0.55rem 1.1rem', fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>
                        Revenue — paid via Stripe ({paidAppts.length})
                      </td>
                      <td style={{ padding: '0.55rem 1.1rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: '0.88rem' }}>${servicesRevenue.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>

              {/* Mobile stacked rows */}
              <div className="s-mobile-list">
                {Array.from({ length: MOBILE_PER_PAGE }).map((_, i) => {
                  const appt = mobileAppts[i]
                  if (!appt) return (
                    <div key={`empty-${i}`} style={{ minHeight: 70, borderBottom: i < MOBILE_PER_PAGE - 1 ? `1px solid ${C.border}` : 'none', background: 'var(--col-modal)' }} />
                  )
                  const s = STATUS_APPT[appt.status] || STATUS_APPT.confirmed
                  const paidOnline = appt.payment_status === 'paid'
                  const paidStore = appt.payment_status === 'pay_in_store' && appt.status === 'completed'
                  const payStore = appt.payment_status === 'pay_in_store' && appt.status !== 'completed'
                  const anyPaid = paidOnline || paidStore
                  return (
                    <div key={appt.id} style={{ padding: '0.875rem 1rem', minHeight: 70, borderBottom: i < MOBILE_PER_PAGE - 1 ? `1px solid ${C.border}` : 'none', borderLeft: `3px solid ${s.color}` }}>
                      {/* Line 1 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                        <p style={{ flex: 1, color: C.white, fontSize: '0.84rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0 }}>
                          {appt.profiles?.full_name || '—'}
                        </p>
                        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 }}>{appt.status}</span>
                        {paidOnline
                          ? <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>Paid online</span>
                          : paidStore
                            ? <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>Paid in store</span>
                            : payStore
                              ? <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>Pay in store</span>
                              : <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 20, background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>Unpaid</span>
                        }
                        {appt.services && <span style={{ fontSize: '0.8rem', color: anyPaid ? C.gold : C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: anyPaid ? 700 : 400, flexShrink: 0 }}>${apptFinalPrice(appt).toFixed(2)}</span>}
                      </div>
                      {/* Line 2 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        {appt.date && <span style={{ fontSize: '0.83rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{format(parseISO(appt.date), 'MMM d')}{appt.time ? ` ${appt.time.slice(0,5)}` : ''}</span>}
                        {appt.services?.name && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: '0.83rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 140 }}>{appt.services.name}</span></>}
                        {appt.stylists?.name && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: '0.83rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>{appt.stylists.name}</span></>}
                        {appt.created_at && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: '0.68rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>booked {format(new Date(appt.created_at), 'MMM d')}</span></>}
                      </div>
                    </div>
                  )
                })}
                {totalMobilePages > 1 && (
                  <MobilePager page={mobilePage} total={totalMobilePages} count={filteredAppts.length} onPrev={() => setMobilePage(p => p - 1)} onNext={() => setMobilePage(p => p + 1)} perPage={MOBILE_PER_PAGE} />
                )}
                {paidAppts.length > 0 && !search && (
                  <div style={{ padding: '0.6rem 1rem', background: C.goldBg, borderTop: `1px solid ${C.goldBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>Revenue — {paidAppts.length} paid</span>
                    <span style={{ color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: '0.88rem' }}>${servicesRevenue.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </>)
          )}

          {tab === 'Product Orders' && (
            loading ? <Skeleton rows={4} /> :
            filteredOrders.length === 0 ? <Empty icon={Package} text={`No product orders for ${emptyText}`} /> : (<>
              {/* Desktop table */}
              <table className="s-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(var(--rgb-hi),0.02)', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0 }}>
                    {['Product', 'Client', 'Qty', 'Status', 'Payment', 'Unit Price', 'Total'].map(h => (
                      <th key={h} style={{ padding: '0.55rem 1.1rem', fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, textAlign: 'left', fontFamily: 'DM Sans,sans-serif', background: 'var(--col-modal)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {desktopOrders.map((order, i) => {
                    const s = STATUS_ORDER[order.status] || STATUS_ORDER.active
                    const lineTotal = linePrice(order) * (order.quantity || 1)
                    return (
                      <tr key={order.id} style={{ borderBottom: i < desktopOrders.length - 1 ? `1px solid ${C.border}` : 'none' }} className="s-row">
                        <td style={{ padding: '0.6rem 1.1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--col-card)', border: `1px solid ${C.border}`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {order.products?.image_url ? <img src={order.products.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={11} style={{ color: C.muted }} />}
                            </div>
                            <span style={{ color: C.white, fontSize: '0.95rem', fontFamily: 'DM Sans,sans-serif' }}>{order.products?.name || '—'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem' }}>
                          <p style={{ color: C.dim, fontSize: '0.86rem', fontFamily: 'DM Sans,sans-serif' }}>{order.profiles?.full_name || '—'}</p>
                          {order.profiles?.phone && <p style={{ color: C.muted, fontSize: '0.79rem', fontFamily: 'DM Sans,sans-serif' }}>{order.profiles.phone}</p>}
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', color: C.dim, fontSize: '0.95rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>×{order.quantity || 1}</td>
                        <td style={{ padding: '0.6rem 1.1rem' }}>
                          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, textTransform: 'capitalize' }}>{order.status === 'active' ? 'Awaiting Pickup' : order.status}</span>
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem' }}>
                          {order.payment_status === 'paid'
                            ? <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Paid online</span>
                            : order.payment_status === 'pay_in_store' && order.status === 'retrieved'
                              ? <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Paid in store</span>
                              : order.payment_status === 'pay_in_store'
                                ? <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Pay in store</span>
                                : <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Unpaid</span>
                          }
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', color: C.muted, fontSize: '0.86rem', fontFamily: 'DM Sans,sans-serif' }}>{linePrice(order) ? `$${linePrice(order).toFixed(2)}` : '—'}</td>
                        <td style={{ padding: '0.6rem 1.1rem', fontFamily: 'DM Sans,sans-serif', fontSize: '0.95rem', color: (order.payment_status === 'paid' || (order.payment_status === 'pay_in_store' && order.status === 'retrieved')) ? C.gold : C.muted, fontWeight: (order.payment_status === 'paid' || (order.payment_status === 'pay_in_store' && order.status === 'retrieved')) ? 600 : 400 }}>
                          {linePrice(order) ? `$${lineTotal.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {paidOrders.length > 0 && !search && (
                  <tfoot>
                    <tr style={{ borderTop: `1px solid ${C.goldBorder}`, background: C.goldBg }}>
                      <td colSpan={6} style={{ padding: '0.55rem 1.1rem', fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>Revenue — paid via Stripe ({paidOrders.length})</td>
                      <td style={{ padding: '0.55rem 1.1rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: '0.88rem' }}>${productsRevenue.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>

              {/* Mobile stacked rows */}
              <div className="s-mobile-list">
                {Array.from({ length: MOBILE_PER_PAGE }).map((_, i) => {
                  const order = mobileOrders[i]
                  if (!order) return (
                    <div key={`empty-${i}`} style={{ minHeight: 70, borderBottom: i < MOBILE_PER_PAGE - 1 ? `1px solid ${C.border}` : 'none', background: 'var(--col-modal)' }} />
                  )
                  const s = STATUS_ORDER[order.status] || STATUS_ORDER.active
                  const paidOnlineO = order.payment_status === 'paid'
                  const paidStoreO = order.payment_status === 'pay_in_store' && order.status === 'retrieved'
                  const payStoreO = order.payment_status === 'pay_in_store' && order.status !== 'retrieved'
                  const anyPaidO = paidOnlineO || paidStoreO
                  const lineTotal = linePrice(order) * (order.quantity || 1)
                  return (
                    <div key={order.id} style={{ padding: '0.875rem 1rem', minHeight: 70, borderBottom: i < MOBILE_PER_PAGE - 1 ? `1px solid ${C.border}` : 'none', borderLeft: `3px solid ${s.color}` }}>
                      {/* Line 1 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 5, background: 'var(--col-card)', border: `1px solid ${C.border}`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {order.products?.image_url ? <img src={order.products.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={10} style={{ color: C.muted }} />}
                        </div>
                        <p style={{ flex: 1, color: C.white, fontSize: '0.84rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0 }}>
                          {order.products?.name || '—'}
                        </p>
                        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 }}>
                          {order.status === 'active' ? 'Pickup' : order.status}
                        </span>
                        {paidOnlineO
                          ? <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>Paid online</span>
                          : paidStoreO
                            ? <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>Paid in store</span>
                            : payStoreO
                              ? <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>Pay in store</span>
                              : <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 20, background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>Unpaid</span>
                        }
                      </div>
                      {/* Line 2 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', paddingLeft: 33 }}>
                        {order.profiles?.full_name && <span style={{ fontSize: '0.83rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>{order.profiles.full_name}</span>}
                        <span style={{ color: 'var(--col-text)' }}>·</span>
                        <span style={{ fontSize: '0.83rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>×{order.quantity || 1}</span>
                        {linePrice(order) > 0 && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: '0.83rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>${linePrice(order).toFixed(2)} each</span></>}
                        <span style={{ color: 'var(--col-text)' }}>·</span>
                        <span style={{ fontSize: '0.84rem', color: anyPaidO ? C.gold : 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: anyPaidO ? 700 : 400 }}>${lineTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )
                })}
                {totalMobilePages > 1 && (
                  <MobilePager page={mobilePage} total={totalMobilePages} count={filteredOrders.length} onPrev={() => setMobilePage(p => p - 1)} onNext={() => setMobilePage(p => p + 1)} perPage={MOBILE_PER_PAGE} />
                )}
                {paidOrders.length > 0 && !search && (
                  <div style={{ padding: '0.6rem 1rem', background: C.goldBg, borderTop: `1px solid ${C.goldBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>Revenue — {paidOrders.length} paid</span>
                    <span style={{ color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: '0.88rem' }}>${productsRevenue.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </>)
          )}
        </div>

        {/* Desktop pager — hidden on mobile */}
        <div className="s-pager-wrap">
          <Pager
            page={desktopPage}
            total={tab === 'Appointments' ? filteredAppts.length : filteredOrders.length}
            perPage={DESKTOP_PER_PAGE}
            onChange={setDesktopPage}
          />
        </div>
      </div>

      <style>{`
        .s-nav-btn:hover  { background: ${C.goldBg} !important; color: ${C.gold} !important; }
        .s-back-btn:hover { background: ${C.goldBg} !important; color: ${C.gold} !important; border-color: ${C.gold} !important; }
        .s-search:focus   { border-color: ${C.goldBorder} !important; }
        .s-row:hover      { background: rgba(var(--rgb-hi),0.02); }
        .bar-col:hover .bar-fill  { filter: brightness(1.3); }
        .bar-col:hover .bar-label { color: var(--col-text) !important; }
        .s-mobile-list { display: none; flex-direction: column; }
        .chart-bars { height: 120px; }
        .sales-m-tab-bar { display: none; }
        .s-back-short { display: none; }
        .s-pager-wrap { flex-shrink: 0; padding: 0.25rem 1.25rem 0.75rem; }
        @media (max-width: 1199px) {
          .sales-outer { height: auto !important; overflow: visible !important; padding-bottom: 2rem !important; }
          .sales-bottom-card { flex: none !important; min-height: 0 !important; overflow: visible !important; }
          .sales-bottom-inner { overflow: visible !important; flex: none !important; min-height: 0 !important; }
        }
        @media (max-width: 767px) {
          .sales-m-tab-bar { display: flex; gap: 0.5rem; flex-shrink: 0; }
          .sales-m-tab-btn { flex: 1; padding: 0.5rem; border-radius: 10px; border: 1px solid rgba(var(--rgb-hi),0.1); background: transparent; color: var(--col-text); font-size: 0.8rem; font-family: 'DM Sans',sans-serif; font-weight: 700; cursor: pointer; transition: all 0.15s; }
          .sales-m-tab-btn.active { color: var(--col-acc); background: rgba(var(--rgb-acc),0.08); border-color: rgba(var(--rgb-acc),0.2); }
          .sales-m-hide { display: none !important; }
          .sales-kpi { grid-template-columns: 1fr 1fr !important; }
          .sales-kpi > * { min-width: 0; overflow: hidden; }
          .sales-kpi > *:nth-child(n+3) { grid-column: 1 / -1; }
          .status-breakdown-grid { grid-template-columns: 1fr 1fr !important; }
          .sales-chart-card { padding: 0.75rem !important; }
          .sales-chart-row { flex-direction: column !important; align-items: stretch !important; }
          .sales-chart-split { width: 100% !important; border-left: none !important; padding-left: 0 !important; border-top: 1px solid rgba(var(--rgb-hi),0.08) !important; padding-top: 1rem !important; margin-top: 0.5rem !important; }
          .chart-bars { height: 160px !important; }
          .chart-y-axis { height: 160px !important; }
          .chart-area { height: 160px !important; }
          .s-table { display: none !important; }
          .s-pager-wrap { display: none !important; }
          .s-mobile-list { display: flex !important; }
          .sales-tab-bar { padding: 0 0.75rem !important; flex-wrap: wrap !important; gap: 0.25rem !important; }
        }
        @media (max-width: 480px) {
          .sales-mode-btn { padding: 4px 10px !important; font-size: 11px !important; letter-spacing: 0.08em !important; }
          .s-back-long  { display: none; }
          .s-back-short { display: inline; }
        }
        @keyframes shimmer {
          0%   { background-position: -400px 0 }
          100% { background-position:  400px 0 }
        }
        .sk {
          background: linear-gradient(90deg, rgba(var(--rgb-hi),0.04) 25%, rgba(var(--rgb-hi),0.09) 50%, rgba(var(--rgb-hi),0.04) 75%);
          background-size: 400px 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

function niceMax(val) {
  if (val <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(val)))
  const norm = val / mag
  const factor = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return factor * mag
}

function fmtTick(v, isDollar) {
  if (v === 0) return '0'
  const r = Math.round(v)
  const prefix = isDollar ? '$' : ''
  if (r >= 1000) return `${prefix}${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)}k`
  return `${prefix}${r}`
}

/* ── Period chart (week / month) ─────────────────── */
function PeriodChart({ appointments, preorders, start, end, mode }) {
  const [selected, setSelected] = useState(null)
  const days = eachDayOfInterval({ start, end: addDays(end, -1) })

  const data = days.map(day => {
    const dayStr = format(day, 'yyyy-MM-dd')
    const apptRev = appointments.filter(a => a._day === dayStr).reduce((s, a) => s + a._revenue, 0)
    const ordRev  = preorders.filter(p => p._day === dayStr).reduce((s, p) => s + p._revenue, 0)
    return { day, label: mode === 'month' ? format(day, 'd') : format(day, 'EEE'), total: apptRev + ordRev, apptRev, ordRev }
  })

  const maxVal = Math.max(1, ...data.map(d => d.total))
  const nMax = niceMax(maxVal)
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const isToday = (day) => format(day, 'yyyy-MM-dd') === todayStr
  const Y_W = 42

  const popup = selected && (
    <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 20, background: 'var(--col-card)', border: '1px solid rgba(var(--rgb-hi),0.12)', borderRadius: 10, padding: '0.6rem 0.875rem', minWidth: 155, boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--rgb-hi),0.5)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
          {mode === 'month' ? format(selected.day, 'MMM d') : format(selected.day, 'EEE, MMM d')}
        </p>
        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(var(--rgb-hi),0.4)', padding: '0 0 0 8px', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#34d399', fontFamily: 'DM Sans,sans-serif' }}>Services</span>
          <span style={{ fontSize: 12, color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>${selected.apptRev.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'DM Sans,sans-serif' }}>Products</span>
          <span style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>${selected.ordRev.toFixed(2)}</span>
        </div>
        <div style={{ borderTop: '1px solid rgba(var(--rgb-hi),0.07)', paddingTop: 5, marginTop: 2, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--col-acc)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>Total</span>
          <span style={{ fontSize: 12, color: 'var(--col-acc)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>${selected.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )

  const isMonth = mode === 'month'
  const BAR_W = 20
  const BAR_GAP = isMonth ? 3 : 5

  const barsInner = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="chart-area" style={{ position: 'relative', height: 120 }}>
        {[25, 50, 75].map(pct => (
          <div key={pct} style={{ position: 'absolute', bottom: `${pct}%`, left: 0, right: 0, height: 1, background: 'rgba(var(--rgb-hi),0.04)', pointerEvents: 'none', zIndex: 0 }} />
        ))}
        <div className="chart-bars" style={{ height: 120, display: 'flex', alignItems: 'flex-end', gap: BAR_GAP, position: 'relative', zIndex: 1 }}>
          {data.map(({ day, total, apptRev, ordRev }, i) => {
            const hp = total === 0 ? 0 : Math.max(2, (total / nMax) * 100)
            const today = isToday(day)
            const isSel = selected?.i === i
            return (
              <div key={i} className="bar-col"
                onClick={() => setSelected(isSel ? null : { i, day, total, apptRev, ordRev })}
                style={{ ...(isMonth ? { width: BAR_W, flexShrink: 0 } : { flex: 1 }), position: 'relative', height: '100%', cursor: 'pointer' }}>
                {total === 0
                  ? <div style={{ position: 'absolute', bottom: 0, width: '100%', height: 2, background: today ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.04)', borderRadius: 2 }} />
                  : <>
                      {!isMonth && (
                        <span style={{ position: 'absolute', bottom: `calc(${hp}% + 4px)`, left: '50%', transform: 'translateX(-50%)', fontSize: 13, color: today ? C.gold : '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2 }}>
                          ${total.toFixed(0)}
                        </span>
                      )}
                      <motion.div className="bar-fill"
                        initial={{ height: '0%' }}
                        animate={{ height: `${hp}%` }}
                        transition={{ duration: 0.55, delay: i * 0.02, ease: [0.22, 1, 0.36, 1] }}
                        style={{ position: 'absolute', bottom: 0, width: '100%', borderRadius: '4px 4px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', outline: isSel ? '2px solid var(--col-acc)' : 'none', outlineOffset: 1 }}>
                        {ordRev > 0 && <div style={{ flex: ordRev, background: 'linear-gradient(to top, #a78bfa, rgba(167,139,250,0.27))' }} />}
                        {apptRev > 0 && <div style={{ flex: apptRev, background: 'linear-gradient(to top, #34d399, rgba(52,211,153,0.27))' }} />}
                      </motion.div>
                    </>
                }
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: BAR_GAP }}>
        {data.map(({ day, label }, i) => {
          const today = isToday(day)
          return (
            <div key={i} className="bar-label" style={{ ...(isMonth ? { width: BAR_W, flexShrink: 0 } : { flex: 1 }), textAlign: 'center', fontSize: isMonth ? 11 : 12, color: today ? C.goldDim : 'rgba(var(--rgb-hi),0.55)', fontFamily: 'DM Sans,sans-serif', transition: 'color .2s', fontWeight: today ? 700 : 400 }}>
              {label}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
      {popup}
      <div style={{ display: 'flex', gap: 4 }}>
        <div className="chart-y-axis" style={{ width: Y_W, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, height: 120 }}>
          {[nMax, nMax * 0.75, nMax * 0.5, nMax * 0.25, 0].map((v, i) => (
            <span key={i} style={{ fontSize: 9, color: 'rgba(var(--rgb-hi),0.35)', fontFamily: 'DM Sans,sans-serif', lineHeight: 1 }}>
              {fmtTick(v, true)}
            </span>
          ))}
        </div>
        {isMonth
          ? <div style={{ flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 0 }}>{barsInner}</div>
          : <div style={{ flex: 1, minWidth: 0 }}>{barsInner}</div>
        }
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 2, paddingLeft: Y_W + 4 }}>
        {[['#34d399', 'Services'], ['#a78bfa', 'Products']].map(([col, lbl]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: col }} />
            <span style={{ fontSize: 13, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Yearly bar chart (all 12 months of selected year) ── */
function YearlyChart({ appointments, preorders, anchor }) {
  const [selected, setSelected] = useState(null)
  const year = anchor.getFullYear()

  const byS = {}, byP = {}
  appointments.forEach(a => {
    if (!a._revenue) return
    const k = a._day.slice(0, 7)
    byS[k] = (byS[k] || 0) + a._revenue
  })
  preorders.forEach(p => {
    if (!p._revenue) return
    const k = p._day.slice(0, 7)
    byP[k] = (byP[k] || 0) + p._revenue
  })

  const months = Array.from({ length: 12 }, (_, i) => {
    const k = `${year}-${String(i + 1).padStart(2, '0')}`
    const sRev = byS[k] || 0
    const pRev = byP[k] || 0
    return { k, sRev, pRev, total: sRev + pRev, label: format(parseISO(k + '-01'), 'MMM') }
  })

  const curMonthKey = format(new Date(), 'yyyy-MM')
  const Y_W = 42
  const CH = 120
  const nMax = niceMax(Math.max(1, ...months.map(m => m.total)))

  const popup = selected && (
    <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 20, background: 'var(--col-card)', border: '1px solid rgba(var(--rgb-hi),0.12)', borderRadius: 10, padding: '0.6rem 0.875rem', minWidth: 160, boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--rgb-hi),0.5)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
          {format(parseISO(selected.k + '-01'), 'MMMM yyyy')}
        </p>
        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(var(--rgb-hi),0.4)', padding: '0 0 0 8px', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#34d399', fontFamily: 'DM Sans,sans-serif' }}>Services</span>
          <span style={{ fontSize: 12, color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>${selected.sRev.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'DM Sans,sans-serif' }}>Products</span>
          <span style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>${selected.pRev.toFixed(2)}</span>
        </div>
        <div style={{ borderTop: '1px solid rgba(var(--rgb-hi),0.07)', paddingTop: 5, marginTop: 2, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--col-acc)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>Total</span>
          <span style={{ fontSize: 12, color: 'var(--col-acc)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>${selected.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )

  const BAR_W = 42
  const BAR_GAP = 5

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
      {popup}
      <div style={{ display: 'flex', gap: 4 }}>
        <div className="chart-y-axis" style={{ width: Y_W, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, height: CH }}>
          {[nMax, nMax * 0.75, nMax * 0.5, nMax * 0.25, 0].map((v, i) => (
            <span key={i} style={{ fontSize: 9, color: 'rgba(var(--rgb-hi),0.35)', fontFamily: 'DM Sans,sans-serif', lineHeight: 1 }}>
              {fmtTick(v, true)}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="chart-area" style={{ position: 'relative', height: CH }}>
              {[25, 50, 75].map(pct => (
                <div key={pct} style={{ position: 'absolute', bottom: `${pct}%`, left: 0, right: 0, height: 1, background: 'rgba(var(--rgb-hi),0.04)', pointerEvents: 'none', zIndex: 0 }} />
              ))}
              <div className="chart-bars" style={{ height: CH, display: 'flex', alignItems: 'flex-end', gap: BAR_GAP, position: 'relative', zIndex: 1 }}>
                {months.map(({ k, total, sRev, pRev }, i) => {
                  const hp = total === 0 ? 0 : Math.max(2, (total / nMax) * 100)
                  const isSel = selected?.k === k
                  return (
                    <div key={k} className="bar-col"
                      onClick={() => setSelected(isSel ? null : { k, total, sRev, pRev })}
                      style={{ width: BAR_W, flexShrink: 0, position: 'relative', height: '100%', cursor: 'pointer' }}>
                      {total === 0
                        ? <div style={{ position: 'absolute', bottom: 0, width: '100%', height: 2, background: 'rgba(var(--rgb-hi),0.04)', borderRadius: 2 }} />
                        : <motion.div className="bar-fill"
                            initial={{ height: '0%' }}
                            animate={{ height: `${hp}%` }}
                            transition={{ duration: 0.55, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                            style={{ position: 'absolute', bottom: 0, width: '100%', borderRadius: '4px 4px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', outline: isSel ? '2px solid var(--col-acc)' : 'none', outlineOffset: 1 }}>
                            {pRev > 0 && <div style={{ flex: pRev, background: 'linear-gradient(to top, #a78bfa, rgba(167,139,250,0.27))' }} />}
                            {sRev > 0 && <div style={{ flex: sRev, background: 'linear-gradient(to top, #34d399, rgba(52,211,153,0.27))' }} />}
                          </motion.div>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: BAR_GAP }}>
              {months.map(m => {
                const isCur = m.k === curMonthKey
                return (
                  <div key={m.k} className="bar-label" style={{ width: BAR_W, flexShrink: 0, textAlign: 'center', fontSize: 11, color: isCur ? C.goldDim : 'rgba(var(--rgb-hi),0.4)', fontFamily: 'DM Sans,sans-serif', fontWeight: isCur ? 700 : 400, transition: 'color .2s' }}>
                    {m.label}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 2, paddingLeft: Y_W + 4 }}>
        {[['#34d399', 'Services'], ['#a78bfa', 'Products']].map(([col, lbl]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: col }} />
            <span style={{ fontSize: 13, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Hourly chart (day view) ─────────────────────── */
function HourlyChart({ appointments, hours }) {
  const [selected, setSelected] = useState(null)
  const counts = hours.map(h => {
    const hStr = String(h).padStart(2, '0')
    const slot  = appointments.filter(a => a.time?.startsWith(hStr) && a.status !== 'cancelled')
    return { h, total: slot.length, completed: slot.filter(a => a.status === 'completed').length, confirmed: slot.filter(a => a.status === 'confirmed').length }
  })
  const maxCount = Math.max(1, ...counts.map(c => c.total))
  const nMax = niceMax(maxCount)
  const Y_W = 20

  const popup = selected && (
    <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 20, background: 'var(--col-card)', border: '1px solid rgba(var(--rgb-hi),0.12)', borderRadius: 10, padding: '0.6rem 0.875rem', minWidth: 145, boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(var(--rgb-hi),0.5)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
          {String(selected.h).padStart(2,'0')}:00 – {String(selected.h + 1).padStart(2,'0')}:00
        </p>
        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(var(--rgb-hi),0.4)', padding: '0 0 0 8px', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[['Completed', 'completed', C.gold], ['Confirmed', 'confirmed', '#34d399']].map(([lbl, key, col]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 12, color: col, fontFamily: 'DM Sans,sans-serif' }}>{lbl}</span>
            <span style={{ fontSize: 12, color: col, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{selected[key]}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid rgba(var(--rgb-hi),0.07)', paddingTop: 5, marginTop: 2, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--col-acc)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>Total</span>
          <span style={{ fontSize: 12, color: 'var(--col-acc)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{selected.total}</span>
        </div>
      </div>
    </div>
  )

  const BAR_W = 28
  const BAR_GAP = 4

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
      {popup}
      <div style={{ display: 'flex', gap: 4 }}>
        <div className="chart-y-axis" style={{ width: Y_W, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 4, height: 120 }}>
          {[nMax, nMax * 0.75, nMax * 0.5, nMax * 0.25, 0].map((v, i) => (
            <span key={i} style={{ fontSize: 9, color: 'rgba(var(--rgb-hi),0.35)', fontFamily: 'DM Sans,sans-serif', lineHeight: 1 }}>{fmtTick(v, false)}</span>
          ))}
        </div>
        <div style={{ flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="chart-area" style={{ position: 'relative', height: 120 }}>
              {[25, 50, 75].map(pct => (
                <div key={pct} style={{ position: 'absolute', bottom: `${pct}%`, left: 0, right: 0, height: 1, background: 'rgba(var(--rgb-hi),0.04)', pointerEvents: 'none', zIndex: 0 }} />
              ))}
              <div className="chart-bars" style={{ height: 120, display: 'flex', alignItems: 'flex-end', gap: BAR_GAP, position: 'relative', zIndex: 1 }}>
                {counts.map(({ h, total, completed, confirmed }, i) => {
                  const hp = total === 0 ? 0 : Math.max(2, (total / nMax) * 100)
                  const color = completed > 0 ? 'var(--col-acc)' : confirmed > 0 ? '#34d399' : null
                  const colorAlpha = completed > 0 ? 'rgba(var(--rgb-acc),0.4)' : confirmed > 0 ? 'rgba(52,211,153,0.4)' : null
                  const isSel = selected?.h === h
                  return (
                    <div key={h} className="bar-col"
                      onClick={() => setSelected(isSel ? null : { h, total, completed, confirmed })}
                      style={{ width: BAR_W, flexShrink: 0, position: 'relative', height: '100%', cursor: 'pointer' }}>
                      {total === 0
                        ? <div style={{ position: 'absolute', bottom: 0, width: '100%', height: 2, background: 'rgba(var(--rgb-hi),0.04)', borderRadius: 2 }} />
                        : <>
                            <span style={{ position: 'absolute', bottom: `calc(${hp}% + 4px)`, left: '50%', transform: 'translateX(-50%)', fontSize: 12, color: color || C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2 }}>{total}</span>
                            <motion.div className="bar-fill"
                              initial={{ height: '0%' }}
                              animate={{ height: `${hp}%` }}
                              transition={{ duration: 0.55, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                              style={{ position: 'absolute', bottom: 0, width: '100%', background: color ? `linear-gradient(to top, ${color}, ${colorAlpha})` : 'rgba(var(--rgb-hi),0.12)', borderRadius: '4px 4px 0 0', outline: isSel ? '2px solid var(--col-acc)' : 'none', outlineOffset: 1 }}>
                            </motion.div>
                          </>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: BAR_GAP }}>
              {counts.map(({ h }) => (
                <div key={h} className="bar-label" style={{ width: BAR_W, flexShrink: 0, textAlign: 'center', fontSize: 11, color: 'rgba(var(--rgb-hi),0.55)', fontFamily: 'DM Sans,sans-serif', transition: 'color .2s' }}>{h}h</div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 2, paddingLeft: Y_W + 4 }}>
        {[['completed', C.gold], ['confirmed', '#34d399']].map(([s, col]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: col }} />
            <span style={{ fontSize: 13, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', textTransform: 'capitalize', letterSpacing: '0.1em' }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Status breakdown ────────────────────────────── */
function StatusBreakdown({ appointments, compact, horizontal }) {
  const total   = appointments.length
  const statuses = ['completed', 'confirmed', 'cancelled']
  const counts  = statuses.map(s => ({ s, n: appointments.filter(a => a.status === s).length, col: APPT_COLORS[s] }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10 }}>
      <div style={{ display: 'flex', height: compact ? 5 : 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(var(--rgb-hi),0.06)' }}>
        {total > 0 && counts.map(({ s, n, col }) => n === 0 ? null : (
          <motion.div key={s} initial={{ width: 0 }} animate={{ width: `${(n / total) * 100}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} style={{ height: '100%', background: col }} />
        ))}
      </div>
      <div className="status-breakdown-grid" style={{ display: 'grid', gridTemplateColumns: horizontal ? 'repeat(4, 1fr)' : '1fr 1fr', gap: compact ? '0.3rem' : '0.5rem' }}>
        {counts.map(({ s, n, col }) => (
          <div key={s} style={{ background: `${col}10`, border: `1px solid ${col}22`, borderRadius: 8, padding: compact ? '0.35rem 0.6rem' : '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: horizontal ? '1.15rem' : compact ? '0.95rem' : '1.1rem', color: n > 0 ? col : 'var(--col-text)', lineHeight: 1 }}>{n}</p>
              <p className="sales-status-lbl" style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'capitalize', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', marginTop: 1 }}>{s}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Revenue split ───────────────────────────────── */
function RevenueSplit({ servicesRevenue, productsRevenue, total }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(var(--rgb-hi),0.05)' }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${(servicesRevenue / total) * 100}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} style={{ height: '100%', background: 'linear-gradient(90deg, #34d399, #34d39988)' }} />
        <motion.div initial={{ width: 0 }} animate={{ width: `${(productsRevenue / total) * 100}%` }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} style={{ height: '100%', background: 'linear-gradient(90deg, #a78bfa88, #a78bfa)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: '#34d399' }} />
          <span style={{ fontSize: 12, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>Services <span style={{ color: '#34d399', fontWeight: 600 }}>${servicesRevenue.toFixed(2)}</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: '#a78bfa' }} />
          <span style={{ fontSize: 12, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>Products <span style={{ color: '#a78bfa', fontWeight: 600 }}>${productsRevenue.toFixed(2)}</span></span>
        </div>
      </div>
    </div>
  )
}


function MobilePager({ page, total, count, perPage, onPrev, onNext }) {
  const from = page * perPage + 1
  const to   = Math.min((page + 1) * perPage, count)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', borderTop: `1px solid rgba(var(--rgb-hi),0.06)` }}>
      <button onClick={onPrev} disabled={page === 0}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, background: 'none', border: `1px solid ${page === 0 ? 'rgba(var(--rgb-hi),0.06)' : 'rgba(var(--rgb-hi),0.12)'}`, color: page === 0 ? 'var(--col-text)' : 'var(--col-text)', fontSize: 13, fontFamily: 'DM Sans,sans-serif', cursor: page === 0 ? 'default' : 'pointer', transition: 'all .15s' }}>
        <ChevronLeft size={12} /> Prev
      </button>
      <span style={{ fontSize: 12, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>
        {from}–{to} <span style={{ color: 'var(--col-text)' }}>of</span> {count}
      </span>
      <button onClick={onNext} disabled={page >= total - 1}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, background: 'none', border: `1px solid ${page >= total - 1 ? 'rgba(var(--rgb-hi),0.06)' : 'rgba(var(--rgb-hi),0.12)'}`, color: page >= total - 1 ? 'var(--col-text)' : 'var(--col-text)', fontSize: 13, fontFamily: 'DM Sans,sans-serif', cursor: page >= total - 1 ? 'default' : 'pointer', transition: 'all .15s' }}>
        Next <ChevronRight size={12} />
      </button>
    </div>
  )
}

function Skeleton({ rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0.625rem 0.875rem' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 0.25rem', borderBottom: i < rows - 1 ? '1px solid rgba(var(--rgb-hi),0.04)' : 'none' }}>
          <div className="sk" style={{ width: 60, height: 10, borderRadius: 5, animationDelay: `${i * 0.06}s` }} />
          <div className="sk" style={{ width: 70, height: 10, borderRadius: 5, animationDelay: `${i * 0.06 + 0.05}s` }} />
          <div className="sk" style={{ flex: 1, height: 10, borderRadius: 5, animationDelay: `${i * 0.06 + 0.1}s` }} />
          <div className="sk" style={{ width: 50, height: 10, borderRadius: 5, animationDelay: `${i * 0.06 + 0.15}s` }} />
          <div className="sk" style={{ width: 40, height: 22, borderRadius: 20, animationDelay: `${i * 0.06 + 0.2}s` }} />
          <div className="sk" style={{ width: 44, height: 10, borderRadius: 5, animationDelay: `${i * 0.06 + 0.25}s` }} />
        </div>
      ))}
    </div>
  )
}

function Empty({ icon: Icon, text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 8 }}>
      <Icon size={22} style={{ color: 'var(--col-text)' }} />
      <p style={{ color: 'var(--col-text)', fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif' }}>{text}</p>
    </div>
  )
}
