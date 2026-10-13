import { useState, useEffect } from 'react'
import { Calendar, ShoppingBag, UserCheck, MessageSquare, Clock, LayoutDashboard } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { apptFinalPrice } from '../../lib/price'
import { slotsForDay } from '../../lib/hours'
import { getOrFetch } from '../../lib/cache'
import { format, getHours, startOfMonth, endOfMonth } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

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



function greeting() {
  const h = getHours(new Date())
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }

export default function StudioDashboard() {
  const [stats,         setStats]         = useState({ appointments: 0, pending: 0, preorders: 0, clockedIn: 0, msgs: 0 })
  const [todayAppts,    setTodayAppts]    = useState([])
  const [stylists,      setStylists]      = useState([])
  const [stylistFilter, setStylistFilter] = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [mobileTab,     setMobileTab]     = useState('overview')
  const [activeClockIn, setActiveClockIn] = useState(undefined) // undefined = not yet fetched
  const navigate = useNavigate()
  const { isAdmin, isManager, user } = useAuth()

  useEffect(() => { load() }, [])

  async function load() {
    const today = format(new Date(), 'yyyy-MM-dd')
    const result = await getOrFetch(`studio_dashboard_${today}`, async () => {
      const [
        { count: apptCount }, { count: pending }, { count: preorders },
        { count: msgs }, { data: todayList }, { data: stylistList },
      ] = await Promise.all([
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('date', format(startOfMonth(new Date()), 'yyyy-MM-dd')).lte('date', format(endOfMonth(new Date()), 'yyyy-MM-dd')),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'pending').gte('date', format(startOfMonth(new Date()), 'yyyy-MM-dd')).lte('date', format(endOfMonth(new Date()), 'yyyy-MM-dd')),
        supabase.from('preorders').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        // Unread client messages in the tickets this user can see
        supabase.from('ticket_messages').select('*', { count: 'exact', head: true }).eq('is_from_admin', false).eq('read', false),
        supabase.from('appointments')
          .select('*, profiles(full_name), services(name, price, duration), stylists(name, photo_url)')
          .eq('date', today)
          .neq('status', 'cancelled')
          .order('time'),
        supabase.from('stylists').select('id, name, photo_url').order('display_order'),
      ])
      return {
        stats: { appointments: apptCount || 0, pending: pending || 0, preorders: preorders || 0, clockedIn: 0, msgs: msgs || 0 },
        todayAppts: todayList || [],
        stylists: stylistList || [],
      }
    }, 60_000)
    setStats(result.stats)
    setTodayAppts(result.todayAppts)
    setStylists(result.stylists)
    setLoading(false)

    // Live — always fresh, not cached
    const { count: clockedInCount } = await supabase
      .from('timesheets').select('*', { count: 'exact', head: true }).is('clock_out', null)
    setStats(s => ({ ...s, clockedIn: clockedInCount || 0 }))

    if (!isAdmin && !isManager && user) {
      const { data: linked } = await supabase
        .from('stylists').select('id').eq('profile_id', user.id).maybeSingle()
      if (linked) {
        const { data: open } = await supabase
          .from('timesheets').select('id, clock_in')
          .eq('stylist_id', linked.id).is('clock_out', null).maybeSingle()
        setActiveClockIn(open || null)
      } else {
        setActiveClockIn(null)
      }
    }
  }

  const statCards = [
    { icon: Calendar,      label: 'Appointments', value: stats.appointments, sub: `${stats.pending} pending · this month`, link: '/studio/schedule', color: C.gold },
    { icon: ShoppingBag,   label: 'Orders',       value: stats.preorders,    sub: 'Awaiting pickup',          link: '/studio/orders',      color: '#a78bfa' },
    (isAdmin || isManager)
      ? { icon: UserCheck, label: 'Artists In', value: stats.clockedIn, sub: `of ${stylists.length} artist${stylists.length !== 1 ? 's' : ''}`, link: '/studio/timesheets', color: '#34d399' }
      : { icon: Clock,     label: 'Timesheets', value: null,             sub: 'My time logs',                                                    link: '/studio/timesheets', color: '#34d399' },
    { icon: MessageSquare, label: 'Messages',     value: stats.msgs,         sub: 'Unread',                   link: '/studio/messages',  color: '#60a5fa' },
  ]

  const SLOTS        = slotsForDay(new Date())
  const visibleAppts = stylistFilter ? todayAppts.filter(a => a.stylist_id === stylistFilter) : todayAppts
  const bookedCount  = visibleAppts.length
  const freeCount    = SLOTS.length - new Set(visibleAppts.map(a => a.time?.slice(0, 5))).size
  const nowTime      = format(new Date(), 'HH:mm')
  const nextAppt     = todayAppts.find(a => (a.time?.slice(0, 5) || '') >= nowTime)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', paddingBottom: '2rem' }}>

      {/* Header — always visible */}
      <div style={{ flexShrink: 0, paddingBottom: '1rem', borderBottom: `1px solid ${C.border}` }}>
        <p style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: '0.3rem' }}>Overview</p>
        <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.15rem' }}>
          {greeting()}.
        </h1>
        <p style={{ color: C.muted, fontSize: '0.87rem', fontFamily: 'DM Sans,sans-serif' }}>{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Tab bar — mobile only, sits between header and content */}
      <div className="dash-tab-bar">
        <button className={`dash-tab-btn${mobileTab === 'overview' ? ' active' : ''}`} onClick={() => setMobileTab('overview')}>
          <LayoutDashboard size={14} strokeWidth={1.5} />
          Overview
        </button>
        <button className={`dash-tab-btn${mobileTab === 'schedule' ? ' active' : ''}`} onClick={() => setMobileTab('schedule')}>
          <Calendar size={14} strokeWidth={1.5} />
          Schedule
        </button>
      </div>

      {/* Stat cards */}
      <div className={`dash-stats${mobileTab !== 'overview' ? ' dash-m-hide' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem', flexShrink: 0 }}>
        {statCards.map(c => {
          const isClockCard = !isAdmin && !isManager && c.label === 'Timesheets'
          const clockedIn   = isClockCard && !!activeClockIn
          const elapsed     = clockedIn ? Math.floor((Date.now() - new Date(activeClockIn.clock_in)) / 60000) : 0
          const elapsedStr  = elapsed >= 60 ? `${Math.floor(elapsed/60)}h ${elapsed%60}m` : `${elapsed}m`
          const dotColor    = clockedIn ? '#34d399' : 'var(--col-text)'
          return (
            <button key={c.label} onClick={() => navigate(c.link)} className="d-stat"
              style={{ ...card, padding: '1.1rem 1.25rem', textAlign: 'left', cursor: 'pointer', transition: 'all .2s ease', borderColor: isClockCard && clockedIn ? 'rgba(52,211,153,0.2)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.875rem' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${isClockCard && clockedIn ? '#34d399' : c.color}14`, border: `1px solid ${isClockCard && clockedIn ? '#34d399' : c.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <c.icon size={15} color={isClockCard && clockedIn ? '#34d399' : c.color} strokeWidth={1.5} />
                </div>
                <p style={{ fontSize: '0.82rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, lineHeight: 1.2 }}>{c.label}</p>
              </div>
              {isClockCard ? (
                activeClockIn === undefined ? (
                  <div className="font-display" style={{ fontSize: '2rem', color: C.border, lineHeight: 1, marginBottom: '0.2rem' }}>—</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.2rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, animation: clockedIn ? 'dash-pulse 2s infinite' : 'none' }} />
                    <span className="font-display" style={{ fontSize: '1.35rem', color: clockedIn ? '#34d399' : C.muted, lineHeight: 1 }}>
                      {clockedIn ? 'In' : 'Out'}
                    </span>
                  </div>
                )
              ) : (
                <div className="font-display" style={{ fontSize: '2rem', color: loading ? C.border : C.white, lineHeight: 1, marginBottom: '0.2rem' }}>
                  {loading ? '—' : c.value}
                </div>
              )}
              <p style={{ fontSize: '0.83rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>
                {isClockCard ? (clockedIn ? `Since ${elapsedStr} ago` : 'Not clocked in') : c.sub}
              </p>
            </button>
          )
        })}
      </div>

      {/* Mobile-only extras: today summary + quick actions */}
      <div className={`dash-mobile-extras${mobileTab !== 'overview' ? ' dash-m-hide' : ''}`}>

        {/* Today at a glance */}
        <div style={{ ...card, padding: '0.875rem 1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <p style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>Today</p>
            <button onClick={() => setMobileTab('schedule')} style={{ fontSize: '0.79rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              View all →
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginBottom: nextAppt && !loading ? '0.625rem' : 0 }}>
            {loading ? '…' : `${bookedCount} booked · ${freeCount} free slot${freeCount !== 1 ? 's' : ''}`}
          </p>
          {nextAppt && !loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.75rem', borderRadius: 9, background: C.goldBg, border: `1px solid ${C.goldBorder}` }}>
              <span style={{ fontSize: '0.8rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, flexShrink: 0 }}>{nextAppt.time?.slice(0, 5)}</span>
              <div style={{ width: 1, height: 16, background: C.goldBorder, flexShrink: 0 }} />
              {nextAppt.stylists?.photo_url && <img src={nextAppt.stylists.photo_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.83rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nextAppt.profiles?.full_name || 'Client'}
                </p>
                <p style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[nextAppt.services?.name, nextAppt.stylists?.name].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span style={{ fontSize: 12, padding: '2px 7px', borderRadius: 5, background: 'rgba(var(--rgb-acc),0.15)', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Next</span>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {[
            { label: 'Schedule',   icon: Calendar,      link: '/studio/schedule',   color: C.gold },
            { label: 'Messages',   icon: MessageSquare, link: '/studio/messages',   color: '#60a5fa' },
            { label: 'Orders',     icon: ShoppingBag,   link: '/studio/orders',     color: '#a78bfa' },
            { label: 'Timesheets', icon: Clock,         link: '/studio/timesheets', color: '#34d399' },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.link)}
              style={{ ...card, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left', transition: 'all .15s', background: C.card, border: `1px solid ${C.border}` }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${a.color}14`, border: `1px solid ${a.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <a.icon size={14} color={a.color} strokeWidth={1.5} />
              </div>
              <span style={{ fontSize: '0.83rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{a.label}</span>
            </button>
          ))}
        </div>

      </div>

      {/* Today's schedule */}
      <div className={mobileTab !== 'schedule' ? 'dash-m-hide' : undefined} style={{ ...card, display: 'flex', flexDirection: 'column' }}>

        {/* Schedule header */}
        <div style={{ padding: '0.875rem 1.25rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 className="font-display" style={{ fontSize: '1.05rem', color: C.white, marginBottom: 2 }}>Today's Schedule</h2>
            <p style={{ fontSize: '0.83rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
              {loading ? '…' : `${bookedCount} booked · ${freeCount} free slot${freeCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>
            {format(new Date(), 'MMM d')}
          </span>
        </div>

        {/* Stylist filter */}
        {stylists.length > 0 && (
          <div style={{ display: 'flex', gap: 6, padding: '0.625rem 1.25rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, overflowX: 'auto' }}>
            <button onClick={() => setStylistFilter(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 20, border: `1px solid ${!stylistFilter ? C.goldBorder : C.border}`, background: !stylistFilter ? C.goldBg : 'transparent', color: !stylistFilter ? C.gold : C.muted, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', flexShrink: 0 }}>
              All stylists
            </button>
            {stylists.map(s => {
              const active = stylistFilter === s.id
              return (
                <button key={s.id} onClick={() => setStylistFilter(active ? null : s.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 12px 4px 4px', borderRadius: 20, border: `1px solid ${active ? C.goldBorder : C.border}`, background: active ? C.goldBg : 'transparent', color: active ? C.gold : C.muted, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {s.photo_url
                    ? <img src={s.photo_url} alt={s.name} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', border: `1.5px solid ${active ? C.gold : 'rgba(var(--rgb-hi),0.12)'}` }} />
                    : <div style={{ width: 22, height: 22, borderRadius: '50%', background: active ? C.goldBg : C.subtle, border: `1.5px solid ${active ? C.goldBorder : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: active ? C.gold : C.muted, fontWeight: 700 }}>
                        {s.name.charAt(0)}
                      </div>
                  }
                  {s.name.split(' ')[0]}
                </button>
              )
            })}
          </div>
        )}

        {/* Slots */}
        <div style={{ padding: '0.75rem 1.25rem' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {Array.from({ length: 10 }).map((_, i) => <div key={i} style={{ height: 44, borderRadius: 8, background: C.subtle }} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {SLOTS.map(slot => {
                const slotAppts = visibleAppts.filter(a => a.time?.slice(0, 5) === slot)
                const count = slotAppts.length

                return (
                  <div key={slot} style={{ display: 'flex', gap: 12, minHeight: 44, alignItems: count > 0 ? 'flex-start' : 'center' }}>

                    {/* Time */}
                    <span style={{ width: 40, flexShrink: 0, fontSize: '0.84rem', fontFamily: 'DM Sans,sans-serif', textAlign: 'right', paddingTop: count > 0 ? 10 : 0,
                      color: count > 1 ? '#f59e0b' : count === 1 ? C.gold : 'var(--col-text)',
                      fontWeight: count > 0 ? 700 : 400,
                    }}>
                      {slot}
                    </span>

                    {/* Separator */}
                    <div style={{ width: 1, alignSelf: 'stretch', flexShrink: 0,
                      background: count > 1 ? 'rgba(245,158,11,0.4)' : count === 1 ? C.goldBorder : 'rgba(var(--rgb-hi),0.05)',
                    }} />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0, paddingTop: count > 0 ? 5 : 0, paddingBottom: count > 0 ? 5 : 0 }}>

                      {count === 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 1, background: 'rgba(var(--rgb-hi),0.04)', borderRadius: 1 }} />
                          <span style={{ fontSize: 11, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0 }}>Free</span>
                        </div>
                      )}

                      {count === 1 && (() => {
                        const appt = slotAppts[0]
                        const s = STATUS[appt.status] || STATUS.pending
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.4rem 0.875rem', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}` }}>
                            {appt.stylists?.photo_url
                              ? <img src={appt.stylists.photo_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: `1.5px solid ${s.border}` }} />
                              : <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${s.color}22`, border: `1.5px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: s.color, fontWeight: 700, flexShrink: 0 }}>
                                  {appt.stylists?.name?.charAt(0) || '?'}
                                </div>
                            }
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ color: C.white, fontSize: '0.92rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {appt.stylists?.name || 'Stylist'}
                              </p>
                              <p style={{ color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {[appt.services?.name, appt.profiles?.full_name].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            {appt.services?.price && <span style={{ fontSize: '0.84rem', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>${apptFinalPrice(appt).toFixed(2)}</span>}
                            {appt.payment_status === 'pay_in_store' && (
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, flexShrink: 0 }}>
                                Pay in store
                              </span>
                            )}
                            <div style={{ padding: '2px 9px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0 }}>
                              <span style={{ fontSize: 11, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'capitalize' }}>{appt.status}</span>
                            </div>
                          </div>
                        )
                      })()}

                      {count > 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ marginBottom: 2 }}>
                            <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>
                              {count} bookings
                            </span>
                          </div>
                          {slotAppts.map(appt => {
                            const s = STATUS[appt.status] || STATUS.pending
                            return (
                              <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.35rem 0.75rem', borderRadius: 9, background: s.bg, border: `1px solid ${s.border}` }}>
                                {appt.stylists?.photo_url
                                  ? <img src={appt.stylists.photo_url} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: `1.5px solid ${s.border}` }} />
                                  : <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${s.color}22`, border: `1.5px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: s.color, fontWeight: 700, flexShrink: 0 }}>
                                      {appt.stylists?.name?.charAt(0) || '?'}
                                    </div>
                                }
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ color: C.white, fontSize: '0.87rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {appt.stylists?.name || 'Stylist'}
                                  </p>
                                  <p style={{ color: C.muted, fontSize: '0.79rem', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {[appt.services?.name, appt.profiles?.full_name].filter(Boolean).join(' · ')}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                  {appt.services?.price && <span style={{ fontSize: '0.8rem', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>${apptFinalPrice(appt).toFixed(2)}</span>}
                                  {appt.payment_status === 'pay_in_store' && (
                                    <span style={{ fontSize: 12, padding: '2px 7px', borderRadius: 5, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>
                                      In store
                                    </span>
                                  )}
                                  <div style={{ padding: '2px 7px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}` }}>
                                    <span style={{ fontSize: 12, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'capitalize' }}>{appt.status}</span>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes dot-pulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.4)} }
        @keyframes dash-pulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(52,211,153,0.5)} 50%{opacity:.8;box-shadow:0 0 0 4px rgba(52,211,153,0)} }
        .dot-pulse { animation: dot-pulse 1.6s ease-in-out infinite; }
        .d-stat:hover { border-color: ${C.goldBorder} !important; background: rgba(var(--rgb-acc),0.07) !important; box-shadow: 0 4px 20px rgba(var(--rgb-acc),0.1) !important; }
        .dash-tab-bar { display: none; }
        .dash-mobile-extras { display: none; }
        @media (max-width: 639px) {
          .dash-stats { grid-template-columns: repeat(2,1fr) !important; }
          .dash-m-hide { display: none !important; }
          .dash-tab-bar { display: flex; gap: 0.5rem; }
          .dash-mobile-extras { display: flex; flex-direction: column; gap: 0.75rem; }
          .dash-tab-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0.55rem 0.5rem; border-radius: 10px; border: 1px solid rgba(var(--rgb-hi),0.1); background: transparent; color: var(--col-text); font-size: 0.8rem; font-family: 'DM Sans',sans-serif; font-weight: 700; cursor: pointer; transition: all 0.15s; }
          .dash-tab-btn.active { color: var(--col-acc); background: rgba(var(--rgb-acc),0.08); border-color: rgba(var(--rgb-acc),0.2); }
        }
      `}</style>
    </div>
  )
}
