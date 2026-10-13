import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useLogAction } from '../../hooks/useLogAction'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Package, Check, X, Trash2, AlertTriangle, ChevronRight, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { linePrice } from '../../lib/price'
import { fetchAll } from '../../lib/fetchAll'
import { getOrFetch, invalidate } from '../../lib/cache'
import Pager from '../../lib/Pager'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const C = {
  card: 'var(--col-modal)', gold: 'var(--col-acc)', goldDim: 'var(--col-acc)',
  goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)',
  subtle: 'rgba(var(--rgb-hi),0.06)', border: 'rgba(var(--rgb-hi),0.07)',
}

const STATUS_STYLE = {
  active:    { color: 'var(--col-acc)', bg: 'rgba(var(--rgb-acc),0.1)', border: 'rgba(var(--rgb-acc),0.28)', label: 'Awaiting Pickup' },
  retrieved: { color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.22)',  label: 'Retrieved'       },
  expired:   { color: 'var(--col-text)', bg: 'rgba(var(--rgb-hi),0.06)', border: 'rgba(var(--rgb-hi),0.1)', label: 'Expired' },
  cancelled: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.22)', label: 'Cancelled'      },
}

const STATUS_TABS = ['All', 'Active', 'Retrieved', 'Expired', 'Cancelled']

export default function StudioOrders() {
  const { isAdmin, isManager } = useAuth()
  const log = useLogAction()
  const [orders,       setOrders]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [tab,          setTab]          = useState('All')
  const [updating,     setUpdating]     = useState(null)
  const [details,      setDetails]      = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [page,         setPage]         = useState(0)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await getOrFetch('studio_orders', async () => {
      const { data, error } = await fetchAll(() => supabase
        .from('preorders')
        .select('*, products(name, price, image_url, category), profiles(full_name, phone)')
        .order('created_at', { ascending: false })
        .order('id'))
      if (error) toast.error('Failed to load orders')
      return data || []
    }, 60_000)
    setOrders(data)
    setLoading(false)
  }

  // Group individual preorder rows into logical orders.
  // Priority: order_group_id (new) → payment_intent_id (legacy online) → id (singleton).
  const grouped = useMemo(() => {
    const map = new Map()
    for (const order of orders) {
      const key = order.order_group_id ?? order.payment_intent_id ?? order.id
      if (!map.has(key)) {
        map.set(key, {
          groupId: key,
          profiles: order.profiles,
          status: order.status,
          payment_status: order.payment_status,
          payment_intent_id: order.payment_intent_id,
          created_at: order.created_at,
          items: [],
        })
      }
      map.get(key).items.push(order)
    }
    return Array.from(map.values())
  }, [orders])

  function syncGroup(groupId, patch) {
    setOrders(prev => prev.map(o =>
      (o.order_group_id ?? o.payment_intent_id ?? o.id) === groupId ? { ...o, ...patch } : o
    ))
    setDetails(prev => prev?.groupId === groupId
      ? { ...prev, ...patch, items: prev.items.map(i => ({ ...i, ...patch })) }
      : prev
    )
  }

  async function markRetrieved(group) {
    setUpdating(group.groupId)
    const ids = group.items.map(i => i.id)
    const { error } = await supabase.from('preorders').update({ status: 'retrieved' }).in('id', ids)
    if (error) { toast.error('Update failed'); setUpdating(null); return }
    toast.success('Marked as retrieved')
    log('order.retrieved', { entityType: 'order', entityId: group.groupId, details: { message: `marked ${group.profiles?.full_name || 'client'}'s order as retrieved` } })
    invalidate('studio_orders')
    syncGroup(group.groupId, { status: 'retrieved' })
    setUpdating(null)
  }

  async function cancelOrder(group) {
    if (!confirm('Cancel this order? A Stripe refund will be issued automatically if paid online.')) return
    setUpdating(group.groupId)

    const { data, error } = await supabase.functions.invoke('process-refund', {
      body: { type: 'order', id: group.groupId },
    })
    if (error) {
      const body = await error.context?.json?.().catch(() => null)
      toast.error('Failed to cancel: ' + (body?.error || error.message || 'unknown error')); setUpdating(null); return
    }

    log('order.cancelled', { entityType: 'order', entityId: group.groupId, details: { message: `cancelled ${group.profiles?.full_name || 'client'}'s order${data?.refunded ? ' — Stripe refund issued' : ''}` } })

    // Items still awaiting pickup are put back in stock by the server
    invalidate('studio_orders')
    toast.success(data?.refunded ? 'Order cancelled & refund issued' : 'Order cancelled')
    syncGroup(group.groupId, { status: 'cancelled', ...(data?.refunded ? { payment_status: 'refunded' } : {}) })
    setUpdating(null)
  }

  async function revertToWaiting(group) {
    setUpdating(group.groupId)
    const ids = group.items.map(i => i.id)
    const { error } = await supabase.from('preorders').update({ status: 'active' }).in('id', ids)
    if (error) { toast.error('Update failed'); setUpdating(null); return }
    toast.success('Order reverted to awaiting pickup')
    log('order.reverted', { entityType: 'order', entityId: group.groupId, details: { message: `reverted ${group.profiles?.full_name || 'client'}'s order to awaiting pickup` } })
    invalidate('studio_orders')
    syncGroup(group.groupId, { status: 'active' })
    setUpdating(null)
  }

  function openDelete(group) {
    // Deleting would leave reserved stock off the shelf — cancel first
    if (group.status === 'active') return toast.error('Cancel this order first — that returns its items to stock')
    setDeleteTarget(group)
  }
  function closeDelete() { setDeleteTarget(null) }

  async function confirmDelete() {
    const ids = deleteTarget.items.map(i => i.id)
    const { data: deleted, error } = await supabase.from('preorders').delete().in('id', ids).select('id')
    if (error) { toast.error('Delete failed'); return }
    if (!deleted?.length) { toast.error('Only an admin can delete orders'); return }
    invalidate('studio_orders')
    toast.success('Order deleted')
    log('order.deleted', { entityType: 'order', entityId: deleteTarget.groupId, details: { message: `deleted order from ${deleteTarget.profiles?.full_name || 'client'}` } })
    setOrders(prev => prev.filter(o => !ids.includes(o.id)))
    setDetails(null)
    closeDelete()
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return grouped.filter(g => {
      const matchesTab = tab === 'All' || g.status === tab.toLowerCase()
      const matchesSearch = !q
        || g.profiles?.full_name?.toLowerCase().includes(q)
        || g.profiles?.phone?.toLowerCase().includes(q)
        || g.items.some(o => o.id.toLowerCase().includes(q) || o.products?.name?.toLowerCase().includes(q))
      return matchesTab && matchesSearch
    })
  }, [grouped, search, tab])

  const counts = useMemo(() => {
    const c = { All: grouped.length }
    STATUS_TABS.slice(1).forEach(s => { c[s] = grouped.filter(g => g.status === s.toLowerCase()).length })
    return c
  }, [grouped])

  const PER_PAGE = window.innerWidth < 768 ? 7 : 8
  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  return (
    <div className="orders-outer" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .o-search:focus { border-color: ${C.goldBorder} !important; }
        .o-row:hover { background: rgba(var(--rgb-hi),0.035) !important; border-color: rgba(var(--rgb-hi),0.13) !important; transform: translateY(-1px); box-shadow: 0 4px 18px rgba(0,0,0,0.18); }
        .o-row:hover .o-details-btn { border-color: ${C.goldBorder} !important; color: ${C.gold} !important; }
        .o-retrieve:hover:not(:disabled) { background: rgba(52,211,153,0.2) !important; border-color: rgba(52,211,153,0.5) !important; }
        .o-cancel:hover:not(:disabled) { background: rgba(248,113,113,0.15) !important; border-color: rgba(248,113,113,0.4) !important; }
        .o-delete:hover { background: rgba(248,113,113,0.15) !important; border-color: rgba(248,113,113,0.4) !important; }
        .o-revert:hover:not(:disabled) { background: rgba(var(--rgb-acc),0.18) !important; border-color: rgba(var(--rgb-acc),0.45) !important; }
        @media (max-width: 1199px) {
          .orders-outer { height: auto !important; overflow: visible !important; padding-bottom: 2rem !important; }
          .orders-list  { flex: none !important; overflow: visible !important; min-height: 0 !important; }
          .o-row:hover  { transform: none !important; box-shadow: none !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, paddingBottom: '1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.6rem,2.5vw,2.2rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.15rem' }}>Orders</h1>
          <p style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>All product pre-orders</p>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search by name, phone, product…" autoComplete="off" className="o-search"
            style={{ background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '0.45rem 0.875rem 0.45rem 2rem', fontSize: '0.8rem', color: C.white, outline: 'none', fontFamily: 'DM Sans,sans-serif', width: 280, maxWidth: '100%', transition: 'border-color .2s' }} />
        </div>
      </div>

      {/* ── Status tabs ── */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap' }}>
        {STATUS_TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setPage(0) }}
            style={{ padding: '0.35rem 0.875rem', borderRadius: 20, fontSize: 11, letterSpacing: '0.13em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: tab === t ? 600 : 400, cursor: 'pointer', transition: 'all .18s', border: 'none', background: tab === t ? C.goldBg : 'rgba(var(--rgb-hi),0.04)', color: tab === t ? C.gold : C.muted, outline: tab === t ? `1px solid ${C.goldBorder}` : '1px solid transparent' }}>
            {t}<span style={{ marginLeft: 5, fontSize: 9, opacity: 0.7 }}>({counts[t] || 0})</span>
          </button>
        ))}
      </div>

      {/* ── List ── */}
      <div className="orders-list" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 76, borderRadius: 14, background: 'rgba(var(--rgb-hi),0.04)' }} className="shimmer" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 10 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={22} color="rgba(var(--rgb-hi),0.12)" strokeWidth={1} />
            </div>
            <p style={{ color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif' }}>
              {search ? 'No orders match your search' : 'No orders yet'}
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {paged.map((group) => {
                const s = STATUS_STYLE[group.status] || STATUS_STYLE.active
                const total = group.items.reduce((sum, o) => sum + linePrice(o) * (o.quantity || 1), 0)

                return (
                  <div key={group.groupId} className="o-row"
                    onClick={() => setDetails(group)}
                    style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', background: 'var(--col-modal)', border: `1px solid ${C.border}`, borderLeft: `3px solid ${s.color}`, borderRadius: 14, cursor: 'pointer', transition: 'all .18s' }}>

                    {/* Left: info block */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Row 1: name + date */}
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}>
                        <span style={{ fontSize: '0.88rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, color: C.white, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0 }}>
                          {group.profiles?.full_name || '—'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {format(new Date(group.created_at), 'MMM d · HH:mm')}
                        </span>
                      </div>
                      {/* Row 2: status + payment */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', whiteSpace: 'nowrap' }}>
                          {s.label}
                        </span>
                        {group.payment_status === 'paid'
                          ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Paid online</span>
                          : group.status === 'retrieved'
                            ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Paid in store</span>
                            : <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Pay in store</span>
                        }
                      </div>
                    </div>

                    {/* Right: price + action + arrow */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: '1rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: C.gold, letterSpacing: '-0.01em' }}>
                        ${total.toFixed(2)}
                      </span>
<div className="o-details-btn" style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .18s' }}>
                        <ChevronRight size={13} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <Pager page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </div>

      {/* ── Details Modal ── */}
      <AnimatePresence>
        {details && (() => {
          const s = STATUS_STYLE[details.status] || STATUS_STYLE.active
          const total = details.items.reduce((sum, o) => sum + linePrice(o) * (o.quantity || 1), 0)
          return (
            <motion.div key="order-details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
              onMouseDown={e => { if (e.target === e.currentTarget) setDetails(null) }}>
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ type: 'spring', damping: 28, stiffness: 340 }}
                onClick={e => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', background: 'var(--col-modal)', border: `1px solid ${C.goldBorder}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column' }}>

                {/* Gold top bar */}
                <div style={{ height: 3, background: `linear-gradient(90deg,${C.gold},var(--col-acc2),rgba(var(--rgb-acc),0.15))`, flexShrink: 0 }} />

                <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <div>
                      <h2 className="font-display" style={{ fontSize: '1.5rem', color: C.white, fontWeight: 400, lineHeight: 1.1, marginBottom: 5 }}>Order Details</h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                          {details.items.length} item{details.items.length !== 1 ? 's' : ''}
                        </span>
                        <span style={{ color: 'rgba(var(--rgb-hi),0.18)', fontSize: 10 }}>·</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: C.muted, letterSpacing: '0.04em' }}>
                          {format(new Date(details.created_at), 'MMM d, yyyy · HH:mm')}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setDetails(null)}
                      style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <X size={13} />
                    </button>
                  </div>

                  {/* Product list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {details.items.map((item) => {
                      const itemTotal = linePrice(item) * (item.quantity || 1)
                      return (
                        <div key={item.id} style={{ display: 'flex', gap: '0.875rem', padding: '0.875rem', background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 12 }}>
                          <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--col-card)', border: `1px solid ${C.border}`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {item.products?.image_url
                              ? <img src={item.products.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <Package size={18} color="var(--col-text)" strokeWidth={1} />
                            }
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: C.white, fontSize: '0.88rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              {item.products?.name || '—'}
                            </p>
                            {item.products?.category && (
                              <p style={{ color: C.muted, fontSize: '0.7rem', fontFamily: 'DM Sans,sans-serif', textTransform: 'capitalize', marginBottom: 6 }}>
                                {item.products.category}
                              </p>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>×{item.quantity || 1}</span>
                              {linePrice(item) > 0 && <>
                                <span style={{ width: 1, height: 10, background: C.border }} />
                                <span style={{ fontSize: '0.7rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>@ ${linePrice(item).toFixed(2)} each</span>
                              </>}
                            </div>
                          </div>
                          <span style={{ fontSize: '0.92rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, flexShrink: 0, alignSelf: 'center' }}>
                            ${itemTotal.toFixed(2)}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Order total (only when multi-item) */}
                  {details.items.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.875rem', background: C.goldBg, border: `1px solid ${C.goldBorder}`, borderRadius: 10, marginBottom: '1rem' }}>
                      <span style={{ fontSize: '0.82rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Order Total</span>
                      <span style={{ fontSize: '1.05rem', color: C.gold, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>${total.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Client + date grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '1rem' }}>
                    <div style={{ padding: '0.75rem', background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                      <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 5 }}>Client</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--col-acc)', border: `1px solid ${C.goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: 'var(--col-bg)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>
                            {(details.profiles?.full_name || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: '0.78rem', color: C.white, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {details.profiles?.full_name || '—'}
                          </p>
                          {details.profiles?.phone && (
                            <p style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>{details.profiles.phone}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                      <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 5 }}>Ordered</p>
                      <p style={{ fontSize: '0.78rem', color: C.white, fontFamily: 'DM Sans,sans-serif' }}>
                        {format(new Date(details.created_at), 'MMM d, yyyy')}
                      </p>
                      <p style={{ fontSize: '0.68rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>
                        {format(new Date(details.created_at), 'HH:mm')}
                      </p>
                    </div>
                  </div>

                  {/* Status + payment */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, marginBottom: '1.25rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, boxShadow: `0 0 8px ${s.color}88`, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flex: 1 }}>{s.label}</span>
                    {details.payment_status === 'paid'
                      ? <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.22)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Paid online</span>
                      : details.status === 'retrieved'
                        ? <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.22)', color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Paid in store</span>
                        : <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.22)', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Pay in store</span>
                    }
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {details.status === 'retrieved' && (
                      <button onClick={() => revertToWaiting(details)} disabled={updating === details.groupId} className="o-revert"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0.65rem', borderRadius: 10, background: C.goldBg, border: `1px solid ${C.goldBorder}`, color: C.gold, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: updating === details.groupId ? 'not-allowed' : 'pointer', transition: 'all .18s', opacity: updating === details.groupId ? 0.5 : 1 }}>
                        {updating === details.groupId
                          ? <div style={{ width: 12, height: 12, border: `2px solid ${C.goldBorder}`, borderTopColor: C.gold, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                          : <RotateCcw size={14} />}
                        Revert to Awaiting Pickup
                      </button>
                    )}
                    {details.status === 'active' && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => markRetrieved(details)} disabled={updating === details.groupId} className="o-retrieve"
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0.65rem', borderRadius: 10, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.28)', color: '#34d399', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: updating === details.groupId ? 'not-allowed' : 'pointer', transition: 'all .18s', opacity: updating === details.groupId ? 0.5 : 1 }}>
                          {updating === details.groupId
                            ? <div style={{ width: 12, height: 12, border: '2px solid rgba(52,211,153,0.3)', borderTopColor: '#34d399', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                            : <Check size={14} />}
                          Mark as Picked Up
                        </button>
                        {!isManager && (
                          <button onClick={() => cancelOrder(details)} disabled={updating === details.groupId} className="o-cancel"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0.65rem 1rem', borderRadius: 10, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: updating === details.groupId ? 'not-allowed' : 'pointer', transition: 'all .18s', opacity: updating === details.groupId ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                            <X size={13} /> Cancel
                          </button>
                        )}
                      </div>
                    )}
                    {isAdmin && (
                      <button onClick={() => openDelete(details)} className="o-delete"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0.6rem', borderRadius: 10, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', color: 'rgba(248,113,113,0.6)', fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, cursor: 'pointer', transition: 'all .18s', letterSpacing: '0.06em' }}>
                        <Trash2 size={12} /> Delete Order
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
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
              style={{ width: '100%', maxWidth: 400, background: 'var(--col-modal)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.75)' }}>
              <div style={{ height: 3, background: 'linear-gradient(90deg,#f87171,rgba(248,113,113,0.3))' }} />
              <div style={{ padding: '1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: '1.25rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AlertTriangle size={18} color="#f87171" />
                  </div>
                  <div>
                    <h3 style={{ color: C.white, fontFamily: '"Cormorant Garamond",serif', fontSize: '1.35rem', fontWeight: 500, marginBottom: 4 }}>Delete order?</h3>
                    <p style={{ color: C.muted, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.5 }}>This is permanent and cannot be undone.</p>
                  </div>
                </div>
                <div style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.12)', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1.25rem' }}>
                  <p style={{ color: C.white, fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, marginBottom: 3 }}>
                    {deleteTarget.items.map(i => i.products?.name || '?').join(', ')}
                  </p>
                  <p style={{ color: C.muted, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif' }}>
                    {deleteTarget.profiles?.full_name} · {deleteTarget.items.length} item{deleteTarget.items.length !== 1 ? 's' : ''} · ${deleteTarget.items.reduce((sum, o) => sum + linePrice(o) * (o.quantity || 1), 0).toFixed(2)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={closeDelete}
                    style={{ flex: 1, padding: '0.7rem', borderRadius: 10, background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.08)', color: C.muted, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={confirmDelete}
                    style={{ flex: 1, padding: '0.7rem', borderRadius: 10, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer' }}>
                    Delete
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
