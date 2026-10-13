import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Edit2, Trash2, X, Save, Scissors, Clock, Upload, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getOrFetch, invalidate } from '../../lib/cache'
import { useLogAction } from '../../hooks/useLogAction'
import toast from 'react-hot-toast'

const C = {
  card: 'var(--col-modal)', modal: 'var(--col-modal)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)', subtle: 'rgba(var(--rgb-hi),0.06)',
  border: 'rgba(var(--rgb-hi),0.07)',
}

const CATS = ['cut', 'color', 'treatment', 'style', 'other']

const CAT = {
  cut:       { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   gradient: 'rgba(96,165,250,0.15)',   label: 'Cut' },
  color:     { color: '#c084fc', bg: 'rgba(192,132,252,0.1)',  gradient: 'rgba(192,132,252,0.15)',  label: 'Color' },
  treatment: { color: '#34d399', bg: 'rgba(52,211,153,0.1)',   gradient: 'rgba(52,211,153,0.15)',   label: 'Treatment' },
  style:     { color: 'var(--col-acc)', bg: 'rgba(var(--rgb-acc),0.1)', gradient: 'rgba(var(--rgb-acc),0.15)', label: 'Style' },
  other:     { color: 'var(--col-text)', bg: 'rgba(var(--rgb-hi),0.06)', gradient: 'rgba(var(--rgb-hi),0.06)', label: 'Other' },
}

const EMPTY = { name: '', description: '', price: '', duration: '', category: '', active: true, image_url: '', gender: 'mixed' }

const GENDER = [
  { value: 'man',   label: 'Men',   color: '#60a5fa', border: 'rgba(96,165,250,0.35)' },
  { value: 'woman', label: 'Women', color: '#f472b6', border: 'rgba(244,114,182,0.35)' },
  { value: 'mixed', label: 'Both',  color: 'var(--col-acc)', border: 'var(--col-acc)' },
]

const inp = (extra = {}) => ({
  width: '100%', background: 'rgba(var(--rgb-hi),0.05)', border: '1px solid rgba(var(--rgb-hi),0.1)',
  borderRadius: 9, padding: '0.55rem 0.8rem', fontSize: '0.85rem', color: 'var(--col-text)', outline: 'none',
  fontFamily: 'DM Sans,sans-serif', fontWeight: 300, transition: 'border-color .2s, box-shadow .2s',
  boxSizing: 'border-box', ...extra,
})
const lbl = { display: 'block', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }

export default function StudioServices() {
  const log = useLogAction()
  const [services,    setServices]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(null)
  const [form,        setForm]        = useState(EMPTY)
  const [saving,      setSaving]      = useState(false)
  const [catFilter,   setCatFilter]   = useState('all')
  const [file,        setFile]        = useState(null)
  const [filePreview, setFilePreview] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setFilePreview(URL.createObjectURL(f))
  }

  function closeModal() {
    setModal(null)
    setForm(EMPTY)
    setFile(null)
    setFilePreview('')
  }

  useEffect(() => { load() }, [])

  async function load() {
    const data = await getOrFetch('studio_services', async () => {
      const { data } = await supabase.from('services').select('*').order('category').order('name')
      return data || []
    }, 5 * 60_000)
    setServices(data)
    setLoading(false)
  }

  async function save() {
    if (!form.name.trim()) return toast.error('Name is required')
    if (!form.price || parseFloat(form.price) <= 0) return toast.error('Price must be greater than $0')
    setSaving(true)
    try {
      let image_url = form.image_url || ''
      if (file) {
        const ext  = file.name.split('.').pop()
        const path = `services/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('gallery').upload(path, file, { upsert: true })
        if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)
        const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(path)
        image_url = publicUrl
      }
      const rest = { ...form }
      delete rest.id
      const payload = { ...rest, price: parseFloat(form.price) || 0, duration: parseInt(form.duration) || 0, image_url }
      const { error } = modal === 'add'
        ? await supabase.from('services').insert(payload)
        : await supabase.from('services').update(payload).eq('id', form.id)
      if (error) throw error
      toast.success(modal === 'add' ? 'Service added' : 'Service updated')
      log(modal === 'add' ? 'service.created' : 'service.edited', { entityType: 'service', details: { message: `${modal === 'add' ? 'created' : 'edited'} service "${form.name}"` } })
      closeModal(); invalidate('studio_services'); invalidate('studio_home_display'); load()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  function openDelete(s)  { setDeleteTarget(s) }
  function closeDelete()  { setDeleteTarget(null) }

  async function confirmDelete() {
    setDeleting(true)
    const { error } = await supabase.from('services').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) { toast.error(error.message); return }
    toast.success('Service deleted')
    log('service.deleted', { entityType: 'service', entityId: deleteTarget.id, details: { message: `deleted service "${deleteTarget.name}"` } })
    invalidate('studio_services'); invalidate('studio_home_display'); load()
    closeDelete()
  }

  async function toggleActive(s) {
    await supabase.from('services').update({ active: !s.active }).eq('id', s.id)
    toast.success(s.active ? 'Service archived' : 'Service restored')
    log(s.active ? 'service.archived' : 'service.restored', { entityType: 'service', entityId: s.id, details: { message: `${s.active ? 'archived' : 'restored'} service "${s.name}"` } })
    invalidate('studio_services'); invalidate('studio_home_display'); load()
  }

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const archivedCount = services.filter(s => !s.active).length
  const filtered = catFilter === 'archived'
    ? services.filter(s => !s.active)
    : catFilter === 'all'
      ? services
      : services.filter(s => s.active && s.category === catFilter)

  const catCounts = CATS.reduce((acc, c) => {
    acc[c] = services.filter(s => s.active && s.category === c).length
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .m-inp:focus { border-color: ${C.goldBorder} !important; box-shadow: 0 0 0 3px rgba(var(--rgb-acc),0.08); }
        .svc-card { transition: transform .35s cubic-bezier(0.22,1,0.36,1), box-shadow .35s ease; }
        .svc-card:hover { transform: translateY(-6px) scale(1.01); box-shadow: 0 28px 64px rgba(0,0,0,0.6) !important; }
        .svc-card:hover .svc-img { transform: scale(1.08) !important; }
        .svc-edit-btn:hover   { background: var(--col-text) !important; color: #fff !important; border-color: var(--col-text) !important; }
        .svc-arc-btn:hover    { background: rgba(var(--rgb-acc),0.22) !important; color: var(--col-acc) !important; border-color: rgba(var(--rgb-acc),0.4) !important; }
        .svc-del-btn:hover    { background: rgba(248,113,113,0.25) !important; color: #f87171 !important; border-color: rgba(248,113,113,0.4) !important; }
        .cat-filter:hover { border-color: var(--col-text) !important; color: ${C.dim} !important; }
        .btn-g:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(var(--rgb-acc),0.3); }
        .modal-close:hover { background: rgba(var(--rgb-hi),0.1) !important; }
        .modal-cancel:hover { border-color: var(--col-text) !important; }
        .skel { background: linear-gradient(90deg,var(--shimmer-a) 25%,var(--shimmer-b) 50%,var(--shimmer-a) 75%); background-size:200% 100%; animation:shimmer 1.6s infinite; }
      `}</style>

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: '1.25rem', paddingBottom: '1.1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.6rem,2.5vw,2.2rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.15rem' }}>Services</h1>
          <p style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
            {services.filter(s => s.active).length} active
            {archivedCount > 0 && <span style={{ color: 'rgba(248,113,113,0.5)', marginLeft: 8 }}>· {archivedCount} archived</span>}
          </p>
        </div>
        <button onClick={() => { setForm(EMPTY); setModal('add') }} className="btn-g"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0.55rem 1.1rem', borderRadius: 10, background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .2s', letterSpacing: '0.04em' }}>
          <Plus size={14} /> New Service
        </button>
      </div>

      {/* Category filter bar */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 6, marginBottom: '1.1rem', flexWrap: 'wrap' }}>
        <button onClick={() => setCatFilter('all')}
          style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${catFilter === 'all' ? C.goldBorder : C.border}`, background: catFilter === 'all' ? C.goldBg : 'transparent', color: catFilter === 'all' ? C.gold : C.muted, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          className="cat-filter">
          All · {services.length}
        </button>
        {archivedCount > 0 && (
          <button onClick={() => setCatFilter('archived')}
            style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${catFilter === 'archived' ? 'rgba(248,113,113,0.4)' : C.border}`, background: catFilter === 'archived' ? 'rgba(248,113,113,0.1)' : 'transparent', color: catFilter === 'archived' ? '#f87171' : C.muted, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}
            className="cat-filter">
            <EyeOff size={9} />
            Archived · {archivedCount}
          </button>
        )}
        {CATS.filter(c => catCounts[c] > 0).map(c => {
          const cat = CAT[c]
          return (
            <button key={c} onClick={() => setCatFilter(c)}
              style={{ padding: '5px 14px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${catFilter === c ? cat.color + '55' : C.border}`, background: catFilter === c ? cat.bg : 'transparent', color: catFilter === c ? cat.color : C.muted, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', letterSpacing: '0.08em', textTransform: 'uppercase' }}
              className="cat-filter">
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: catFilter === c ? cat.color : C.border, transition: 'background .15s' }} />
              {cat.label} · {catCounts[c]}
            </button>
          )
        })}
      </div>

      {/* Card grid */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 320, borderRadius: 20, border: `1px solid ${C.border}` }} className="skel" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: 12 }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Scissors size={24} color={C.muted} strokeWidth={1.2} />
            </div>
            <p style={{ color: C.muted, fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif' }}>No services found</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {filtered.map(s => {
              const cat = CAT[s.category] || CAT.other
              return (
                <div key={s.id} className="svc-card"
                  style={{ borderRadius: 20, overflow: 'hidden', position: 'relative', height: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', border: `1px solid ${s.active ? 'rgba(var(--rgb-hi),0.06)' : 'rgba(var(--rgb-hi),0.03)'}` }}>

                  {/* ── Background: full-bleed image or gradient ── */}
                  <div style={{ position: 'absolute', inset: 0 }}>
                    {s.image_url
                      ? <img src={s.image_url} alt={s.name} className="svc-img"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.7s cubic-bezier(0.22,1,0.36,1)', filter: s.active ? 'none' : 'brightness(0.3) saturate(0.4)' }} />
                      : <div style={{ width: '100%', height: '100%', background: `radial-gradient(ellipse at 25% 25%, ${cat.color}28 0%, ${cat.color}08 55%, var(--col-bg2) 100%)`, filter: s.active ? 'none' : 'brightness(0.3) saturate(0.4)' }}>
                          <span className="font-display" style={{ position: 'absolute', bottom: -10, right: 12, fontSize: '9rem', color: `${cat.color}12`, lineHeight: 1, fontWeight: 700, userSelect: 'none', letterSpacing: '-0.04em' }}>
                            {s.name.charAt(0)}
                          </span>
                        </div>
                    }
                    {/* Archived overlay icon */}
                    {!s.active && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <EyeOff size={32} color="var(--col-text)" />
                      </div>
                    )}
                    {/* Deep gradient overlay — readable text at bottom */}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(8,8,12,0.5) 40%, rgba(8,8,12,0.97) 100%)' }} />
                    {/* Category colour top-edge accent */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${cat.color}, ${cat.color}33)` }} />
                  </div>

                  {/* ── Top row: category badge (left) + action buttons (right) ── */}
                  <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 3 }}>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, padding: '4px 11px', borderRadius: 20, background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(10px)', color: cat.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', border: `1px solid ${cat.color}35` }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: cat.color }} />
                        {cat.label}
                      </span>
                      {s.gender && s.gender !== 'mixed' && (() => {
                        const g = GENDER.find(g => g.value === s.gender)
                        return g ? (
                          <span style={{ fontSize: 9, padding: '4px 10px', borderRadius: 20, background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(10px)', color: g.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', border: `1px solid ${g.border}` }}>
                            {g.label}
                          </span>
                        ) : null
                      })()}
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => { setForm({ ...s }); setFilePreview(s.image_url || ''); setFile(null); setModal('edit') }}
                        className="svc-edit-btn"
                        style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.28)', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all .15s' }}>
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => toggleActive(s)}
                        className="svc-arc-btn"
                        title={s.active ? 'Archive' : 'Restore'}
                        style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(0,0,0,0.62)', border: `1px solid ${s.active ? 'var(--col-acc)' : 'var(--col-acc)'}`, color: s.active ? 'var(--col-acc)' : 'var(--col-acc)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all .15s' }}>
                        {s.active ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button onClick={() => openDelete(s)}
                        className="svc-del-btn"
                        style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(248,113,113,0.25)', color: 'rgba(248,113,113,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all .15s' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* ── Bottom content ── */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '1.25rem 1.4rem 1.35rem', zIndex: 2 }}>

                    {/* Service name */}
                    <h3 className="font-display" style={{ fontSize: '1.65rem', color: '#ffffff', lineHeight: 1.1, marginBottom: s.description ? '0.35rem' : '0.85rem', fontWeight: 400 }}>
                      {s.name}
                    </h3>

                    {/* Description */}
                    {s.description && (
                      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.6, marginBottom: '0.85rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {s.description}
                      </p>
                    )}

                    {/* Divider */}
                    <div style={{ height: 1, background: `linear-gradient(90deg, ${cat.color}40, transparent)`, marginBottom: '0.75rem' }} />

                    {/* Price + duration */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="font-display" style={{ fontSize: '2rem', color: cat.color, lineHeight: 1, textShadow: `0 0 24px ${cat.color}50` }}>
                        ${s.price}
                      </span>
                      {s.duration > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <Clock size={10} color="rgba(255,255,255,0.6)" strokeWidth={1.5} />
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.04em' }}>
                            {Math.floor(s.duration / 60) > 0 ? `${Math.floor(s.duration / 60)}h ` : ''}{s.duration % 60 > 0 ? `${s.duration % 60}m` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>


                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      <AnimatePresence>
        {modal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 28, stiffness: 380 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 480, background: C.modal, border: `1px solid ${C.goldBorder}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.65)', maxHeight: '90vh', overflowY: 'auto' }}>

              {/* Gold top bar */}
              <div style={{ height: 3, background: `linear-gradient(90deg,${C.gold},var(--col-acc2),rgba(var(--rgb-acc),0.15))` }} />

              <div style={{ padding: '1.75rem' }}>
                {/* Modal header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                  <div>
                    <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, marginBottom: 5 }}>
                      {modal === 'add' ? 'New Service' : 'Edit Service'}
                    </p>
                    <h2 className="font-display font-light" style={{ fontSize: '1.8rem', color: C.white, lineHeight: 1 }}>
                      {modal === 'add' ? 'Add a Service' : form.name || 'Edit Service'}
                    </h2>
                  </div>
                  <button onClick={closeModal} className="modal-close"
                    style={{ width: 32, height: 32, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .2s', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={lbl}>Name <span style={{ color: C.gold }}>*</span></label>
                    <input value={form.name} onChange={set('name')} placeholder="e.g. Precision Cut" style={inp()} className="m-inp" />
                  </div>

                  <div>
                    <label style={lbl}>Description</label>
                    <textarea value={form.description || ''} onChange={set('description')} rows={2} placeholder="Short description of the service…" style={{ ...inp(), resize: 'none' }} className="m-inp" />
                  </div>

                  {/* Image upload */}
                  <div>
                    <label style={lbl}>Service Image</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Preview */}
                      {filePreview && (
                        <div style={{ position: 'relative', height: 140, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.goldBorder}` }}>
                          <img src={filePreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button type="button" onClick={() => { setFile(null); setFilePreview(''); setForm(p => ({ ...p, image_url: '' })) }}
                            style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.28)', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <X size={12} />
                          </button>
                        </div>
                      )}
                      {/* Upload button */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.8rem', borderRadius: 9, background: 'rgba(var(--rgb-hi),0.05)', border: `1px dashed ${filePreview ? C.goldBorder : 'var(--col-text)'}`, cursor: 'pointer', fontSize: '0.82rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', transition: 'all 0.2s' }}>
                        <Upload size={13} />
                        {filePreview ? 'Replace image' : 'Upload image'}
                        <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
                      </label>
                      {/* URL fallback */}
                      {!filePreview && (
                        <input value={form.image_url} onChange={set('image_url')} placeholder="or paste an image URL…" style={inp()} className="m-inp" />
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={lbl}>Price ($)</label>
                      <input type="number" value={form.price} onChange={set('price')} placeholder="45" style={inp()} className="m-inp" />
                    </div>
                    <div>
                      <label style={lbl}>Hours</label>
                      <input type="number" min="0" max="12"
                        value={Math.floor((parseInt(form.duration) || 0) / 60)}
                        onChange={e => {
                          const h = Math.max(0, parseInt(e.target.value) || 0)
                          const m = (parseInt(form.duration) || 0) % 60
                          setForm(p => ({ ...p, duration: h * 60 + m }))
                        }}
                        placeholder="0" style={inp()} className="m-inp" />
                    </div>
                    <div>
                      <label style={lbl}>Minutes</label>
                      <input type="number" min="0" max="59"
                        value={(parseInt(form.duration) || 0) % 60}
                        onChange={e => {
                          const m = Math.min(59, Math.max(0, parseInt(e.target.value) || 0))
                          const h = Math.floor((parseInt(form.duration) || 0) / 60)
                          setForm(p => ({ ...p, duration: h * 60 + m }))
                        }}
                        placeholder="0" style={inp()} className="m-inp" />
                    </div>
                  </div>

                  {/* Category selector */}
                  <div>
                    <label style={lbl}>Category</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {CATS.map(c => {
                        const cat = CAT[c]
                        const sel = form.category === c
                        return (
                          <button key={c} type="button" onClick={() => setForm(p => ({ ...p, category: c }))}
                            style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${sel ? cat.color + '66' : C.border}`, background: sel ? cat.bg : 'transparent', color: sel ? cat.color : C.muted, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: sel ? cat.color : C.border, transition: 'background .15s' }} />
                            {cat.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Gender selector */}
                  <div>
                    <label style={lbl}>For</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {GENDER.map(g => {
                        const isSel = form.gender === g.value
                        return (
                          <button key={g.value} type="button" onClick={() => setForm(p => ({ ...p, gender: g.value }))}
                            style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${isSel ? g.border : C.border}`, background: isSel ? `${g.color}18` : 'transparent', color: isSel ? g.color : C.muted, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {g.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '0.625rem', marginTop: '1.5rem' }}>
                  <button onClick={closeModal} className="modal-cancel"
                    style={{ flex: 1, padding: '0.7rem', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}>
                    Cancel
                  </button>
                  <button onClick={save} disabled={saving} className="btn-g"
                    style={{ flex: 1.5, padding: '0.7rem', borderRadius: 10, background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: saving ? 0.6 : 1, transition: 'all .2s' }}>
                    {saving
                      ? <div style={{ width: 15, height: 15, border: '2px solid rgba(0,0,0,.25)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                      : <><Save size={14} /> {modal === 'add' ? 'Add Service' : 'Save Changes'}</>
                    }
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete confirmation modal ── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
            onMouseDown={e => { if (e.target === e.currentTarget) closeDelete() }}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 420, background: 'var(--col-modal)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#f87171,#ef4444)' }} />
              <div style={{ padding: '1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: '1.25rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AlertTriangle size={18} color="#f87171" />
                  </div>
                  <div>
                    <h3 style={{ color: C.white, fontFamily: '"Cormorant Garamond",serif', fontSize: '1.35rem', fontWeight: 500, marginBottom: 4 }}>Delete service?</h3>
                    <p style={{ color: C.muted, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.5 }}>This action is permanent and cannot be undone.</p>
                  </div>
                </div>

                <div style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.12)', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1.5rem' }}>
                  <p style={{ color: C.white, fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, marginBottom: 2 }}>{deleteTarget.name}</p>
                  <p style={{ color: C.muted, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif' }}>
                    {[deleteTarget.category && (CAT[deleteTarget.category]?.label), deleteTarget.price && `$${deleteTarget.price}`].filter(Boolean).join(' · ')}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={closeDelete}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 9, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer', transition: 'all .15s' }}
                    className="modal-cancel">
                    Cancel
                  </button>
                  <button onClick={confirmDelete} disabled={deleting}
                    style={{ flex: 1, padding: '0.65rem', borderRadius: 9, border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#f87171,#ef4444)', color: 'var(--col-text)', fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .2s', opacity: deleting ? 0.6 : 1 }}>
                    {deleting
                      ? <div style={{ width: 14, height: 14, border: '2px solid var(--col-text)', borderTopColor: 'var(--col-text)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                      : <><Trash2 size={13} /> Delete</>
                    }
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
