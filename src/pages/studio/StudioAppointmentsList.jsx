import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, X, ChevronDown, Trash2, AlertTriangle, ChevronRight, ChevronLeft,
  Calendar, Clock, LayoutList,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLogAction } from '../../hooks/useLogAction'
import {
  format, isToday, isTomorrow, isPast, parseISO, isSameDay,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameMonth
} from 'date-fns'
import toast from 'react-hot-toast'
import Pager from '../../lib/Pager'

const C = {
  bg:     'var(--col-modal)',
  card:   'var(--col-modal)',
  card2:  'var(--shimmer-a)',
  gold:   'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)', faint: 'rgba(var(--rgb-hi),0.1)',
  border: 'rgba(var(--rgb-hi),0.07)',
}

const STATUS_CFG = {
  confirmed: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)', label: 'Confirmed' },
  completed: { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.25)',  label: 'Completed' },
  cancelled: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', label: 'Cancelled' },
}
const ALL_STATUSES = ['confirmed', 'completed', 'cancelled']

const clientName  = a => a.profiles?.full_name || a.guest_name  || null
const clientPhone = a => a.profiles?.phone     || a.guest_phone || null
const isGuest     = a => !a.user_id && !!a.guest_name

function getWeekBounds(offset) {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

function weekLabel(offset) {
  const { start, end } = getWeekBounds(offset)
  const fmt = d => format(d, 'MMM d')
  const year = end.getFullYear() !== new Date().getFullYear() ? `, ${end.getFullYear()}` : ''
  if (offset === 0) return `This week  ·  ${fmt(start)} – ${fmt(end)}`
  if (offset === -1) return `Last week  ·  ${fmt(start)} – ${fmt(end)}`
  return `${fmt(start)} – ${fmt(end)}${year}`
}

function dateLabel(dateStr) {
  const d = parseISO(dateStr)
  if (isToday(d))    return { text: 'Today',    accent: true  }
  if (isTomorrow(d)) return { text: 'Tomorrow', accent: false }
  return { text: format(d, 'MMM d, yyyy'), accent: false }
}

function StatusDropdown({ appt, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, right: 0 })
  const btnRef      = useRef(null)
  const dropdownRef = useRef(null)
  const cfg = STATUS_CFG[appt.status] || STATUS_CFG.confirmed

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
        <span style={{ fontSize: 11, color: cfg.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.04em' }}>{cfg.label}</span>
        <ChevronDown size={10} style={{ color: cfg.color, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div ref={dropdownRef} style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999, background: 'var(--col-card)', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', minWidth: 140, boxShadow: '0 12px 40px rgba(0,0,0,0.55)' }}>
          {ALL_STATUSES.filter(s => s !== appt.status).map(s => {
            const c = STATUS_CFG[s]
            return (
              <button key={s} onClick={() => { onUpdate(appt.id, s); setOpen(false) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', transition: 'background .12s', textAlign: 'left' }}
                className="dd-opt">
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: c.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{c.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function StudioAppointmentsList() {
  const { user, isAdmin, isManager } = useAuth()
  const log = useLogAction()
  const navigate = useNavigate()

  // List state
  const [appointments, setAppointments] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [viewMode,     setViewMode]     = useState('week')  // 'all' | 'week'
  const [weekOffset,   setWeekOffset]   = useState(0)
  const [details,      setDetails]      = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)
  const [page,         setPage]         = useState(0)

  // Responsive per-page
  const [perPage, setPerPage] = useState(() => window.innerWidth <= 640 ? 4 : 5)
  useEffect(() => {
    const handler = () => setPerPage(window.innerWidth <= 640 ? 4 : 5)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Sub-tab + calendar state
  const [tab,         setTab]         = useState('list')   // 'list' | 'calendar'
  const [calDate,     setCalDate]     = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const [dayPage,     setDayPage]     = useState(0)


  useEffect(() => {
    load()
    let debounce = null
    const sub = supabase.channel('apptlist-appointments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        clearTimeout(debounce)
        debounce = setTimeout(load, 800)
      })
      .subscribe()
    return () => { clearTimeout(debounce); supabase.removeChannel(sub) }
  }, [user])

  async function load() {
    if (!user) return
    if (isAdmin || isManager) {
      const { data } = await supabase
        .from('appointments')
        .select('*, profiles(full_name, phone), services(name, price, duration), stylists(name)')
        .order('date', { ascending: false })
        .order('time', { ascending: true })
      setAppointments(data || [])
    } else {
      const { data: linked } = await supabase.from('stylists').select('id').eq('profile_id', user.id).maybeSingle()
      if (linked) {
        const { data } = await supabase
          .from('appointments')
          .select('*, profiles(full_name, phone), services(name, price, duration), stylists(name)')
          .eq('stylist_id', linked.id)
          .order('date', { ascending: false })
          .order('time', { ascending: true })
        setAppointments(data || [])
      }
    }
    setLoading(false)
  }

  function openDelete(appt) { setDeleteTarget(appt) }
  function closeDelete()     { setDeleteTarget(null) }

  async function confirmDelete() {
    setDeleting(true)
    const { error } = await supabase.from('appointments').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) { toast.error(error.message); return }
    log('appointment.deleted', {
      entityType: 'appointment', entityId: deleteTarget.id,
      details: { message: `deleted ${clientName(deleteTarget) || 'client'}'s "${deleteTarget.services?.name || 'appointment'}" on ${deleteTarget.date}` },
    })
    setAppointments(prev => prev.filter(a => a.id !== deleteTarget.id))
    setDetails(null)
    toast.success('Appointment deleted')
    closeDelete()
  }

  async function updateStatus(id, newStatus) {
    const appt = appointments.find(a => a.id === id)
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id)
    if (error) { toast.error(error.message); return }
    log('appointment.status_changed', {
      entityType: 'appointment', entityId: id,
      details: { message: `changed ${clientName(appt) || 'client'}'s "${appt?.services?.name || 'appointment'}" status → ${newStatus}` },
    })
    const updated = { ...appt, status: newStatus }
    setAppointments(prev => prev.map(a => a.id === id ? updated : a))
    if (details?.id === id) setDetails(updated)

    if (newStatus === 'completed' && appt?.status !== 'completed' && appt?.user_id) {
      const { data: prof } = await supabase.from('profiles').select('points').eq('id', appt.user_id).single()
      const newCount = (prof?.points || 0) + 1
      await supabase.from('profiles').update({ points: newCount }).eq('id', appt.user_id)
      if (newCount % 5 === 0) {
        const code = `REWARD${Math.random().toString(36).slice(2, 7).toUpperCase()}`
        const expiry = new Date(); expiry.setMonth(expiry.getMonth() + 3)
        const { data: coupon } = await supabase.from('coupons').insert({
          code, discount_type: 'percentage', discount_value: 30,
          min_points_required: 0, expiry_date: expiry.toISOString().split('T')[0],
          max_uses: 1, active: true, is_public: false,
        }).select().single()
        if (coupon) {
          await supabase.from('user_coupons').insert({ user_id: appt.user_id, coupon_id: coupon.id, used: false })
          toast.success(`Visit ${newCount} — 30% reward sent to ${appt.profiles?.full_name || 'client'}`)
        }
      } else {
        toast.success(`Visit ${newCount % 5}/5 — ${5 - (newCount % 5)} more to unlock 30% off`)
      }
    } else {
      toast.success(`Marked as ${STATUS_CFG[newStatus]?.label}`)
    }
  }

  const filtered = useMemo(() => {
    const { start, end } = getWeekBounds(weekOffset)
    return appointments.filter(a => {
      const matchStatus = statusFilter === 'all' || a.status === statusFilter
      const q = search.toLowerCase()
      const matchSearch = !q ||
        a.profiles?.full_name?.toLowerCase().includes(q) ||
        a.profiles?.phone?.includes(q) ||
        a.guest_name?.toLowerCase().includes(q) ||
        a.guest_phone?.includes(q) ||
        a.guest_email?.toLowerCase().includes(q) ||
        a.services?.name?.toLowerCase().includes(q) ||
        a.stylists?.name?.toLowerCase().includes(q)
      const matchWeek = viewMode === 'all' || (() => { const d = parseISO(a.date); return d >= start && d <= end })()
      return matchStatus && matchSearch && matchWeek
    })
  }, [appointments, search, statusFilter, viewMode, weekOffset])

  const countBase = useMemo(() => {
    const { start, end } = getWeekBounds(weekOffset)
    return appointments.filter(a => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        a.profiles?.full_name?.toLowerCase().includes(q) ||
        a.profiles?.phone?.includes(q) ||
        a.guest_name?.toLowerCase().includes(q) ||
        a.guest_phone?.includes(q) ||
        a.guest_email?.toLowerCase().includes(q) ||
        a.services?.name?.toLowerCase().includes(q) ||
        a.stylists?.name?.toLowerCase().includes(q)
      const matchWeek = viewMode === 'all' || (() => { const d = parseISO(a.date); return d >= start && d <= end })()
      return matchSearch && matchWeek
    })
  }, [appointments, search, viewMode, weekOffset])

  const counts = useMemo(() =>
    ALL_STATUSES.reduce((acc, s) => { acc[s] = countBase.filter(a => a.status === s).length; return acc }, {}),
    [countBase]
  )

  const paged = filtered.slice(page * perPage, (page + 1) * perPage)

  // Group appointments by date for calendar
  const apptsByDate = useMemo(() => {
    const map = new Map()
    for (const a of appointments) {
      if (!map.has(a.date)) map.set(a.date, [])
      map.get(a.date).push(a)
    }
    return map
  }, [appointments])

  // Appointments for the selected day
  const dayAppts = useMemo(() => {
    if (!selectedDay) return []
    const key = format(selectedDay, 'yyyy-MM-dd')
    return (apptsByDate.get(key) || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }, [selectedDay, apptsByDate])

  const pagedDay = dayAppts.slice(dayPage * perPage, (dayPage + 1) * perPage)

  const statCards = [
    { s: 'confirmed', label: 'Confirmed', cfg: STATUS_CFG.confirmed },
    { s: 'completed', label: 'Completed', cfg: STATUS_CFG.completed },
    { s: 'cancelled', label: 'Cancelled', cfg: STATUS_CFG.cancelled },
  ]

  // Shared appointment row renderer
  function ApptRow({ appt, i, last }) {
    const { text: dateText, accent } = dateLabel(appt.date)
    const name     = clientName(appt)
    const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
    const isPastAppt = isPast(parseISO(`${appt.date}T${appt.time || '23:59'}`))
    const cfg = STATUS_CFG[appt.status] || STATUS_CFG.confirmed
    return (
      <div className="al-row"
        style={{ padding: '0.875rem 1.25rem', borderBottom: last ? 'none' : `1px solid ${C.border}`, borderLeft: `3px solid ${accent ? cfg.color : 'transparent'}`, transition: 'background .15s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${cfg.color}22,${cfg.color}0e)`, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: cfg.color, fontFamily: '"Cormorant Garamond",serif', fontWeight: 600 }}>{initials}</span>
          </div>
          <p style={{ flex: 1, color: C.white, fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0 }}>
            {name || <span style={{ color: C.muted, fontStyle: 'italic' }}>Unknown</span>}
            {isGuest(appt) && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.05em', verticalAlign: 'middle' }}>GUEST</span>}
          </p>
          <StatusDropdown appt={appt} onUpdate={updateStatus} />
          <button onClick={() => setDetails(appt)} className="al-info-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 9px', borderRadius: 7, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all .18s', flexShrink: 0 }}>
            Info <ChevronRight size={9} />
          </button>
          {isAdmin && (
            <button onClick={() => openDelete(appt)} className="del-row-btn"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, background: 'transparent', border: '1px solid rgba(248,113,113,0.15)', color: 'rgba(248,113,113,0.4)', cursor: 'pointer', transition: 'all .18s', flexShrink: 0 }}>
              <Trash2 size={11} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', paddingLeft: 38 }}>
          <span style={{ fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', color: accent ? C.gold : 'var(--col-text)', fontWeight: accent ? 600 : 400 }}>{dateText}</span>
          {appt.time && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: '0.7rem', color: isPastAppt && appt.status !== 'completed' ? 'rgba(248,113,113,0.5)' : 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>{appt.time.slice(0, 5)}</span></>}
          {appt.services?.name && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: '0.7rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 160 }}>{appt.services.name}</span></>}
          {appt.stylists?.name && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: '0.7rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>{appt.stylists.name}</span></>}
          {appt.services?.price && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', color: appt.status === 'completed' ? C.gold : 'var(--col-text)', fontWeight: appt.status === 'completed' ? 600 : 400 }}>${appt.services.price}</span></>}
          {appt.payment_status === 'paid' && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Paid online</span></>}
          {appt.payment_status === 'pay_in_store' && appt.status === 'completed' && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Paid in store</span></>}
          {appt.payment_status === 'pay_in_store' && appt.status !== 'completed' && <><span style={{ color: 'var(--col-text)' }}>·</span><span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Pay in store</span></>}
        </div>
      </div>
    )
  }

  // ── Calendar: Month view ──────────────────────────────
  function MonthView() {
    const monthStart = startOfMonth(calDate)
    const monthEnd   = endOfMonth(calDate)
    const days       = eachDayOfInterval({ start: monthStart, end: monthEnd })
    const startPad   = getDay(monthStart) // 0 = Sun

    return (
      <div>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <button onClick={() => { setCalDate(subMonths(calDate, 1)); setSelectedDay(null) }} className="cal-nav-btn"
            style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, cursor: 'pointer', transition: 'all .15s' }}>
            <ChevronLeft size={13} />
          </button>
          <span className="font-display" style={{ fontSize: '1.05rem', color: C.white }}>{format(calDate, 'MMMM yyyy')}</span>
          <button onClick={() => { setCalDate(addMonths(calDate, 1)); setSelectedDay(null) }} className="cal-nav-btn"
            style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, cursor: 'pointer', transition: 'all .15s' }}>
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 9, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', padding: '0 0 4px' }}>{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
          {Array.from({ length: startPad }).map((_, i) => <div key={`p${i}`} />)}
          {days.map(day => {
            const key     = format(day, 'yyyy-MM-dd')
            const list    = apptsByDate.get(key) || []
            const isSel   = selectedDay && isSameDay(day, selectedDay)
            const isToday_ = isToday(day)
            const dotMap  = ALL_STATUSES.reduce((acc, s) => { acc[s] = list.filter(a => a.status === s).length; return acc }, {})

            return (
              <button key={key} onClick={() => { setSelectedDay(isSel ? null : day); setDayPage(0) }} className="cal-day-btn"
                style={{
                  borderRadius: 8, padding: '0.35rem 0.2rem 0.4rem', cursor: 'pointer', textAlign: 'center',
                  background: isSel ? C.goldBg : isToday_ ? 'rgba(var(--rgb-hi),0.04)' : 'transparent',
                  border: `1px solid ${isSel ? C.goldBorder : isToday_ ? 'rgba(var(--rgb-acc),0.22)' : 'transparent'}`,
                  transition: 'all .15s', minHeight: 52,
                }}>
                <span style={{ display: 'block', fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', color: isSel ? C.gold : isToday_ ? C.gold : C.white, fontWeight: isSel || isToday_ ? 600 : 400, marginBottom: 4 }}>{format(day, 'd')}</span>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap', minHeight: 8 }}>
                  {ALL_STATUSES.filter(s => dotMap[s] > 0).map(s => (
                    <div key={s} style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_CFG[s].color, flexShrink: 0 }} title={`${dotMap[s]} ${s}`} />
                  ))}
                  {list.length > 3 && (
                    <span style={{ fontSize: 7, color: C.muted, fontFamily: 'DM Sans,sans-serif', lineHeight: 1, marginTop: 1 }}>+{list.length - ALL_STATUSES.filter(s => dotMap[s] > 0).length}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Calendar: Week view ───────────────────────────────
  return (
    <div className="al-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.6rem' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .al-row:hover { background: rgba(var(--rgb-hi),0.02) !important; }
        .al-row:hover .al-info-btn { border-color: ${C.goldBorder} !important; color: ${C.gold} !important; }
        .al-search:focus { border-color: ${C.goldBorder} !important; box-shadow: 0 0 0 3px rgba(var(--rgb-acc),0.07); }
        .al-pill:hover  { border-color: var(--col-text) !important; color: var(--col-text) !important; }
        .dd-opt:hover   { background: rgba(var(--rgb-hi),0.05) !important; }
        .stat-card:hover { border-color: rgba(var(--rgb-hi),0.12) !important; transform: translateY(-1px); }
        @media (max-width: 1199px) {
          .al-root { height: auto !important; }
          .al-list-box { overflow: visible !important; height: auto !important; flex: none !important; min-height: unset !important; }
        }
        .del-row-btn:hover { color: #f87171 !important; border-color: rgba(248,113,113,0.25) !important; background: rgba(248,113,113,0.08) !important; }
        .cal-nav-btn:hover { border-color: ${C.goldBorder} !important; color: ${C.gold} !important; }
        .cal-day-btn:hover { background: rgba(var(--rgb-hi),0.05) !important; border-color: rgba(var(--rgb-hi),0.1) !important; }
        .cal-chip:hover { opacity: 0.8; transform: translateY(-1px); }
        @media (max-width: 640px) {
          /* Base bump: everything inherits larger text on mobile */
          .al-root { font-size: 15px !important; }

          /* Stat cards */
          .stat-card { padding: 0.35rem 0.4rem !important; gap: 5px !important; }
          .stat-card .stat-num { font-size: 1rem !important; }
          .stat-card .stat-lbl { font-size: 8px !important; letter-spacing: 0.04em !important; }
          .stat-grid { gap: 0.3rem !important; }

          /* List rows */
          .al-row { padding: 0.875rem 1rem !important; }
          .al-row p, .al-row span { font-size: 14px !important; }
          .al-row .al-info-btn { font-size: 12px !important; padding: 5px 11px !important; }

          /* Main tabs */
          .al-root .al-main-tab { font-size: 13px !important; padding: 0.7rem 0.875rem !important; }

          /* View switcher buttons */
          .al-root .al-view-btn { font-size: 13px !important; padding: 8px 18px !important; }

          /* Period pills */
          .al-pill { font-size: 13px !important; padding: 6px 16px !important; }

          /* Search input */
          .al-search { font-size: 14px !important; padding: 0.55rem 0.875rem 0.55rem 2.2rem !important; }

          /* Calendar day numbers */
          .al-root .cal-day-num { font-size: 14px !important; }
          .al-root .cal-weekday  { font-size: 11px !important; }

          /* Details panel */
          .al-root .al-detail-label { font-size: 11px !important; }
          .al-root .al-detail-value { font-size: 15px !important; }

        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, paddingBottom: '0.75rem' }}>
        <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.3rem,2vw,1.7rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.15rem' }}>Appointments</h1>
        <span style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>{appointments.length} total</span>
      </div>


      {/* ══ LIST VIEW ════════════════════════════════════ */}
      {tab === 'list' && (
        <>
          {/* View switcher */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {[
                { key: 'list',     icon: LayoutList, label: 'List'     },
                { key: 'calendar', icon: Calendar,   label: 'Calendar' },
              ].map(({ key, icon: Icon, label }, i) => {
                const active = tab === key
                return (
                  <button key={key} onClick={() => setTab(key)}
                    className="al-view-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', cursor: 'pointer', transition: 'all .18s', border: 'none', borderLeft: i > 0 ? `1px solid ${C.border}` : 'none', background: active ? 'rgba(var(--rgb-acc),0.1)' : 'rgba(var(--rgb-hi),0.03)', color: active ? C.gold : C.muted, fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: active ? 700 : 400, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
                    <Icon size={12} /> {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Stat cards */}
          <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem', flexShrink: 0 }}>
            {statCards.map(({ s, label, cfg }) => (
              <button key={s} className="stat-card"
                onClick={() => { setStatusFilter(statusFilter === s ? 'all' : s); setPage(0) }}
                style={{ background: statusFilter === s ? cfg.bg : C.card, border: `1px solid ${statusFilter === s ? cfg.border : C.border}`, borderRadius: 10, padding: '0.55rem 0.875rem', cursor: 'pointer', textAlign: 'left', transition: 'all .18s', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                <div className="font-display stat-num" style={{ fontSize: '1.25rem', color: loading ? C.border : C.white, lineHeight: 1 }}>{loading ? '—' : counts[s]}</div>
                <p className="stat-lbl" style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: statusFilter === s ? cfg.color : C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flex: 1 }}>{label}</p>
                {statusFilter === s && <X size={9} style={{ color: cfg.color, opacity: 0.7, flexShrink: 0 }} />}
              </button>
            ))}
          </div>

          {/* Period mode toggle + week navigator */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {[{ key: 'week', label: 'Week by week' }, { key: 'all', label: 'All time' }].map(({ key, label }) => {
                const active = viewMode === key
                return (
                  <button key={key} onClick={() => { setViewMode(key); setPage(0) }} className="al-pill"
                    style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${active ? C.goldBorder : 'rgba(var(--rgb-hi),0.12)'}`, background: active ? C.goldBg : 'rgba(var(--rgb-hi),0.04)', color: active ? C.gold : 'var(--col-text)', fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: active ? 700 : 400, cursor: 'pointer', transition: 'all .15s', letterSpacing: '0.04em' }}>
                    {label}
                  </button>
                )
              })}
            </div>
            {viewMode === 'week' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => { setWeekOffset(w => w - 1); setPage(0) }} className="cal-nav-btn"
                    style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, cursor: 'pointer', transition: 'all .15s', flexShrink: 0 }}>
                    <ChevronLeft size={13} />
                  </button>
                  <div style={{ flex: 1, textAlign: 'center', padding: '5px 12px', borderRadius: 9, background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'DM Sans,sans-serif', color: C.white, letterSpacing: '0.02em' }}>
                    {weekLabel(weekOffset)}
                  </div>
                  <button onClick={() => { setWeekOffset(w => w + 1); setPage(0) }} className="cal-nav-btn"
                    style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, cursor: 'pointer', transition: 'all .15s', flexShrink: 0 }}>
                    <ChevronRight size={13} />
                  </button>
                </div>
                {weekOffset !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button onClick={() => { setWeekOffset(0); setPage(0) }} className="al-pill"
                      style={{ padding: '3px 14px', borderRadius: 20, border: `1px solid ${C.goldBorder}`, background: C.goldBg, color: C.gold, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', letterSpacing: '0.06em' }}>
                      This week
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Search */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
                placeholder="Search by client, phone, service or stylist…" autoComplete="off" className="al-search"
                style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: '0.42rem 0.875rem 0.42rem 2.1rem', fontSize: '0.8rem', color: C.white, outline: 'none', fontFamily: 'DM Sans,sans-serif', fontWeight: 300, transition: 'all .2s', boxSizing: 'border-box' }} />
              {search && (
                <button onClick={() => { setSearch(''); setPage(0) }}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center' }}>
                  <X size={13} />
                </button>
              )}
            </div>
            {(search || statusFilter !== 'all') && (
              <button onClick={() => { setSearch(''); setStatusFilter('all'); setPage(0) }} className="al-pill"
                style={{ padding: '0.48rem 1rem', borderRadius: 9, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s' }}>
                Clear all
              </button>
            )}
          </div>

          {!loading && (search || statusFilter !== 'all') && (
            <p style={{ flexShrink: 0, fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: -4 }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              {statusFilter !== 'all' && <span style={{ color: STATUS_CFG[statusFilter]?.color }}> · {STATUS_CFG[statusFilter]?.label}</span>}
              {search && <span> matching "<span style={{ color: C.dim }}>{search}</span>"</span>}
            </p>
          )}

          {/* List */}
          <div className="al-list-box" style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
            {loading ? (
              <div>
                {Array.from({ length: perPage }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '1rem 1.25rem', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.card2 }} className="shimmer" />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ height: 11, width: '38%', borderRadius: 4, background: C.card2 }} className="shimmer" />
                      <div style={{ height: 9, width: '55%', borderRadius: 4, background: C.card2 }} className="shimmer" />
                    </div>
                    <div style={{ height: 26, width: 100, borderRadius: 8, background: C.card2 }} className="shimmer" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Search size={22} style={{ color: C.faint }} />
                </div>
                <p style={{ color: C.dim, fontSize: '0.88rem', fontFamily: 'DM Sans,sans-serif' }}>
                  {search || statusFilter !== 'all' ? 'No appointments match your search' : 'No appointments yet'}
                </p>
                {(search || statusFilter !== 'all') && (
                  <button onClick={() => { setSearch(''); setStatusFilter('all'); setPage(0) }}
                    style={{ padding: '6px 18px', borderRadius: 20, background: C.goldBg, border: `1px solid ${C.goldBorder}`, color: C.goldDim, fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.08em' }}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>{paged.map((appt, i) => (
                <ApptRow key={appt.id} appt={appt} i={i} last={i === paged.length - 1} />
              ))}<Pager page={page} total={filtered.length} perPage={perPage} onChange={setPage} /></>
            )}
          </div>

        </>
      )}

      {/* ══ CALENDAR VIEW ════════════════════════════════════ */}
      {tab === 'calendar' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto' }}>

          {/* Toolbar: Calendar/List switcher + Today button */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* View switcher */}
            <div style={{ display: 'inline-flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {[
                { key: 'list',     icon: LayoutList, label: 'List'     },
                { key: 'calendar', icon: Calendar,   label: 'Calendar' },
              ].map(({ key, icon: Icon, label }, i) => {
                const active = tab === key
                return (
                  <button key={key} onClick={() => setTab(key)}
                    className="al-view-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', cursor: 'pointer', transition: 'all .18s', border: 'none', borderLeft: i > 0 ? `1px solid ${C.border}` : 'none', background: active ? 'rgba(var(--rgb-acc),0.1)' : 'rgba(var(--rgb-hi),0.03)', color: active ? C.gold : C.muted, fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: active ? 700 : 400, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
                    <Icon size={12} /> {label}
                  </button>
                )
              })}
            </div>
            {/* Today — only when not on current month */}
            {!isSameMonth(calDate, new Date()) && (
              <button onClick={() => { setCalDate(new Date()); setSelectedDay(null) }}
                style={{ padding: '5px 14px', borderRadius: 8, border: `1px solid ${C.goldBorder}`, background: C.goldBg, color: C.gold, fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', letterSpacing: '0.08em' }}>
                Today
              </button>
            )}
          </div>

          {/* Calendar grid */}
          <div style={{ flexShrink: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1rem' }}>
            {loading ? (
              <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 22, height: 22, border: `2px solid ${C.border}`, borderTopColor: C.gold, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
              </div>
            ) : <MonthView />}
          </div>

          {/* Legend */}
          <div style={{ flexShrink: 0, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {ALL_STATUSES.map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_CFG[s].color }} />
                <span style={{ fontSize: 10, color: C.muted, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.06em' }}>{STATUS_CFG[s].label}</span>
              </div>
            ))}
          </div>

          {/* ── Day panel ── */}
          <AnimatePresence>
            {selectedDay && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{ flexShrink: 0, background: C.card, border: `1px solid ${C.goldBorder}`, borderRadius: 14, overflow: 'hidden' }}>
                {/* Day panel header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderBottom: `1px solid ${C.border}`, background: C.goldBg }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Calendar size={13} color={C.gold} />
                    <span className="font-display" style={{ fontSize: '1.1rem', color: C.white }}>{format(selectedDay, 'EEEE, MMMM d')}</span>
                    <span style={{ padding: '2px 9px', borderRadius: 20, background: 'rgba(var(--rgb-acc),0.12)', border: `1px solid ${C.goldBorder}`, fontSize: 10, color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
                      {dayAppts.length} appointment{dayAppts.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button onClick={() => setSelectedDay(null)}
                    style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.06)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <X size={12} />
                  </button>
                </div>

                {dayAppts.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 1.25rem', gap: 8 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Calendar size={18} style={{ color: C.faint }} />
                    </div>
                    <p style={{ color: C.dim, fontSize: '0.84rem', fontFamily: 'DM Sans,sans-serif' }}>No appointments on this day</p>
                  </div>
                ) : (
                  <>
                    {pagedDay.map((appt, i) => (
                      <ApptRow key={appt.id} appt={appt} i={i} last={i === pagedDay.length - 1} />
                    ))}
                    <Pager page={dayPage} total={dayAppts.length} perPage={perPage} onChange={setDayPage} />
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Details modal ── */}
      <AnimatePresence>
        {details && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
            onMouseDown={e => { if (e.target === e.currentTarget) setDetails(null) }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 460, background: 'var(--col-modal)', border: `1px solid ${C.goldBorder}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.75)' }}>
              {(() => {
                const cfg = STATUS_CFG[details.status] || STATUS_CFG.confirmed
                const { text: dateText, accent } = dateLabel(details.date)
                const dName    = clientName(details)
                const initials = dName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
                const isPastAppt = isPast(parseISO(`${details.date}T${details.time || '23:59'}`))
                return (
                  <>
                    <div style={{ height: 3, background: `linear-gradient(90deg,${C.gold},var(--col-acc2),rgba(var(--rgb-acc),0.15))` }} />
                    <div style={{ padding: '1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                        <div>
                          <h2 className="font-display" style={{ fontSize: '1.5rem', color: C.white, fontWeight: 400, lineHeight: 1.1, marginBottom: 4 }}>Appointment</h2>
                          <span style={{ fontSize: '0.7rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.06em' }}>{format(parseISO(details.date), 'EEEE, MMMM d yyyy')}</span>
                        </div>
                        <button onClick={() => setDetails(null)}
                          style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <X size={13} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.875rem 1rem', background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: '0.875rem' }}>
                        <div style={{ width: 42, height: 42, borderRadius: '50%', background: `linear-gradient(135deg,${cfg.color}28,${cfg.color}14)`, border: `1px solid ${cfg.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 14, color: cfg.color, fontFamily: '"Cormorant Garamond",serif', fontWeight: 600 }}>{initials}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2, flexWrap: 'wrap' }}>
                            <p style={{ color: C.white, fontSize: '0.9rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>{dName || 'Unknown client'}</p>
                            {isGuest(details) && <span style={{ fontSize: 9, padding: '1px 7px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.05em' }}>GUEST</span>}
                          </div>
                          {clientPhone(details) && <p style={{ color: C.muted, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif' }}>{clientPhone(details)}</p>}
                          {isGuest(details) && details.guest_email && <p style={{ color: 'rgba(96,165,250,0.6)', fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', marginTop: 1 }}>{details.guest_email}</p>}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '0.875rem' }}>
                        <div style={{ padding: '0.75rem', background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                            <Calendar size={10} color={C.muted} />
                            <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Date</p>
                          </div>
                          <p style={{ fontSize: '0.82rem', color: accent ? C.gold : C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: accent ? 600 : 400 }}>{dateText}</p>
                          <p style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>{format(parseISO(details.date), 'EEEE')}</p>
                        </div>
                        <div style={{ padding: '0.75rem', background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                            <Clock size={10} color={C.muted} />
                            <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Time</p>
                          </div>
                          <p style={{ fontSize: '0.82rem', color: isPastAppt && details.status !== 'completed' ? 'rgba(248,113,113,0.7)' : C.white, fontFamily: 'DM Sans,sans-serif' }}>{details.time?.slice(0, 5) || '—'}</p>
                          {details.services?.duration && <p style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>{details.services.duration} min</p>}
                        </div>
                      </div>
                      {(details.services || details.stylists) && (
                        <div style={{ padding: '0.875rem 1rem', background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: '0.875rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 4 }}>Service</p>
                              <p style={{ color: C.white, fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{details.services?.name || '—'}</p>
                              {details.stylists?.name && <p style={{ color: C.muted, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>with {details.stylists.name}</p>}
                            </div>
                            {details.services?.price && (
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 4 }}>Price</p>
                                <span className="font-display" style={{ fontSize: '1.3rem', color: details.status === 'completed' ? C.gold : C.dim }}>${details.services.price}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {details.payment_status === 'paid' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.22)', borderRadius: 10, marginBottom: '0.875rem' }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.8rem', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Paid online</span>
                          {details.services?.price && <span className="font-display" style={{ marginLeft: 'auto', fontSize: '1.1rem', color: '#34d399' }}>${details.services.price}</span>}
                        </div>
                      )}
                      {details.payment_status === 'pay_in_store' && details.status === 'completed' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.22)', borderRadius: 10, marginBottom: '0.875rem' }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.8rem', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Paid in store</span>
                          {details.services?.price && <span className="font-display" style={{ marginLeft: 'auto', fontSize: '1.1rem', color: '#34d399' }}>${details.services.price}</span>}
                        </div>
                      )}
                      {details.payment_status === 'pay_in_store' && details.status !== 'completed' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.65rem 1rem', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.22)', borderRadius: 10, marginBottom: '0.875rem' }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Payment due in store</span>
                          {details.services?.price && <span className="font-display" style={{ marginLeft: 'auto', fontSize: '1.1rem', color: '#f59e0b' }}>${details.services.price}</span>}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: `${cfg.bg}`, border: `1px solid ${cfg.border}`, borderRadius: 10, marginBottom: isAdmin ? '0.875rem' : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, boxShadow: `0 0 8px ${cfg.color}88`, flexShrink: 0 }} />
                          <span style={{ fontSize: '0.8rem', color: cfg.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Status</span>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 8px', borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: cfg.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.04em' }}>{cfg.label}</span>
                        </div>
                      </div>
                      {isAdmin && (
                        <button onClick={() => openDelete(details)} className="del-row-btn"
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0.6rem', borderRadius: 10, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', color: 'rgba(248,113,113,0.55)', fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, cursor: 'pointer', transition: 'all .18s', letterSpacing: '0.06em' }}>
                          <Trash2 size={12} /> Delete Appointment
                        </button>
                      )}
                    </div>
                  </>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete confirmation modal ── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
            onMouseDown={e => { if (e.target === e.currentTarget) closeDelete() }}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 420, background: 'var(--col-modal)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#f87171,#ef4444)' }} />
              <div style={{ padding: '1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: '1.25rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AlertTriangle size={18} color="#f87171" />
                  </div>
                  <div>
                    <h3 style={{ color: C.white, fontFamily: '"Cormorant Garamond",serif', fontSize: '1.35rem', fontWeight: 500, marginBottom: 4 }}>Delete appointment?</h3>
                    <p style={{ color: C.muted, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.5 }}>This action is permanent and cannot be undone.</p>
                  </div>
                </div>
                <div style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.12)', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1.5rem' }}>
                  <p style={{ color: C.white, fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, marginBottom: 4 }}>
                    {clientName(deleteTarget) || 'Unknown client'}
                    {isGuest(deleteTarget) && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, verticalAlign: 'middle' }}>GUEST</span>}
                  </p>
                  <p style={{ color: C.muted, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif' }}>
                    {[deleteTarget.services?.name, deleteTarget.date ? format(parseISO(deleteTarget.date), 'MMM d, yyyy') : null, deleteTarget.time?.slice(0, 5)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={closeDelete} className="al-pill"
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 9, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer', transition: 'all .15s' }}>
                    Cancel
                  </button>
                  <button onClick={confirmDelete} disabled={deleting}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 9, border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#f87171,#ef4444)', color: 'var(--col-text)', fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .2s', opacity: deleting ? 0.6 : 1 }}>
                    {deleting ? <div style={{ width: 14, height: 14, border: '2px solid var(--col-text)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> : <><Trash2 size={13} /> Delete</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
