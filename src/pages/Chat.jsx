import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Send, MessageSquare, X, CheckCircle, Scissors } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, isToday, isYesterday } from 'date-fns'
import toast from 'react-hot-toast'

const C = {
  bg: 'var(--col-bg)', card: 'var(--col-card)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)',
  goldBg: 'var(--col-acc)', goldBorder: 'var(--col-acc)',
  white: 'var(--col-text)', dim: 'var(--col-text)',
  muted: 'var(--col-text)', border: 'rgba(var(--rgb-hi),0.07)',
  msgBg: 'var(--col-modal)',
}

function timeFmt(d) {
  const date = new Date(d)
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMM d')
}

export default function Chat() {
  const { user, profile } = useAuth()
  const [tickets,  setTickets]  = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(true)
  const [sending,  setSending]  = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [showNew,  setShowNew]  = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newMsg,   setNewMsg]   = useState('')
  const [creating,    setCreating]    = useState(false)
  const [workers,     setWorkers]     = useState([])
  const [staffNames,  setStaffNames]  = useState({})
  const [recipientId, setRecipientId] = useState(null)
  const bottomRef  = useRef(null)
  const selectedRef = useRef(null)

  useEffect(() => { selectedRef.current = selected }, [selected])

  useEffect(() => {
    if (!user) return
    loadTickets()
    // Customers can't read staff profiles directly; this returns names only
    supabase.rpc('staff_directory').then(({ data }) => {
      const staff = data || []
      setStaffNames(Object.fromEntries(staff.map(p => [p.id, p.full_name])))
      setWorkers(staff.filter(p => p.role === 'artist').sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')))
    })
    const sub = supabase.channel(`client-tickets-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages' }, payload => {
        const msg = payload.new
        if (selectedRef.current?.id === msg.ticket_id) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          if (msg.is_from_admin) {
            supabase.from('ticket_messages').update({ read: true }).eq('id', msg.id)
          }
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        }
        loadTickets()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, loadTickets)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [user])

  useEffect(() => {
    if (!selected) return
    setMessages([])
    loadMessages(selected.id)
  }, [selected?.id])

  async function loadTickets() {
    const { data: tkts } = await supabase
      .from('tickets').select('*, recipient:profiles!recipient_id(full_name)').eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (!tkts?.length) { setTickets([]); setLoading(false); return }

    const ids = tkts.map(t => t.id)
    const { data: msgs } = await supabase
      .from('ticket_messages')
      .select('ticket_id, content, created_at, read, is_from_admin')
      .in('ticket_id', ids)
      .order('created_at', { ascending: false })

    const meta = {}
    for (const m of (msgs || [])) {
      if (!meta[m.ticket_id]) meta[m.ticket_id] = { lastMsg: m.content, lastTime: m.created_at, unread: 0 }
      if (!m.read && m.is_from_admin) meta[m.ticket_id].unread++
    }
    setTickets(tkts.map(t => ({ ...t, ...(meta[t.id] || {}) })))
    setLoading(false)
  }

  async function loadMessages(ticketId) {
    setLoadingMsgs(true)
    const { data } = await supabase
      .from('ticket_messages').select('*, sender:profiles!sender_id(full_name)').eq('ticket_id', ticketId).order('created_at')
    setMessages(data || [])
    setLoadingMsgs(false)
    await supabase.from('ticket_messages')
      .update({ read: true }).eq('ticket_id', ticketId).eq('is_from_admin', true).eq('read', false)
    loadTickets()
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function createTicket() {
    if (!newTitle.trim()) return toast.error('Please enter a title')
    setCreating(true)
    try {
      const { data: ticket, error } = await supabase
        .from('tickets').insert({ user_id: user.id, title: newTitle.trim(), status: 'open', recipient_id: recipientId })
        .select().single()
      if (error) throw error
      if (newMsg.trim()) {
        await supabase.from('ticket_messages').insert({
          ticket_id: ticket.id, sender_id: user.id,
          content: newMsg.trim(), is_from_admin: false, read: false,
        })
        await supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticket.id)
      }
      setShowNew(false); setNewTitle(''); setNewMsg(''); setRecipientId(null)
      await loadTickets()
      setSelected(ticket)
      toast.success('Ticket created')
    } catch (err) { toast.error(err.message) }
    finally { setCreating(false) }
  }

  async function send(e) {
    e.preventDefault()
    if (!input.trim() || !selected || sending || selected.status === 'closed') return
    setSending(true)
    const content = input.trim(); setInput('')
    const { data, error } = await supabase
      .from('ticket_messages')
      .insert({ ticket_id: selected.id, sender_id: user.id, content, is_from_admin: false, read: false })
      .select().single()
    if (error) { setInput(content); toast.error('Failed to send') }
    else if (data) {
      setMessages(prev => [...prev, data])
      await supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', selected.id)
      loadTickets()
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    setSending(false)
  }

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'You'

  return (
    <div style={{ position: 'fixed', top: 68, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', background: C.bg }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .tk-item:hover { background: rgba(var(--rgb-hi),0.025) !important; }
        .msg-inp:focus { outline: none; }
        .msg-inp::placeholder { color: rgba(var(--rgb-hi),0.3); }
        .send-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(var(--rgb-acc),0.35); }
        .send-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .new-inp:focus { border-color: rgba(var(--rgb-acc),0.5) !important; box-shadow: 0 0 0 3px rgba(var(--rgb-acc),0.07); outline: none; }
        .new-inp::placeholder { color: rgba(var(--rgb-hi),0.3); }
        .chat-back { display: none; }
        .chat-send-label { display: inline; }

        @media (max-width: 767px) {
          .chat-layout { grid-template-columns: 1fr !important; }
          .chat-has-thread .chat-list { display: none !important; }
          .chat-layout:not(.chat-has-thread) .chat-thread { display: none !important; }
          .chat-back { display: flex !important; }

          /* Ticket list */
          .chat-list-hdr { padding: 1rem 1.125rem !important; }
          .chat-new-btn { padding: 9px 18px !important; font-size: 13px !important; border-radius: 12px !important; }
          .tk-item { padding: 1rem 1.125rem !important; min-height: 76px; }
          .tk-avatar { width: 44px !important; height: 44px !important; font-size: 16px !important; }

          /* Thread header */
          .thread-hdr { padding: 0.875rem 1rem !important; }
          .thread-hdr-badge-row { gap: 5px !important; }
          .thread-hdr-date { display: none !important; }

          /* Messages */
          .msg-bubble-wrap { max-width: 86% !important; }
          .msg-content { font-size: 0.9rem !important; }

          /* Input */
          .chat-input-area { padding: 0.625rem 0.875rem !important; }
          .chat-inp-form { padding: 0.5rem 0.5rem 0.5rem 1rem !important; border-radius: 16px !important; }
          .msg-inp { font-size: 16px !important; padding: 0.4rem 0 !important; }
          .chat-send-btn { width: 40px !important; height: 40px !important; padding: 0 !important; border-radius: 12px !important; justify-content: center; }
          .chat-send-label { display: none !important; }

          /* New ticket modal — bottom sheet */
          .new-modal-overlay { align-items: flex-end !important; padding: 0 !important; }
          .new-modal-panel { border-radius: 22px 22px 0 0 !important; max-width: 100% !important; }
          .new-modal-inputs input, .new-modal-inputs textarea { font-size: 16px !important; }
        }
      `}</style>

      {/* 2-panel */}
      <div className={`chat-layout${selected ? ' chat-has-thread' : ''}`} style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1px', overflow: 'hidden', background: C.border }}>

        {/* ── LEFT: ticket list ────────────────────────────── */}
        <div className="chat-list" style={{ background: C.card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div className="chat-list-hdr" style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.88rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Messages</p>
              <p style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(var(--rgb-hi),0.35)', fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>
                {tickets.length} {tickets.length === 1 ? 'conversation' : 'conversations'}
              </p>
            </div>
            <button className="chat-new-btn" onClick={() => setShowNew(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10,
              background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)',
              fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer',
              letterSpacing: '0.12em', textTransform: 'uppercase', transition: 'transform .2s, box-shadow .2s',
              boxShadow: '0 4px 14px rgba(var(--rgb-acc),0.28)',
            }}>
              <Plus size={12} /> New
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0.5rem' }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ height: 76, borderRadius: 10, background: 'rgba(var(--rgb-hi),0.03)', margin: '0.25rem 0' }} className="shimmer" />
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem 1.5rem', textAlign: 'center', gap: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={22} color="rgba(var(--rgb-hi),0.18)" strokeWidth={1.5} />
                </div>
                <div>
                  <p style={{ color: C.white, fontSize: '0.88rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, marginBottom: 4 }}>No conversations yet</p>
                  <p style={{ color: 'rgba(var(--rgb-hi),0.3)', fontSize: '0.76rem', fontFamily: 'DM Sans,sans-serif' }}>Start a new ticket to chat with the team</p>
                </div>
                <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 10, background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  <Plus size={12} /> New Ticket
                </button>
              </div>
            ) : tickets.map(tk => {
              const isActive = selected?.id === tk.id
              const isOpen = tk.status === 'open'
              const avatarLabel = (staffNames[tk.recipient_id] || 'H')[0].toUpperCase()
              return (
                <button key={tk.id} className="tk-item" onClick={() => setSelected(tk)}
                  style={{ width: '100%', textAlign: 'left', padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: 12, background: isActive ? 'rgba(var(--rgb-acc),0.07)' : 'transparent', border: 'none', borderLeft: `3px solid ${isActive ? 'var(--col-acc)' : 'transparent'}`, borderBottom: '1px solid rgba(var(--rgb-hi),0.04)', cursor: 'pointer', transition: 'background .15s' }}>

                  {/* Avatar */}
                  <div className="tk-avatar" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: isOpen ? 'rgba(52,211,153,0.1)' : 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${isOpen ? 'rgba(52,211,153,0.22)' : 'rgba(var(--rgb-hi),0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <span style={{ fontSize: 14, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: isOpen ? '#34d399' : 'var(--col-acc)' }}>{avatarLabel}</span>
                    {tk.unread > 0 && (
                      <div style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, padding: '0 3px', border: `2px solid ${C.card}` }}>
                        {tk.unread}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <p style={{ fontSize: '0.84rem', color: isActive ? C.white : 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: isActive || tk.unread > 0 ? 600 : 400, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}>{tk.title}</p>
                      {tk.lastTime && <span style={{ fontSize: 11, color: 'rgba(var(--rgb-hi),0.3)', fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap', marginLeft: 8, flexShrink: 0 }}>{timeFmt(tk.lastTime)}</span>}
                    </div>

                    {/* Last message */}
                    <p style={{ fontSize: '0.75rem', color: 'rgba(var(--rgb-hi),0.35)', fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginBottom: 5 }}>
                      {tk.lastMsg || 'No messages yet'}
                    </p>

                    {/* Meta row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: isOpen ? '#34d399' : 'rgba(var(--rgb-hi),0.2)', boxShadow: isOpen ? '0 0 5px rgba(52,211,153,0.5)' : 'none', flexShrink: 0 }} />
                        <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', color: isOpen ? 'rgba(52,211,153,0.7)' : 'rgba(var(--rgb-hi),0.25)', fontWeight: 600 }}>
                          {tk.status}
                        </span>
                      </div>
                      <span style={{ color: 'rgba(var(--rgb-hi),0.15)', fontSize: 10 }}>·</span>
                      <span style={{ fontSize: 10, fontFamily: 'DM Sans,sans-serif', color: 'rgba(var(--rgb-hi),0.35)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {staffNames[tk.recipient_id] || 'HairGo Store'}
                      </span>
                      {tk.appointment_id && (
                        <>
                          <span style={{ color: 'rgba(var(--rgb-hi),0.15)', fontSize: 10 }}>·</span>
                          <span style={{ fontSize: 9, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>APPT</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Profile footer */}
          <div style={{ padding: '0.75rem 1rem', borderTop: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--col-bg)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{displayName[0]?.toUpperCase()}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.75rem', color: C.white, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{displayName}</p>
              <p style={{ fontSize: 10, color: 'rgba(var(--rgb-hi),0.3)', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Client</p>
            </div>
          </div>
        </div>

        {/* ── RIGHT: thread ────────────────────────────────── */}
        <div className="chat-thread" style={{ background: C.card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(var(--rgb-acc),0.08)', border: '1px solid rgba(var(--rgb-acc),0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Scissors size={22} color="var(--col-acc)" strokeWidth={1.5} style={{ transform: 'rotate(45deg)' }} />
              </div>
              <div>
                <p style={{ color: C.white, fontSize: '0.92rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, marginBottom: 5 }}>Select a conversation</p>
                <p style={{ color: 'rgba(var(--rgb-hi),0.3)', fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif' }}>or open a new ticket to get started</p>
              </div>
              <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 11, background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                <Plus size={12} /> New Ticket
              </button>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="thread-hdr" style={{ padding: '0.875rem 1.25rem', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: 'linear-gradient(180deg, rgba(var(--rgb-hi),0.02) 0%, transparent 100%)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <button className="chat-back" onClick={() => setSelected(null)}
                    style={{ alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.dim, cursor: 'pointer', flexShrink: 0, padding: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                  </button>
                  <p style={{ color: C.white, fontSize: '0.92rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1, margin: 0 }}>{selected.title}</p>
                </div>
                <div className="thread-hdr-badge-row" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: selected.recipient ? 'rgba(52,211,153,0.1)' : 'var(--col-acc)', border: `1px solid ${selected.recipient ? 'rgba(52,211,153,0.3)' : 'rgba(var(--rgb-acc),0.6)'}` }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: selected.recipient ? '#34d399' : 'var(--col-bg)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: selected.recipient ? '#34d399' : 'var(--col-bg)', letterSpacing: '0.04em' }}>
                      {staffNames[selected.recipient_id] || 'HairGo Store'}
                    </span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: selected.status === 'open' ? 'rgba(52,211,153,0.08)' : 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${selected.status === 'open' ? 'rgba(52,211,153,0.2)' : 'rgba(var(--rgb-hi),0.07)'}` }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: selected.status === 'open' ? '#34d399' : 'var(--col-text)', boxShadow: selected.status === 'open' ? '0 0 5px rgba(52,211,153,0.4)' : 'none', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: selected.status === 'open' ? 'rgba(52,211,153,0.8)' : 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{selected.status}</span>
                  </span>
                  {selected.appointment_id && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Appt</span>
                    </span>
                  )}
                  <span className="thread-hdr-date" style={{ fontSize: 11, color: 'rgba(var(--rgb-hi),0.3)', fontFamily: 'DM Sans,sans-serif' }}>{format(new Date(selected.created_at), 'MMM d, yyyy')}</span>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '1rem 1.125rem', display: 'flex', flexDirection: 'column', gap: '0.375rem', background: C.msgBg }}>
                {loadingMsgs ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 20, height: 20, border: '2px solid rgba(var(--rgb-acc),0.2)', borderTopColor: 'var(--col-acc)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: 'rgba(var(--rgb-hi),0.25)', fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontStyle: 'italic' }}>No messages yet — start the conversation</p>
                  </div>
                ) : messages.map((msg, i) => {
                  const isMe = !msg.is_from_admin
                  const showDate = i === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[i - 1].created_at).toDateString()
                  const prevSame = i > 0 && !messages[i-1].is_from_admin === !msg.is_from_admin
                  return (
                    <div key={msg.id} style={{ marginBottom: 2 }}>
                      {showDate && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0.875rem 0' }}>
                          <div style={{ flex: 1, height: 1, background: 'rgba(var(--rgb-hi),0.05)' }} />
                          <span style={{ fontSize: 11, color: 'rgba(var(--rgb-hi),0.3)', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap', padding: '3px 12px', borderRadius: 20, background: 'rgba(var(--rgb-hi),0.03)', border: '1px solid rgba(var(--rgb-hi),0.06)' }}>
                            {isToday(new Date(msg.created_at)) ? 'Today' : isYesterday(new Date(msg.created_at)) ? 'Yesterday' : format(new Date(msg.created_at), 'MMMM d')}
                          </span>
                          <div style={{ flex: 1, height: 1, background: 'rgba(var(--rgb-hi),0.05)' }} />
                        </div>
                      )}
                      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
                        style={{ display: 'flex', alignItems: 'flex-end', gap: 8, justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: prevSame ? 2 : 10 }}>
                        {!isMe && (
                          <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, rgba(var(--rgb-acc),0.2), rgba(var(--rgb-acc),0.1))', border: '1px solid rgba(var(--rgb-acc),0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 10, color: 'var(--col-acc)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>HG</span>
                          </div>
                        )}
                        <div className="msg-bubble-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 4, maxWidth: '68%' }}>
                          {!isMe && !prevSame && (
                            <span style={{ fontSize: 11, color: 'var(--col-acc)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', paddingLeft: 3 }}>{staffNames[msg.sender_id] || 'HairGo Team'}</span>
                          )}
                          <div className="msg-content" style={{ padding: '0.6rem 1rem', borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize: '0.84rem', lineHeight: 1.65, fontFamily: 'DM Sans,sans-serif', ...(isMe ? { background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontWeight: 500, boxShadow: '0 4px 16px rgba(var(--rgb-acc),0.22)' } : { background: 'rgba(var(--rgb-hi),0.06)', border: '1px solid rgba(var(--rgb-hi),0.08)', color: 'var(--col-text)', backdropFilter: 'blur(6px)' }) }}>
                            {msg.content}
                          </div>
                          <span style={{ fontSize: 10, color: 'rgba(var(--rgb-hi),0.28)', fontFamily: 'DM Sans,sans-serif', paddingLeft: isMe ? 0 : 3, paddingRight: isMe ? 3 : 0 }}>{format(new Date(msg.created_at), 'HH:mm')}</span>
                        </div>
                      </motion.div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              {selected.status === 'closed' ? (
                <div style={{ padding: '0.875rem 1.25rem', borderTop: `1px solid ${C.border}`, background: C.card, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={14} color="rgba(var(--rgb-hi),0.3)" />
                  <p style={{ fontSize: '0.8rem', color: 'rgba(var(--rgb-hi),0.35)', fontFamily: 'DM Sans,sans-serif' }}>This ticket has been closed by the team.</p>
                </div>
              ) : (
                <div className="chat-input-area" style={{ padding: '0.75rem 1.25rem', borderTop: `1px solid ${C.border}`, background: C.card }}>
                  <form onSubmit={send} className="chat-inp-form" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '0.375rem 0.375rem 0.375rem 0.875rem', transition: 'border-color .2s' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(var(--rgb-acc),0.4)'}
                    onBlur={e => e.currentTarget.style.borderColor = C.border}>
                    <input value={input} onChange={e => setInput(e.target.value)} placeholder="Reply to the team…" className="msg-inp"
                      style={{ flex: 1, background: 'transparent', border: 'none', padding: '0.35rem 0', fontSize: '0.84rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 300 }} />
                    <button type="submit" disabled={!input.trim() || sending} className="send-btn chat-send-btn"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.45rem 0.875rem', borderRadius: 10, background: input.trim() ? `linear-gradient(135deg,${C.gold},var(--col-acc2))` : 'rgba(var(--rgb-hi),0.06)', color: input.trim() ? 'var(--col-bg)' : 'rgba(var(--rgb-hi),0.25)', fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .2s', flexShrink: 0, letterSpacing: '0.08em' }}>
                      {sending
                        ? <div style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,.2)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                        : <><Send size={12} /><span className="chat-send-label"> Send</span></>
                      }
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── New Ticket Modal ─────────────────────────────── */}
      <AnimatePresence>
        {showNew && (
          <motion.div className="new-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
            onClick={() => { setShowNew(false); setNewTitle(''); setNewMsg(''); setRecipientId(null) }}>
            <motion.div className="new-modal-panel" initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 440, background: 'var(--col-card)', border: '1px solid rgba(var(--rgb-acc),0.15)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.7)' }}>
              <div style={{ height: 3, background: `linear-gradient(90deg,${C.gold},var(--col-acc2),rgba(var(--rgb-acc),.2))` }} />
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <div>
                    <h2 className="font-display" style={{ fontSize: '1.5rem', color: C.white, marginBottom: 3 }}>New Ticket</h2>
                    <p style={{ fontSize: '0.75rem', color: 'rgba(var(--rgb-hi),0.35)', fontFamily: 'DM Sans,sans-serif' }}>Our team will reply as soon as possible</p>
                  </div>
                  <button onClick={() => { setShowNew(false); setNewTitle(''); setNewMsg(''); setRecipientId(null) }} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(var(--rgb-hi),.05)', border: `1px solid ${C.border}`, color: 'rgba(var(--rgb-hi),0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={13} />
                  </button>
                </div>

                <div className="new-modal-inputs" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(var(--rgb-hi),0.35)', fontFamily: 'DM Sans,sans-serif', marginBottom: 8 }}>Send to</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {[{ id: null, full_name: 'Store' }, ...workers].map(w => (
                        <button key={w.id ?? 'store'} type="button" onClick={() => setRecipientId(w.id)}
                          style={{ padding: '6px 16px', borderRadius: 20, fontSize: 13, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', letterSpacing: '0.06em', border: `1px solid ${recipientId === w.id ? 'rgba(var(--rgb-acc),0.5)' : C.border}`, background: recipientId === w.id ? 'rgba(var(--rgb-acc),0.1)' : 'transparent', color: recipientId === w.id ? C.gold : 'rgba(var(--rgb-hi),0.45)' }}>
                          {w.full_name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(var(--rgb-hi),0.35)', fontFamily: 'DM Sans,sans-serif', marginBottom: 8 }}>Subject *</label>
                    <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Question about my appointment…" className="new-inp"
                      style={{ width: '100%', background: 'rgba(var(--rgb-hi),.04)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.7rem 0.875rem', fontSize: '0.85rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 300, boxSizing: 'border-box', transition: 'border-color .2s, box-shadow .2s' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(var(--rgb-hi),0.35)', fontFamily: 'DM Sans,sans-serif', marginBottom: 8 }}>Message <span style={{ textTransform: 'none', letterSpacing: 0, color: 'rgba(var(--rgb-hi),0.2)' }}>(optional)</span></label>
                    <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} rows={3} placeholder="Describe your question or request…" className="new-inp"
                      style={{ width: '100%', background: 'rgba(var(--rgb-hi),.04)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.7rem 0.875rem', fontSize: '0.85rem', color: C.white, fontFamily: 'DM Sans,sans-serif', fontWeight: 300, boxSizing: 'border-box', resize: 'none', transition: 'border-color .2s, box-shadow .2s' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
                  <button onClick={() => { setShowNew(false); setNewTitle(''); setNewMsg(''); setRecipientId(null) }} style={{ flex: 1, padding: '0.7rem', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: 'rgba(var(--rgb-hi),0.35)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={createTicket} disabled={creating || !newTitle.trim()}
                    style={{ flex: 2, padding: '0.7rem', borderRadius: 10, background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: creating || !newTitle.trim() ? 'not-allowed' : 'pointer', opacity: creating || !newTitle.trim() ? 0.45 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'opacity .2s' }}>
                    {creating ? <div style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,.25)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} /> : 'Create Ticket'}
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
