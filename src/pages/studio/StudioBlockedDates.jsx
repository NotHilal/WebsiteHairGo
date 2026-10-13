import { useState, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, Lock, Unlock, X, BanIcon, Clock,
  CheckCircle, XCircle, Settings, Calendar, AlertCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { invalidate } from '../../lib/cache'
import { useAuth } from '../../contexts/AuthContext'
import { useLogAction } from '../../hooks/useLogAction'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameDay, isBefore, startOfDay,
} from 'date-fns'
import toast from 'react-hot-toast'
import { toMins, SLOTS } from '../../lib/hours'

const C = {
  card: 'var(--col-modal)', modal: 'var(--col-modal)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)', subtle: 'rgba(var(--rgb-hi),0.06)',
  border: 'rgba(var(--rgb-hi),0.07)',
  danger: '#f87171', dangerBg: 'rgba(248,113,113,0.12)', dangerBorder: 'rgba(248,113,113,0.25)',
  warning: '#f59e0b', warnBg: 'rgba(245,158,11,0.1)', warnBorder: 'rgba(245,158,11,0.25)',
  info: '#60a5fa', infoBg: 'rgba(96,165,250,0.1)', infoBorder: 'rgba(96,165,250,0.25)',
  success: '#4ade80', successBg: 'rgba(74,222,128,0.1)', successBorder: 'rgba(74,222,128,0.25)',
}

const WDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ── Shared button / input styles ──
const btnSecondary = { flex: 1, padding: '0.65rem', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }
const btnGold      = { flex: 1.4, padding: '0.65rem', borderRadius: 10, background: 'linear-gradient(135deg,var(--col-acc),var(--col-acc2))', color: 'var(--col-bg)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
const btnDanger    = { flex: 1.4, padding: '0.65rem', borderRadius: 10, background: 'transparent', border: `1.5px solid ${C.dangerBorder}`, color: C.danger, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background .18s' }
const labelStyle   = { display: 'block', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 7 }
const inputStyle   = { width: '100%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '0.6rem 0.875rem', fontSize: '0.85rem', color: C.white, outline: 'none', fontFamily: 'DM Sans,sans-serif', fontWeight: 300, transition: 'border-color .2s', boxSizing: 'border-box' }

function Spinner({ dark }) {
  return <div style={{ width: 14, height: 14, border: `2px solid ${dark ? 'rgba(0,0,0,.25)' : 'var(--col-text)'}`, borderTopColor: dark ? 'var(--col-bg)' : '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
}

function TabBtn({ id, label, icon: Icon, active, set }) {
  const on = active === id
  return (
    <button onClick={() => set(id)} className={`block-tab-btn${on ? ' active' : ''}`}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0.55rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, transition: 'all .18s', background: on ? C.goldBg : 'transparent', color: on ? C.gold : C.muted, outline: on ? `1px solid ${C.goldBorder}` : 'none' }}>
      <Icon size={12} /> {label}
    </button>
  )
}

export default function StudioBlockedDates() {
  const { user, isAdmin, isManager } = useAuth()
  const log = useLogAction()

  const [loading,        setLoading]        = useState(true)
  const [month,          setMonth]          = useState(new Date())
  const [selected,       setSelected]       = useState(null)
  const [blockTab,       setBlockTab]       = useState('hours')
  const [reason,         setReason]         = useState('')
  const [selHours,       setSelHours]       = useState([])
  const [saving,         setSaving]         = useState(false)
  const [conflictAppts,  setConflictAppts]  = useState([])
  const [checkingConflicts, setCheckingConflicts] = useState(false)

  // Admin
  const [salonBlocked,   setSalonBlocked]   = useState([])  // blocked_dates where stylist_id IS NULL & approved
  const [salonHours,     setSalonHours]     = useState([])  // blocked_hours where stylist_id IS NULL
  const [pendingRequests,setPendingRequests]= useState([])  // blocked_dates where status = pending
  const [allStylists,    setAllStylists]    = useState([])
  const [settings,       setSettings]       = useState({ maxDays: 2, maxHours: 16 })
  const [draftSettings,  setDraftSettings]  = useState({ maxDays: 2, maxHours: 16 })
  const [editingSettings,setEditingSettings]= useState(false)
  const [settingsTab,    setSettingsTab]    = useState('general')
  const [overrideDrafts, setOverrideDrafts] = useState({}) // { [stylistId]: { days, hours } }

  // Worker
  const [myStylist,      setMyStylist]      = useState(null)
  const [myHours,        setMyHours]        = useState([])
  const [myRequests,     setMyRequests]     = useState([])

  useEffect(() => { load() }, [isAdmin, isManager])

  // Check for active appointments when admin/manager selects a day to potentially block
  useEffect(() => {
    if (!selected || (!isAdmin && !isManager) || selected.salonClosed) {
      setConflictAppts([])
      return
    }
    let cancelled = false
    setCheckingConflicts(true)
    supabase
      .from('appointments')
      .select('id, time, status, profiles(full_name), stylists(name)')
      .eq('date', selected.key)
      .in('status', ['pending', 'confirmed'])
      .then(({ data }) => {
        if (!cancelled) { setConflictAppts(data || []); setCheckingConflicts(false) }
      })
    return () => { cancelled = true }
  }, [selected])

  async function load() {
    setLoading(true)
    try {
      if (isAdmin || isManager) await loadAdmin()
      else                      await loadWorker()
    } finally {
      setLoading(false)
    }
  }

  async function loadAdmin() {
    const [{ data: bd }, { data: bh }, { data: cfg }, { data: styl }] = await Promise.all([
      supabase.from('blocked_dates').select('*, stylist:stylists(name)').order('date'),
      supabase.from('blocked_hours').select('*').order('date'),
      supabase.from('salon_settings').select('key, value'),
      supabase.from('stylists').select('*').order('display_order'),
    ])

    setSalonBlocked((bd || []).filter(d => !d.stylist_id && d.status === 'approved'))
    setPendingRequests((bd || []).filter(d => d.stylist_id && d.status === 'pending'))
    setSalonHours((bh || []).filter(h => !h.stylist_id))
    setAllStylists(styl || [])
    applySettings(cfg)
  }

  async function loadWorker() {
    const { data: stylist } = await supabase
      .from('stylists').select('*').eq('profile_id', user.id).maybeSingle()
    setMyStylist(stylist)
    if (!stylist) return

    const [{ data: bh }, { data: bd }, { data: salonBD }, { data: cfg }] = await Promise.all([
      supabase.from('blocked_hours').select('*').eq('stylist_id', stylist.id).order('date'),
      supabase.from('blocked_dates').select('*').eq('stylist_id', stylist.id).order('date'),
      supabase.from('blocked_dates').select('date').is('stylist_id', null).eq('status', 'approved'),
      supabase.from('salon_settings').select('key, value'),
    ])

    setMyHours(bh || [])
    setMyRequests(bd || [])
    setSalonBlocked(salonBD || [])
    applySettings(cfg)
  }

  function applySettings(cfg) {
    if (!cfg) return
    const maxDays  = parseInt(cfg.find(c => c.key === 'max_days_off_per_month')?.value  || '2')
    const maxHours = parseInt(cfg.find(c => c.key === 'max_hours_off_per_month')?.value || '16')
    setSettings({ maxDays, maxHours })
    setDraftSettings({ maxDays, maxHours })
  }

  // Effective quota for the logged-in worker (override wins over global)
  const effectiveMaxDays  = myStylist?.quota_days_override  ?? settings.maxDays
  const effectiveMaxHours = myStylist?.quota_hours_override ?? settings.maxHours

  function openSettings() {
    const drafts = {}
    allStylists.forEach(s => {
      drafts[s.id] = {
        days:  s.quota_days_override  != null ? String(s.quota_days_override)  : '',
        hours: s.quota_hours_override != null ? String(s.quota_hours_override) : '',
      }
    })
    setOverrideDrafts(drafts)
    setSettingsTab('general')
    setEditingSettings(true)
  }

  async function saveOverrides() {
    setSaving(true)
    try {
      await Promise.all(
        allStylists.map(s => {
          const d = overrideDrafts[s.id] || {}
          return supabase.from('stylists').update({
            quota_days_override:  d.days  !== '' ? parseInt(d.days)  : null,
            quota_hours_override: d.hours !== '' ? parseInt(d.hours) : null,
          }).eq('id', s.id)
        })
      )
      // Refresh stylist list
      const { data } = await supabase.from('stylists').select('id, name, photo_url, quota_days_override, quota_hours_override').order('display_order')
      setAllStylists(data || [])
      toast.success('Overrides saved')
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  // ── Derived maps ──
  const salonBlockedMap = Object.fromEntries(salonBlocked.map(d => [d.date || d, d]))

  const hoursMap = ((isAdmin || isManager) ? salonHours : myHours).reduce((acc, h) => {
    if (!acc[h.date]) acc[h.date] = []
    acc[h.date].push(h.hour)
    return acc
  }, {})

  // pending requests keyed by date
  const pendingMap = (isAdmin || isManager)
    ? Object.fromEntries(pendingRequests.map(r => [r.date, r]))
    : myRequests.reduce((acc, r) => { acc[r.date] = r; return acc }, {})

  // ── Monthly quota (worker only) ──
  const monthEnd   = format(endOfMonth(new Date()),   'yyyy-MM-dd')
  const today      = format(new Date(),               'yyyy-MM-dd')

  // Only count future/today hours — past ones already happened and can't be gamed
  const hoursUsed    = myHours.filter(h => h.date >= today     && h.date <= monthEnd).length
  const approvedDays = myRequests.filter(r => r.status === 'approved' && r.date >= today && r.date <= monthEnd).length
  const pendingDays  = myRequests.filter(r => r.status === 'pending'  && r.date >= today && r.date <= monthEnd).length

  // ── Calendar helpers ──
  const days     = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startPad = getDay(startOfMonth(month))
  const isPast   = d => isBefore(d, startOfDay(new Date()))
  const isToday  = d => isSameDay(d, new Date())

  function getDayStyle(key, day) {
    if (salonBlockedMap[key])         return { bg: C.dangerBg, border: C.dangerBorder, num: C.danger }
    if (pendingMap[key])                return { bg: C.infoBg,   border: C.infoBorder,   num: C.info }
    if ((hoursMap[key] || []).length)   return { bg: C.warnBg,   border: C.warnBorder,   num: C.warning }
    if (isToday(day))                   return { bg: C.goldBg,   border: C.goldBorder,   num: C.gold }
    return { bg: 'rgba(var(--rgb-hi),0.03)', border: C.border, num: C.dim }
  }

  // ── Day click ──
  function handleDayClick(day) {
    if (isPast(day)) return
    const key = format(day, 'yyyy-MM-dd')
    setSelected({
      day, key,
      salonClosed: !!salonBlockedMap[key],
      request: pendingMap[key] || null,
    })
    setReason(pendingMap[key]?.reason || salonBlockedMap[key]?.reason || '')
    setSelHours(hoursMap[key] || [])
    setBlockTab((isAdmin || isManager) ? (salonBlockedMap[key] ? 'day' : 'hours') : 'hours')
  }

  function closeModal() { setSelected(null); setReason(''); setSelHours([]); setBlockTab('hours'); setConflictAppts([]) }
  function toggleHour(h) { setSelHours(p => p.includes(h) ? p.filter(x => x !== h) : [...p, h]) }

  // ── Admin: salon-wide day block ──
  async function blockSalonDay() {
    if (conflictAppts.length > 0) {
      toast.error('Resolve all pending/confirmed appointments before closing this day.')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('blocked_dates').insert({
        date: selected.key, reason: reason.trim() || null, stylist_id: null, status: 'approved', created_by: user.id,
      })
      if (error) throw error
      toast.success('Day blocked')
      log('blocked_dates.salon_blocked', { entityType: 'blocked_dates', details: { message: `blocked salon day ${selected.key}${reason.trim() ? ` — ${reason.trim()}` : ''}` } })
      closeModal(); invalidate('blocked_dates'); load()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function unblockSalonDay() {
    setSaving(true)
    const rec = salonBlocked.find(d => (d.date || d) === selected.key)
    if (rec?.id) {
      const { error } = await supabase.from('blocked_dates').delete().eq('id', rec.id)
      if (error) { toast.error(error.message); setSaving(false); return }
    }
    toast.success('Day reopened')
    log('blocked_dates.salon_unblocked', { entityType: 'blocked_dates', details: { message: `unblocked salon day ${selected.key}` } })
    setSaving(false); closeModal(); invalidate('blocked_dates'); load()
  }

  // Bookings that would be left without their stylist
  async function bookingsFor(stylistId, date, hours = null) {
    let q = supabase.from('appointments').select('id, time, duration_minutes')
      .eq('date', date).in('status', ['pending', 'confirmed'])
    if (stylistId) q = q.eq('stylist_id', stylistId)
    const { data } = await q
    if (!hours) return data || []
    return (data || []).filter(a => {
      const start = toMins(a.time)
      const end   = start + (a.duration_minutes || 60)
      return hours.some(h => toMins(h) >= start && toMins(h) < end)
    })
  }

  // ── Admin: approve / reject ──
  async function approveRequest(req) {
    const clash = await bookingsFor(req.stylist_id, req.date)
    if (clash.length) {
      toast.error(`${req.stylist?.name || 'This stylist'} has ${clash.length} booking${clash.length !== 1 ? 's' : ''} on ${req.date} — move or cancel them before approving.`)
      return
    }
    await supabase.from('blocked_dates').update({ status: 'approved' }).eq('id', req.id)
    toast.success('Approved')
    log('blocked_dates.approved', { entityType: 'blocked_dates', entityId: req.id, details: { message: `approved day-off for ${req.stylist?.name || 'artist'} on ${req.date}` } })
    load()
  }
  async function rejectRequest(req) {
    await supabase.from('blocked_dates').update({ status: 'rejected' }).eq('id', req.id)
    toast.success('Rejected')
    log('blocked_dates.rejected', { entityType: 'blocked_dates', entityId: req.id, details: { message: `rejected day-off for ${req.stylist?.name || 'artist'} on ${req.date}` } })
    load()
  }

  // ── Hours save (admin = salon-wide, worker = own) ──
  async function saveHours() {
    setSaving(true)
    try {
      // Don't block hours that already have clients booked in them
      const newHours = selHours.filter(h => !(hoursMap[selected.key] || []).includes(h))
      if (newHours.length) {
        const clash = await bookingsFor((!isAdmin && !isManager) ? myStylist.id : null, selected.key, newHours)
        if (clash.length) {
          toast.error(`${clash.length} booking${clash.length !== 1 ? 's' : ''} already in those hours — move or cancel ${clash.length !== 1 ? 'them' : 'it'} first.`)
          setSaving(false); return
        }
      }

      if (!isAdmin && !isManager) {
        // Quota is per month of the day being blocked; that day's hours are replaced
        const selMonthStart = format(startOfMonth(selected.day), 'yyyy-MM-dd')
        const selMonthEnd   = format(endOfMonth(selected.day), 'yyyy-MM-dd')
        const existing = myHours.filter(h => h.date >= (today > selMonthStart ? today : selMonthStart) && h.date <= selMonthEnd && h.date !== selected.key).length
        if (existing + selHours.length > effectiveMaxHours) {
          toast.error(`Monthly limit: ${effectiveMaxHours} hours. This would bring you to ${existing + selHours.length}.`)
          setSaving(false); return
        }
        await supabase.from('blocked_hours').delete().eq('date', selected.key).eq('stylist_id', myStylist.id)
        if (selHours.length) {
          const { error } = await supabase.from('blocked_hours').insert(selHours.map(h => ({ date: selected.key, hour: h, stylist_id: myStylist.id })))
          if (error) throw error
        }
      } else {
        // Admin: salon-wide hours (stylist_id null)
        await supabase.from('blocked_hours').delete().eq('date', selected.key).is('stylist_id', null)
        if (selHours.length) {
          const { error } = await supabase.from('blocked_hours').insert(selHours.map(h => ({ date: selected.key, hour: h, stylist_id: null })))
          if (error) throw error
        }
      }
      toast.success(selHours.length ? `${selHours.length} slot${selHours.length !== 1 ? 's' : ''} blocked` : 'Hours cleared')
      closeModal(); invalidate('blocked_dates'); load()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  // ── Worker: request / cancel day off ──
  async function requestDayOff() {
    setSaving(true)
    try {
      const { error } = await supabase.from('blocked_dates').insert({
        date: selected.key, reason: reason.trim() || null, stylist_id: myStylist.id, status: 'pending', created_by: user.id,
      })
      if (error) throw error
      toast.success('Day-off request submitted — awaiting manager approval')
      log('blocked_dates.requested', { entityType: 'blocked_dates', details: { message: `requested day off on ${selected.key}${reason.trim() ? ` — ${reason.trim()}` : ''}` } })
      closeModal(); load()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function cancelDayOff() {
    if (!selected.request) return
    setSaving(true)
    const { data: deleted } = await supabase.from('blocked_dates').delete().eq('id', selected.request.id).select('id')
    if (!deleted?.length) {
      toast.error('Approved days off can only be removed by a manager')
      setSaving(false); return
    }
    toast.success('Request cancelled')
    setSaving(false); closeModal(); load()
  }

  // ── Admin: save settings ──
  async function saveSettings() {
    setSaving(true)
    try {
      await Promise.all([
        supabase.from('salon_settings').upsert({ key: 'max_days_off_per_month',  value: String(draftSettings.maxDays)  }),
        supabase.from('salon_settings').upsert({ key: 'max_hours_off_per_month', value: String(draftSettings.maxHours) }),
      ])
      setSettings(draftSettings)
      setEditingSettings(false)
      toast.success('Caps saved')
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const upcomingSalon = salonBlocked.filter(d => !isPast(new Date((d.date || d) + 'T00:00:00')))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .bd-day.clickable:hover { border-color: ${C.gold} !important; background: rgba(var(--rgb-acc),0.06) !important; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(var(--rgb-acc),0.14); cursor: pointer; }
        .bd-nav:hover { background: ${C.goldBg} !important; border-color: ${C.goldBorder} !important; color: ${C.gold} !important; }
        .bd-today-btn:hover { background: ${C.gold} !important; color: #000 !important; }
        .m-inp:focus { border-color: ${C.goldBorder} !important; box-shadow: 0 0 0 3px rgba(var(--rgb-acc),0.08); outline: none; }
        .hour-pill { transition: all .15s ease; }
        .hour-pill:not(.hour-pill-on):hover { border-color: ${C.gold} !important; color: ${C.gold} !important; background: ${C.goldBg} !important; }
        .hour-pill-on:hover { filter: brightness(1.12) !important; }
        .block-tab-btn:hover:not(.active) { color: ${C.dim} !important; background: rgba(var(--rgb-hi),0.04) !important; }
        .unblock-btn:hover { background: rgba(248,113,113,0.08) !important; }
        .approve-btn:hover { background: rgba(74,222,128,0.12) !important; }
        .reject-btn:hover  { background: rgba(248,113,113,0.08) !important; }
        @media (max-width: 767px) {
          .bd-main-layout { grid-template-columns: 1fr !important; }
          .bd-main-layout > div:last-child { display: none !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, marginBottom: '1.25rem', paddingBottom: '1.1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.6rem,2.5vw,2.2rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.15rem' }}>
            {(isAdmin || isManager) ? 'Availability Management' : 'My Availability'}
          </h1>
          <p style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
            {(isAdmin || isManager)
              ? 'Block salon-wide days · Approve day-off requests · Configure monthly caps'
              : 'Block your hours freely · Full days need manager approval'}
          </p>
        </div>
        {isAdmin && !isManager && (
          <button onClick={openSettings}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.875rem', borderRadius: 9, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>
            <Settings size={12} /> Caps
          </button>
        )}
      </div>

      {/* ── Worker: account not linked ── */}
      {!isAdmin && !isManager && !loading && !myStylist && (
        <div style={{ background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', gap: 10 }}>
          <AlertCircle size={15} color={C.warning} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ color: C.warning, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Account not linked to a stylist</p>
            <p style={{ color: 'rgba(245,158,11,0.6)', fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>Ask an admin to link your profile in Studio → Stylists.</p>
          </div>
        </div>
      )}

      {/* ── Worker: monthly quota bar ── */}
      {!isAdmin && !isManager && myStylist && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.875rem 1.25rem', marginBottom: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Hours */}
          <div>
            <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, marginBottom: 4 }}>Hours this month</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: '1.4rem', fontFamily: 'Cormorant Garamond,serif', color: hoursUsed >= effectiveMaxHours ? C.danger : C.white, lineHeight: 1 }}>{hoursUsed}</span>
              <span style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>/ {effectiveMaxHours}</span>
            </div>
            <div style={{ width: 110, height: 3, background: 'rgba(var(--rgb-hi),0.08)', borderRadius: 2, marginTop: 5 }}>
              <div style={{ width: `${Math.min(100, (hoursUsed / effectiveMaxHours) * 100)}%`, height: '100%', borderRadius: 2, background: hoursUsed >= effectiveMaxHours ? C.danger : C.gold, transition: 'width .3s' }} />
            </div>
          </div>

          <div style={{ width: 1, height: 36, background: C.border }} />

          {/* Days */}
          <div>
            <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, marginBottom: 4 }}>Days off this month</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: '1.4rem', fontFamily: 'Cormorant Garamond,serif', color: approvedDays >= effectiveMaxDays ? C.danger : C.white, lineHeight: 1 }}>{approvedDays}</span>
              <span style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>/ {effectiveMaxDays} approved</span>
            </div>
            {pendingDays > 0 && (
              <p style={{ fontSize: '0.68rem', color: C.info, fontFamily: 'DM Sans,sans-serif', marginTop: 3 }}>{pendingDays} pending</p>
            )}
          </div>
        </div>
      )}

      {/* ── Admin: pending requests ── */}
      {(isAdmin || isManager) && pendingRequests.length > 0 && (
        <div style={{ background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: 12, padding: '0.875rem 1.1rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.78rem', color: C.info, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: '0.625rem' }}>
            {pendingRequests.length} day-off request{pendingRequests.length !== 1 ? 's' : ''} awaiting approval
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(96,165,250,0.06)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.78rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{req.stylist?.name}</span>
                  <span style={{ fontSize: '0.75rem', color: C.dim, fontFamily: 'DM Sans,sans-serif', marginLeft: 8 }}>{format(new Date(req.date + 'T00:00:00'), 'EEE, MMM d')}</span>
                  {req.reason && <span style={{ fontSize: '0.7rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginLeft: 8 }}>— {req.reason}</span>}
                </div>
                <button onClick={() => approveRequest(req)} className="approve-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: 'transparent', border: `1px solid ${C.successBorder}`, color: C.success, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'background .15s', flexShrink: 0 }}>
                  <CheckCircle size={11} /> Approve
                </button>
                <button onClick={() => rejectRequest(req)} className="reject-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: 'transparent', border: `1px solid ${C.dangerBorder}`, color: C.danger, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'background .15s', flexShrink: 0 }}>
                  <XCircle size={11} /> Reject
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="bd-main-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.25rem', flex: 1, minHeight: 0 }}>

        {/* Calendar */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* Nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '1.1rem 1.5rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <button onClick={() => setMonth(subMonths(month, 1))} className="bd-nav"
              style={{ width: 36, height: 36, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted, transition: 'all .2s', flexShrink: 0 }}>
              <ChevronLeft size={15} />
            </button>
            <span className="font-display" style={{ fontSize: '1.3rem', color: C.white, flex: 1, textAlign: 'center' }}>{format(month, 'MMMM yyyy')}</span>
            <button onClick={() => setMonth(new Date())} className="bd-today-btn"
              style={{ padding: '5px 14px', borderRadius: 20, background: 'transparent', border: `1px solid ${C.goldBorder}`, color: C.goldDim, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .2s', flexShrink: 0 }}>
              Today
            </button>
            <button onClick={() => setMonth(addMonths(month, 1))} className="bd-nav"
              style={{ width: 36, height: 36, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted, transition: 'all .2s', flexShrink: 0 }}>
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 18, padding: '0.65rem 1.5rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: 'wrap' }}>
            {[
              { dot: { background: C.subtle,   border: `1px solid ${C.border}` },       label: 'Available' },
              { dot: { background: C.goldBg,   border: `1px solid ${C.goldBorder}` },   label: 'Today' },
              { dot: { background: C.warnBg,   border: `1px solid ${C.warnBorder}` },   label: 'Hours blocked' },
              { dot: { background: C.infoBg,   border: `1px solid ${C.infoBorder}` },   label: isAdmin ? 'Pending request' : 'Awaiting approval' },
              { dot: { background: C.dangerBg, border: `1px solid ${C.dangerBorder}` }, label: 'Salon closed' },
            ].map(({ dot, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                <div style={{ width: 9, height: 9, borderRadius: 3, flexShrink: 0, ...dot }} />
                {label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div style={{ flex: 1, padding: '1rem 1.5rem 1.5rem', overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 6 }}>
              {WDAYS.map((d, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: i === 0 || i === 6 ? C.goldDim : C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, paddingBottom: 6 }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
              {Array.from({ length: startPad }).map((_, i) => <div key={`p${i}`} style={{ minHeight: 72 }} />)}
              {loading
                ? days.map((_, i) => <div key={i} style={{ minHeight: 72, borderRadius: 10, background: C.subtle, border: `1px solid ${C.border}` }} />)
                : days.map(day => {
                    const key  = format(day, 'yyyy-MM-dd')
                    const past = isPast(day)
                    const { bg, border, num } = getDayStyle(key, day)
                    const hours   = hoursMap[key] || []
                    const closed  = !!salonBlockedMap[key]
                    const pending = pendingMap[key]

                    return (
                      <div key={key} className={`bd-day${!past ? ' clickable' : ''}`}
                        onClick={() => handleDayClick(day)}
                        style={{ minHeight: 72, borderRadius: 10, padding: '7px 7px 5px', border: `1.5px solid ${border}`, background: bg, opacity: past ? 0.3 : 1, cursor: past ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', transition: 'all .18s ease' }}>

                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="font-display" style={{ fontSize: '1.1rem', color: num, fontWeight: 700, lineHeight: 1 }}>{format(day, 'd')}</span>
                          {isToday(day) && !closed && <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold, marginTop: 4 }} />}
                        </div>

                        {closed && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <BanIcon size={8} color={C.danger} />
                            <span style={{ fontSize: 8, color: C.danger, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>Closed</span>
                          </div>
                        )}

                        {!closed && pending && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={8} color={C.info} />
                            <span style={{ fontSize: 8, color: C.info, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>
                              {(isAdmin || isManager) ? (pending.stylist?.name?.split(' ')[0] || 'Request') : (pending.status === 'approved' ? 'Day off' : pending.status === 'rejected' ? 'Rejected' : 'Pending')}
                            </span>
                          </div>
                        )}

                        {!closed && !pending && hours.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
                            {hours.slice(0, 3).map(h => (
                              <span key={h} style={{ fontSize: 7, padding: '1px 4px', borderRadius: 3, background: 'rgba(245,158,11,0.18)', color: C.warning, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{h}</span>
                            ))}
                            {hours.length > 3 && <span style={{ fontSize: 7, color: C.warning, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>+{hours.length - 3}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })
              }
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0, overflow: 'hidden' }}>

          {/* Salon closures */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', flex: upcomingSalon.length ? '1' : '0 0 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '0.875rem 1.1rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BanIcon size={12} color={C.danger} />
              <div>
                <p style={{ fontSize: '0.78rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Salon Closures</p>
                <p style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>{upcomingSalon.length} upcoming</p>
              </div>
            </div>
            <div style={{ overflowY: 'auto', minHeight: 0, padding: '0.625rem' }}>
              {upcomingSalon.length === 0
                ? <p style={{ color: C.muted, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', textAlign: 'center', padding: '0.75rem 0' }}>None scheduled</p>
                : upcomingSalon.map((d, i) => (
                  <div key={d.id || i}
                    onClick={() => (isAdmin || isManager) && handleDayClick(new Date((d.date || d) + 'T00:00:00'))}
                    style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 9, padding: '0.6rem 0.875rem', marginBottom: 5, cursor: (isAdmin || isManager) ? 'pointer' : 'default' }}>
                    <p style={{ color: C.danger, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
                      {format(new Date((d.date || d) + 'T00:00:00'), 'EEE, MMM d')}
                    </p>
                    {d.reason && <p style={{ color: 'rgba(248,113,113,0.5)', fontSize: '0.68rem', fontFamily: 'DM Sans,sans-serif', marginTop: 1 }}>{d.reason}</p>}
                  </div>
                ))
              }
            </div>
          </div>

          {/* Worker: my requests */}
          {!isAdmin && !isManager && myStylist && (() => {
            const upcoming = myRequests.filter(r => !isPast(new Date(r.date + 'T00:00:00'))).sort((a, b) => a.date.localeCompare(b.date))
            return (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', flex: '1', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ padding: '0.875rem 1.1rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={12} color={C.info} />
                  <div>
                    <p style={{ fontSize: '0.78rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>My Requests</p>
                    <p style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>{upcoming.length} upcoming</p>
                  </div>
                </div>
                <div style={{ overflowY: 'auto', minHeight: 0, padding: '0.625rem' }}>
                  {upcoming.length === 0
                    ? <p style={{ color: C.muted, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', textAlign: 'center', padding: '0.75rem 0' }}>No requests</p>
                    : upcoming.map(r => {
                        const col = r.status === 'approved' ? C.success : r.status === 'rejected' ? C.danger : C.info
                        const bg2 = r.status === 'approved' ? C.successBg : r.status === 'rejected' ? C.dangerBg : C.infoBg
                        const br2 = r.status === 'approved' ? C.successBorder : r.status === 'rejected' ? C.dangerBorder : C.infoBorder
                        return (
                          <div key={r.id} onClick={() => handleDayClick(new Date(r.date + 'T00:00:00'))}
                            style={{ background: bg2, border: `1px solid ${br2}`, borderRadius: 9, padding: '0.6rem 0.875rem', marginBottom: 5, cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <p style={{ color: col, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
                                {format(new Date(r.date + 'T00:00:00'), 'EEE, MMM d')}
                              </p>
                              <span style={{ fontSize: '0.63rem', padding: '2px 6px', borderRadius: 4, background: `${col}22`, color: col, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                {r.status}
                              </span>
                            </div>
                            {r.reason && <p style={{ color: `${col}99`, fontSize: '0.68rem', fontFamily: 'DM Sans,sans-serif', marginTop: 1 }}>{r.reason}</p>}
                          </div>
                        )
                      })
                  }
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Day modal ── */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ width: '100%', maxWidth: 460, background: C.modal, borderRadius: 18, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)', border: `1px solid ${C.goldBorder}` }}
            onClick={e => e.stopPropagation()}>

            <div style={{ height: 3, background: `linear-gradient(90deg,${C.gold},var(--col-acc2),rgba(var(--rgb-acc),0.15))` }} />
            <div style={{ padding: '1.5rem' }}>

              {/* Modal header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                  <h2 className="font-display" style={{ fontSize: '1.6rem', color: C.white, lineHeight: 1.1 }}>{format(selected.day, 'EEEE')}</h2>
                  <p style={{ color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>{format(selected.day, 'MMMM d, yyyy')}</p>
                </div>
                <button onClick={closeModal} style={{ width: 30, height: 30, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', background: C.subtle, borderRadius: 10, padding: 3, marginBottom: '1.25rem', gap: 3 }}>
                {(isAdmin || isManager) ? (
                  <>
                    <TabBtn id="day"   label="Salon Day"   icon={BanIcon}   active={blockTab} set={setBlockTab} />
                    <TabBtn id="hours" label="Salon Hours"  icon={Clock}     active={blockTab} set={setBlockTab} />
                  </>
                ) : (
                  <>
                    <TabBtn id="hours"  label="My Hours"   icon={Clock}     active={blockTab} set={setBlockTab} />
                    <TabBtn id="dayoff" label="Day Off"     icon={Calendar}  active={blockTab} set={setBlockTab} />
                  </>
                )}
              </div>

              {/* ── Admin: Salon day tab ── */}
              {(isAdmin || isManager) && blockTab === 'day' && (
                selected.salonClosed ? (
                  <>
                    <p style={{ fontSize: '0.82rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                      This full day is closed — no bookings are accepted.
                    </p>
                    <div style={{ display: 'flex', gap: '0.625rem' }}>
                      <button onClick={closeModal} style={btnSecondary}>Cancel</button>
                      <button onClick={unblockSalonDay} disabled={saving} className="unblock-btn" style={{ ...btnDanger, opacity: saving ? 0.5 : 1 }}>
                        {saving ? <Spinner /> : <><Unlock size={13} /> Reopen Day</>}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Conflict warning */}
                    {checkingConflicts && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem', padding: '0.6rem 0.875rem', borderRadius: 10, background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}` }}>
                        <Spinner />
                        <span style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>Checking appointments…</span>
                      </div>
                    )}

                    {!checkingConflicts && conflictAppts.length > 0 && (
                      <div style={{ background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 10, padding: '0.875rem', marginBottom: '1.1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <AlertCircle size={13} color={C.warning} />
                          <p style={{ fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, color: C.warning }}>
                            {conflictAppts.length} active appointment{conflictAppts.length !== 1 ? 's' : ''} on this day
                          </p>
                        </div>
                        <p style={{ fontSize: '0.72rem', color: 'rgba(245,158,11,0.7)', fontFamily: 'DM Sans,sans-serif', marginBottom: 8, lineHeight: 1.5 }}>
                          Cancel or reschedule these before closing the day:
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {conflictAppts.map(a => (
                            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.06)', borderRadius: 7, padding: '6px 9px' }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.status === 'pending' ? '#f59e0b' : '#34d399', flexShrink: 0 }} />
                              <span style={{ flex: 1, fontSize: '0.75rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.profiles?.full_name || 'Client'}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', flexShrink: 0 }}>{a.time}</span>
                              {a.stylists?.name && (
                                <span style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', flexShrink: 0 }}>· {a.stylists.name.split(' ')[0]}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ marginBottom: '1.1rem' }}>
                      <label style={labelStyle}>Reason <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--col-text)' }}>(optional)</span></label>
                      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Public holiday, Team day…" className="m-inp" autoFocus style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.625rem' }}>
                      <button onClick={closeModal} style={btnSecondary}>Cancel</button>
                      <button onClick={blockSalonDay} disabled={saving || checkingConflicts || conflictAppts.length > 0}
                        style={{ ...btnGold, opacity: (saving || checkingConflicts || conflictAppts.length > 0) ? 0.45 : 1 }}>
                        {saving ? <Spinner dark /> : <><Lock size={13} /> Close Full Day</>}
                      </button>
                    </div>
                  </>
                )
              )}

              {/* ── Hours tab (admin or worker) ── */}
              {blockTab === 'hours' && (
                <>
                  {/* Worker quota pill */}
                  {!isAdmin && !isManager && (
                    <div style={{ background: hoursUsed >= effectiveMaxHours ? C.dangerBg : C.goldBg, border: `1px solid ${hoursUsed >= effectiveMaxHours ? C.dangerBorder : C.goldBorder}`, borderRadius: 8, padding: '0.45rem 0.75rem', marginBottom: '0.875rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', color: hoursUsed >= effectiveMaxHours ? C.danger : C.goldDim }}>Hours this month</span>
                      <span style={{ fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: hoursUsed >= effectiveMaxHours ? C.danger : C.gold }}>
                        {(() => {
                          const existing = myHours.filter(h => h.date >= today && h.date <= monthEnd && h.date !== selected.key).length
                          const projected = existing + selHours.length
                          return projected !== hoursUsed ? `${hoursUsed} → ${projected} / ${effectiveMaxHours}` : `${hoursUsed} / ${effectiveMaxHours}`
                        })()}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                      {(isAdmin || isManager) ? 'Block slots salon-wide' : 'Select slots to block'}
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setSelHours([...SLOTS])} style={{ fontSize: 9, padding: '3px 9px', borderRadius: 7, background: C.goldBg, border: `1px solid ${C.goldBorder}`, color: C.goldDim, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>All</button>
                      <button onClick={() => setSelHours([])} style={{ fontSize: 9, padding: '3px 9px', borderRadius: 7, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Clear</button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: '1.25rem' }}>
                    {[
                      ['Morning',   SLOTS.filter(s => parseInt(s) < 13)],
                      ['Afternoon', SLOTS.filter(s => parseInt(s) >= 13)],
                    ].map(([label, slots]) => (
                      <div key={label}>
                        <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, marginBottom: 8 }}>{label}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
                          {slots.map(h => {
                            const on = selHours.includes(h)
                            return (
                              <button key={h} onClick={() => toggleHour(h)} className={`hour-pill${on ? ' hour-pill-on' : ''}`}
                                style={{ padding: '0.45rem 0', borderRadius: 8, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', fontWeight: on ? 700 : 400, cursor: 'pointer', border: on ? 'none' : `1px solid ${C.border}`, background: on ? `linear-gradient(135deg,${C.gold},var(--col-acc2))` : 'rgba(var(--rgb-hi),0.03)', color: on ? 'var(--col-bg)' : C.muted, boxShadow: on ? `0 3px 10px rgba(var(--rgb-acc),0.3)` : 'none', transition: 'all .15s' }}>
                                {h}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '0.625rem' }}>
                    <button onClick={closeModal} style={btnSecondary}>Cancel</button>
                    <button onClick={saveHours} disabled={saving} style={{ ...btnGold, opacity: saving ? 0.5 : 1 }}>
                      {saving ? <Spinner dark /> : <><Clock size={13} /> Save {selHours.length ? `(${selHours.length})` : 'Hours'}</>}
                    </button>
                  </div>
                </>
              )}

              {/* ── Worker: Day off tab ── */}
              {!isAdmin && !isManager && blockTab === 'dayoff' && (
                selected.request ? (
                  // Existing request
                  <>
                    {(() => {
                      const s = selected.request.status
                      const col = s === 'approved' ? C.success : s === 'rejected' ? C.danger : C.info
                      const bg2 = s === 'approved' ? C.successBg : s === 'rejected' ? C.dangerBg : C.infoBg
                      const br2 = s === 'approved' ? C.successBorder : s === 'rejected' ? C.dangerBorder : C.infoBorder
                      const Icon = s === 'approved' ? CheckCircle : s === 'rejected' ? XCircle : Clock
                      const label = s === 'approved' ? 'Day off approved' : s === 'rejected' ? 'Request rejected' : 'Awaiting manager approval'
                      return (
                        <div style={{ background: bg2, border: `1px solid ${br2}`, borderRadius: 10, padding: '0.875rem', marginBottom: '1.1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: selected.request.reason ? 4 : 0 }}>
                            <Icon size={13} color={col} />
                            <p style={{ fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, color: col }}>{label}</p>
                          </div>
                          {selected.request.reason && <p style={{ fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', color: C.muted, marginTop: 2 }}>{selected.request.reason}</p>}
                        </div>
                      )
                    })()}
                    <div style={{ display: 'flex', gap: '0.625rem' }}>
                      <button onClick={closeModal} style={btnSecondary}>Close</button>
                      {selected.request.status === 'pending' && (
                        <button onClick={cancelDayOff} disabled={saving} className="unblock-btn" style={{ ...btnDanger, opacity: saving ? 0.5 : 1 }}>
                          {saving ? <Spinner /> : <><X size={13} /> Cancel Request</>}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  // New request
                  <>
                    <div style={{ background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: 10, padding: '0.75rem 0.875rem', marginBottom: '1rem', display: 'flex', gap: 8 }}>
                      <AlertCircle size={13} color={C.info} style={{ flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: '0.75rem', color: C.info, fontFamily: 'DM Sans,sans-serif', lineHeight: 1.55 }}>
                        Full days require manager approval before they're blocked on the calendar.
                      </p>
                    </div>

                    {approvedDays >= effectiveMaxDays && (
                      <div style={{ background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 10, padding: '0.75rem 0.875rem', marginBottom: '1rem' }}>
                        <p style={{ fontSize: '0.75rem', color: C.warning, fontFamily: 'DM Sans,sans-serif', lineHeight: 1.5 }}>
                          You've used your {effectiveMaxDays}-day allowance this month. This request may not be approved.
                        </p>
                      </div>
                    )}

                    <div style={{ marginBottom: '1.1rem' }}>
                      <label style={labelStyle}>Reason <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--col-text)' }}>(optional)</span></label>
                      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Medical, Personal day…" className="m-inp" autoFocus style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.625rem' }}>
                      <button onClick={closeModal} style={btnSecondary}>Cancel</button>
                      <button onClick={requestDayOff} disabled={saving} style={{ ...btnGold, opacity: saving ? 0.5 : 1 }}>
                        {saving ? <Spinner dark /> : <><Calendar size={13} /> Request Day Off</>}
                      </button>
                    </div>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Settings modal ── */}
      {editingSettings && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setEditingSettings(false) }}>
          <div style={{ width: '100%', maxWidth: 420, background: C.modal, borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.goldBorder}`, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ height: 3, background: `linear-gradient(90deg,${C.gold},var(--col-acc2),rgba(var(--rgb-acc),0.15))`, flexShrink: 0 }} />

            <div style={{ padding: '1.5rem 1.5rem 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
                <h2 className="font-display" style={{ fontSize: '1.4rem', color: C.white }}>Monthly Caps</h2>
                <button onClick={() => setEditingSettings(false)} style={{ width: 28, height: 28, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={13} />
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', background: C.subtle, borderRadius: 10, padding: 3, gap: 3, marginBottom: '1.25rem' }}>
                {[
                  { id: 'general',   label: 'General' },
                  { id: 'overrides', label: 'Per Stylist' },
                ].map(t => {
                  const on = settingsTab === t.id
                  return (
                    <button key={t.id} onClick={() => setSettingsTab(t.id)}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, transition: 'all .18s', background: on ? C.goldBg : 'transparent', color: on ? C.gold : C.muted, outline: on ? `1px solid ${C.goldBorder}` : 'none' }}>
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ padding: '0 1.5rem 1.5rem', overflowY: 'auto', flex: 1 }}>

              {/* ── General tab ── */}
              {settingsTab === 'general' && (
                <>
                  <p style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginBottom: '1.1rem', lineHeight: 1.55 }}>
                    Default limits for all stylists. Individual overrides take priority when set.
                  </p>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>Max days off per month</label>
                    <input type="number" min="0" max="31" value={draftSettings.maxDays}
                      onChange={e => setDraftSettings(p => ({ ...p, maxDays: parseInt(e.target.value) || 0 }))}
                      className="m-inp" style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={labelStyle}>Max hours off per month</label>
                    <input type="number" min="0" max="200" value={draftSettings.maxHours}
                      onChange={e => setDraftSettings(p => ({ ...p, maxHours: parseInt(e.target.value) || 0 }))}
                      className="m-inp" style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.625rem' }}>
                    <button onClick={() => setEditingSettings(false)} style={btnSecondary}>Cancel</button>
                    <button onClick={saveSettings} disabled={saving} style={{ ...btnGold, opacity: saving ? 0.5 : 1 }}>
                      {saving ? <Spinner dark /> : 'Save'}
                    </button>
                  </div>
                </>
              )}

              {/* ── Overrides tab ── */}
              {settingsTab === 'overrides' && (
                <>
                  <p style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginBottom: '1rem', lineHeight: 1.55 }}>
                    Leave blank to use the general limit. Set a number to give that stylist a personal cap.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.25rem' }}>
                    {/* Header row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>Stylist</span>
                      <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textAlign: 'center' }}>Days</span>
                      <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textAlign: 'center' }}>Hours</span>
                    </div>

                    {allStylists.map(s => {
                      const d = overrideDrafts[s.id] || { days: '', hours: '' }
                      const hasOverride = d.days !== '' || d.hours !== ''
                      return (
                        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 9, background: hasOverride ? C.goldBg : 'transparent', border: `1px solid ${hasOverride ? C.goldBorder : 'transparent'}`, transition: 'all .15s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            {s.photo_url
                              ? <img src={s.photo_url} alt={s.name} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                              : <div style={{ width: 26, height: 26, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, flexShrink: 0 }} />
                            }
                            <span style={{ fontSize: '0.78rem', color: C.white, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                          </div>
                          <input
                            type="number" min="0" max="31"
                            placeholder={String(draftSettings.maxDays)}
                            value={d.days}
                            onChange={e => setOverrideDrafts(p => ({ ...p, [s.id]: { ...p[s.id], days: e.target.value } }))}
                            className="m-inp"
                            style={{ ...inputStyle, padding: '0.4rem 0.5rem', textAlign: 'center', fontSize: '0.8rem' }}
                          />
                          <input
                            type="number" min="0" max="200"
                            placeholder={String(draftSettings.maxHours)}
                            value={d.hours}
                            onChange={e => setOverrideDrafts(p => ({ ...p, [s.id]: { ...p[s.id], hours: e.target.value } }))}
                            className="m-inp"
                            style={{ ...inputStyle, padding: '0.4rem 0.5rem', textAlign: 'center', fontSize: '0.8rem' }}
                          />
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: '0.625rem' }}>
                    <button onClick={() => setEditingSettings(false)} style={btnSecondary}>Cancel</button>
                    <button onClick={saveOverrides} disabled={saving} style={{ ...btnGold, opacity: saving ? 0.5 : 1 }}>
                      {saving ? <Spinner dark /> : 'Save Overrides'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
