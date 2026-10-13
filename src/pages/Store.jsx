import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Minus, Package, CheckCircle, ShoppingCart, ChevronRight, MapPin, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { useNavigate } from 'react-router-dom'
import { getOrFetch } from '../lib/cache'


/* Per-card quantity state lives here so each card tracks its own qty */
function ProductCard({ p, inCart, cartItems, onAddToCart, onViewDetail, isGuest }) {
  const [qty, setQty] = useState(1)
  const [adding, setAdding] = useState(false)
  const outOfStock = (p.stock || 0) === 0

  async function handleAdd(e) {
    e.stopPropagation()
    if (outOfStock || adding) return
    setAdding(true)
    await onAddToCart(p, qty)
    setAdding(false)
    setQty(1)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'var(--col-card)',
        border: inCart ? '1.5px solid rgba(52,211,153,0.35)' : '1px solid rgba(var(--rgb-hi),0.07)',
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: outOfStock ? 0.55 : 1,
        transition: 'border-color 0.3s, box-shadow 0.3s, transform 0.3s',
      }}
      whileHover={{ y: outOfStock ? 0 : -3, boxShadow: outOfStock ? 'none' : '0 12px 40px rgba(0,0,0,0.5)' }}
    >
      {/* ── Image ──────────────────────────────── */}
      <div
        onClick={() => onViewDetail(p)}
        style={{ position: 'relative', aspectRatio: '1/1', overflow: 'hidden', background: 'var(--col-modal)', cursor: 'pointer', flexShrink: 0 }}
      >
        {p.image_url
          ? <img src={p.image_url} alt={p.name} loading="lazy" decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.55s ease, opacity 0.4s ease', display: 'block', opacity: 0 }}
              onLoad={e => { e.currentTarget.style.opacity = '1' }}
              onMouseEnter={e => { if (!outOfStock) e.currentTarget.style.transform = 'scale(1.05)' }}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={40} color="rgba(var(--rgb-hi),0.06)" />
            </div>
        }

        {/* Badges */}
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {inCart && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, background: 'rgba(52,211,153,0.9)', fontSize: 11, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              <CheckCircle size={9} /> In Cart
            </span>
          )}
          {!inCart && p.stock > 0 && p.stock < 5 && (
            <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(245,158,11,0.85)', fontSize: 11, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Only {p.stock} left
            </span>
          )}
          {outOfStock && (
            <span style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(0,0,0,0.75)', fontSize: 11, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Out of stock
            </span>
          )}
        </div>

        {/* Quick-view hint */}
        <div style={{ position: 'absolute', bottom: 10, right: 10, opacity: 0, transition: 'opacity 0.25s' }} className="qv-btn">
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', fontSize: 11, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Details <ChevronRight size={9} />
          </span>
        </div>
      </div>

      {/* ── Info ───────────────────────────────── */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* Category */}
        {p.category && (
          <span style={{ fontSize: 11, color: 'var(--col-acc)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 5 }}>
            {p.category}
          </span>
        )}

        {/* Name */}
        <p
          onClick={() => onViewDetail(p)}
          style={{ color: 'var(--col-text)', fontSize: '0.88rem', fontWeight: 500, lineHeight: 1.35, marginBottom: 10, cursor: 'pointer', transition: 'color 0.2s', flex: 1 }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--col-acc)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--col-text)'}>
          {p.name}
        </p>

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
          <span className="font-display" style={{ fontSize: '1.45rem', color: 'var(--col-acc)', lineHeight: 1 }}>${parseFloat(p.price).toFixed(2)}</span>
          {qty > 1 && (
            <span style={{ fontSize: 11, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>×{qty} = ${(p.price * qty).toFixed(2)}</span>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(var(--rgb-hi),0.05)', marginBottom: 14 }} />

        {/* Qty + Add row */}
        {/* In-cart count badge */}
        {inCart && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <CheckCircle size={11} color="#34d399" />
            <span style={{ fontSize: 12, color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
              {cartItems.find(i => i.product_id === p.id)?.quantity ?? 0} in cart
            </span>
          </div>
        )}

        {isGuest ? (
          /* ── Guest: sign-in prompt button ──────────────────── */
          <button
            onClick={e => { e.stopPropagation(); onAddToCart(p, 1) }}
            disabled={outOfStock}
            style={{
              width: '100%', height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: 'rgba(var(--rgb-hi),0.04)',
              color: outOfStock ? 'var(--col-text)' : 'var(--col-text)',
              border: '1px solid rgba(var(--rgb-hi),0.1)',
              cursor: outOfStock ? 'not-allowed' : 'pointer',
              fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { if (!outOfStock) { e.currentTarget.style.background = 'rgba(var(--rgb-hi),0.08)'; e.currentTarget.style.color = 'var(--col-text)'; e.currentTarget.style.borderColor = 'var(--col-text)' } }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--rgb-hi),0.04)'; e.currentTarget.style.color = outOfStock ? 'var(--col-text)' : 'var(--col-text)'; e.currentTarget.style.borderColor = 'rgba(var(--rgb-hi),0.1)' }}>
            <Lock size={11} /> Sign in to order
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Qty selector */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.09)', borderRadius: 10, flexShrink: 0 }}>
              <button
                onClick={e => { e.stopPropagation(); setQty(q => Math.max(1, q - 1)) }}
                disabled={outOfStock}
                style={{ width: 34, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--col-text)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s', borderRadius: '10px 0 0 10px' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--col-text)'}>
                <Minus size={11} />
              </button>
              <span style={{ width: 28, textAlign: 'center', color: 'var(--col-text)', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'DM Sans,sans-serif', userSelect: 'none' }}>
                {qty}
              </span>
              <button
                onClick={e => { e.stopPropagation(); setQty(q => Math.min(p.stock || 10, q + 1)) }}
                disabled={outOfStock || qty >= (p.stock || 10)}
                style={{ width: 34, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: qty >= (p.stock || 10) ? 'var(--col-text)' : 'var(--col-text)', background: 'none', border: 'none', cursor: qty >= (p.stock || 10) ? 'not-allowed' : 'pointer', transition: 'color 0.15s', borderRadius: '0 10px 10px 0' }}
                onMouseEnter={e => { if (qty < (p.stock || 10)) e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => e.currentTarget.style.color = qty >= (p.stock || 10) ? 'var(--col-text)' : 'var(--col-text)'}>
                <Plus size={11} />
              </button>
            </div>

            {/* Add / Add more button */}
            <button
              onClick={handleAdd}
              disabled={outOfStock || adding}
              style={{
                flex: 1, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: outOfStock ? 'rgba(var(--rgb-hi),0.04)' : 'linear-gradient(135deg, var(--col-acc), var(--col-acc2))',
                color: outOfStock ? 'var(--col-text)' : 'var(--col-bg)',
                border: outOfStock ? '1px solid rgba(var(--rgb-hi),0.07)' : 'none',
                cursor: outOfStock ? 'not-allowed' : 'pointer',
                fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700,
                boxShadow: outOfStock ? 'none' : '0 4px 16px rgba(var(--rgb-acc),0.25)',
                transition: 'all 0.25s',
              }}
              onMouseEnter={e => { if (!outOfStock) { e.currentTarget.style.boxShadow = '0 6px 24px rgba(var(--rgb-acc),0.45)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = outOfStock ? 'none' : '0 4px 16px rgba(var(--rgb-acc),0.25)'; e.currentTarget.style.transform = 'translateY(0)' }}>
              {adding
                ? <div style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                : <><ShoppingCart size={12} /><span className="cart-btn-text">Add</span></>
              }
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ─── Main component ──────────────────────────────────── */
export default function Store() {
  const { user }                 = useAuth()
  const { cartItems, cartTotal, addToCart } = useCart()
  const navigate                 = useNavigate()
  const [products,  setProducts]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [activecat, setActivecat] = useState('All')
  const [detail,    setDetail]    = useState(null)
  const [dQty,      setDQty]      = useState(1)
  const [dAdding,      setDAdding]      = useState(false)
  const [showGuestModal, setShowGuestModal] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const data = await getOrFetch('products_available', async () => {
      const { data } = await supabase.from('products').select('*').eq('available', true).order('created_at', { ascending: false })
      return data || []
    }, 2 * 60_000)
    setProducts(data)
    setLoading(false)
  }

  const categories = ['All', ...new Set(products.flatMap(p => p.tags?.length ? p.tags : p.category ? [p.category] : []))]
  const filtered   = activecat === 'All' ? products : products.filter(p => {
    const cats = p.tags?.length ? p.tags : p.category ? [p.category] : []
    return cats.some(c => c.toLowerCase() === activecat.toLowerCase())
  })

  function inCart(id) { return cartItems.some(i => i.product_id === id) }
  const cartQty = cartItems.reduce((s, i) => s + i.quantity, 0)

  async function handleAddFromCard(product, qty) {
    if (!user) { setShowGuestModal(true); return }
    await addToCart(product, qty)
  }

  async function handleAddFromDetail() {
    if (!detail || !user) { setShowGuestModal(true); return }
    setDAdding(true)
    await addToCart(detail, dQty)
    setDAdding(false)
    setDetail(null); setDQty(1)
  }

  function openDetail(p) { setDetail(p); setDQty(1) }
  function closeDetail() { setDetail(null); setDQty(1) }

  return (
    <div className="page-root" style={{ minHeight: '100vh', paddingTop: 96, paddingBottom: 80, background: 'var(--col-bg)' }}>
      <div className="wrap">

        {/* ── Header ─────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
          <div>
            <h1 className="font-display font-light" style={{ color: 'var(--col-text)', fontSize: 'clamp(2rem,4vw,3rem)', lineHeight: 1, marginBottom: 6 }}>
              Store
            </h1>
            <p style={{ color: 'var(--col-text)', fontSize: '0.83rem', fontFamily: 'DM Sans,sans-serif' }}>
              {products.length} product{products.length !== 1 ? 's' : ''} · Pay online, pick up in-salon
            </p>
          </div>

          {/* Cart summary */}
          {user && (
            <button onClick={() => navigate('/profile', { state: { tab: 'Cart' } })}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderRadius: 12, background: cartQty > 0 ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${cartQty > 0 ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.08)'}`, cursor: 'pointer', transition: 'all 0.2s', overflow: 'visible', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <ShoppingCart size={16} color={cartQty > 0 ? 'var(--col-bg)' : 'var(--col-text)'} />
                {cartQty > 0 && (
                  <span style={{ position: 'absolute', top: -7, right: -7, width: 15, height: 15, borderRadius: '50%', background: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans,sans-serif' }}>{cartQty}</span>
                )}
              </div>
              <span style={{ fontSize: 12, color: cartQty > 0 ? 'var(--col-bg)' : 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
                {cartQty > 0 ? `Checkout · $${cartTotal.toFixed(2)}` : 'Cart'}
              </span>
            </button>
          )}
        </div>

        {/* ── Category filters ──────────────────── */}
        {categories.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 32, borderBottom: '1px solid rgba(var(--rgb-hi),0.06)', paddingBottom: 16, flexWrap: 'wrap' }}>
            {categories.map(cat => {
              const isActive = activecat === cat
              const count = cat === 'All' ? products.length : products.filter(p => (p.tags?.length ? p.tags : p.category ? [p.category] : []).some(c => c.toLowerCase() === cat.toLowerCase())).length
              return (
                <button key={cat} onClick={() => setActivecat(cat)} style={{
                  padding: '7px 16px', borderRadius: 8, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                  fontFamily: 'DM Sans,sans-serif', fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                  background: isActive ? 'rgba(var(--rgb-acc),0.12)' : 'transparent',
                  color: isActive ? 'var(--col-acc)' : 'var(--col-text)',
                  border: isActive ? '1px solid rgba(var(--rgb-acc),0.3)' : '1px solid transparent',
                  transition: 'all 0.18s',
                }}>
                  {cat}
                  <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.6 }}>({count})</span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── Product grid ─────────────────────── */}
        {loading ? (
          <div className="store-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--col-card)', border: '1px solid rgba(var(--rgb-hi),0.06)' }}>
                <div className="shimmer" style={{ aspectRatio: '1/1' }} />
                <div style={{ padding: '14px 16px' }}>
                  <div className="shimmer" style={{ height: 8, borderRadius: 4, width: '35%', marginBottom: 8 }} />
                  <div className="shimmer" style={{ height: 12, borderRadius: 4, width: '80%', marginBottom: 12 }} />
                  <div className="shimmer" style={{ height: 16, borderRadius: 4, width: '30%', marginBottom: 14 }} />
                  <div className="shimmer" style={{ height: 38, borderRadius: 10 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--col-text)', fontSize: '0.9rem', fontFamily: 'DM Sans,sans-serif' }}>
            No products in this category yet.
          </div>
        ) : (
          <div className="store-grid">
            {filtered.map(p => (
              <ProductCard
                key={p.id}
                p={p}
                inCart={inCart(p.id)}
                cartItems={cartItems}
                onAddToCart={handleAddFromCard}
                onViewDetail={openDetail}
                isGuest={!user}
              />
            ))}
          </div>
        )}

        {!user && !loading && filtered.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 32, display: 'flex', justifyContent: 'center' }}>
            <button onClick={() => setShowGuestModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 12, background: 'var(--col-acc)', border: '1px solid rgba(var(--rgb-acc),0.2)', color: 'var(--col-bg)', fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.08em', transition: 'all .2s' }}>
              <ShoppingCart size={13} /> Sign in to order
            </button>
          </div>
        )}
      </div>

      {/* ── Product detail modal ───────────────── */}
      <AnimatePresence>
        {detail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={e => { if (e.target === e.currentTarget) closeDetail() }}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
              className="store-detail-modal"
              style={{ width: '100%', maxWidth: 780, background: 'var(--col-card)', border: '1px solid rgba(var(--rgb-hi),0.09)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.8)', display: 'grid', gridTemplateColumns: '1fr 1fr', maxHeight: '92vh', position: 'relative' }}>

              {/* Close button — top-right of modal */}
              <button onClick={closeDetail}
                style={{ position: 'absolute', top: 14, right: 14, zIndex: 10, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.45)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}>
                <X size={14} />
              </button>

              {/* Image */}
              <div style={{ position: 'relative', background: 'var(--col-modal)', minHeight: 'clamp(240px, 50vh, 380px)' }}>
                {detail.image_url
                  ? <img src={detail.image_url} alt={detail.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, opacity: 0, transition: 'opacity 0.4s ease' }} onLoad={e => { e.currentTarget.style.opacity = '1' }} />
                  : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={56} color="rgba(var(--rgb-hi),0.05)" />
                    </div>
                }
                {detail.category && (
                  <div style={{ position: 'absolute', top: 16, left: 16, padding: '4px 12px', borderRadius: 6, background: 'var(--col-acc)' }}>
                    <span style={{ fontSize: 11, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: 'var(--col-bg)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>{detail.category}</span>
                  </div>
                )}
              </div>

              {/* Details */}
              <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
                <h2 className="font-display font-light" style={{ color: 'var(--col-text)', fontSize: '2rem', lineHeight: 1.1, marginBottom: '0.5rem' }}>{detail.name}</h2>

                <p className="font-display gold-gradient" style={{ fontSize: '2rem', lineHeight: 1, marginBottom: '1.25rem' }}>
                  ${(parseFloat(detail.price) * dQty).toFixed(2)}
                  {dQty > 1 && <span style={{ fontSize: '0.9rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', backgroundImage: 'none', WebkitTextFillColor: 'var(--col-text)', marginLeft: 8 }}>×{dQty}</span>}
                </p>

                <div style={{ height: 1, background: 'rgba(var(--rgb-hi),0.06)', marginBottom: '1.25rem' }} />

                {detail.description && (
                  <p style={{ color: 'var(--col-text)', fontSize: '0.84rem', lineHeight: 1.85, fontFamily: 'DM Sans,sans-serif', fontWeight: 300, marginBottom: '1.5rem', flex: 1 }}>{detail.description}</p>
                )}

                {/* Stock */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.5rem' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: detail.stock === 0 ? '#f87171' : detail.stock < 5 ? '#f59e0b' : '#34d399' }} />
                  <span style={{ fontSize: 12, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>
                    {detail.stock === 0 ? 'Out of stock' : detail.stock < 5 ? `Only ${detail.stock} left` : `In stock`}
                  </span>
                </div>

                {/* Qty */}
                {!inCart(detail.id) && detail.stock > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
                    <span style={{ fontSize: 11, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.14em', textTransform: 'uppercase', marginRight: 4 }}>Qty</span>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.1)', borderRadius: 10 }}>
                      <button onClick={() => setDQty(q => Math.max(1, q - 1))} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--col-text)', background: 'none', border: 'none', cursor: 'pointer' }}><Minus size={12} /></button>
                      <span style={{ width: 30, textAlign: 'center', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>{dQty}</span>
                      <button onClick={() => setDQty(q => Math.min(detail.stock || 10, q + 1))} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--col-text)', background: 'none', border: 'none', cursor: 'pointer' }}><Plus size={12} /></button>
                    </div>
                  </div>
                )}

                {inCart(detail.id) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <CheckCircle size={12} color="#34d399" />
                    <span style={{ fontSize: 11, color: '#34d399', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
                      {cartItems.find(i => i.product_id === detail.id)?.quantity ?? 0} already in cart
                    </span>
                  </div>
                )}
                {user ? (
                  <button onClick={handleAddFromDetail} disabled={dAdding || detail.stock === 0} className="btn-gold" style={{ width: '100%', justifyContent: 'center' }}>
                    {dAdding
                      ? <div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.25)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                      : <><ShoppingCart size={14} /><span className="cart-btn-text">Add to Cart · ${(parseFloat(detail.price) * dQty).toFixed(2)}</span></>
                    }
                  </button>
                ) : (
                  <button
                    onClick={() => setShowGuestModal(true)}
                    disabled={detail.stock === 0}
                    style={{
                      width: '100%', padding: '11px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.12)',
                      color: detail.stock === 0 ? 'var(--col-text)' : 'var(--col-text)',
                      fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700,
                      cursor: detail.stock === 0 ? 'not-allowed' : 'pointer', transition: 'all .2s',
                    }}
                    onMouseEnter={e => { if (detail.stock > 0) { e.currentTarget.style.background = 'rgba(var(--rgb-hi),0.08)'; e.currentTarget.style.color = 'var(--col-text)'; e.currentTarget.style.borderColor = 'var(--col-text)' } }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--rgb-hi),0.04)'; e.currentTarget.style.color = detail.stock === 0 ? 'var(--col-text)' : 'var(--col-text)'; e.currentTarget.style.borderColor = 'rgba(var(--rgb-hi),0.12)' }}>
                    <Lock size={13} /> Sign in to order
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Guest order modal ─────────────────── */}
      <AnimatePresence>
        {showGuestModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={e => { if (e.target === e.currentTarget) setShowGuestModal(false) }}
            style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.93, y: 8 }}
              transition={{ type: 'spring', damping: 26, stiffness: 340 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 400, background: 'var(--col-card)', border: '1px solid rgba(var(--rgb-hi),0.09)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.8)' }}>

              <div style={{ height: 3, background: 'linear-gradient(90deg,var(--col-acc),var(--col-acc2),rgba(var(--rgb-acc),0.2))' }} />

              <div style={{ padding: '1.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                  <button onClick={() => setShowGuestModal(false)}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.05)', border: '1px solid rgba(var(--rgb-hi),0.09)', color: 'var(--col-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={12} />
                  </button>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--col-acc)', border: '1px solid rgba(var(--rgb-acc),0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <ShoppingCart size={22} color="var(--col-acc)" strokeWidth={1.5} />
                  </div>
                  <h2 className="font-display font-light" style={{ color: 'var(--col-text)', fontSize: '1.6rem', lineHeight: 1.1, marginBottom: 10 }}>
                    Ready to order?
                  </h2>
                  <p style={{ color: 'var(--col-text)', fontSize: '0.84rem', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.7 }}>
                    Create an account or sign in to order online and have your items ready for pick-up.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.25rem' }}>
                  <button onClick={() => navigate('/login')} className="btn-gold" style={{ justifyContent: 'center', width: '100%' }}>
                    Log in to my account
                  </button>
                  <button onClick={() => navigate('/register')}
                    style={{ width: '100%', padding: '11px', borderRadius: 12, background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.09)', color: 'var(--col-text)', fontSize: 13, fontFamily: 'DM Sans,sans-serif', fontWeight: 500, cursor: 'pointer', transition: 'all .2s' }}>
                    Create a free account
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(var(--rgb-hi),0.03)', border: '1px solid rgba(var(--rgb-hi),0.07)' }}>
                  <MapPin size={14} color="var(--col-text)" strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: '0.78rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.6, margin: 0 }}>
                    Prefer to shop in person? Come visit us at the salon — all products are available to purchase directly in store.
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky checkout bar ── */}
      {user && cartQty > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="store-checkout-bar"
          style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            zIndex: 50, display: 'flex', alignItems: 'center', gap: 16,
            padding: '12px 12px 12px 20px', borderRadius: 16, whiteSpace: 'nowrap',
            background: 'var(--col-card)', border: '1px solid rgba(var(--rgb-acc),0.28)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(var(--rgb-acc),0.06)',
          }}>
          <ShoppingCart size={15} color="var(--col-acc)" />
          <span style={{ fontSize: 13, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>
            {cartQty} item{cartQty !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 14, color: 'var(--col-acc)', fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>
            ${cartTotal.toFixed(2)}
          </span>
          <button onClick={() => navigate('/profile', { state: { tab: 'Cart' } })} className="btn-gold" style={{ padding: '9px 22px', fontSize: 11, gap: 7 }}>
            Checkout <ChevronRight size={13} />
          </button>
        </motion.div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .product-card:hover .qv-btn { opacity: 1 !important; }
        .store-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 1.25rem;
        }
        .cart-btn-text { margin-left: 5px; }
        @media (max-width: 540px) {
          .cart-btn-text { display: none; }
          .store-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 0.75rem;
          }
          .store-checkout-bar {
            left: 12px !important;
            right: 12px !important;
            bottom: max(16px, env(safe-area-inset-bottom, 16px)) !important;
            transform: none !important;
            white-space: normal !important;
            justify-content: space-between;
          }
        }
        @media (max-width: 720px) {
          .store-detail-modal {
            grid-template-columns: 1fr !important;
            max-height: 92vh;
            overflow-y: auto;
          }
          .store-detail-modal > div:first-child {
            min-height: 200px !important;
            max-height: clamp(200px, 35vh, 260px);
          }
        }
      `}</style>
    </div>
  )
}
