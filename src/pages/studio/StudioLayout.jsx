import { useState, useEffect, useRef, Suspense } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Calendar, CalendarOff, Package, Image, MessageSquare,
  Tag, Users, UserCheck, LogOut, Scissors, Menu, BarChart2, ClipboardList, ShoppingBag, Sparkles, Clock, Banknote, Activity, Sun, Moon,
} from 'lucide-react'
import hairgoLogo from '../../assets/hairgo.png'
import AppointmentAlert from '../../components/AppointmentAlert'
import DayOffAlert from '../../components/DayOffAlert'
import UnlinkedArtistAlert from '../../components/UnlinkedArtistAlert'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import toast from 'react-hot-toast'

const C = {
  bg: 'var(--col-bg)', card: 'var(--col-card)', sidebar: 'var(--col-bg2)', topbar: 'var(--col-card)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)', subtle: 'rgba(var(--rgb-hi),0.06)',
  border: 'rgba(var(--rgb-hi),0.1)', danger: '#f87171',
}

const adminNavItems = [
  { to: '/studio/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/studio/sales',         icon: BarChart2,       label: 'Sales' },
  { to: '/studio/timesheets',    icon: Clock,           label: 'Timesheets' },
  { to: '/studio/pay-runs',      icon: Banknote,        label: 'Pay Runs' },
  { to: '/studio/appointments',  icon: ClipboardList,   label: 'Appointments' },
  { to: '/studio/schedule',      icon: Calendar,        label: 'Schedule' },
  { to: '/studio/blocked-dates', icon: CalendarOff,     label: 'Blocked Dates' },
  { to: '/studio/messages',      icon: MessageSquare,   label: 'Messages' },
  { to: '/studio/orders',        icon: ShoppingBag,     label: 'Orders' },
  { to: '/studio/home-display',  icon: Sparkles,        label: 'Home Display' },
  { to: '/studio/services',      icon: Scissors,        label: 'Services' },
  { to: '/studio/stylists',      icon: UserCheck,       label: 'Stylists' },
  { to: '/studio/users',         icon: Users,           label: 'Users' },
  { to: '/studio/products',      icon: Package,         label: 'Products' },
  { to: '/studio/gallery',       icon: Image,           label: 'Gallery' },
  { to: '/studio/coupons',       icon: Tag,             label: 'Coupons' },
  { to: '/studio/logs',          icon: Activity,        label: 'Activity Logs' },
]

const managerNavItems = [
  { to: '/studio/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/studio/timesheets',    icon: Clock,           label: 'Timesheets' },
  { to: '/studio/appointments',  icon: ClipboardList,   label: 'Appointments' },
  { to: '/studio/schedule',      icon: Calendar,        label: 'Schedule' },
  { to: '/studio/blocked-dates', icon: CalendarOff,     label: 'Blocked Dates' },
  { to: '/studio/messages',      icon: MessageSquare,   label: 'Messages' },
  { to: '/studio/orders',        icon: ShoppingBag,     label: 'Orders' },
  { to: '/studio/products',      icon: Package,         label: 'Products' },
  { to: '/studio/gallery',       icon: Image,           label: 'Gallery' },
  { to: '/studio/coupons',       icon: Tag,             label: 'Coupons' },
]

const workerNavItems = [
  { to: '/studio/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/studio/timesheets',    icon: Clock,           label: 'Timesheets' },
  { to: '/studio/paysheet',      icon: Banknote,        label: 'Paysheet' },
  { to: '/studio/appointments',  icon: ClipboardList,   label: 'Appointments' },
  { to: '/studio/schedule',      icon: Calendar,        label: 'Schedule' },
  { to: '/studio/blocked-dates', icon: CalendarOff,     label: 'Blocked Dates' },
  { to: '/studio/messages',      icon: MessageSquare,   label: 'Messages' },
  { to: '/studio/orders',        icon: ShoppingBag,     label: 'Orders' },
]

export default function StudioLayout() {
  const [open,             setOpen]             = useState(false)
  const [unread,           setUnread]           = useState(0)
  const [pendingDayoffs,   setPendingDayoffs]   = useState(0)
  const { signOut, profile, isAdmin, isManager, user } = useAuth()
  const { isDark, toggleTheme } = useTheme()

  // Refs so the realtime handler always sees the latest values
  const isAdminRef   = useRef(isAdmin)
  const isManagerRef = useRef(isManager)
  const userRef      = useRef(user)
  useEffect(() => { isAdminRef.current   = isAdmin   }, [isAdmin])
  useEffect(() => { isManagerRef.current = isManager }, [isManager])
  useEffect(() => { userRef.current      = user      }, [user])

  useEffect(() => {
    fetchUnread()
    fetchPendingDayoffs()
    const sub = supabase.channel('studio-unread-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_messages' }, fetchUnread)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fetchUnread)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_dates' }, fetchPendingDayoffs)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  // Re-fetch when profile loads (first time isAdmin / user become available)
  useEffect(() => { fetchUnread() }, [isAdmin, user?.id])

  async function fetchUnread() {
    const usr  = userRef.current
    const isAdm = isAdminRef.current || isManagerRef.current
    if (!usr) return

    // Unread client messages in store/direct tickets
    let ticketQ = supabase.from('tickets').select('id')
    if (isAdm) ticketQ = ticketQ.is('recipient_id', null).is('appointment_id', null)
    else       ticketQ = ticketQ.eq('recipient_id', usr.id)

    const { data: tkts } = await ticketQ
    const ids = (tkts || []).map(t => t.id)

    let msgCount = 0
    if (ids.length) {
      const { count } = await supabase
        .from('ticket_messages')
        .select('*', { count: 'exact', head: true })
        .in('ticket_id', ids)
        .eq('is_from_admin', false)
        .eq('read', false)
      msgCount = count || 0
    }

    // Admin/Manager: open request tickets where admin has not yet replied
    let reqCount = 0
    if (isAdm) {
      const { data: openReqs } = await supabase
        .from('tickets')
        .select('id')
        .not('appointment_id', 'is', null)
        .eq('status', 'open')
      const reqIds = (openReqs || []).map(t => t.id)
      if (reqIds.length) {
        const { data: replied } = await supabase
          .from('ticket_messages')
          .select('ticket_id')
          .in('ticket_id', reqIds)
          .eq('is_from_admin', true)
        const repliedSet = new Set((replied || []).map(m => m.ticket_id))
        reqCount = reqIds.filter(id => !repliedSet.has(id)).length
      }
    }

    setUnread(msgCount + reqCount)
  }

  async function fetchPendingDayoffs() {
    const { count } = await supabase
      .from('blocked_dates')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .not('stylist_id', 'is', null)
    setPendingDayoffs(count || 0)
  }
  const navigate = useNavigate()
  const location = useLocation()
  const navItems = isAdmin ? adminNavItems : isManager ? managerNavItems : workerNavItems
  const currentPage = navItems.find(n => location.pathname.startsWith(n.to))?.label ?? 'Studio'

  async function handleSignOut() {
    sessionStorage.removeItem('studio_access')
    await signOut()
    toast.success('Signed out')
    navigate('/studio')
  }

  const Sidebar = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Brand */}
      <div className="s-brand-wrap" style={{ padding: '1.5rem 1.25rem 1.25rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', opacity: 1, transition: 'opacity .18s' }}
          className="s-brand">
          <img src={hairgoLogo} alt="HairGo" className="s-logo-circle" style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid rgba(var(--rgb-acc),0.35)`, boxShadow: `0 4px 16px rgba(var(--rgb-acc),0.3)`, flexShrink: 0, objectFit: 'cover' }} />
          <div>
            <span className="font-display s-brand-name" style={{ fontSize: '1.15rem', color: C.white, lineHeight: 1 }}>
              Hair<span style={{ color: C.gold }}>Go</span>
            </span>
            <span style={{ display: 'block', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>
              Studio
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="s-nav-list" style={{ flex: 1, padding: '0.75rem 0.625rem', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.55rem 0.875rem', borderRadius: 10,
              fontSize: '0.9rem', fontFamily: 'DM Sans,sans-serif', fontWeight: isActive ? 500 : 400,
              color: isActive ? C.gold : C.dim,
              background: isActive ? C.goldBg : 'transparent',
              border: isActive ? `1px solid ${C.goldBorder}` : '1px solid transparent',
              textDecoration: 'none', transition: 'all .18s ease',
            })}
            className="s-nav">
            {({ isActive }) => (
              <>
                <Icon size={14} strokeWidth={isActive ? 2 : 1.5} style={{ flexShrink: 0 }} />
                {label}
                {label === 'Messages' && unread > 0 && (
                  <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0, boxShadow: '0 0 5px rgba(239,68,68,0.5)' }} />
                )}
                {label === 'Blocked Dates' && (isAdmin || isManager) && pendingDayoffs > 0 && (
                  <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9, background: '#ef4444', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, padding: '0 4px' }}>
                    {pendingDayoffs > 9 ? '9+' : pendingDayoffs}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="s-footer-wrap" style={{ padding: '0.75rem 0.625rem', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ padding: '0.5rem 0.875rem', marginBottom: 6 }}>
          <p style={{ fontSize: '0.86rem', color: C.dim, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile?.full_name || 'Admin'}
          </p>
          <p style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>
            {isAdmin ? 'Studio Admin' : isManager ? 'Manager' : 'Artist'}
          </p>
        </div>
        <button onClick={handleSignOut} className="s-signout"
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '0.5rem 0.875rem', borderRadius: 10, fontSize: '0.9rem', fontFamily: 'DM Sans,sans-serif', color: 'rgba(248,113,113,0.5)', background: 'none', border: `1px solid rgba(248,113,113,0.12)`, cursor: 'pointer', transition: 'all .18s ease', textAlign: 'left' }}>
          <LogOut size={13} strokeWidth={1.5} />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="studio-root" style={{ display: 'flex', height: '100vh', width: '100vw', background: C.bg, overflow: 'hidden' }}>

      <aside style={{ width: 210, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.border}` }} className="s-sidebar">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }}
              onClick={() => setOpen(false)} />
            <motion.aside initial={{ x: -210 }} animate={{ x: 0 }} exit={{ x: -210 }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, width: 210, background: C.sidebar, borderRight: `1px solid ${C.border}` }}>
              <Sidebar />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="studio-right" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Topbar */}
        <header className="studio-topbar" style={{ height: 50, flexShrink: 0, borderBottom: `1px solid ${C.border}`, background: C.topbar, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => setOpen(true)} style={{ display: 'none', padding: 4, color: C.dim, background: 'none', border: 'none', cursor: 'pointer' }} className="s-menu-btn">
              <Menu size={17} />
            </button>
            <span style={{ fontSize: '0.9rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.04em' }}>{currentPage}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={toggleTheme} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--rgb-hi),0.05)', border: '1px solid rgba(var(--rgb-hi),0.1)', color: C.dim, cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}>
              {isDark ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <UnlinkedArtistAlert />
            <DayOffAlert />
            <AppointmentAlert />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.14)' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399' }} className="animate-pulse" />
              <span style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#34d399', fontFamily: 'DM Sans,sans-serif' }}>Live</span>
            </div>
          </div>
        </header>

        <main className="studio-main" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '1.75rem 2rem' }}>
          <div className="studio-outlet" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
            <Suspense fallback={null}><Outlet /></Suspense>
          </div>
        </main>
      </div>

      <style>{`
        .s-brand:hover { opacity: 0.75 !important; }
        .s-nav:hover { color: var(--col-acc) !important; background: rgba(var(--rgb-acc),0.08) !important; border-color: rgba(var(--rgb-acc),0.14) !important; }
        .s-signout:hover { color: ${C.danger} !important; border-color: rgba(248,113,113,0.28) !important; background: rgba(248,113,113,0.06) !important; }
        .s-sidebar  { display: none; }
        .s-menu-btn { display: flex !important; }
        @media (min-width: 1200px) {
          .s-sidebar  { display: block !important; position: sticky !important; top: 0 !important; height: 100vh !important; align-self: flex-start !important; }
          .s-menu-btn { display: none  !important; }
          /* Switch to native document scroll on desktop */
          .studio-root   { height: auto !important; min-height: 100vh !important; overflow: visible !important; }
          .studio-right  { overflow: visible !important; }
          .studio-main   { overflow: visible !important; }
          .studio-outlet { overflow: visible !important; overflow-y: visible !important; flex: none !important; }
        }
        @media (max-width: 1199px) {
          /* Single scroll container model: outlet scrolls, document is locked.
             Uses 100dvh (dynamic viewport height) to avoid iOS browser-chrome clipping. */
          .studio-root   { height: 100dvh !important; }
          .studio-main   { padding: 0.875rem !important; }
          .studio-outlet { overscroll-behavior-y: contain; }
          .s-brand-wrap  { padding: 0.75rem 1rem !important; }
          .s-logo-circle { width: 26px !important; height: 26px !important; }
          .s-brand-name  { font-size: 1rem !important; }
          .s-nav-list    { padding: 0.4rem 0.5rem !important; gap: 1px !important; }
          .s-nav         { padding: 0.38rem 0.75rem !important; font-size: 0.88rem !important; }
          .s-footer-wrap { padding: 0.5rem 0.5rem !important; }
        }
      `}</style>
    </div>
  )
}
