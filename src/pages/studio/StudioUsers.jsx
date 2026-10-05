import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Users, Search, MessageCircle, Mail, X, Send, Star, ChevronDown, ShieldCheck, Check, UserPlus, Scissors, Plus, ArrowRight, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { invalidate } from '../../lib/cache'
import { useAuth } from '../../contexts/AuthContext'
import { useLogAction } from '../../hooks/useLogAction'
import { format } from 'date-fns'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import Pager from '../../lib/Pager'

const C = {
  card: 'var(--col-modal)', modal: 'var(--col-modal)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)', subtle: 'rgba(var(--rgb-hi),0.06)',
  border: 'rgba(var(--rgb-hi),0.07)',
}

const ROLE_STYLE = {
  user:    { color: 'var(--col-text)', bg: 'rgba(var(--rgb-hi),0.05)', border: 'rgba(var(--rgb-hi),0.1)',   label: 'User'    },
  artist:  { color: '#60a5fa',         bg: 'rgba(96,165,250,0.1)',     border: 'rgba(96,165,250,0.22)',     label: 'Artist'  },
  manager: { color: '#a78bfa',         bg: 'rgba(167,139,250,0.1)',    border: 'rgba(167,139,250,0.22)',    label: 'Manager' },
  admin:   { color: 'var(--col-acc)',  bg: 'rgba(var(--rgb-acc),0.08)', border: 'rgba(var(--rgb-acc),0.22)', label: 'Admin'   },
}

const TABS = [
  { key: 'user',    label: 'Users'    },
  { key: 'artist',  label: 'Artists'  },
  { key: 'manager', label: 'Managers' },
  { key: 'admin',   label: 'Admins'   },
]

function RoleOption({ rrs, isActive, label, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', background: isActive ? rrs.bg : hov ? 'rgba(var(--rgb-hi),0.04)' : 'transparent', border: 'none', cursor: 'pointer', color: isActive ? rrs.color : hov ? 'var(--col-text)' : 'var(--col-text)', fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: isActive ? 700 : 400, letterSpacing: '0.13em', textTransform: 'uppercase', textAlign: 'left', transition: 'all .15s' }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: rrs.color, opacity: isActive || hov ? 1 : 0.3, flexShrink: 0, transition: 'opacity .15s', boxShadow: (isActive || hov) ? `0 0 6px ${rrs.color}88` : 'none' }} />
      {label}
      {isActive && <Check size={10} style={{ marginLeft: 'auto', color: rrs.color }} />}
    </button>
  )
}

function RoleSelector({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, left: 0 })
  const [hov,  setHov]  = useState(false)
  const btnRef = useRef(null)

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 5, left: r.left })
    }
    setOpen(p => !p)
  }

  useEffect(() => {
    if (!open) return
    const close = e => { if (!btnRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const rs = ROLE_STYLE[value] || ROLE_STYLE.user

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button ref={btnRef} onClick={toggle}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px 5px 9px', borderRadius: 8, background: hov ? rs.bg : 'transparent', border: `1px solid ${hov || open ? rs.border : 'rgba(var(--rgb-hi),0.09)'}`, color: rs.color, cursor: 'pointer', transition: 'all .2s', fontFamily: 'DM Sans,sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: rs.color, boxShadow: hov ? `0 0 7px ${rs.color}` : 'none', transition: 'box-shadow .2s', flexShrink: 0 }} />
        {rs.label}
        <ChevronDown size={9} color={rs.color} style={{ opacity: 0.55, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .22s' }} />
      </button>

      {open && createPortal(
        <div onMouseDown={e => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, background: 'var(--col-card)', border: '1px solid rgba(var(--rgb-acc),0.18)', borderRadius: 12, overflow: 'hidden', minWidth: 130, boxShadow: '0 20px 56px rgba(0,0,0,0.65), 0 0 0 1px rgba(var(--rgb-hi),0.03)' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg,var(--col-acc),var(--col-acc2),rgba(var(--rgb-acc),0.1))' }} />
          {[
            { role: 'user',    label: 'User'    },
            { role: 'artist',  label: 'Artist'  },
            { role: 'manager', label: 'Manager' },
            { role: 'admin',   label: 'Admin'   },
          ].map(({ role, label }) => (
            <RoleOption key={role} rrs={ROLE_STYLE[role]} isActive={role === value} label={label}
              onClick={() => { onChange(role); setOpen(false) }} />
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

export default function StudioUsers() {
  const { user: adminUser } = useAuth()
  const log = useLogAction()
  const [all,           setAll]           = useState([])
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [searchParams]  = useSearchParams()
  const [tab,           setTab]           = useState(() => {
    const t = searchParams.get('tab')
    return ['user', 'artist', 'admin'].includes(t) ? t : 'user'
  })
  const [msgModal,      setMsgModal]      = useState(null)
  const [msgTitle,      setMsgTitle]      = useState('')
  const [msgBody,       setMsgBody]       = useState('')
  const [sending,       setSending]       = useState(false)
  // role-change confirmation (user ↔ admin)
  const [roleConfirm,      setRoleConfirm]      = useState(null)
  const [confirming,       setConfirming]       = useState(false)
  const [deleteStylist,    setDeleteStylist]    = useState(false)
  // employee promotion wizard
  const [empModal,      setEmpModal]      = useState(null) // { userId, userName }
  const [empStep,       setEmpStep]       = useState(1)    // 1=assign, 2=confirm
  const [freeStylists,  setFreeStylists]  = useState([])   // unlinked stylists
  const [empMode,       setEmpMode]       = useState('assign') // 'assign' | 'create'
  const [empSelected,   setEmpSelected]   = useState(null)
  const [empName,       setEmpName]       = useState('')
  const [empTitle,      setEmpTitle]      = useState('')
  const [empPhoto,      setEmpPhoto]      = useState(null)   // File
  const [empPreview,    setEmpPreview]    = useState(null)   // object URL
  const [empErr,        setEmpErr]        = useState('')
  const [empSaving,     setEmpSaving]     = useState(false)
  const empFileRef = useRef(null)
  const [stylists,      setStylists]      = useState([])
  const [page,          setPage]          = useState(0)
  const navigate = useNavigate()

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data, error }, { data: stylistData }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('stylists').select('id, name, title, profile_id').not('profile_id', 'is', null),
    ])
    if (error) toast.error('Could not load users: ' + error.message)
    setAll(data || [])
    setStylists(stylistData || [])
    setLoading(false)
  }

  async function unlinkStylist(userId, userName) {
    const { error, count } = await supabase.from('stylists').update({ profile_id: null }).eq('profile_id', userId).select()
    if (error) return toast.error(error.message)
    toast.success(`Stylist unlinked from ${userName || 'account'}`)
  }

  async function changeRole(id, newRole) {
    const target = all.find(u => u.id === id)
    if (newRole === 'artist') {
      const { data } = await supabase.from('stylists').select('id, name, title, photo_url').is('profile_id', null).order('name')
      const free = data || []
      setFreeStylists(free)
      setEmpModal({ userId: id, userName: target?.full_name || 'this user' })
      setEmpStep(1)
      setEmpMode(free.length > 0 ? 'assign' : 'create')
      setEmpSelected(null)
      setEmpName(target?.full_name || '')
      setEmpTitle(''); setEmpErr('')
      setEmpPhoto(null); setEmpPreview(null)
      return
    }
    const linked = stylists.find(s => s.profile_id === id) || null
    setDeleteStylist(false)
    setRoleConfirm({ userId: id, newRole, userName: target?.full_name || 'this user', linkedStylist: linked })
  }

  async function applyEmployeePromotion() {
    if (empStep === 1) {
      if (empMode === 'assign' && !empSelected) { setEmpErr('Select an artist profile to link'); return }
      if (empMode === 'create' && !empName.trim()) { setEmpErr('Enter a name for the new artist'); return }
      setEmpErr(''); setEmpStep(2); return
    }
    // Step 2 — execute
    setEmpSaving(true); setEmpErr('')
    try {
      // 1. Change role via edge function
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ userId: empModal.userId, newRole: 'artist' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update role')
      // 2. Link or create stylist
      let newStylist = null
      if (empMode === 'assign') {
        const { data, error } = await supabase.from('stylists').update({ profile_id: empModal.userId }).eq('id', empSelected).select('id, name, title, profile_id').single()
        if (error) throw error
        newStylist = data
      } else {
        let photo_url = null
        if (empPhoto) {
          const ext  = empPhoto.name.split('.').pop()
          const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
          const { error: upErr } = await supabase.storage.from('stylists').upload(path, empPhoto, { upsert: false })
          if (upErr) throw new Error('Photo upload failed: ' + upErr.message)
          photo_url = supabase.storage.from('stylists').getPublicUrl(path).data.publicUrl
        }
        const { data, error } = await supabase.from('stylists').insert({ name: empName.trim(), title: empTitle.trim() || null, photo_url, profile_id: empModal.userId }).select('id, name, title, profile_id').single()
        if (error) throw error
        newStylist = data
      }
      setAll(prev => prev.map(u => u.id === empModal.userId ? { ...u, role: 'artist' } : u))
      setStylists(prev => {
        const without = prev.filter(s => s.id !== newStylist.id)
        return [...without, newStylist]
      })
      toast.success(`${empModal.userName} is now an artist`)
      log('user.artist_promoted', {
        entityType: 'user', entityId: empModal.userId,
        details: { message: `promoted ${empModal.userName} to artist` },
      })
      setEmpModal(null)
    } catch (err) { setEmpErr(err.message) }
    finally { setEmpSaving(false) }
  }

  async function applyRoleChange() {
    setConfirming(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ userId: roleConfirm.userId, newRole: roleConfirm.newRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update role')
      // If demoting from employee, unlink or delete the attached stylist
      const wasEmployee = all.find(u => u.id === roleConfirm.userId)?.role === 'artist'
      if (wasEmployee) {
        if (deleteStylist && roleConfirm.linkedStylist) {
          await supabase.from('stylists').delete().eq('id', roleConfirm.linkedStylist.id)
        } else {
          await supabase.from('stylists').update({ profile_id: null }).eq('profile_id', roleConfirm.userId)
        }
        setStylists(prev => prev.filter(s => s.profile_id !== roleConfirm.userId))
        invalidate('stylists_all')
        invalidate('home_stylists')
        invalidate('studio_stylists')
      }
      setAll(prev => prev.map(u => u.id === roleConfirm.userId ? { ...u, role: roleConfirm.newRole } : u))
      toast.success(`Role changed to ${roleConfirm.newRole}`)
      log('user.role_changed', {
        entityType: 'user', entityId: roleConfirm.userId,
        details: { message: `changed ${roleConfirm.userName}'s role to "${roleConfirm.newRole}"` },
      })
      setRoleConfirm(null)
    } catch (err) { toast.error(err.message) }
    finally { setConfirming(false) }
  }

  async function adjustVisits(id, delta, current) {
    const newCount = Math.max(0, (current || 0) + delta)
    const { error } = await supabase.from('profiles').update({ points: newCount }).eq('id', id)
    if (error) return toast.error(error.message)
    setAll(prev => prev.map(u => u.id === id ? { ...u, points: newCount } : u))
    if (delta > 0 && newCount % 5 === 0 && newCount > 0) {
      const code   = `REWARD${Math.random().toString(36).slice(2, 7).toUpperCase()}`
      const expiry = new Date(); expiry.setMonth(expiry.getMonth() + 3)
      const { data: coupon } = await supabase.from('coupons').insert({
        code, discount_type: 'percentage', discount_value: 30,
        min_points_required: 0, expiry_date: expiry.toISOString().split('T')[0],
        max_uses: 1, active: true, is_public: false,
      }).select().single()
      if (coupon) {
        await supabase.from('user_coupons').insert({ user_id: id, coupon_id: coupon.id, used: false })
        toast.success(`Visit ${newCount} — 30% reward coupon sent!`)
      }
    } else {
      toast.success(delta > 0 ? '+1 visit added' : '1 visit removed')
    }
  }

  function openMsg(u) {
    setMsgModal(u)
    setMsgTitle('Message from HairGo')
    setMsgBody('')
  }

  async function sendMessage() {
    if (!msgBody.trim()) return toast.error('Please write a message')
    setSending(true)
    try {
      const title = msgTitle.trim() || 'Message from HairGo'
      const { data: ticket, error: te } = await supabase
        .from('tickets').insert({ user_id: msgModal.id, title, status: 'open', recipient_id: adminUser.id }).select().single()
      if (te) throw te
      const { error: me } = await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id, sender_id: adminUser.id, content: msgBody.trim(), is_from_admin: true, read: false,
      })
      if (me) throw me
      toast.success('Message sent — ticket created')
      setMsgModal(null)
      navigate('/studio/messages')
    } catch (err) { toast.error(err.message) }
    finally { setSending(false) }
  }

  function sendEmail(u) {
    if (!u.email) return toast.error('No email on file for this user')
    window.open(`mailto:${u.email}`, '_blank')
  }

  const byRole = role => all.filter(u => (u.role || 'user') === role)
  const list   = byRole(tab).filter(u =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone?.includes(search)
  )

  const isUsers = tab === 'user'
  const PER_PAGE = window.innerWidth < 768 ? 6 : 10
  const paged = list.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .usr-search:focus { border-color: ${C.goldBorder} !important; box-shadow: 0 0 0 3px rgba(var(--rgb-acc),0.08); }
        .usr-row:hover { background: rgba(var(--rgb-hi),0.02); }
        .usr-pts-add:hover  { background: ${C.goldBg} !important; color: ${C.gold} !important; }
        .usr-pts-sub:hover  { color: ${C.dim} !important; border-color: var(--col-text) !important; }
        .usr-msg-btn:hover  { background: rgba(96,165,250,0.15)  !important; border-color: rgba(96,165,250,0.4)  !important; color: #93c5fd !important; }
        .usr-mail-btn:hover { background: rgba(52,211,153,0.13)  !important; border-color: rgba(52,211,153,0.35) !important; color: #6ee7b7 !important; }
        .msg-inp:focus { border-color: ${C.goldBorder} !important; box-shadow: 0 0 0 3px rgba(var(--rgb-acc),0.08); }
        .modal-cancel:hover { border-color: var(--col-text) !important; color: ${C.dim} !important; }
        .usr-unlink-btn:hover { background: rgba(248,113,113,0.15) !important; border-color: rgba(248,113,113,0.4) !important; }
        .emp-sty-card:hover { border-color: rgba(96,165,250,0.4) !important; background: rgba(96,165,250,0.05) !important; }
        .emp-sty-card:hover .emp-sty-img { transform: scale(1.05); }
        .usr-mobile-cards { display: none; }
        @media (max-width: 767px) {
          .usr-desktop-table { display: none !important; }
          .usr-mobile-cards  { display: block !important; }
          .usr-top-row { flex-direction: column !important; align-items: stretch !important; gap: 0.5rem !important; }
          .usr-tabs { flex-wrap: wrap !important; }
          .usr-search-box { width: 100% !important; }
          .usr-search-box input { width: 100% !important; }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, marginBottom: '1.1rem', paddingBottom: '1.1rem', borderBottom: `1px solid ${C.border}` }}>
        <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.6rem,2.5vw,2.2rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.25rem' }}>Users</h1>
        <div style={{ display: 'flex', gap: 14 }}>
          {TABS.map(({ key, label }) => (
            <span key={key} style={{ fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', color: C.muted }}>
              <span style={{ color: ROLE_STYLE[key].color, fontWeight: 600 }}>{byRole(key).length}</span> {label.toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* ── Tabs + Search ───────────────────────────────────────── */}
      <div className="usr-top-row" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.875rem' }}>
        <div className="usr-tabs" style={{ display: 'flex', gap: 4 }}>
          {TABS.map(({ key, label }) => {
            const rs     = ROLE_STYLE[key]
            const active = tab === key
            return (
              <button key={key} onClick={() => { setTab(key); setSearch(''); setPage(0) }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 16px', borderRadius: 9, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: active ? 600 : 400, cursor: 'pointer', transition: 'all .15s', border: active ? `1px solid ${rs.border}` : `1px solid ${C.border}`, background: active ? rs.bg : 'transparent', color: active ? rs.color : C.muted }}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{byRole(key).length}</span>
                {label}
              </button>
            )
          })}
        </div>
        <div className="usr-search-box" style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder="Name, email or phone…"
            style={{ width: 220, background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '0.45rem 0.75rem 0.45rem 1.9rem', fontSize: '0.78rem', color: C.white, outline: 'none', fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box', transition: 'border-color .2s' }}
            className="usr-search" />
        </div>
      </div>

      {/* ── Table / Cards ──────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* Desktop table */}
        <div className="usr-desktop-table">
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(var(--rgb-hi),0.03)', borderBottom: `1px solid ${C.border}` }}>
                {['Client', 'Phone', ...(isUsers ? ['Visits'] : []), 'Role', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '0.65rem 1.1rem', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, textAlign: 'left', fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} style={{ padding: '0.75rem 1.1rem' }}>
                        <div style={{ height: 10, borderRadius: 4, width: j === 0 ? 130 : 70, background: C.subtle }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : list.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center' }}>
                  <Users size={28} style={{ margin: '0 auto 0.6rem', color: C.border, display: 'block' }} />
                  <p style={{ color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif' }}>
                    {search ? 'No results for your search' : `No ${TABS.find(t => t.key === tab)?.label.toLowerCase()} yet`}
                  </p>
                </td></tr>
              ) : paged.map(u => {
                const rs = ROLE_STYLE[u.role] || ROLE_STYLE.user
                return (
                  <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}` }} className="usr-row">

                    {/* Client */}
                    <td style={{ padding: '0.75rem 1.1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: rs.bg, border: `1px solid ${rs.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 12, color: rs.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{u.full_name?.[0]?.toUpperCase() || '?'}</span>
                        </div>
                        <div>
                          <p style={{ color: u.full_name ? C.white : C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontStyle: u.full_name ? 'normal' : 'italic' }}>{u.full_name || 'No name'}</p>
                          {u.email
                            ? <p style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: 1 }}>{u.email}</p>
                            : <p style={{ fontSize: '0.65rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontStyle: 'italic', marginTop: 1 }}>no email on file</p>
                          }
                        </div>
                      </div>
                    </td>

                    {/* Phone */}
                    <td style={{ padding: '0.75rem 1.1rem', color: C.muted, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif' }}>{u.phone || '—'}</td>

                    {/* Visits — users only */}
                    {isUsers && (
                      <td style={{ padding: '0.75rem 1.1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Star size={10} color={C.goldDim} />
                          <span style={{ color: C.dim, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{u.points || 0}</span>
                          <span style={{ color: 'var(--col-text)', fontSize: '0.7rem', fontFamily: 'DM Sans,sans-serif' }}>/ {Math.ceil(((u.points || 0) + 1) / 5) * 5}</span>
                        </div>
                      </td>
                    )}

                    {/* Role */}
                    <td style={{ padding: '0.75rem 1.1rem' }}>
                      <RoleSelector value={u.role || 'user'} onChange={newRole => changeRole(u.id, newRole)} />
                    </td>

                    {/* Joined */}
                    <td style={{ padding: '0.75rem 1.1rem', color: C.muted, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap' }}>
                      {u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy') : '—'}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.75rem 1.1rem' }}>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'nowrap' }}>
                        {/* +/- visits — users only */}
                        {isUsers && (
                          <>
                            <button onClick={() => adjustVisits(u.id, 1, u.points)} className="usr-pts-add"
                              style={{ padding: '4px 9px', borderRadius: 7, background: C.goldBg, border: `1px solid ${C.goldBorder}`, color: C.goldDim, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>+1</button>
                            <button onClick={() => adjustVisits(u.id, -1, u.points)} className="usr-pts-sub"
                              style={{ padding: '4px 9px', borderRadius: 7, background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>−1</button>
                            <div style={{ width: 1, height: 18, background: C.border, flexShrink: 0 }} />
                          </>
                        )}

                        {/* Message */}
                        <button onClick={() => openMsg(u)} className="usr-msg-btn"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 7, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap' }}>
                          <MessageCircle size={11} /> Message
                        </button>

                        {/* Email */}
                        <button onClick={() => sendEmail(u)} className="usr-mail-btn"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 7, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)', color: '#34d399', fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', opacity: u.email ? 1 : 0.3 }}>
                          <Mail size={11} /> Email
                        </button>

                        {/* Unlink stylist — employees only */}
                        {tab === 'artist' && (
                          <>
                            <div style={{ width: 1, height: 18, background: C.border, flexShrink: 0 }} />
                            <button onClick={() => unlinkStylist(u.id, u.full_name)} className="usr-unlink-btn"
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap' }}>
                              <Scissors size={9} /> Unlink
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </div>{/* end desktop table */}

        {/* Mobile cards */}
        <div className="usr-mobile-cards">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '1rem', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.06)', flexShrink: 0 }} />
                  <div>
                    <div style={{ height: 11, width: 130, background: 'rgba(var(--rgb-hi),0.06)', borderRadius: 4, marginBottom: 5 }} />
                    <div style={{ height: 9, width: 170, background: 'rgba(var(--rgb-hi),0.04)', borderRadius: 4 }} />
                  </div>
                </div>
              </div>
            ))
          ) : list.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '3rem', textAlign: 'center' }}>
              <Users size={24} style={{ margin: '0 auto 0.5rem', color: C.border, display: 'block' }} />
              <p style={{ color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif' }}>
                {search ? 'No results for your search' : `No ${TABS.find(t => t.key === tab)?.label.toLowerCase()} yet`}
              </p>
            </div>
          ) : paged.map(u => {
            const rs = ROLE_STYLE[u.role] || ROLE_STYLE.user
            return (
              <div key={u.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 8 }}>
                {/* Top */}
                <div style={{ padding: '0.875rem 1rem', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: rs.bg, border: `1px solid ${rs.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 14, color: rs.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{u.full_name?.[0]?.toUpperCase() || '?'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                      <p style={{ color: u.full_name ? C.white : C.muted, fontSize: '0.88rem', fontFamily: 'DM Sans,sans-serif', fontStyle: u.full_name ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{u.full_name || 'No name'}</p>
                      <RoleSelector value={u.role || 'user'} onChange={newRole => changeRole(u.id, newRole)} />
                    </div>
                    <p style={{ fontSize: '0.7rem', color: u.email ? C.muted : 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontStyle: u.email ? 'normal' : 'italic', marginBottom: 3 }}>{u.email || 'no email on file'}</p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {u.phone && <span style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>{u.phone}</span>}
                      {isUsers && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', color: C.dim, fontFamily: 'DM Sans,sans-serif' }}>
                          <Star size={9} color={C.goldDim} /> {u.points || 0} visits
                        </span>
                      )}
                      {u.created_at && <span style={{ fontSize: '0.65rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>Joined {format(new Date(u.created_at), 'MMM d, yyyy')}</span>}
                    </div>
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 5, padding: '0.625rem 1rem', borderTop: `1px solid ${C.border}`, background: 'rgba(var(--rgb-hi),0.01)', flexWrap: 'wrap' }}>
                  {isUsers && (
                    <>
                      <button onClick={() => adjustVisits(u.id, 1, u.points)} className="usr-pts-add"
                        style={{ padding: '5px 12px', borderRadius: 7, background: C.goldBg, border: `1px solid ${C.goldBorder}`, color: C.goldDim, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>+1</button>
                      <button onClick={() => adjustVisits(u.id, -1, u.points)} className="usr-pts-sub"
                        style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>−1</button>
                      <div style={{ width: 1, height: 18, background: C.border, alignSelf: 'center', flexShrink: 0 }} />
                    </>
                  )}
                  <button onClick={() => openMsg(u)} className="usr-msg-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap' }}>
                    <MessageCircle size={11} /> Message
                  </button>
                  <button onClick={() => sendEmail(u)} className="usr-mail-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)', color: '#34d399', fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', opacity: u.email ? 1 : 0.3 }}>
                    <Mail size={11} /> Email
                  </button>
                  {tab === 'artist' && (
                    <button onClick={() => unlinkStylist(u.id, u.full_name)} className="usr-unlink-btn"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap' }}>
                      <Scissors size={9} /> Unlink
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {!loading && <Pager page={page} total={list.length} perPage={PER_PAGE} onChange={setPage} />}

        <p style={{ fontSize: '0.68rem', color: C.muted, textAlign: 'center', marginTop: '0.75rem', fontFamily: 'DM Sans,sans-serif', opacity: 0.5 }}>
          Role changes take effect after the user's next sign-in. · Email only available for accounts registered after the email field was added.
        </p>
      </div>

      {/* ── Role-Change Password Modal ────────────────────────── */}
      {roleConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setRoleConfirm(null) }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 400, background: C.modal, border: `1px solid ${C.goldBorder}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.7)' }}>

            <div style={{ height: 3, background: 'linear-gradient(90deg,var(--col-acc),var(--col-acc2),rgba(var(--rgb-acc),0.15))' }} />

            <div style={{ padding: '1.75rem' }}>
              {/* Icon + title */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.goldBg, border: `1px solid ${C.goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <ShieldCheck size={22} color={C.gold} strokeWidth={1.5} />
                </div>
                <h2 className="font-display font-light" style={{ fontSize: '1.55rem', color: C.white, lineHeight: 1.1, marginBottom: '0.4rem' }}>
                  Confirm Role Change
                </h2>
                <p style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', lineHeight: 1.6 }}>
                  You're changing <span style={{ color: C.white }}>{roleConfirm.userName}</span>'s role to{' '}
                  <span style={{ color: ROLE_STYLE[roleConfirm.newRole]?.color }}>{roleConfirm.newRole}</span>.
                  <br />This cannot be undone without changing it back manually.
                </p>
              </div>

              {/* Linked stylist — only shown when demoting an artist */}
              {roleConfirm.linkedStylist && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 8 }}>
                    Linked artist profile
                  </p>

                  {/* Keep option */}
                  <button onClick={() => setDeleteStylist(false)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, marginBottom: 6, background: !deleteStylist ? 'rgba(52,211,153,0.06)' : 'rgba(var(--rgb-hi),0.02)', border: `1px solid ${!deleteStylist ? 'rgba(52,211,153,0.3)' : C.border}`, cursor: 'pointer', transition: 'all .15s', textAlign: 'left' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${!deleteStylist ? '#34d399' : 'var(--col-text)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                      {!deleteStylist && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399' }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.8rem', color: !deleteStylist ? 'var(--col-text)' : C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: !deleteStylist ? 600 : 400, lineHeight: 1.2 }}>
                        Keep <span style={{ color: !deleteStylist ? '#34d399' : C.muted }}>{roleConfirm.linkedStylist.name}</span>
                      </p>
                      <p style={{ fontSize: '0.68rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>Unlink the account but keep the profile for reassignment</p>
                    </div>
                  </button>

                  {/* Delete option */}
                  <button onClick={() => setDeleteStylist(true)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, background: deleteStylist ? 'rgba(248,113,113,0.06)' : 'rgba(var(--rgb-hi),0.02)', border: `1px solid ${deleteStylist ? 'rgba(248,113,113,0.35)' : C.border}`, cursor: 'pointer', transition: 'all .15s', textAlign: 'left' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${deleteStylist ? '#f87171' : 'var(--col-text)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                      {deleteStylist && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f87171' }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.8rem', color: deleteStylist ? 'var(--col-text)' : C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: deleteStylist ? 600 : 400, lineHeight: 1.2 }}>
                        Delete <span style={{ color: deleteStylist ? '#f87171' : C.muted }}>{roleConfirm.linkedStylist.name}</span>
                      </p>
                      <p style={{ fontSize: '0.68rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>Permanently remove the artist profile</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '0.625rem' }}>
                <button onClick={() => setRoleConfirm(null)} className="modal-cancel"
                  style={{ flex: 1, padding: '0.65rem', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}>
                  Cancel
                </button>
                <button onClick={applyRoleChange} disabled={confirming}
                  style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'linear-gradient(135deg,var(--col-acc),var(--col-acc2))', color: 'var(--col-bg)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: confirming ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: confirming ? 0.6 : 1, transition: 'all .2s' }}>
                  {confirming
                    ? <div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,.25)', borderTopcolor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                    : <><ShieldCheck size={14} /> Confirm Change</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Message Modal ─────────────────────────────────── */}
      {msgModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setMsgModal(null) }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 460, background: C.modal, border: `1px solid ${C.goldBorder}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.65)' }}>

            <div style={{ height: 3, background: 'linear-gradient(90deg,var(--col-acc),var(--col-acc2),rgba(var(--rgb-acc),0.15))' }} />

            <div style={{ padding: '1.5rem 1.75rem' }}>
              {/* Modal header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 4 }}>New Ticket</p>
                  <h2 className="font-display font-light" style={{ fontSize: '1.6rem', color: C.white, lineHeight: 1.1 }}>
                    {msgModal.full_name || 'Client'}
                  </h2>
                  {msgModal.email && (
                    <p style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: 3 }}>{msgModal.email}</p>
                  )}
                </div>
                <button onClick={() => setMsgModal(null)}
                  style={{ width: 32, height: 32, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all .2s' }}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {/* Subject */}
                <div>
                  <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }}>Subject</label>
                  <input value={msgTitle} onChange={e => setMsgTitle(e.target.value)} placeholder="Message from HairGo"
                    style={{ width: '100%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '0.55rem 0.8rem', fontSize: '0.85rem', color: C.white, outline: 'none', fontFamily: 'DM Sans,sans-serif', fontWeight: 300, boxSizing: 'border-box', transition: 'border-color .2s' }}
                    className="msg-inp" />
                </div>

                {/* Message */}
                <div>
                  <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }}>
                    Message <span style={{ color: C.gold }}>*</span>
                  </label>
                  <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} rows={5}
                    placeholder="Write your message to the client…"
                    style={{ width: '100%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '0.65rem 0.8rem', fontSize: '0.85rem', color: C.white, outline: 'none', fontFamily: 'DM Sans,sans-serif', fontWeight: 300, resize: 'none', boxSizing: 'border-box', transition: 'border-color .2s' }}
                    className="msg-inp" />
                </div>

                <p style={{ fontSize: '0.7rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.6 }}>
                  A support ticket will be created and the client will see it in their Messages page.
                </p>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '0.625rem' }}>
                  <button onClick={() => setMsgModal(null)} className="modal-cancel"
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}>
                    Cancel
                  </button>
                  <button onClick={sendMessage} disabled={sending}
                    style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'linear-gradient(135deg,var(--col-acc),var(--col-acc2))', color: 'var(--col-bg)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: sending ? 0.6 : 1, transition: 'all .2s' }}>
                    {sending
                      ? <div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,.25)', borderTopcolor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                      : <><Send size={13} /> Send & Open Ticket</>
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Employee Promotion Wizard ─────────────────────────── */}
      {empModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setEmpModal(null) }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: empStep === 2 ? 460 : 680, background: C.modal, border: '1px solid rgba(96,165,250,0.2)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 48px 120px rgba(0,0,0,0.8)', transition: 'max-width .3s ease' }}>

            <div style={{ height: 3, background: 'linear-gradient(90deg,#60a5fa,#3b82f6,rgba(96,165,250,0.1))' }} />

            <div style={{ padding: '1.75rem' }}>

              {/* Header + step indicator */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(96,165,250,0.55)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 4 }}>Promoting to Artist</p>
                  <h2 className="font-display font-light" style={{ fontSize: '1.6rem', color: C.white, lineHeight: 1.1 }}>
                    {empStep === 1 ? empModal.userName : 'Almost done'}
                  </h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  {[1, 2].map(n => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, transition: 'all .2s', background: empStep === n ? '#60a5fa' : empStep > n ? 'rgba(96,165,250,0.18)' : 'rgba(var(--rgb-hi),0.05)', color: empStep === n ? 'var(--col-bg)' : empStep > n ? '#60a5fa' : C.muted, border: empStep > n ? '1px solid rgba(96,165,250,0.3)' : 'none' }}>
                        {empStep > n ? <Check size={9} /> : n}
                      </div>
                      {n < 2 && <div style={{ width: 18, height: 1, background: empStep > n ? 'rgba(96,165,250,0.35)' : C.border }} />}
                    </div>
                  ))}
                </div>
              </div>

              {empStep === 1 ? (<>
                {/* ── Card grid ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.625rem', maxHeight: 340, overflowY: 'auto', marginBottom: empMode === 'create' ? '1rem' : 0, paddingRight: 2 }}>

                  {/* Existing stylist cards */}
                  {freeStylists.map(s => {
                    const sel = empMode === 'assign' && empSelected === s.id
                    return (
                      <button key={s.id} onClick={() => { setEmpMode('assign'); setEmpSelected(s.id); setEmpErr('') }}
                        className="emp-sty-card"
                        style={{ display: 'flex', alignItems: 'stretch', borderRadius: 14, overflow: 'hidden', border: `1px solid ${sel ? 'rgba(96,165,250,0.6)' : C.border}`, background: sel ? 'rgba(96,165,250,0.06)' : C.card, cursor: 'pointer', transition: 'all .18s', textAlign: 'left', padding: 0, position: 'relative', boxShadow: sel ? '0 0 0 1px rgba(96,165,250,0.25)' : 'none' }}>

                        {/* Photo */}
                        <div style={{ width: 76, flexShrink: 0, position: 'relative', overflow: 'hidden', background: 'var(--col-modal)' }}>
                          {s.photo_url
                            ? <img src={s.photo_url} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block', transition: 'transform .4s ease' }} className="emp-sty-img" />
                            : <div style={{ width: '100%', height: '100%', minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,rgba(96,165,250,0.06),rgba(59,130,246,0.03))' }}>
                                <Scissors size={22} color="rgba(96,165,250,0.2)" strokeWidth={1} />
                              </div>
                          }
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 55%, rgba(22,22,32,0.8))' }} />
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, padding: '0.75rem 0.875rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, minWidth: 0 }}>
                          <p className="font-display" style={{ color: sel ? C.white : C.dim, fontSize: '1rem', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color .15s' }}>{s.name}</p>
                          {s.title && <p style={{ color: sel ? 'var(--col-acc)' : C.muted, fontSize: '0.68rem', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.04em', transition: 'color .15s' }}>{s.title}</p>}
                        </div>

                        {/* Selected checkmark */}
                        {sel && (
                          <div style={{ position: 'absolute', top: 7, right: 7, width: 18, height: 18, borderRadius: '50%', background: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={10} color="var(--col-bg)" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    )
                  })}

                  {/* Create New card */}
                  <button onClick={() => { setEmpMode('create'); setEmpSelected(null); setEmpErr('') }}
                    className="emp-sty-card"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, border: `1px dashed ${empMode === 'create' ? 'rgba(96,165,250,0.5)' : 'rgba(var(--rgb-hi),0.12)'}`, background: empMode === 'create' ? 'rgba(96,165,250,0.05)' : 'transparent', cursor: 'pointer', transition: 'all .18s', minHeight: 80, padding: '0.875rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: empMode === 'create' ? 'rgba(96,165,250,0.15)' : C.subtle, border: `1px solid ${empMode === 'create' ? 'rgba(96,165,250,0.35)' : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .18s' }}>
                      <Plus size={14} color={empMode === 'create' ? '#60a5fa' : C.muted} />
                    </div>
                    <span style={{ fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, color: empMode === 'create' ? '#60a5fa' : C.muted, transition: 'color .15s' }}>Create New Stylist</span>
                  </button>
                </div>

                {/* Create form — shown when "Create New" is selected */}
                {empMode === 'create' && (
                  <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem', borderRadius: 12, background: 'rgba(96,165,250,0.04)', border: '1px solid rgba(96,165,250,0.12)', marginBottom: 0, alignItems: 'flex-start' }}>

                    {/* Photo picker */}
                    <input ref={empFileRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        if (!f.type.startsWith('image/')) { toast.error('Select an image file'); return }
                        if (f.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return }
                        setEmpPhoto(f)
                        setEmpPreview(URL.createObjectURL(f))
                        e.target.value = ''
                      }} />
                    <div style={{ flexShrink: 0 }}>
                      <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 5 }}>Photo</label>
                      <button type="button" onClick={() => empFileRef.current?.click()}
                        style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: `1px dashed ${empPreview ? 'rgba(96,165,250,0.5)' : 'var(--col-text)'}`, background: empPreview ? 'transparent' : 'rgba(var(--rgb-hi),0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, position: 'relative', transition: 'border-color .2s' }}>
                        {empPreview
                          ? <img src={empPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                          : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                              <Upload size={16} color="rgba(96,165,250,0.4)" strokeWidth={1.5} />
                              <span style={{ fontSize: 8, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.08em' }}>Upload</span>
                            </div>
                        }
                      </button>
                      {empPreview && (
                        <button type="button" onClick={() => { setEmpPhoto(null); setEmpPreview(null) }}
                          style={{ marginTop: 4, width: '100%', fontSize: 8, color: '#f87171', fontFamily: 'DM Sans,sans-serif', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}>
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Name + Title */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 5 }}>Name <span style={{ color: '#60a5fa' }}>*</span></label>
                        <input value={empName} onChange={e => { setEmpName(e.target.value); setEmpErr('') }} placeholder="Full name…" autoFocus
                          style={{ width: '100%', background: 'rgba(var(--rgb-hi),0.05)', border: '1px solid rgba(var(--rgb-hi),0.1)', borderRadius: 9, padding: '0.5rem 0.75rem', fontSize: '0.83rem', color: C.white, outline: 'none', fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box' }} className="msg-inp" />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 5 }}>Title</label>
                        <input value={empTitle} onChange={e => setEmpTitle(e.target.value)} placeholder="e.g. Senior Stylist…"
                          style={{ width: '100%', background: 'rgba(var(--rgb-hi),0.05)', border: '1px solid rgba(var(--rgb-hi),0.1)', borderRadius: 9, padding: '0.5rem 0.75rem', fontSize: '0.83rem', color: C.white, outline: 'none', fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box' }} className="msg-inp" />
                      </div>
                    </div>

                  </div>
                )}

                {empErr && <p style={{ fontSize: '0.72rem', color: '#f87171', fontFamily: 'DM Sans,sans-serif', marginTop: 8 }}>{empErr}</p>}

                <div style={{ display: 'flex', gap: '0.625rem', marginTop: '1.25rem' }}>
                  <button onClick={() => setEmpModal(null)}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={applyEmployeePromotion}
                    style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'linear-gradient(135deg,#60a5fa,#3b82f6)', color: 'var(--col-bg)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                    Next <ArrowRight size={13} />
                  </button>
                </div>
              </>) : (<>

                {/* ── Step 2: summary + password ── */}
                <div style={{ padding: '0.875rem 1rem', borderRadius: 12, background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <UserPlus size={13} color="#60a5fa" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', color: C.dim, fontFamily: 'DM Sans,sans-serif' }}>
                      <span style={{ color: C.white }}>{empModal.userName}</span> → Artist role
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Scissors size={13} color="#60a5fa" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', color: C.dim, fontFamily: 'DM Sans,sans-serif' }}>
                      {empMode === 'create'
                        ? <>Creating: <span style={{ color: C.white }}>{empName}{empTitle ? ` — ${empTitle}` : ''}</span></>
                        : <>Linked to: <span style={{ color: C.white }}>{freeStylists.find(s => s.id === empSelected)?.name}</span></>
                      }
                    </span>
                  </div>
                </div>

                {empErr && <p style={{ fontSize: '0.72rem', color: '#f87171', fontFamily: 'DM Sans,sans-serif', marginBottom: 12 }}>{empErr}</p>}

                <div style={{ display: 'flex', gap: '0.625rem' }}>
                  <button onClick={() => { setEmpStep(1); setEmpErr('') }}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer' }}>
                    ← Back
                  </button>
                  <button onClick={applyEmployeePromotion} disabled={empSaving}
                    style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'linear-gradient(135deg,#60a5fa,#3b82f6)', color: 'var(--col-bg)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: empSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: empSaving ? 0.6 : 1 }}>
                    {empSaving
                      ? <div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,.25)', borderTopcolor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                      : <><ShieldCheck size={14} /> Confirm & Promote</>
                    }
                  </button>
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
