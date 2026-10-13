import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, ChevronLeft, ChevronRight, User, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getOrFetch } from '../lib/cache'

const CATS    = ['All', 'Cut', 'Color', 'Style', 'Treatment']
const GENDERS = ['All', 'Woman', 'Man']
const PER_PAGE = 6

const GALLERY = [
  {
    id: 1, category: 'cut', gender: 'woman',
    image_url: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=800&q=85',
    title: 'Precision French Bob',
    description: 'A sleek, jaw-length bob sculpted to perfection. Clean lines and effortless movement make this cut a timeless signature for modern elegance.',
    stylist: 'Sophie Laurent', duration: '45 min', price: 'from $45',
  },
  {
    id: 2, category: 'color', gender: 'woman',
    image_url: 'https://images.unsplash.com/photo-1614020863825-28a0bb7e3c3c?auto=format&fit=crop&w=800&q=85',
    title: 'Sunlit Balayage',
    description: 'Hand-painted highlights that mimic the natural warmth of sunlight. Seamlessly blended from root to tip for a lived-in, radiant finish.',
    stylist: 'Isabelle Moreau', duration: '2h 30 min', price: 'from $120',
  },
  {
    id: 3, category: 'style', gender: 'woman',
    image_url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=85',
    title: 'Voluminous Blow-Out',
    description: 'Full-bodied, glossy blow-out styled for lasting hold and maximum shine. Perfect for special occasions or whenever you want to feel extraordinary.',
    stylist: 'Camille Dubois', duration: '45 min', price: 'from $55',
  },
  {
    id: 4, category: 'color', gender: 'woman',
    image_url: 'https://images.unsplash.com/photo-1554519934-e32b1629d9ee?auto=format&fit=crop&w=800&q=85',
    title: 'Warm Copper Ombré',
    description: 'A rich gradient transitioning from deep roots to warm copper ends. Expertly blended for a bold yet sophisticated colour story.',
    stylist: 'Marie Fontaine', duration: '3h', price: 'from $150',
  },
  {
    id: 5, category: 'cut', gender: 'woman',
    image_url: 'https://images.unsplash.com/photo-1634449571010-02389ed0f9b0?auto=format&fit=crop&w=800&q=85',
    title: 'Textured Layers',
    description: 'Soft, cascading layers that add movement and body to any hair type. Personalised to complement your face shape and natural texture.',
    stylist: 'Sophie Laurent', duration: '1h', price: 'from $65',
  },
  {
    id: 6, category: 'treatment', gender: 'woman',
    image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=85',
    title: 'Keratin Smoothing',
    description: 'A professional keratin treatment that eliminates frizz and restores silk-like smoothness for up to 3 months.',
    stylist: 'Elena Rousseau', duration: '2h', price: 'from $180',
  },
  {
    id: 7, category: 'color', gender: 'woman',
    image_url: 'https://images.unsplash.com/photo-1605980766335-d3a41c7332a1?auto=format&fit=crop&w=800&q=85',
    title: 'Platinum Highlights',
    description: 'Striking platinum streaks woven through darker roots for a high-contrast, editorial look. Bold, luminous, and completely unforgettable.',
    stylist: 'Isabelle Moreau', duration: '3h 30 min', price: 'from $180',
  },
  {
    id: 8, category: 'style', gender: 'woman',
    image_url: 'https://images.unsplash.com/photo-1560869713-7d0a29430803?auto=format&fit=crop&w=800&q=85',
    title: 'Effortless Beach Waves',
    description: 'Tousled, sun-kissed waves styled to look naturally undone. Light and breezy — the ultimate everyday glamour.',
    stylist: 'Camille Dubois', duration: '1h', price: 'from $65',
  },
  {
    id: 9, category: 'cut', gender: 'man',
    image_url: 'https://images.unsplash.com/photo-1595475884562-073c30d45670?auto=format&fit=crop&w=800&q=85',
    title: "Classic Men's Cut",
    description: 'A refined, well-structured cut tailored to the individual. Clean edges, precise fade, and a finish that stays sharp all week.',
    stylist: 'Julien Lefebvre', duration: '45 min', price: 'from $40',
  },
  {
    id: 10, category: 'treatment', gender: 'man',
    image_url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=85',
    title: 'Deep Hydration Ritual',
    description: 'An intensive moisture treatment that revives dry, damaged hair from within. Leaves strands visibly stronger, softer, and full of life.',
    stylist: 'Elena Rousseau', duration: '1h 15 min', price: 'from $95',
  },
  {
    id: 11, category: 'style', gender: 'woman',
    image_url: 'https://images.unsplash.com/photo-1499557354967-2b2d8910bcca?auto=format&fit=crop&w=800&q=85',
    title: 'Updo Elegance',
    description: 'A sculpted updo that balances sophistication and softness. Crafted for weddings, galas, or any moment that deserves to be remembered.',
    stylist: 'Antoine Bernard', duration: '1h 30 min', price: 'from $90',
  },
  {
    id: 12, category: 'color', gender: 'woman',
    image_url: 'https://images.unsplash.com/photo-1605497788044-5a32c7078486?auto=format&fit=crop&w=800&q=85',
    title: 'Vivid Fantasy Color',
    description: 'Fearless, head-turning colour crafted for those who dare to stand out. Every shade mixed and applied with precision for a lasting, luminous result.',
    stylist: 'Marie Fontaine', duration: '4h', price: 'from $220',
  },
]

export default function Gallery() {
  const [images,   setImages]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [cat,      setCat]      = useState('All')
  const [gender,   setGender]   = useState('All')
  const [page,     setPage]     = useState(1)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    getOrFetch('gallery_all', async () => {
      const { data } = await supabase.from('gallery').select('*, stylists(name)').or('visible.is.null,visible.eq.true').order('display_order')
      return data || []
    }, 5 * 60_000).then(data => { setImages(data); setLoading(false) })
  }, [])

  useEffect(() => {
    document.body.style.overflow = lightbox ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [lightbox])

  // Demo photos only stand in while the salon has none of its own
  const source    = loading ? [] : (images.length ? images : GALLERY)
  // Real photos have no gender, so the Woman/Man filter only applies to tagged photos
  const hasGender = source.some(img => img.gender)
  const filtered  = source
    .filter(img => cat === 'All' || img.category === cat.toLowerCase())
    .filter(img => !hasGender || gender === 'All' || img.gender === gender.toLowerCase())
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const lbIdx  = lightbox ? filtered.findIndex(i => i.id === lightbox.id) : -1
  const lbPrev = lbIdx > 0 ? filtered[lbIdx - 1] : null
  const lbNext = lbIdx < filtered.length - 1 ? filtered[lbIdx + 1] : null

  useEffect(() => {
    const onKey = e => {
      if (!lightbox) return
      if (e.key === 'Escape')      setLightbox(null)
      if (e.key === 'ArrowLeft'  && lbPrev) setLightbox(lbPrev)
      if (e.key === 'ArrowRight' && lbNext) setLightbox(lbNext)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, lbPrev, lbNext])

  function changeFilter(fn) { fn(); setPage(1) }
  function changePage(p)    { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 100, paddingBottom: 100, position: 'relative' }}>

      {/* Ambient glow */}
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: 1100, height: 560, background: 'radial-gradient(ellipse, rgba(var(--rgb-acc),0.06) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />

      <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <motion.span className="sec-label"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}>
            Our Work
          </motion.span>

          <motion.h1
            className="font-display"
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ color: 'var(--col-text)', fontSize: 'clamp(4.5rem, 12vw, 9rem)', lineHeight: 0.9, fontWeight: 300, letterSpacing: '-0.02em', marginBottom: 28 }}>
            Gallery
          </motion.h1>

          <motion.div
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
            transition={{ duration: 0.85, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--col-acc) 30%, var(--col-acc2) 50%, var(--col-acc) 70%, transparent)', maxWidth: 280, margin: '0 auto 24px', transformOrigin: 'center' }} />

          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            style={{ color: 'var(--col-text)', fontSize: '0.88rem', lineHeight: 1.9, maxWidth: 360, margin: '0 auto', opacity: 0.55, fontFamily: 'DM Sans, sans-serif', fontWeight: 300 }}>
            Every image is a story of craft, care, and transformation.
          </motion.p>

          {!loading && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              style={{ marginTop: 14, fontSize: 12, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--col-acc)', fontFamily: 'DM Sans, sans-serif' }}>
              {filtered.length} {filtered.length === 1 ? 'work' : 'works'}
            </motion.p>
          )}
        </div>

        {/* ── Filters ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.22 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 60 }}>

          {/* Gender segmented control */}
          <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(var(--rgb-hi),0.1)', background: 'rgba(var(--rgb-hi),0.03)' }}>
            {hasGender && GENDERS.map(g => (
              <button key={g} onClick={() => changeFilter(() => setGender(g))}
                style={{ padding: '9px 28px', background: gender === g ? 'var(--col-acc)' : 'transparent', color: gender === g ? 'var(--col-bg)' : 'var(--col-text)', border: 'none', cursor: 'pointer', fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif', fontWeight: gender === g ? 600 : 400, transition: 'all 0.22s ease' }}>
                {g}
              </button>
            ))}
          </div>

          {/* Category pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {CATS.map(c => (
              <button key={c} onClick={() => changeFilter(() => setCat(c))}
                style={{ padding: '6px 18px', borderRadius: 9999, cursor: 'pointer', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif', fontWeight: 500, transition: 'all 0.22s ease', background: cat === c ? 'rgba(var(--rgb-acc),0.13)' : 'transparent', border: cat === c ? '1px solid rgba(var(--rgb-acc),0.38)' : '1px solid rgba(var(--rgb-hi),0.1)', color: cat === c ? 'var(--col-acc)' : 'var(--col-text)', boxShadow: cat === c ? '0 2px 12px rgba(var(--rgb-acc),0.14)' : 'none' }}>
                {c}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Grid ── */}
        {loading ? (
          <div className="gal-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="shimmer" style={{ aspectRatio: '3/4', borderRadius: 6 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ textAlign: 'center', padding: '6rem 0' }}>
            <p className="font-display" style={{ color: 'var(--col-text)', fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 300, marginBottom: 10 }}>Nothing here yet</p>
            <p style={{ color: 'var(--col-text)', fontSize: '0.85rem', fontFamily: 'DM Sans, sans-serif', opacity: 0.45 }}>Try a different filter combination</p>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${cat}-${gender}-${page}`}
              className="gal-grid"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}>
              {paginated.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="gal-card"
                  onClick={() => setLightbox(item)}
                  style={{ aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', position: 'relative', cursor: 'pointer', background: 'rgba(255,255,255,0.04)' }}>

                  <div className="gal-shimmer" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
                  <img src={item.image_url} alt={item.title || ''}
                    className="gal-img" loading="lazy" decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.9s cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease', opacity: 0, position: 'relative', zIndex: 1 }}
                    onLoad={e => { e.currentTarget.style.opacity = '1'; const s = e.currentTarget.previousSibling; if (s) s.style.display = 'none' }} />

                  {/* Permanent bottom gradient */}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 42%, transparent 65%)', pointerEvents: 'none' }} />

                  {/* Category tag */}
                  {item.category && (
                    <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 2 }}>
                      <span style={{ fontSize: 10, padding: '3.5px 10px', borderRadius: 20, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(10px)', color: 'rgba(255,255,255,0.82)', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {item.category}
                      </span>
                    </div>
                  )}

                  {/* Always-visible title */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 1.1rem 1.1rem', zIndex: 2 }}>
                    {item.title && (
                      <p className="font-display" style={{ color: '#fff', fontSize: '1.1rem', lineHeight: 1.1, margin: 0 }}>
                        {item.title}
                      </p>
                    )}
                  </div>

                  {/* Hover layer */}
                  <div className="gal-hover" style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '1.1rem', background: 'transparent', transition: 'background 0.35s ease', pointerEvents: 'none' }}>
                    <div className="gal-hover-info" style={{ opacity: 0, transform: 'translateY(7px)', transition: 'all 0.35s ease' }}>
                      {(item.stylist || item.stylists?.name) && (
                        <p style={{ fontSize: 11, color: 'var(--col-acc)', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif', margin: 0 }}>
                          {item.stylist || item.stylists?.name}
                        </p>
                      )}
                    </div>
                    <div className="gal-hover-btn" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--col-acc)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transform: 'scale(0.55)', transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)', flexShrink: 0 }}>
                      <ArrowRight size={13} color="var(--col-bg)" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 64 }}>
            <button onClick={() => changePage(page - 1)} disabled={page === 1}
              style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.1)', color: 'var(--col-text)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.28 : 1, transition: 'all 0.2s' }}>
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => changePage(p)}
                style={{ width: 38, height: 38, borderRadius: 10, fontSize: 12, fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.22s', background: p === page ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.04)', border: p === page ? 'none' : '1px solid rgba(var(--rgb-hi),0.1)', color: p === page ? 'var(--col-bg)' : 'var(--col-text)', fontWeight: p === page ? 700 : 400, boxShadow: p === page ? '0 4px 18px rgba(var(--rgb-acc),0.35)' : 'none' }}>
                {p}
              </button>
            ))}
            <button onClick={() => changePage(page + 1)} disabled={page === totalPages}
              style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.1)', color: 'var(--col-text)', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.28 : 1, transition: 'all 0.2s' }}>
              <ChevronRight size={14} />
            </button>
          </motion.div>
        )}
      </div>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            onClick={() => setLightbox(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>

            {/* Prev arrow */}
            {lbPrev && (
              <button onClick={e => { e.stopPropagation(); setLightbox(lbPrev) }}
                className="gal-lb-arrow"
                style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(12px)', transition: 'all 0.2s' }}>
                <ChevronLeft size={20} />
              </button>
            )}

            {/* Next arrow */}
            {lbNext && (
              <button onClick={e => { e.stopPropagation(); setLightbox(lbNext) }}
                className="gal-lb-arrow"
                style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(12px)', transition: 'all 0.2s' }}>
                <ChevronRight size={20} />
              </button>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={lightbox.id}
                initial={{ opacity: 0, scale: 0.95, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                onClick={e => e.stopPropagation()}
                className="gal-lb-modal"
                style={{ width: '100%', maxWidth: 940, maxHeight: '88vh', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 64px 160px rgba(0,0,0,0.9)', display: 'flex', position: 'relative' }}>

                {/* Close button — top-right of modal */}
                <button onClick={() => setLightbox(null)} className="gal-lb-close"
                  style={{ position: 'absolute', top: 14, right: 14, zIndex: 20, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.2s' }}>
                  <X size={14} />
                </button>

                {/* Image panel */}
                <div style={{ flex: '0 0 57%', position: 'relative', overflow: 'hidden', minHeight: 320, background: 'rgba(255,255,255,0.04)' }}>
                  <img src={lightbox.image_url} alt={lightbox.title || ''}
                    loading="lazy" decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0, transition: 'opacity 0.4s ease' }}
                    onLoad={e => { e.currentTarget.style.opacity = '1' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,0,0,0.06) 50%, rgba(0,0,0,0.5) 100%)' }} />
                  <div style={{ position: 'absolute', bottom: 18, left: 20 }}>
                    <span style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', fontFamily: 'DM Sans, sans-serif' }}>
                      {lbIdx + 1} of {filtered.length}
                    </span>
                  </div>
                </div>

                {/* Detail panel */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--col-bg)', overflowY: 'auto', position: 'relative' }}>
                  {/* Accent bar */}
                  <div style={{ height: 2, flexShrink: 0, background: 'linear-gradient(90deg, var(--col-acc), var(--col-acc2), rgba(var(--rgb-acc),0.15))' }} />

                  <div style={{ flex: 1, padding: '2rem 2rem 2.5rem', display: 'flex', flexDirection: 'column' }}>

                    {/* Category pill */}
                    {lightbox.category && (
                      <span style={{ fontSize: 10, padding: '4px 14px', borderRadius: 9999, background: 'rgba(var(--rgb-acc),0.1)', border: '1px solid rgba(var(--rgb-acc),0.25)', color: 'var(--col-acc)', fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.22em', textTransform: 'uppercase', display: 'inline-block', width: 'fit-content', marginBottom: '1.25rem' }}>
                        {lightbox.category}
                      </span>
                    )}

                    {/* Title */}
                    <h2 className="font-display" style={{ color: 'var(--col-text)', fontSize: 'clamp(1.7rem,2.8vw,2.4rem)', lineHeight: 1.05, fontWeight: 300, margin: '0 0 1rem' }}>
                      {lightbox.title}
                    </h2>

                    {/* Divider */}
                    <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(var(--rgb-acc),0.3), transparent)', marginBottom: '1.25rem' }} />

                    {/* Description */}
                    {lightbox.description && (
                      <p style={{ color: 'var(--col-text)', opacity: 0.55, fontSize: '0.845rem', lineHeight: 1.9, margin: 0, fontFamily: 'DM Sans, sans-serif', fontWeight: 300 }}>
                        {lightbox.description}
                      </p>
                    )}

                    <div style={{ flex: 1, minHeight: 20 }} />

                    {/* Meta */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.5rem' }}>
                      {(lightbox.stylist || lightbox.stylists?.name) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(var(--rgb-acc),0.08)', border: '1px solid rgba(var(--rgb-acc),0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <User size={12} color="var(--col-acc)" />
                          </div>
                          <div>
                            <p style={{ fontSize: 10, color: 'var(--col-text)', opacity: 0.35, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif', margin: '0 0 2px' }}>Stylist</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--col-text)', opacity: 0.8, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>{lightbox.stylist || lightbox.stylists?.name}</p>
                          </div>
                        </div>
                      )}
                      {lightbox.duration && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(var(--rgb-acc),0.08)', border: '1px solid rgba(var(--rgb-acc),0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Clock size={12} color="var(--col-acc)" />
                          </div>
                          <div>
                            <p style={{ fontSize: 10, color: 'var(--col-text)', opacity: 0.35, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'DM Sans, sans-serif', margin: '0 0 2px' }}>Duration</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--col-text)', opacity: 0.8, fontFamily: 'DM Sans, sans-serif', margin: 0 }}>{lightbox.duration}</p>
                          </div>
                        </div>
                      )}
                      {lightbox.price && (
                        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(var(--rgb-acc),0.05)', border: '1px solid rgba(var(--rgb-acc),0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--col-text)', opacity: 0.35, fontFamily: 'DM Sans, sans-serif' }}>Starting from</span>
                          <span className="font-display" style={{ fontSize: '1.4rem', color: 'var(--col-acc)', lineHeight: 1 }}>{lightbox.price}</span>
                        </div>
                      )}
                    </div>

                    {/* CTA */}
                    <Link to="/appointments" onClick={() => setLightbox(null)}
                      className="btn-gold" style={{ width: '100%', justifyContent: 'center', borderRadius: 10 }}>
                      Book this Service <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes gal-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .gal-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 100%);
          background-size: 200% 100%;
          animation: gal-shimmer 1.6s infinite linear;
        }
        .gal-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .gal-card:hover .gal-img { transform: scale(1.08) !important; }
        .gal-card:hover .gal-hover { background: rgba(0,0,0,0.48) !important; }
        .gal-card:hover .gal-hover-info { opacity: 1 !important; transform: translateY(0) !important; }
        .gal-card:hover .gal-hover-btn { opacity: 1 !important; transform: scale(1) !important; }
        .gal-lb-arrow:hover { background: rgba(255,255,255,0.12) !important; border-color: rgba(255,255,255,0.22) !important; color: #fff !important; }
        .gal-lb-close:hover { background: rgba(255,255,255,0.18) !important; border-color: rgba(255,255,255,0.3) !important; color: #fff !important; }
        .gal-lb-modal { flex-direction: row; }
        @media (max-width: 800px) {
          .gal-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .gal-lb-modal { flex-direction: column !important; overflow-y: auto; max-height: 92vh; }
          .gal-lb-modal > div:first-child { flex: 0 0 clamp(220px,42vw,300px) !important; min-height: clamp(220px,42vw,300px) !important; }
        }
        @media (max-width: 480px) {
          .gal-grid { gap: 6px; }
        }
      `}</style>
    </div>
  )
}
