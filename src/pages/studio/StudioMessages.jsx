import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Send, MessageSquare, CheckCircle, RotateCcw, Trash2, AlertTriangle, Store, Scissors, RefreshCw, Tag, Gift, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLogAction } from '../../hooks/useLogAction'
import {
  format, isToday, isYesterday, parseISO,
  addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isBefore, startOfDay, getDay,
} from 'date-fns'
import toast from 'react-hot-toast'
import { slotsForDay, toMins } from '../../lib/hours'

const C = {
  card: 'var(--col-modal)', gold: 'var(--col-acc)', goldDim: 'var(--col-acc)',
  goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)',
  border: 'rgba(var(--rgb-hi),0.07)', blue: '#60a5fa', blueBg: 'rgba(96,165,250,0.1)', blueBorder: 'rgba(96,165,250,0.22)',
  amber: '#f59e0b', amberBg: 'rgba(245,158,11,0.09)', amberBorder: 'rgba(245,158,11,0.25)',
  green: '#34d399', greenBg: 'rgba(52,211,153,0.08)', greenBorder: 'rgba(52,211,153,0.22)',
}

function timeFmt(d) {
  const date = new Date(d)
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMM d')
}

const FILTERS = ['All', 'Open', 'Closed']

export default function StudioMessages() {
  const { user, profile, isAdmin, isManager } = useAuth()
  const log = useLogAction()
  const [searchParams, setSearchParams] = useSearchParams()
  const [allTickets,     setAllTickets]    = useState([])
  const [selected,       setSelected]      = useState(null)
  const [messages,       setMessages]      = useState([])
  const [input,          setInput]         = useState('')
  const [loading,        setLoading]       = useState(true)
  const [filter,         setFilter]        = useState('All')
  const [tab,            setTab]           = useState('store')
  const [sending,        setSending]       = useState(false)
  const [toggling,       setToggling]      = useState(false)
  const [confirmDel,     setConfirmDel]    = useState(false)
  const [deleting,       setDeleting]      = useState(false)
  // Requests tab state
  const [stylists,       setStylists]      = useState([])
  const [reschedModal,      setReschedModal]     = useState(false)
  const [reschedDate,       setReschedDate]      = useState('')
  const [reschedTime,       setReschedTime]      = useState('')
  const [reschedStylist,    setReschedStylist]   = useState('')
  const [reschedWorking,    setReschedWorking]   = useState(false)
  const [reschedMonth,      setReschedMonth]     = useState(new Date())
  const [rBlockedDates,     setRBlockedDates]    = useState([])
  const [rStylistDayOffs,   setRStylistDayOffs]  = useState([])
  const [rTakenSlots,       setRTakenSlots]      = useState([])
  const [rBlockedHours,     setRBlockedHours]    = useState([])
  const [creditWorking,  setCreditWorking] = useState(false)
  const [couponModal,    setCouponModal]   = useState(false)
  const [couponCode,     setCouponCode]    = useState('')
  const [couponSending,  setCouponSending] = useState(false)
  const [requestsCount,  setRequestsCount] = useState(0)
  const bottomRef      = useRef(null)
  const selectedRef    = useRef(null)
  const loadTicketsRef = useRef(null)

  useEffect(() => {
    if (profile?.role === 'artist' || profile?.role === 'manager') setTab('direct')
  }, [profile?.role])

  useEffect(() => { selectedRef.current = selected }, [selected])

  // Keep ref in sync every render so the realtime handler always calls the latest loadTickets
  // (avoids stale-closure bug where tab/profile from first render are captured forever)
  loadTicketsRef.current = loadTickets

  useEffect(() => {
    loadTicketsRef.current()
    fetchRequestsCount()
    const sub = supabase.channel('studio-tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => { loadTicketsRef.current(); fetchRequestsCount() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages' }, payload => {
        const msg = payload.new
        if (selectedRef.current?.id === msg.ticket_id) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          supabase.from('ticket_messages').update({ read: true }).eq('id', msg.id)
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        }
        loadTicketsRef.current()
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  useEffect(() => {
    setSelected(null)
    setMessages([])
    if (tab === 'requests') loadStylists()
  }, [tab])

  useEffect(() => {
    if (!selected) return
    setMessages([])
    loadMessages(selected.id)
  }, [selected?.id])

  async function fetchRequestsCount() {
    const { count } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .not('appointment_id', 'is', null)
      .eq('status', 'open')
    setRequestsCount(count || 0)
  }

  async function loadStylists() {
    const { data } = await supabase.from('stylists').select('id, name').order('name')
    setStylists(data || [])
  }

  async function loadTickets() {
    const role = profile?.role
    let query = supabase
      .from('tickets')
      .select('*, user:profiles!user_id(full_name), recipient:profiles!recipient_id(full_name), appointments!appointment_id(id, date, time, payment_status, services(name, price, duration), stylists(id, name))')
      .order('updated_at', { ascending: false })

    if (role === 'artist') {
      query = query.eq('recipient_id', user.id)
    } else if (role === 'manager') {
      query = query.or(`recipient_id.eq.${user.id},recipient_id.is.null`)
    }
    // admin: no filter — sees everything

    const { data: tkts } = await query
    if (!tkts?.length) { setAllTickets([]); setLoading(false); return }

    const ids = tkts.map(t => t.id)
    const { data: msgs } = await supabase
      .from('ticket_messages')
      .select('ticket_id, content, created_at, read, is_from_admin')
      .in('ticket_id', ids)
      .order('created_at', { ascending: false })

    const meta = {}
    for (const m of (msgs || [])) {
      if (!meta[m.ticket_id]) meta[m.ticket_id] = { lastMsg: m.content, lastTime: m.created_at, unread: 0 }
      if (!m.read && !m.is_from_admin) meta[m.ticket_id].unread++
    }
    const enriched = tkts.map(t => ({ ...t, ...(meta[t.id] || {}) }))
    setAllTickets(enriched)
    setLoading(false)

    const paramId = searchParams.get('ticket')
    if (paramId && !selectedRef.current) {
      const match = enriched.find(t => t.id === paramId)
      if (match) {
        setSelected(match)
        setSearchParams({}, { replace: true })
      } else {
        const { data: direct } = await supabase
          .from('tickets')
          .select('*, user:profiles!user_id(full_name), recipient:profiles!recipient_id(full_name), appointments!appointment_id(id, date, time, payment_status, services(name, price, duration), stylists(id, name))')
          .eq('id', paramId)
          .single()
        if (direct) {
          const newTab = direct.appointment_id ? 'requests' : (direct.recipient_id ? 'direct' : 'store')
          setTab(newTab)
          setSelected(direct)
          setSearchParams({}, { replace: true })
        }
      }
    }
  }

  async function loadMessages(ticketId) {
    const { data } = await supabase
      .from('ticket_messages')
      .select('*, sender:profiles!sender_id(full_name, role)')
      .eq('ticket_id', ticketId)
      .order('created_at')
    setMessages(data || [])
    await supabase.from('ticket_messages')
      .update({ read: true }).eq('ticket_id', ticketId).eq('is_from_admin', false).eq('read', false)
    loadTicketsRef.current()
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function send(e) {
    e.preventDefault()
    if (!input.trim() || !selected || sending || !canReply) return
    setSending(true)
    const content = input.trim(); setInput('')
    const { data, error } = await supabase
      .from('ticket_messages')
      .insert({ ticket_id: selected.id, sender_id: user.id, content, is_from_admin: true, read: false })
      .select('*, sender:profiles!sender_id(full_name, role)').single()
    if (error) { setInput(content); toast.error('Failed to send') }
    else if (data) {
      setMessages(prev => [...prev, data])
      await supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', selected.id)
      loadTicketsRef.current()
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    setSending(false)
  }

  async function toggleStatus() {
    if (!selected || toggling) return
    setToggling(true)
    const newStatus = selected.status === 'open' ? 'closed' : 'open'
    const { error } = await supabase.from('tickets').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', selected.id)
    if (!error) {
      setSelected(prev => ({ ...prev, status: newStatus }))
      toast.success(`Ticket ${newStatus === 'closed' ? 'closed' : 'reopened'}`)
      log(newStatus === 'closed' ? 'ticket.closed' : 'ticket.reopened', {
        entityType: 'ticket', entityId: selected.id,
        details: { message: `${newStatus === 'closed' ? 'closed' : 'reopened'} ticket "${selected.title}" (${selected.user?.full_name || 'client'})` },
      })
      loadTicketsRef.current()
      fetchRequestsCount()
    }
    setToggling(false)
  }

  async function deleteTicket() {
    if (!selected || deleting) return
    setDeleting(true)
    const { error } = await supabase.from('tickets').delete().eq('id', selected.id)
    if (!error) {
      setConfirmDel(false); setSelected(null); setMessages([])
      toast.success('Ticket deleted')
      loadTicketsRef.current(); fetchRequestsCount()
    } else { toast.error('Failed to delete ticket') }
    setDeleting(false)
  }

  async function handleCancelOnly() {
    if (!selected?.appointment_id || creditWorking) return
    setCreditWorking(true)
    try {
      const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', selected.appointment_id)
      if (error) throw error
      await supabase.from('ticket_messages').insert({
        ticket_id: selected.id, sender_id: user.id,
        content: 'Your appointment has been cancelled. Please contact us if you have any questions.',
        is_from_admin: true, read: false
      })
      toast.success('Appointment cancelled')
      loadTicketsRef.current(); fetchRequestsCount(); loadMessages(selected.id)
    } catch { toast.error('Failed to cancel') }
    setCreditWorking(false)
  }

  async function handleIssueCredit() {
    if (!selected?.appointment_id || creditWorking) return
    setCreditWorking(true)
    try {
      const { error } = await supabase.functions.invoke('process-refund', {
        body: { type: 'cancel-with-credit', id: selected.appointment_id }
      })
      if (error) {
        const body = await error.context?.json?.().catch(() => null)
        throw new Error(body?.error || 'Failed to issue credit')
      }
      await supabase.from('ticket_messages').insert({
        ticket_id: selected.id, sender_id: user.id,
        content: '✓ Your appointment has been cancelled and store credit has been issued to your account.',
        is_from_admin: true, read: false
      })
      toast.success('Credit issued & appointment cancelled')
      loadTicketsRef.current(); fetchRequestsCount(); loadMessages(selected.id)
    } catch (err) { toast.error(err.message || 'Failed to issue credit') }
    setCreditWorking(false)
  }

  // Load global blocked dates when modal opens
  useEffect(() => {
    if (!reschedModal) return
    supabase.from('blocked_dates').select('date').is('stylist_id', null).eq('status', 'approved')
      .then(({ data }) => setRBlockedDates((data || []).map(b => b.date)))
  }, [reschedModal])

  // Load stylist day-offs when stylist changes
  useEffect(() => {
    if (!reschedModal || !reschedStylist) { setRStylistDayOffs([]); return }
    supabase.from('blocked_dates').select('date').eq('stylist_id', reschedStylist).eq('status', 'approved')
      .then(({ data }) => setRStylistDayOffs((data || []).map(d => d.date)))
  }, [reschedStylist, reschedModal])

  // Load taken slots when date + stylist are set
  useEffect(() => {
    if (!reschedModal || !reschedDate || !reschedStylist) { setRTakenSlots([]); setRBlockedHours([]); return }
    const apptId   = selected?.appointment_id
    const duration = selected?.appointments?.services?.duration || 60
    const daySlots = slotsForDay(new Date(reschedDate + 'T00:00:00'), duration)
    Promise.all([
      (async () => {
        let q = supabase.from('appointments').select('time, duration_minutes').eq('stylist_id', reschedStylist).eq('date', reschedDate).neq('status', 'cancelled')
        if (apptId) q = q.neq('id', apptId)
        return q
      })(),
      supabase.from('blocked_hours').select('hour').eq('date', reschedDate).or(`stylist_id.eq.${reschedStylist},stylist_id.is.null`),
    ]).then(([{ data: appts }, { data: hours }]) => {
      const takenSet = new Set()
      for (const appt of (appts || [])) {
        const [ah, am] = appt.time.slice(0, 5).split(':').map(Number)
        const apptStart = ah * 60 + am
        const apptEnd   = apptStart + (appt.duration_minutes || 60)
        for (const slot of daySlots) {
          const [sh, sm] = slot.split(':').map(Number)
          const slotStart = sh * 60 + sm
          const slotEnd   = slotStart + duration
          if (slotStart < apptEnd && slotEnd > apptStart) takenSet.add(slot)
        }
      }
      setRTakenSlots([...takenSet])
      setRBlockedHours((hours || []).map(h => h.hour))
    })
  }, [reschedDate, reschedStylist, reschedModal])

  async function handleReschedule() {
    if (!selected?.appointment_id || !reschedDate || !reschedTime || reschedWorking) return
    setReschedWorking(true)
    try {
      // Fetch full old appointment to copy its fields
      const { data: old, error: fetchErr } = await supabase
        .from('appointments')
        .select('user_id, service_id, stylist_id, payment_status, payment_intent_id, notes, guest_name, guest_email, guest_phone, final_price, discount_amount, coupon_id')
        .eq('id', selected.appointment_id)
        .single()
      if (fetchErr) throw fetchErr

      // Create the new appointment first — if this fails we leave the old one untouched
      const newRow = {
        user_id:          old.user_id,
        service_id:       old.service_id,
        stylist_id:       reschedStylist || old.stylist_id,
        date:             reschedDate,
        time:             reschedTime,
        status:           'confirmed',
        payment_status:   old.payment_status,
        payment_intent_id: old.payment_intent_id,
        notes:            old.notes,
        guest_name:       old.guest_name,
        guest_email:      old.guest_email,
        guest_phone:      old.guest_phone,
        final_price:      old.final_price,
        discount_amount:  old.discount_amount,
        coupon_id:        old.coupon_id,
      }
      const { data: newAppt, error: insertErr } = await supabase
        .from('appointments').insert(newRow).select('id').single()
      if (insertErr?.code === '23505' || insertErr?.code === '23P01') throw new Error('That time overlaps another booking for this stylist')
      if (insertErr) throw insertErr

      // Cancel the old appointment only after the new one is confirmed. The
      // payment now belongs to the new booking, so the old one stops counting as paid.
      await supabase.from('appointments').update({
        status: 'cancelled',
        ...(old.payment_status === 'paid' ? { payment_status: 'rescheduled' } : {}),
      }).eq('id', selected.appointment_id)

      // Point the ticket at the new appointment
      await supabase.from('tickets').update({ appointment_id: newAppt.id }).eq('id', selected.id)

      const stylistName = stylists.find(s => s.id === (reschedStylist || old.stylist_id))?.name
      const dateStr = new Date(reschedDate + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', month: 'long', day: 'numeric' })
      await supabase.from('ticket_messages').insert({
        ticket_id: selected.id, sender_id: user.id,
        content: `✓ Your appointment has been rescheduled to ${dateStr} at ${reschedTime}${stylistName ? ` with ${stylistName}` : ''}.`,
        is_from_admin: true, read: false,
      })
      await supabase.from('tickets').update({ status: 'closed' }).eq('id', selected.id)
      setSelected(prev => ({ ...prev, status: 'closed' }))
      setReschedModal(false)
      toast.success('Appointment rescheduled')
      loadTicketsRef.current(); fetchRequestsCount(); loadMessages(selected.id)
    } catch (err) { toast.error(err.message || 'Failed to reschedule') }
    setReschedWorking(false)
  }

  async function handleGiveCoupon() {
    if (!selected || !couponCode.trim() || couponSending) return
    setCouponSending(true)
    try {
      // Attach the coupon to the client's account so personal codes work too
      const code = couponCode.trim().toUpperCase()
      const { data: coupon } = await supabase.from('coupons').select('id, active').eq('code', code).maybeSingle()
      if (!coupon) throw new Error('No coupon with that code')
      if (!coupon.active) throw new Error('That coupon is not active')
      if (selected.user_id) {
        const { error: ucErr } = await supabase.from('user_coupons')
          .upsert({ user_id: selected.user_id, coupon_id: coupon.id, used: false, granted_by: 'admin' }, { onConflict: 'user_id,coupon_id' })
        if (ucErr) throw ucErr
      }
      await supabase.from('ticket_messages').insert({
        ticket_id: selected.id, sender_id: user.id,
        content: `🎁 Here's a coupon code just for you: ${code} — it's been added to your account. Apply it at checkout on your next booking.`,
        is_from_admin: true, read: false
      })
      await supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', selected.id)
      setCouponModal(false); setCouponCode('')
      toast.success('Coupon sent to client')
      loadMessages(selected.id); loadTicketsRef.current()
    } catch (err) { toast.error(err.message || 'Failed to send coupon') }
    setCouponSending(false)
  }

  const canReply = selected && selected.status === 'open' && (
    selected.recipient_id === user?.id ||
    ((isAdmin || isManager) && !selected.recipient_id)
  )

  const tickets = (() => {
    if (profile?.role === 'artist') return allTickets
    if (tab === 'store')    return allTickets.filter(t => !t.recipient_id && !t.appointment_id)
    if (tab === 'direct')   return allTickets.filter(t => t.recipient_id === user?.id)
    if (tab === 'requests') return allTickets.filter(t => !!t.appointment_id)
    return allTickets
  })()

  const totalUnread = allTickets.reduce((sum, t) => sum + (t.unread || 0), 0)
  const storeUnread = allTickets.filter(t => !t.recipient_id && !t.appointment_id).reduce((sum, t) => sum + (t.unread || 0), 0)
  const directUnread = allTickets.filter(t => t.recipient_id === user?.id).reduce((sum, t) => sum + (t.unread || 0), 0)
  const filtered = tickets.filter(t => filter === 'All' || t.status === filter.toLowerCase())
  const isRequestsTab = tab === 'requests'

  return (
    <div className="sm-root" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .send-inp:focus { border-color: ${C.goldBorder} !important; outline: none; box-shadow: 0 0 0 3px rgba(var(--rgb-acc),0.07); }
        .send-inp::placeholder { color: var(--col-text); }
        .tk-row:hover { background: rgba(var(--rgb-hi),0.025) !important; }
        .btn-g:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(var(--rgb-acc),0.25); }
        .sm-modal-inp:focus { border-color: ${C.amberBorder} !important; outline: none; box-shadow: 0 0 0 3px rgba(245,158,11,0.07); }
        .sm-modal-inp::placeholder { color: var(--col-text); opacity: 0.5; }
        @media (min-width: 1200px) {
          .sm-root { height: calc(100vh - 50px - 3.5rem) !important; }
        }
        @media (max-width: 767px) {
          .msg-layout { grid-template-columns: 1fr !important; grid-template-rows: 1fr; }
          .msg-list-panel, .msg-chat-panel { grid-row: 1; }
          .msg-has-chat .msg-list-panel { display: none !important; }
          .msg-layout:not(.msg-has-chat) .msg-chat-panel { display: none !important; }
          .msg-back-btn { display: flex !important; }
          .msg-hdr-wrap { flex-direction: column !important; gap: 8px !important; align-items: flex-start !important; }
          .hdr-actions  { flex-wrap: wrap !important; gap: 4px !important; width: 100% !important; margin-right: 0 !important; }
          .hdr-actions button { flex: 1 1 auto !important; justify-content: center !important; min-width: 0 !important; }
          .msg-hdr-appt { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: '1rem', paddingBottom: '1rem', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.6rem,2.5vw,2.2rem)', color: C.white, lineHeight: 1.1 }}>Messages</h1>
            {totalUnread > 0 && (
              <span style={{ padding: '2px 9px', borderRadius: 20, background: '#ef4444', fontSize: 9, color: '#fff', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>
                {totalUnread} new
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '5px 14px', borderRadius: 20, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', background: filter === f ? C.goldBg : 'transparent', border: `1px solid ${filter === f ? C.goldBorder : C.border}`, color: filter === f ? C.gold : C.muted }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs — admin / manager */}
        {(isAdmin || isManager) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'store',    Icon: Store,      label: 'Store',           color: C.gold,  bg: C.goldBg,  border: C.goldBorder, badge: storeUnread },
              { key: 'direct',   Icon: Scissors,   label: 'My Messages',     color: C.blue,  bg: C.blueBg,  border: C.blueBorder, badge: directUnread },
              { key: 'requests', Icon: RefreshCw,  label: 'Client Requests', color: C.amber, bg: C.amberBg, border: C.amberBorder, badge: requestsCount },
            ].map(({ key, Icon, label, color, bg, border, badge }) => (
              <button key={key} onClick={() => setTab(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 9, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: tab === key ? 600 : 400, cursor: 'pointer', transition: 'all .15s', background: tab === key ? bg : 'transparent', border: `1px solid ${tab === key ? border : C.border}`, color: tab === key ? color : C.muted }}>
                <Icon size={12} strokeWidth={tab === key ? 2.5 : 1.5} />
                {label}
                {badge > 0 && (
                  <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, padding: '0 4px' }}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`msg-layout${selected ? ' msg-has-chat' : ''}`} style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '0.75rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Ticket list ──────────────────────────────────── */}
        <div className="msg-list-panel" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '0.65rem 0.875rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
              {filter === 'All' ? `${filtered.length} tickets` : `${filtered.length} ${filter.toLowerCase()}`}
            </p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading ? (
              <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 60, borderRadius: 8, background: 'rgba(var(--rgb-hi),0.03)' }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '1.5rem', textAlign: 'center' }}>
                <MessageSquare size={20} color={C.border} style={{ marginBottom: 8 }} />
                <p style={{ color: C.muted, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif' }}>
                  {isRequestsTab ? 'No appointment requests' : `No ${filter !== 'All' ? filter.toLowerCase() + ' ' : ''}tickets`}
                </p>
              </div>
            ) : filtered.map(tk => {
              const isActive = selected?.id === tk.id
              const isOpen = tk.status === 'open'
              const clientInitial = (tk.user?.full_name || 'U')[0].toUpperCase()
              const isAppt = !!tk.appointment_id
              return (
                <button key={tk.id} className="tk-row" onClick={() => setSelected(tk)}
                  style={{ width: '100%', textAlign: 'left', padding: '0.65rem 0.75rem', display: 'flex', alignItems: 'flex-start', gap: 9, background: isActive ? (isAppt ? C.amberBg : C.goldBg) : 'transparent', border: 'none', borderLeft: `2px solid ${isActive ? (isAppt ? C.amber : C.gold) : 'transparent'}`, borderBottom: '1px solid rgba(var(--rgb-hi),0.04)', cursor: 'pointer', transition: 'background .15s' }}>
                  <div style={{ position: 'relative', flexShrink: 0, marginTop: 1 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: isAppt ? 'rgba(245,158,11,0.13)' : 'linear-gradient(135deg, rgba(96,165,250,0.22), rgba(139,92,246,0.12))', border: `1px solid ${isAppt ? C.amberBorder : 'rgba(96,165,250,0.18)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, color: isAppt ? C.amber : 'rgba(96,165,250,0.85)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{clientInitial}</span>
                    </div>
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderRadius: '50%', background: isOpen ? '#34d399' : 'var(--col-text)', border: '1.5px solid #161620', boxShadow: isOpen ? '0 0 5px rgba(52,211,153,0.4)' : 'none' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <p style={{ fontSize: '0.77rem', color: isActive ? C.white : 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: isActive ? 600 : 400, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}>
                        {tk.user?.full_name || 'User'}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4, flexShrink: 0 }}>
                        {tk.unread > 0 && (
                          <span style={{ minWidth: 15, height: 15, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, padding: '0 4px' }}>
                            {tk.unread}
                          </span>
                        )}
                        {tk.lastTime && <span style={{ fontSize: 8, color: C.muted, fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap' }}>{timeFmt(tk.lastTime)}</span>}
                      </div>
                    </div>
                    <p style={{ fontSize: '0.7rem', color: isAppt ? C.amber : C.goldDim, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginBottom: isRequestsTab && tk.appointments?.services?.name ? 3 : 0 }}>
                      {tk.title}
                    </p>
                    {isRequestsTab && tk.appointments?.services?.name && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 20, background: C.amberBg, border: `1px solid ${C.amberBorder}` }}>
                        <div style={{ width: 3, height: 3, borderRadius: '50%', background: C.amber, flexShrink: 0 }} />
                        <span style={{ fontSize: 8, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, color: C.amber, whiteSpace: 'nowrap' }}>
                          {tk.appointments.services.name}{tk.appointments.date ? ` · ${tk.appointments.date}` : ''}
                        </span>
                      </span>
                    )}
                    {(isAdmin || isManager) && tab === 'direct' && tk.recipient?.full_name && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 20, background: C.blueBg, border: `1px solid ${C.blueBorder}` }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.blue, flexShrink: 0 }} />
                        <span style={{ fontSize: 8, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, color: 'rgba(96,165,250,0.75)', whiteSpace: 'nowrap' }}>
                          {tk.recipient.full_name}
                        </span>
                      </span>
                    )}
                    {!isAdmin && !isManager && (
                      <p style={{ fontSize: '0.65rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{tk.lastMsg || '—'}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Thread ───────────────────────────────────────── */}
        <div className="msg-chat-panel" style={{ background: C.card, border: `1px solid ${isRequestsTab ? C.amberBorder : C.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: isRequestsTab ? C.amberBg : 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${isRequestsTab ? C.amberBorder : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isRequestsTab ? <RefreshCw size={18} color={C.amber} /> : <MessageSquare size={18} color={C.border} />}
              </div>
              <p style={{ color: C.dim, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif' }}>
                {isRequestsTab ? 'Select a request to review' : 'Select a ticket'}
              </p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ position: 'relative', padding: '0.75rem 1rem', paddingRight: '3.5rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: isRequestsTab ? 'linear-gradient(180deg, rgba(245,158,11,0.04) 0%, transparent 100%)' : 'linear-gradient(180deg, rgba(var(--rgb-hi),0.02) 0%, transparent 100%)' }}>
                {/* Close / Reopen — top-right corner */}
                <button onClick={toggleStatus} disabled={toggling} className="btn-g"
                  style={{ position: 'absolute', top: '0.75rem', right: '1rem', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: toggling ? 'not-allowed' : 'pointer', transition: 'all .2s', opacity: toggling ? 0.6 : 1, whiteSpace: 'nowrap', ...(selected.status === 'open' ? { background: 'rgba(248,113,113,0.12)', color: '#f87171' } : { background: 'rgba(52,211,153,0.1)', color: '#34d399' }) }}>
                  {selected.status === 'open' ? <><CheckCircle size={11} /> Close</> : <><RotateCcw size={11} /> Reopen</>}
                </button>
                <div className="msg-hdr-wrap" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                  <button onClick={() => setSelected(null)} className="msg-back-btn"
                    style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(var(--rgb-hi),0.06)', border: `1px solid ${C.border}`, color: C.dim, cursor: 'pointer', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: C.white, fontSize: '1.05rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginBottom: 4 }}>
                      {selected.user?.full_name || 'Client'}
                    </p>
                    {isRequestsTab && selected.appointments ? (
                      <div style={{ marginBottom: 5 }}>
                        <p style={{ fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginBottom: 2 }}>
                          {[selected.appointments.services?.name, selected.appointments.stylists?.name && `with ${selected.appointments.stylists.name}`].filter(Boolean).join(' ')}
                        </p>
                        <p className="msg-hdr-appt" style={{ fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', color: C.amber, fontWeight: 500 }}>
                          {selected.appointments.date ? new Date(selected.appointments.date + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}
                          {selected.appointments.time ? ` · ${selected.appointments.time.slice(0, 5)}` : ''}
                        </p>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginBottom: 5 }}>
                        {selected.title}
                      </p>
                    )}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: selected.status === 'open' ? '#34d399' : 'var(--col-text)', boxShadow: selected.status === 'open' ? '0 0 5px rgba(52,211,153,0.4)' : 'none', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', color: selected.status === 'open' ? 'rgba(52,211,153,0.85)' : 'var(--col-text)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>{selected.status}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="hdr-actions" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginRight: '-3rem' }}>
                    {/* Client Requests extras */}
                    {isRequestsTab && (isAdmin || isManager) && selected.appointment_id && (
                      <>
                        <button
                          onClick={() => {
                            setReschedDate(selected.appointments?.date || '')
                            setReschedTime(selected.appointments?.time?.slice(0,5) || '')
                            setReschedStylist(selected.appointments?.stylists?.id || '')
                            setReschedMonth(selected.appointments?.date ? parseISO(selected.appointments.date) : new Date())
                            setRTakenSlots([])
                            setRBlockedHours([])
                            setReschedModal(true)
                          }}
                          className="btn-g"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '5px 11px', minWidth: 100, borderRadius: 8, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: `1px solid ${C.amberBorder}`, background: C.amberBg, color: C.amber, cursor: 'pointer', transition: 'all .2s', whiteSpace: 'nowrap' }}>
                          <RefreshCw size={11} /> Reschedule
                        </button>
                        {selected.appointments?.payment_status === 'paid' ? (
                          <button onClick={handleIssueCredit} disabled={creditWorking} className="btn-g"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '5px 11px', minWidth: 100, borderRadius: 8, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: `1px solid ${C.greenBorder}`, background: C.greenBg, color: C.green, cursor: creditWorking ? 'not-allowed' : 'pointer', transition: 'all .2s', opacity: creditWorking ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                            {creditWorking
                              ? <div style={{ width: 11, height: 11, border: `2px solid ${C.green}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                              : <><Tag size={11} /> Issue Credit</>}
                          </button>
                        ) : (
                          <button onClick={handleCancelOnly} disabled={creditWorking} className="btn-g"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '5px 11px', minWidth: 100, borderRadius: 8, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: '1px solid rgba(248,113,113,0.28)', background: 'rgba(248,113,113,0.1)', color: '#f87171', cursor: creditWorking ? 'not-allowed' : 'pointer', transition: 'all .2s', opacity: creditWorking ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                            {creditWorking
                              ? <div style={{ width: 11, height: 11, border: '2px solid #f87171', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                              : 'Cancel'}
                          </button>
                        )}
                      </>
                    )}
                    {isAdmin && (
                      <button onClick={() => setConfirmDel(true)} className="btn-g"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171', cursor: 'pointer', transition: 'all .2s', flexShrink: 0 }}
                        title="Delete ticket">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', background: 'var(--col-bg2)' }}>
                {messages.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: C.muted, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', fontStyle: 'italic' }}>No messages yet</p>
                  </div>
                ) : messages.map((msg, i) => {
                  const isMe = msg.is_from_admin
                  const showDate = i === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[i - 1].created_at).toDateString()
                  const prevSame = i > 0 && !!messages[i-1].is_from_admin === !!msg.is_from_admin
                  const clientInitial = (selected.user?.full_name || 'C')[0].toUpperCase()
                  const senderName = isMe ? (msg.sender?.full_name || 'Store') : (selected.user?.full_name || 'Client')
                  return (
                    <div key={msg.id} style={{ marginBottom: 2 }}>
                      {showDate && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0.75rem 0' }}>
                          <div style={{ flex: 1, height: 1, background: 'rgba(var(--rgb-hi),0.05)' }} />
                          <span style={{ fontSize: 8, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap', padding: '2px 10px', borderRadius: 20, background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.06)' }}>
                            {isToday(new Date(msg.created_at)) ? 'Today' : isYesterday(new Date(msg.created_at)) ? 'Yesterday' : format(new Date(msg.created_at), 'MMMM d')}
                          </span>
                          <div style={{ flex: 1, height: 1, background: 'rgba(var(--rgb-hi),0.05)' }} />
                        </div>
                      )}
                      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
                        style={{ display: 'flex', alignItems: 'flex-end', gap: 7, justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: prevSame ? 2 : 8 }}>
                        {!isMe && (
                          <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, rgba(96,165,250,0.22), rgba(139,92,246,0.12))', border: '1px solid rgba(96,165,250,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 10, color: 'rgba(96,165,250,0.85)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{clientInitial}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 4, maxWidth: '68%' }}>
                          {!prevSame && (
                            <span style={{ fontSize: 9, color: isMe ? C.goldDim : 'rgba(96,165,250,0.6)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.06em', paddingLeft: isMe ? 0 : 3, paddingRight: isMe ? 3 : 0 }}>
                              {senderName}
                            </span>
                          )}
                          <div style={{ padding: '0.55rem 0.95rem', borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px', fontSize: '0.82rem', lineHeight: 1.6, fontFamily: 'DM Sans,sans-serif', ...(isMe ? { background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontWeight: 500, boxShadow: '0 4px 14px rgba(var(--rgb-acc),0.2)' } : { background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.14)', color: 'var(--col-text)', backdropFilter: 'blur(4px)' }) }}>
                            {msg.content}
                          </div>
                          <span style={{ fontSize: 9, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', paddingLeft: isMe ? 0 : 3, paddingRight: isMe ? 3 : 0 }}>
                            {format(new Date(msg.created_at), 'HH:mm')}
                          </span>
                        </div>
                      </motion.div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '0.75rem 0.875rem', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                {!canReply ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle size={13} color="var(--col-text)" />
                    <p style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                      {selected.status === 'closed'
                        ? 'This ticket is closed. Reopen to reply.'
                        : 'Only the assigned artist can reply to this ticket.'}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={send} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 11, padding: '0.3rem 0.3rem 0.3rem 0.75rem', transition: 'border-color .2s' }}
                    onFocus={e => e.currentTarget.style.borderColor = C.goldBorder}
                    onBlur={e => e.currentTarget.style.borderColor = C.border}>
                    <input value={input} onChange={e => setInput(e.target.value)} placeholder={`Reply as ${profile?.full_name || 'you'}…`} className="send-inp"
                      style={{ flex: 1, background: 'transparent', border: 'none', padding: '0.3rem 0', fontSize: '0.82rem', color: C.white, fontFamily: 'DM Sans,sans-serif', outline: 'none' }} />
                    <button type="submit" disabled={!input.trim() || sending} className="btn-g"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.4rem 0.8rem', borderRadius: 8, background: input.trim() ? `linear-gradient(135deg,${C.gold},var(--col-acc2))` : 'rgba(var(--rgb-hi),0.06)', color: input.trim() ? 'var(--col-bg)' : 'var(--col-text)', fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: !input.trim() || sending ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'all .2s', letterSpacing: '0.08em' }}>
                      {sending ? <div style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,.2)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> : <><Send size={11} /> Send</>}
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Delete modal ──────────────────────────────── */}
      <AnimatePresence>
        {confirmDel && selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
            onClick={() => !deleting && setConfirmDel(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.93, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.93 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 380, background: 'var(--col-card)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
              <div style={{ height: 3, background: 'linear-gradient(90deg, #f87171, rgba(248,113,113,0.3))' }} />
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AlertTriangle size={17} color="#f87171" />
                  </div>
                  <div>
                    <p style={{ color: C.white, fontSize: '0.9rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, marginBottom: 2 }}>Delete ticket?</p>
                    <p style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>This action cannot be undone</p>
                  </div>
                </div>
                <div style={{ padding: '0.7rem 0.875rem', borderRadius: 9, background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.12)', marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>{selected.title}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', marginTop: 3 }}>All messages in this thread will be permanently removed.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => setConfirmDel(false)} disabled={deleting}
                    style={{ flex: 1, padding: '0.6rem', borderRadius: 9, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', cursor: deleting ? 'not-allowed' : 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={deleteTicket} disabled={deleting}
                    style={{ flex: 1, padding: '0.6rem', borderRadius: 9, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: deleting ? 0.5 : 1 }}>
                    {deleting ? <div style={{ width: 13, height: 13, border: '2px solid rgba(248,113,113,0.3)', borderTopColor: '#f87171', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> : <><Trash2 size={13} /> Delete</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Give Coupon modal ─────────────────────────── */}
      <AnimatePresence>
        {couponModal && selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
            onClick={() => !couponSending && setCouponModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 400, background: 'var(--col-modal)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>
              <div style={{ height: 3, background: 'linear-gradient(90deg, #a78bfa, rgba(167,139,250,0.3))' }} />
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <div>
                    <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#a78bfa', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 4 }}>Client Requests</p>
                    <h3 style={{ color: C.white, fontFamily: '"Cormorant Garamond",serif', fontSize: '1.35rem', fontWeight: 500 }}>Give Coupon</h3>
                  </div>
                  <button onClick={() => setCouponModal(false)} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <X size={13} />
                  </button>
                </div>
                <p style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginBottom: '1rem', lineHeight: 1.55 }}>
                  Enter a coupon code to send to <strong style={{ color: C.white }}>{selected.user?.full_name || 'the client'}</strong>. It will appear as a message in this thread.
                </p>
                <label style={{ display: 'block', marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }}>Coupon Code</p>
                  <input
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') handleGiveCoupon() }}
                    placeholder="e.g. WELCOME20"
                    className="sm-modal-inp"
                    style={{ width: '100%', padding: '0.7rem 0.875rem', borderRadius: 9, background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, color: C.white, fontSize: '1rem', fontFamily: 'DM Mono, monospace', fontWeight: 600, letterSpacing: '0.1em', boxSizing: 'border-box', transition: 'border-color .2s, box-shadow .2s' }}
                    autoFocus
                  />
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setCouponModal(false)} disabled={couponSending}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 9, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', cursor: couponSending ? 'not-allowed' : 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={handleGiveCoupon} disabled={!couponCode.trim() || couponSending}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 9, border: 'none', background: couponCode.trim() ? 'linear-gradient(135deg, #a78bfa, rgba(167,139,250,0.7))' : 'rgba(var(--rgb-hi),0.06)', color: couponCode.trim() ? 'var(--col-bg)' : C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: couponCode.trim() && !couponSending ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: couponSending ? 0.6 : 1 }}>
                    {couponSending
                      ? <><div style={{ width: 13, height: 13, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> Sending…</>
                      : <><Gift size={13} /> Send Coupon</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reschedule modal ──────────────────────────── */}
      <AnimatePresence>
        {reschedModal && selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
            onClick={() => !reschedWorking && setReschedModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 540, background: 'var(--col-modal)', border: `1px solid ${C.amberBorder}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', maxHeight: '92dvh', overflowY: 'auto' }}>
              <div style={{ height: 3, background: 'linear-gradient(90deg, #f59e0b, rgba(245,158,11,0.3))' }} />
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <div>
                    <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.amber, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 4 }}>Client Requests</p>
                    <h3 style={{ color: C.white, fontFamily: '"Cormorant Garamond",serif', fontSize: '1.35rem', fontWeight: 500 }}>Reschedule</h3>
                  </div>
                  <button onClick={() => setReschedModal(false)} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <X size={13} />
                  </button>
                </div>

                {selected.appointments && (
                  <div style={{ padding: '0.625rem 0.875rem', borderRadius: 10, background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, marginBottom: '1.25rem' }}>
                    <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginBottom: 4 }}>Currently booked</p>
                    <p style={{ fontSize: '0.85rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>
                      {selected.appointments.services?.name}
                      {selected.appointments.date ? ` · ${selected.appointments.date}` : ''}
                      {selected.appointments.time ? ` at ${selected.appointments.time.slice(0,5)}` : ''}
                    </p>
                    {selected.appointments.stylists?.name && (
                      <p style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>with {selected.appointments.stylists.name}</p>
                    )}
                  </div>
                )}

                {/* Stylist */}
                {stylists.length > 0 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }}>Stylist</p>
                    <select value={reschedStylist}
                      onChange={e => { setReschedStylist(e.target.value); setReschedDate(''); setReschedTime('') }}
                      style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: 9, background: 'var(--col-modal)', border: `1px solid ${C.border}`, color: C.white, fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                      <option value="">Keep current stylist</option>
                      {stylists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Calendar */}
                {(() => {
                  const rIsOff = d =>
                    isBefore(d, startOfDay(new Date())) ||
                    rBlockedDates.includes(format(d, 'yyyy-MM-dd')) ||
                    (reschedStylist && rStylistDayOffs.includes(format(d, 'yyyy-MM-dd')))
                  const reschedDur = selected?.appointments?.services?.duration || 60
                  const isSlotUnavailable = slot =>
                    rTakenSlots.includes(slot) || rBlockedHours.some(bh => toMins(bh) >= toMins(slot) && toMins(bh) < toMins(slot) + reschedDur)
                  const monthStart = startOfMonth(reschedMonth)
                  const monthEnd   = endOfMonth(reschedMonth)
                  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd })
                  const startPad   = getDay(monthStart) === 0 ? 6 : getDay(monthStart) - 1
                  const daySlots   = reschedDate ? slotsForDay(parseISO(reschedDate), reschedDur) : []
                  const morning    = daySlots.filter(s => parseInt(s) < 13)
                  const afternoon  = daySlots.filter(s => parseInt(s) >= 13)
                  const selDateObj = reschedDate ? parseISO(reschedDate) : null
                  return (
                    <div style={{ marginBottom: '1.25rem' }}>
                      <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 8 }}>New Date</p>
                      {/* Month nav */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <button onClick={() => setReschedMonth(m => subMonths(m, 1))}
                          style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.06)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <ChevronLeft size={13} />
                        </button>
                        <span style={{ fontSize: '0.85rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>
                          {format(reschedMonth, 'MMMM yyyy')}
                        </span>
                        <button onClick={() => setReschedMonth(m => addMonths(m, 1))}
                          style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.06)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                      {/* Weekday headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
                        {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                          <div key={d} style={{ textAlign: 'center', fontSize: 9, color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.06em' }}>{d}</div>
                        ))}
                      </div>
                      {/* Day grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
                        {Array.from({ length: startPad }, (_, i) => <div key={`p${i}`} />)}
                        {days.map(day => {
                          const ds    = format(day, 'yyyy-MM-dd')
                          const off   = rIsOff(day)
                          const isSel = selDateObj && isSameDay(day, selDateObj)
                          return (
                            <button key={ds} disabled={off}
                              onClick={() => { setReschedDate(ds); setReschedTime('') }}
                              style={{
                                padding: '5px 2px', borderRadius: 6,
                                border: isSel ? '1px solid rgba(var(--rgb-acc),0.5)' : '1px solid transparent',
                                background: isSel ? 'linear-gradient(135deg, var(--col-acc3), var(--col-acc))' : 'transparent',
                                color: isSel ? 'var(--col-bg)' : off ? 'rgba(var(--rgb-hi),0.2)' : C.white,
                                fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif', fontWeight: isSel ? 700 : 400,
                                cursor: off ? 'not-allowed' : 'pointer', textAlign: 'center', transition: 'all .12s',
                              }}>
                              {format(day, 'd')}
                            </button>
                          )
                        })}
                      </div>
                      {/* Time slots */}
                      {reschedDate && (
                        <div style={{ marginTop: '1rem' }}>
                          <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 8 }}>New Time</p>
                          {[{ label: 'Morning', slots: morning }, { label: 'Afternoon', slots: afternoon }].map(({ label, slots }) => (
                            <div key={label} style={{ marginBottom: 8 }}>
                              <p style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', opacity: 0.6, marginBottom: 5 }}>{label}</p>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
                                {slots.map(slot => {
                                  const unavail = isSlotUnavailable(slot)
                                  const isSel   = reschedTime === slot
                                  return (
                                    <button key={slot} disabled={unavail}
                                      onClick={() => setReschedTime(slot)}
                                      style={{
                                        padding: '6px 4px', borderRadius: 7,
                                        border: isSel ? '1px solid rgba(var(--rgb-acc),0.5)' : `1px solid ${C.border}`,
                                        background: isSel ? 'linear-gradient(135deg, var(--col-acc3), var(--col-acc))' : 'rgba(var(--rgb-hi),0.04)',
                                        color: isSel ? 'var(--col-bg)' : unavail ? 'rgba(var(--rgb-hi),0.18)' : C.white,
                                        fontSize: '0.73rem', fontFamily: 'DM Sans,sans-serif', fontWeight: isSel ? 700 : 400,
                                        textDecoration: unavail ? 'line-through' : 'none',
                                        cursor: unavail ? 'not-allowed' : 'pointer', transition: 'all .12s',
                                      }}>
                                      {slot}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setReschedModal(false)} disabled={reschedWorking}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 9, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', cursor: reschedWorking ? 'not-allowed' : 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={handleReschedule} disabled={!reschedDate || !reschedTime || reschedWorking}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 9, border: 'none', background: reschedDate && reschedTime ? 'linear-gradient(135deg, #f59e0b, rgba(245,158,11,0.7))' : 'rgba(var(--rgb-hi),0.06)', color: reschedDate && reschedTime ? 'var(--col-bg)' : C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: reschedDate && reschedTime && !reschedWorking ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: reschedWorking ? 0.6 : 1, transition: 'all .2s' }}>
                    {reschedWorking
                      ? <><div style={{ width: 13, height: 13, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> Saving…</>
                      : <><RefreshCw size={13} /> Confirm Reschedule</>}
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
