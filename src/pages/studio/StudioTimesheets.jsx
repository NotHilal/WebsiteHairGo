import { useState, useEffect } from 'react'
import { Clock, Play, StopCircle, ChevronLeft, ChevronRight, CalendarDays, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Pager from '../../lib/Pager'
import { useAuth } from '../../contexts/AuthContext'
import { useLogAction } from '../../hooks/useLogAction'
import { sheetMins } from '../../lib/pay'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, differenceInMinutes, isToday, startOfMonth, addDays, isSameMonth, addMonths, subMonths, isSameWeek } from 'date-fns'
import toast from 'react-hot-toast'

const C = {
  card: 'var(--col-modal)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)', subtle: 'rgba(var(--rgb-hi),0.06)',
  border: 'rgba(var(--rgb-hi),0.07)',
  green: '#34d399', greenBg: 'rgba(52,211,153,0.1)', greenBorder: 'rgba(52,211,153,0.2)',
  red: '#f87171',   redBg:   'rgba(248,113,113,0.1)', redBorder:   'rgba(248,113,113,0.22)',
}

function fmtMins(mins) {
  if (!mins || mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m.toString().padStart(2, '0')}m`
}


export default function StudioTimesheets() {
  const { user, isAdmin, isManager } = useAuth()
  const log = useLogAction()
  const [week,         setWeek]         = useState(new Date())
  const [stylists,     setStylists]     = useState([])
  const [entries,      setEntries]      = useState([])
  const [linkedStylist, setLinkedStylist] = useState(null)
  const [activeEntry,   setActiveEntry]   = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [page,         setPage]         = useState(0)
  const [showPicker,     setShowPicker]     = useState(false)
  const [pickerMonth,    setPickerMonth]    = useState(startOfMonth(new Date()))
  const [filterStylist,  setFilterStylist]  = useState(null)
  const [showFilter,     setShowFilter]     = useState(false)
  const [liveClockIns,   setLiveClockIns]   = useState([])
  const [,               setTick]           = useState(0)  // re-render every minute for live timers
  const [confirmClockOut, setConfirmClockOut] = useState(null) // stylistId to clock out

  const weekStart = startOfWeek(week, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(week,   { weekStartsOn: 1 })

  useEffect(() => { load() }, [week, user])

  useEffect(() => {
    loadLiveClockIns()
    const sub = supabase.channel('ts-live-clockins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timesheets' }, () => {
        loadLiveClockIns()
        load()
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin && !isManager) return
    const t = setInterval(() => setTick(v => v + 1), 60_000)
    return () => clearInterval(t)
  }, [isAdmin, isManager])

  async function loadLiveClockIns() {
    const { data } = await supabase
      .from('timesheets')
      .select('id, clock_in, stylist_id, stylists(name, photo_url)')
      .is('clock_out', null)
      .order('clock_in')
    setLiveClockIns(data || [])
  }

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [week, user])

  async function load() {
    setLoading(true)
    setError(null)

    if (isAdmin || isManager) {
      const [{ data: stys, error: e1 }, { data: ents, error: e2 }] = await Promise.all([
        supabase.from('stylists').select('id, name, photo_url').order('display_order'),
        supabase.from('timesheets')
          .select('*, stylists(name, photo_url)')
          .gte('clock_in', weekStart.toISOString())
          .lte('clock_in', weekEnd.toISOString())
          .order('clock_in', { ascending: false }),
      ])
      if (e1 || e2) { setError('Could not load timesheets — check your connection.'); setLoading(false); return }
      setStylists(stys || [])
      setEntries(ents || [])
      setLinkedStylist(null)
    } else {
      const { data: linked } = await supabase
        .from('stylists').select('id, name, photo_url').eq('profile_id', user.id).single()
      setLinkedStylist(linked || null)
      if (linked) {
        setStylists([linked])
        const [{ data: ents, error: e1 }, { data: openEntry }] = await Promise.all([
          supabase.from('timesheets')
            .select('*, stylists(name, photo_url)')
            .eq('stylist_id', linked.id)
            .gte('clock_in', weekStart.toISOString())
            .lte('clock_in', weekEnd.toISOString())
            .order('clock_in', { ascending: false }),
          supabase.from('timesheets')
            .select('id, clock_in, stylist_id')
            .eq('stylist_id', linked.id)
            .is('clock_out', null)
            .maybeSingle(),
        ])
        if (e1) { setError('Could not load timesheets — check your connection.'); setLoading(false); return }
        setEntries(ents || [])
        setActiveEntry(openEntry || null)
      } else {
        setStylists([])
        setEntries([])
        setActiveEntry(null)
      }
    }

    setLoading(false)
  }

  // The server stamps the time, so clock-ins can't be back- or forward-dated
  async function clockIn(stylistId) {
    const { error } = await supabase.rpc('clock_in', { p_stylist_id: stylistId })
    if (error) { toast.error(error.message === 'Already clocked in' ? 'Already clocked in' : 'Could not clock in'); load(); return }
    toast.success('Clocked in!')
    const stylistName = stylists.find(s => s.id === stylistId)?.name || 'Unknown'
    log('timesheet.clock_in', { entityType: 'timesheet', entityId: stylistId, details: { message: `clocked in (${stylistName})` } })
    load()
  }

  async function clockOut(stylistId) {
    const now = new Date().toISOString()
    // Optimistic update — stamp clock_out immediately so UI reflects it
    setEntries(prev => prev.map(e =>
      e.stylist_id === stylistId && !e.clock_out ? { ...e, clock_out: now } : e
    ))
    setLiveClockIns(prev => prev.filter(e => e.stylist_id !== stylistId))
    setConfirmClockOut(null)

    const { error } = await supabase.rpc('clock_out', { p_stylist_id: stylistId })
    if (error) { toast.error('Could not clock out'); load(); return }
    toast.success('Clocked out!')
    const stylistName = stylists.find(s => s.id === stylistId)?.name || 'Unknown'
    log('timesheet.clock_out', { entityType: 'timesheet', entityId: stylistId, details: { message: `clocked out (${stylistName})` } })
    load()
  }

  const todayEntries  = entries.filter(e => isToday(new Date(e.clock_in)))
  const totalWeekMins = entries.reduce((acc, e) => acc + sheetMins(e), 0)

  const filtered = filterStylist ? entries.filter(e => e.stylist_id === filterStylist.id) : entries
  const PER_PAGE = 5
  const paged          = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const isCurrentWeek  = isSameWeek(week, new Date(), { weekStartsOn: 1 })

  if (error) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <AlertCircle size={32} color={C.red} />
      <p style={{ color: C.muted, fontFamily: 'DM Sans,sans-serif', fontSize: '1rem', margin: 0, textAlign: 'center' }}>{error}</p>
      <button onClick={load} style={{ padding: '0.5rem 1.5rem', borderRadius: 8, background: C.subtle, border: `1px solid ${C.border}`, color: C.white, fontSize: '0.94rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
      <style>{`
        @keyframes blink        { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
        .ts-row:hover           { background: rgba(var(--rgb-hi),0.02) !important; }
.week-nav:hover         { background: rgba(var(--rgb-acc),0.08) !important; border-color: ${C.goldBorder} !important; color: ${C.gold} !important; }
        .clk-in:hover           { background: rgba(52,211,153,0.18)  !important; }
        .clk-out:hover          { background: rgba(248,113,113,0.18) !important; }
        .ts-date-btn:hover      { background: rgba(var(--rgb-hi),0.05) !important; }
        .ts-picker-week:hover   { background: rgba(var(--rgb-acc),0.1) !important; border-color: rgba(var(--rgb-acc),0.15) !important; }
        .ts-filter-btn:hover    { background: rgba(var(--rgb-hi),0.05) !important; }
        .ts-stylist-row:hover   { background: rgba(var(--rgb-hi),0.04) !important; }
        .ts-today-desktop { display: none !important; }
        .ts-today-mobile  { display: flex; align-items: center; justify-content: center; width: 100%; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, paddingBottom: '1rem', borderBottom: `1px solid ${C.border}` }}>
        <p style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: '0.3rem' }}>Team</p>
        <h1 className="font-display font-light" style={{ fontSize: 'clamp(2rem,3.6vw,2.9rem)', color: C.white, lineHeight: 1.1 }}>Timesheets</h1>
        <p style={{ color: C.muted, fontSize: '0.9rem', fontFamily: 'DM Sans,sans-serif', marginTop: 3 }}>Track worked hours and breaks in real time</p>
      </div>

      {/* Not linked warning for employees */}
      {!isAdmin && !isManager && !loading && !linkedStylist && (
        <div style={{ flexShrink: 0, padding: '1rem 1.25rem', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <p style={{ color: '#f59e0b', fontSize: '0.98rem', fontFamily: 'DM Sans,sans-serif' }}>
            Your account hasn't been linked to a team member yet. Ask an admin to link your account in the <strong>Stylists</strong> page.
          </p>
        </div>
      )}

      {/* ── Stats row ────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: 'flex', gap: '0.6rem' }}>
        {[
          { label: 'Clocked in now', value: liveClockIns.length,    color: C.green },
          { label: 'Week total',     value: fmtMins(totalWeekMins), color: C.gold  },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem 0.75rem', textAlign: 'center' }}>
            <div className="font-display" style={{ fontSize: '1.8rem', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 5 }}>{s.label}</div>
          </div>
        ))}

        {/* Filter by stylist (admin + manager) */}
        {(isAdmin || isManager) && (
          <button onClick={() => setShowFilter(true)} className="ts-filter-btn"
            style={{ flex: 1, background: filterStylist ? C.goldBg : C.card, border: `1px solid ${filterStylist ? C.goldBorder : C.border}`, borderRadius: 12, padding: '0.75rem', cursor: 'pointer', transition: 'all .15s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            {filterStylist ? (
              <>
                {filterStylist.photo_url
                  ? <img src={filterStylist.photo_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', border: `2px solid ${C.gold}` }} />
                  : <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.goldBg, border: `2px solid ${C.goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>{filterStylist.name[0]}</span>
                    </div>
                }
                <span style={{ fontSize: 11, color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filterStylist.name.split(' ')[0]}</span>
              </>
            ) : (
              <>
                <div style={{ fontSize: '1.44rem', color: C.muted, lineHeight: 1 }}>⊞</div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 1 }}>Filter</div>
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Filter modal ─────────────────────────────────────── */}
      {showFilter && (
        <>
          <div onClick={() => setShowFilter(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 101, background: 'var(--col-modal)', border: `1px solid ${C.border}`, borderRadius: 20, padding: '1.5rem', width: 'min(92vw, 380px)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <p style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 4 }}>Team</p>
                <h3 className="font-display font-light" style={{ fontSize: '1.56rem', color: C.white, lineHeight: 1.1 }}>Filter by member</h3>
              </div>
              <button onClick={() => setShowFilter(false)}
                style={{ width: 34, height: 34, borderRadius: 8, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, fontSize: 19, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}
                className="week-nav">
                ×
              </button>
            </div>

            {/* Stylist grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
              {stylists.map(s => {
                const isActive = filterStylist?.id === s.id
                return (
                  <button key={s.id} onClick={() => { setFilterStylist(s); setPage(0); setShowFilter(false) }} className="ts-stylist-row"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0.875rem 0.5rem', borderRadius: 12, background: isActive ? C.goldBg : C.subtle, border: `1px solid ${isActive ? C.goldBorder : C.border}`, cursor: 'pointer', transition: 'all .15s' }}>
                    {s.photo_url
                      ? <img src={s.photo_url} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', border: `2px solid ${isActive ? C.gold : C.border}`, transition: 'border-color .15s' }} />
                      : <div style={{ width: 48, height: 48, borderRadius: '50%', background: isActive ? C.goldBg : 'rgba(var(--rgb-hi),0.06)', border: `2px solid ${isActive ? C.gold : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 19, color: isActive ? C.gold : C.muted, fontWeight: 700 }}>{s.name[0]}</span>
                        </div>
                    }
                    <span style={{ color: isActive ? C.gold : C.white, fontSize: '0.9rem', fontFamily: 'DM Sans,sans-serif', fontWeight: isActive ? 600 : 400, textAlign: 'center', lineHeight: 1.2 }}>{s.name.split(' ')[0]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Week nav + calendar picker ───────────────────────── */}
      <div style={{ flexShrink: 0, position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '0.5rem 0.625rem' }}>
          {/* Main row: clear + arrows + date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(isAdmin || isManager) && filterStylist && (
              <button onClick={() => { setFilterStylist(null); setPage(0) }} className="week-nav"
                style={{ height: 36, padding: '0 12px', borderRadius: 9, background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, fontSize: '0.86rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer', transition: 'all .15s', flexShrink: 0, whiteSpace: 'nowrap' }}>
                Clear
              </button>
            )}

            <button onClick={() => { setWeek(subWeeks(week, 1)); setPage(0) }} className="week-nav"
              style={{ width: 36, height: 36, borderRadius: 9, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s', flexShrink: 0 }}>
              <ChevronLeft size={17} />
            </button>

            <button onClick={() => { setShowPicker(p => !p); setPickerMonth(startOfMonth(week)) }} className="ts-date-btn"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem 0.5rem', borderRadius: 10, transition: 'background .15s' }}>
              <CalendarDays size={16} style={{ color: C.goldDim, flexShrink: 0 }} />
              <span style={{ fontSize: '1.06rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
              </span>
            </button>

            <button onClick={() => { setWeek(addWeeks(week, 1)); setPage(0) }} className="week-nav"
              style={{ width: 36, height: 36, borderRadius: 9, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s', flexShrink: 0 }}>
              <ChevronRight size={17} />
            </button>

            {/* Today — desktop only, hidden on mobile via CSS */}
            {!isCurrentWeek && (
              <button onClick={() => { setWeek(new Date()); setPage(0) }} className="week-nav ts-today-desktop"
                style={{ height: 36, padding: '0 12px', borderRadius: 9, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.86rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer', transition: 'all .15s', flexShrink: 0, whiteSpace: 'nowrap' }}>
                Today
              </button>
            )}
          </div>

          {/* Today — below the date row on both mobile and desktop */}
          {!isCurrentWeek && (
            <button onClick={() => { setWeek(new Date()); setPage(0) }} className="week-nav ts-today-mobile"
              style={{ height: 28, padding: '0 14px', borderRadius: 7, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap' }}>
              Back to today
            </button>
          )}
        </div>

        {/* Backdrop to close picker */}
        {showPicker && <div onClick={() => setShowPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />}

        {/* Calendar picker dropdown */}
        {showPicker && (() => {
          const gridStart  = startOfWeek(startOfMonth(pickerMonth), { weekStartsOn: 1 })
          const pickerDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
          const pickerWeeks = Array.from({ length: 6 }, (_, i) => pickerDays.slice(i * 7, (i + 1) * 7))
          return (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 50, background: 'var(--col-modal)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '1rem', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <button onClick={() => setPickerMonth(subMonths(pickerMonth, 1))} className="week-nav"
                  style={{ width: 32, height: 32, borderRadius: 7, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s' }}>
                  <ChevronLeft size={15} />
                </button>
                <span style={{ color: C.white, fontFamily: 'DM Sans,sans-serif', fontSize: '1.02rem', fontWeight: 600 }}>
                  {format(pickerMonth, 'MMMM yyyy')}
                </span>
                <button onClick={() => setPickerMonth(addMonths(pickerMonth, 1))} className="week-nav"
                  style={{ width: 32, height: 32, borderRadius: 7, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s' }}>
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '0.25rem' }}>
                {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 11, color: C.muted, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.08em', padding: '3px 0', textTransform: 'uppercase' }}>{d}</div>
                ))}
              </div>

              {/* Week rows */}
              {pickerWeeks.map((wk, wi) => {
                const selected = isSameWeek(wk[0], week, { weekStartsOn: 1 })
                return (
                  <div key={wi} className="ts-picker-week"
                    onClick={() => { setWeek(wk[0]); setPage(0); setShowPicker(false) }}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderRadius: 9, cursor: 'pointer', marginBottom: 2, transition: 'all .15s', background: selected ? 'var(--col-acc)' : 'transparent', border: selected ? `1px solid rgba(var(--rgb-acc),0.25)` : '1px solid transparent' }}>
                    {wk.map((day, di) => (
                      <div key={di} style={{ textAlign: 'center', padding: '7px 0', fontSize: '0.96rem', fontFamily: 'DM Sans,sans-serif',
                        color: selected ? (isToday(day) ? '#fff' : !isSameMonth(day, pickerMonth) ? 'rgba(255,255,255,0.45)' : '#fff') : (!isSameMonth(day, pickerMonth) ? 'var(--col-text)' : isToday(day) ? C.gold : C.white),
                        fontWeight: isToday(day) ? 700 : 400 }}>
                        {format(day, 'd')}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* ── Who's In strip (admin + manager realtime view) ─────────────── */}
      {(isAdmin || isManager) && (
        <div style={{ flexShrink: 0, background: 'var(--col-modal)', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.875rem', borderBottom: liveClockIns.length > 0 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: C.muted }}>Who's In</span>
              <span style={{ fontSize: 11, fontFamily: 'DM Sans,sans-serif', color: C.muted }}>·</span>
              <span style={{ fontSize: 11, fontFamily: 'DM Sans,sans-serif', color: C.muted }}>Live</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: liveClockIns.length > 0 ? C.greenBg : C.subtle, border: `1px solid ${liveClockIns.length > 0 ? C.greenBorder : C.border}` }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: liveClockIns.length > 0 ? C.green : 'var(--col-text)', flexShrink: 0, animation: liveClockIns.length > 0 ? 'blink 2s infinite' : 'none' }} />
              <span style={{ fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: liveClockIns.length > 0 ? C.green : C.muted, letterSpacing: '0.08em' }}>
                {liveClockIns.length} clocked in
              </span>
            </div>
          </div>
          {liveClockIns.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.625rem 0.875rem' }}>
              {liveClockIns.map(entry => {
                const mins    = differenceInMinutes(new Date(), new Date(entry.clock_in))
                const elapsed = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
                const s       = entry.stylists
                return (
                  <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isManager ? '0.4rem 0.5rem 0.4rem 0.4rem' : '0.4rem 0.875rem 0.4rem 0.4rem', borderRadius: 9999, background: C.greenBg, border: `1px solid ${C.greenBorder}` }}>
                    {s?.photo_url
                      ? <img src={s.photo_url} alt={s.name} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: `1.5px solid ${C.greenBorder}` }} />
                      : <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(52,211,153,0.1)', border: `1.5px solid ${C.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, color: C.green, fontWeight: 700 }}>
                          {s?.name?.charAt(0) || '?'}
                        </div>
                    }
                    <div>
                      <p style={{ fontSize: '0.9rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, color: C.white, lineHeight: 1.2 }}>{s?.name?.split(' ')[0] || 'Stylist'}</p>
                      <p style={{ fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', color: C.green }}>{format(new Date(entry.clock_in), 'HH:mm')} · {elapsed}</p>
                    </div>
                    {isManager && (
                      <button onClick={() => setConfirmClockOut(entry.stylist_id)} className="clk-out"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'background .15s', flexShrink: 0 }}>
                        <StopCircle size={10} /> Out
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Today's status strip (artists only) ───────────── */}
      {!isAdmin && !isManager && stylists.length > 0 && (
        <div style={{ flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          {stylists.map(s => {
            const active    = isAdmin
              ? todayEntries.find(e => e.stylist_id === s.id && !e.clock_out)
              : activeEntry
            const todayMins = todayEntries
              .filter(e => e.stylist_id === s.id && e.clock_out)
              .reduce((acc, e) => acc + sheetMins(e), 0)
            const sinceMin  = active ? differenceInMinutes(new Date(), new Date(active.clock_in)) : 0

            return (
              <div key={s.id} style={{ background: C.card, border: `1px solid ${active ? C.greenBorder : C.border}`, borderRadius: 14, padding: '1rem 0.875rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: '1 1 110px', minWidth: 110, transition: 'border-color .2s' }}>
                <div style={{ position: 'relative' }}>
                  {s.photo_url
                    ? <img src={s.photo_url} alt={s.name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', border: `2px solid ${active ? C.green : C.border}`, transition: 'border-color .2s' }} />
                    : <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.subtle, border: `2px solid ${active ? C.green : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color .2s' }}>
                        <span style={{ color: C.muted, fontSize: 20, fontWeight: 700 }}>{s.name[0]}</span>
                      </div>
                  }
                  {active && <div style={{ position: 'absolute', bottom: 1, right: 1, width: 13, height: 13, borderRadius: '50%', background: C.green, border: `2px solid ${C.card}`, animation: 'blink 2s infinite' }} />}
                </div>

                <p style={{ color: C.white, fontSize: '0.96rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{s.name.split(' ')[0]}</p>

                {active
                  ? <p style={{ fontSize: 12, color: C.green, fontFamily: 'DM Sans,sans-serif' }}>{fmtMins(sinceMin)}</p>
                  : todayMins > 0
                    ? <p style={{ fontSize: 12, color: C.goldDim, fontFamily: 'DM Sans,sans-serif' }}>{fmtMins(todayMins)}</p>
                    : <p style={{ fontSize: 12, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>Not in</p>
                }

                {isAdmin ? (
                  active
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.green, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, padding: '4px 10px', borderRadius: 9999, background: C.greenBg, border: `1px solid ${C.greenBorder}` }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'blink 2s infinite', display: 'inline-block' }} /> Active
                      </span>
                    : <span style={{ fontSize: 11, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', padding: '4px 10px', borderRadius: 9999, background: C.subtle, border: `1px solid ${C.border}` }}>Off</span>
                ) : (
                  active
                    ? <button onClick={() => setConfirmClockOut(s.id)} className="clk-out"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'background .15s' }}>
                        <StopCircle size={11} /> Out
                      </button>
                    : <button onClick={() => clockIn(s.id)} className="clk-in"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: C.greenBg, border: `1px solid ${C.greenBorder}`, color: C.green, fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'background .15s' }}>
                        <Play size={11} /> In
                      </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Log entries ──────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {loading ? (
          Array.from({ length: PER_PAGE }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.border}`, borderRadius: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: C.subtle, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, borderRadius: 4, width: 110, background: C.subtle, marginBottom: 7 }} />
                <div style={{ height: 10, borderRadius: 4, width: 80, background: C.subtle }} />
              </div>
              <div style={{ height: 12, borderRadius: 4, width: 38, background: C.subtle }} />
              <div style={{ height: 12, borderRadius: 4, width: 38, background: C.subtle }} />
              <div style={{ height: 12, borderRadius: 4, width: 52, background: C.subtle }} />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '3rem', textAlign: 'center' }}>
            <Clock size={32} style={{ margin: '0 auto 0.6rem', color: C.border, display: 'block' }} />
            <p style={{ color: C.muted, fontSize: '0.96rem', fontFamily: 'DM Sans,sans-serif' }}>No entries this week</p>
          </div>
        ) : paged.map(e => {
          const raw      = e.clock_out ? Math.max(0, differenceInMinutes(new Date(e.clock_out), new Date(e.clock_in))) : null
          const net      = raw !== null ? sheetMins(e) : null
          const isActive = !e.clock_out
          return (
            <div key={e.id} className="ts-row"
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.8rem 1rem', background: C.card, border: `1px solid ${isActive ? C.greenBorder : C.border}`, borderLeft: `3px solid ${isActive ? C.green : 'rgba(var(--rgb-acc),0.35)'}`, borderRadius: 12, transition: 'all .12s' }}>

              {/* Avatar */}
              {e.stylists?.photo_url
                ? <img src={e.stylists.photo_url} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: `2px solid ${isActive ? C.greenBorder : C.border}` }} />
                : <div style={{ width: 38, height: 38, borderRadius: '50%', background: C.subtle, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2px solid ${C.border}` }}>
                    <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>{e.stylists?.name?.[0]}</span>
                  </div>
              }

              {/* Name + date */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: C.white, fontSize: '1.14rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{e.stylists?.name}</p>
                <p style={{ color: C.muted, fontSize: '0.94rem', fontFamily: 'DM Sans,sans-serif' }}>{format(new Date(e.clock_in), 'EEE, MMM d')}</p>
              </div>

              {/* In · Out */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>In</div>
                  <span style={{ color: C.green, fontSize: '1.05rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{format(new Date(e.clock_in), 'HH:mm')}</span>
                </div>
                <span style={{ color: C.border, fontSize: '0.9rem', marginTop: 10 }}>·</span>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Out</div>
                  {e.clock_out
                    ? <span style={{ color: C.red, fontSize: '1.05rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{format(new Date(e.clock_out), 'HH:mm')}</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.green, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, padding: '2px 7px', borderRadius: 9999, background: C.greenBg, border: `1px solid ${C.greenBorder}`, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, animation: 'blink 2s infinite', display: 'inline-block' }} /> Live
                      </span>
                  }
                </div>
              </div>

              {/* Net hours */}
              <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 54 }}>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Net</div>
                <span style={{ color: net !== null ? C.gold : C.muted, fontSize: '1.1rem', fontFamily: 'DM Sans,sans-serif', fontWeight: net !== null ? 700 : 400 }}>
                  {net !== null ? fmtMins(net) : '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {!loading && <Pager page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />}

      {/* ── Clock-out confirm modal ── */}
      {confirmClockOut && (() => {
        const stylist = stylists.find(s => s.id === confirmClockOut)
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            onMouseDown={e => { if (e.target === e.currentTarget) setConfirmClockOut(null) }}>
            <div style={{ width: '100%', maxWidth: 380, background: 'var(--col-modal)', borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.redBorder}`, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ height: 3, background: `linear-gradient(90deg,${C.red},rgba(248,113,113,0.3))` }} />
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.875rem' }}>
                  <StopCircle size={18} color={C.red} />
                  <h2 className="font-display" style={{ fontSize: '1.4rem', color: 'var(--col-text)', lineHeight: 1 }}>Clock out</h2>
                </div>
                <p style={{ fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)', opacity: 0.7, marginBottom: '1.25rem', lineHeight: 1.6 }}>
                  Clock out <strong style={{ opacity: 1 }}>{stylist?.name || 'this stylist'}</strong> now? This will end their current session.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setConfirmClockOut(null)}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 10, background: 'transparent', border: `1px solid rgba(var(--rgb-hi),0.1)`, color: 'var(--col-text)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={() => clockOut(confirmClockOut)}
                    style={{ flex: 1.4, padding: '0.65rem', borderRadius: 10, background: C.redBg, border: `1.5px solid ${C.redBorder}`, color: C.red, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <StopCircle size={13} /> Clock Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
