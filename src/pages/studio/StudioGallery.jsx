import { useState, useEffect, useRef, useMemo } from 'react'
import Pager from '../../lib/Pager'
import { Plus, Trash2, Image, X, Save, Edit2, Eye, EyeOff, ShieldAlert, ChevronDown, Check, Tag, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getOrFetch, invalidate } from '../../lib/cache'
import { useAuth } from '../../contexts/AuthContext'
import { useLogAction } from '../../hooks/useLogAction'
import toast from 'react-hot-toast'

const C = {
  card: 'var(--col-modal)', gold: 'var(--col-acc)', goldDim: 'var(--col-acc)',
  goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)',
  subtle: 'rgba(var(--rgb-hi),0.06)', border: 'rgba(var(--rgb-hi),0.07)', modal: 'var(--col-modal)',
  red: '#f87171', redBg: 'rgba(248,113,113,0.1)', redBorder: 'rgba(248,113,113,0.2)',
}

const COLOR_PRESETS = [
  '#60a5fa', '#818cf8', '#c084fc', '#f472b6', '#fb7185',
  '#f87171', '#fb923c', '#f59e0b', 'var(--col-acc)', '#a3e635',
  '#34d399', '#2dd4bf', '#22d3ee', '#38bdf8', '#94a3b8',
]

const inp = { width: '100%', background: 'rgba(var(--rgb-hi),0.05)', border: '1px solid rgba(var(--rgb-hi),0.1)', borderRadius: 9, padding: '0.55rem 0.8rem', fontSize: '0.85rem', color: 'var(--col-text)', outline: 'none', fontFamily: 'DM Sans,sans-serif', fontWeight: 300, transition: 'border-color .2s', boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }
const EMPTY = { image_url: '', title: '', category: '', stylist_id: '', visible: true }

function Select({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const btnRef  = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (!btnRef.current?.contains(e.target) && !panelRef.current?.contains(e.target))
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(p => !p)
  }

  const selected = options.find(o => o.value === value)

  return (
    <div>
      <button ref={btnRef} type="button" onClick={toggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: open ? 'rgba(var(--rgb-hi),0.08)' : 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${open ? C.goldBorder : 'rgba(var(--rgb-hi),0.1)'}`, borderRadius: 9, padding: '0.55rem 0.8rem', fontSize: '0.85rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 300, cursor: 'pointer', transition: 'all .18s', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selected?.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: selected.dot, flexShrink: 0 }} />}
          <span>{selected?.label || '—'}</span>
        </div>
        <ChevronDown size={13} color="var(--col-text)" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {open && rect && (
        <div ref={panelRef}
          style={{ position: 'fixed', top: rect.bottom + 5, left: rect.left, width: rect.width, background: 'var(--col-card)', border: `1px solid ${C.goldBorder}`, borderRadius: 11, overflow: 'hidden', zIndex: 9999, boxShadow: '0 16px 48px rgba(0,0,0,0.7)', animation: 'dropIn .14s ease' }}>
          {options.map(o => {
            const active = value === o.value
            return (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '0.6rem 0.9rem', background: active ? 'var(--col-acc)' : 'transparent', border: 'none', borderBottom: `1px solid rgba(var(--rgb-hi),0.04)`, color: active ? 'var(--col-bg)' : 'var(--col-text)', fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer', textAlign: 'left', transition: 'background .12s' }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(var(--rgb-hi),0.05)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                {o.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.dot, flexShrink: 0 }} />}
                <span style={{ flex: 1 }}>{o.label}</span>
                {active && <Check size={12} color="var(--col-bg)" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function StudioGallery() {
  const { isAdmin } = useAuth()
  const log = useLogAction()
  const [images,      setImages]      = useState([])
  const [stylists,    setStylists]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState('all')
  const [search,      setSearch]      = useState('')
  const [modal,       setModal]       = useState(null)
  const [editing,     setEditing]     = useState(null)
  const [form,        setForm]        = useState(EMPTY)
  const [saving,      setSaving]      = useState(false)
  const [file,        setFile]        = useState(null)
  const [filePreview, setFilePreview] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,    setDeleting]    = useState(false)
  const [page,        setPage]        = useState(0)
  const [perPage,     setPerPage]     = useState(() => window.innerWidth <= 640 ? 6 : 12)

  // categories management
  const [galCats,      setGalCats]      = useState([])
  const [catModal,     setCatModal]     = useState(false)
  const [newCatName,   setNewCatName]   = useState('')
  const [newCatColor,  setNewCatColor]  = useState(COLOR_PRESETS[0])
  const [addingCat,    setAddingCat]    = useState(false)
  const [catDelId,     setCatDelId]     = useState(null)
  const [catDeleting,  setCatDeleting]  = useState(false)

  useEffect(() => {
    load()
    loadGalCats()
    const handler = () => setPerPage(window.innerWidth <= 640 ? 6 : 12)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  async function load() {
    const [imgs, stys] = await getOrFetch('studio_gallery', async () => {
      const [{ data: imgs }, { data: stys }] = await Promise.all([
        supabase.from('gallery').select('*, stylists(name)').order('display_order'),
        supabase.from('stylists').select('id, name'),
      ])
      return [imgs || [], stys || []]
    }, 5 * 60_000)
    setImages(imgs); setStylists(stys); setLoading(false)
  }

  async function loadGalCats() {
    const { data } = await supabase.from('gallery_categories').select('*').order('name')
    const sorted = (data || []).sort((a, b) => {
      if (a.name === 'Other') return 1
      if (b.name === 'Other') return -1
      return a.name.localeCompare(b.name)
    })
    setGalCats(sorted)
  }

  async function saveGalCat() {
    if (!newCatName.trim()) return toast.error('Category name is required')
    setAddingCat(true)
    const { error } = await supabase.from('gallery_categories').insert({ name: newCatName.trim(), color: newCatColor })
    setAddingCat(false)
    if (error) { toast.error(error.message); return }
    toast.success('Category added')
    setNewCatName(''); setNewCatColor(COLOR_PRESETS[0])
    loadGalCats()
  }

  async function deleteGalCat() {
    setCatDeleting(true)
    const { data: deletedCat, error } = await supabase.from('gallery_categories').delete().eq('id', catDelId).select('id')
    if (!error && !deletedCat?.length) { toast.error('Only an admin can delete categories'); setCatDeleting(false); return }
    setCatDeleting(false)
    if (error) { toast.error(error.message); return }
    toast.success('Category deleted')
    setCatDelId(null)
    loadGalCats()
  }

  function closeCatModal() {
    setCatModal(false); setCatDelId(null)
    setNewCatName(''); setNewCatColor(COLOR_PRESETS[0])
  }

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f); setFilePreview(URL.createObjectURL(f))
  }

  function openAdd() {
    setEditing(null); setFile(null); setFilePreview('')
    setForm({ ...EMPTY, category: galCats[0]?.name || '' })
    setModal('add')
  }

  function openEdit(img) {
    setEditing(img); setFile(null); setFilePreview('')
    setForm({ image_url: img.image_url || '', title: img.title || '', category: img.category || '', stylist_id: img.stylist_id || '', visible: img.visible !== false })
    setModal('edit')
  }

  function closeModal() { setModal(null); setEditing(null); setFile(null); setFilePreview('') }

  async function save() {
    if (!file && !form.image_url) return toast.error('Add a photo first')
    setSaving(true)
    try {
      let imageUrl = form.image_url
      if (file) {
        const ext  = file.name.split('.').pop()
        const path = `${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('gallery').upload(path, file, { upsert: true })
        if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)
        const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(path)
        imageUrl = publicUrl
      }
      const payload = { ...form, image_url: imageUrl, stylist_id: form.stylist_id || null }
      const { error } = modal === 'add'
        ? await supabase.from('gallery').insert({ ...payload, display_order: images.length })
        : await supabase.from('gallery').update(payload).eq('id', editing.id)
      if (error) throw error
      toast.success(modal === 'add' ? 'Photo added' : 'Photo updated')
      log(modal === 'add' ? 'gallery.photo_added' : 'gallery.photo_edited', { entityType: 'gallery', details: { message: `${modal === 'add' ? 'added photo' : 'edited photo'} "${form.title || 'untitled'}" in gallery` } })
      closeModal(); invalidate('studio_gallery'); invalidate('studio_home_display'); load()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function toggleVisible(id, current) {
    const next = !current
    setImages(prev => prev.map(img => img.id === id ? { ...img, visible: next } : img))
    const { error } = await supabase.from('gallery').update({ visible: next }).eq('id', id)
    if (error) {
      setImages(prev => prev.map(img => img.id === id ? { ...img, visible: current } : img))
      toast.error(error.message)
    } else {
      invalidate('studio_gallery'); invalidate('studio_home_display')
    }
  }

  function openDelete(img) {
    setDeleteTarget({ id: img.id, title: img.title || 'this photo' })
  }

  async function confirmDelete() {
    setDeleting(true)
    const { data: deletedImg, error } = await supabase.from('gallery').delete().eq('id', deleteTarget.id).select('id')
    if (!error && !deletedImg?.length) { toast.error('Only an admin can delete photos — archive it instead'); setDeleting(false); return }
    if (error) { toast.error(error.message); setDeleting(false); return }
    toast.success('Photo deleted')
    log('gallery.photo_deleted', { entityType: 'gallery', entityId: deleteTarget.id, details: { message: `deleted photo "${deleteTarget.title || 'untitled'}" from gallery` } })
    setDeleteTarget(null); setDeleting(false)
    invalidate('studio_gallery'); invalidate('studio_home_display'); load()
  }

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const hidden = images.filter(img => img.visible === false)
  const filtered = useMemo(() => {
    let base
    if (filter === 'archived') base = images.filter(img => img.visible === false)
    else if (filter === 'all') base = images
    else                       base = images.filter(img => img.category === filter)
    if (!search.trim()) return base
    const q = search.trim().toLowerCase()
    return base.filter(img =>
      img.title?.toLowerCase().includes(q) ||
      img.stylists?.name?.toLowerCase().includes(q)
    )
  }, [images, filter, search])

  const paged = filtered.slice(page * perPage, (page + 1) * perPage)
  useEffect(() => setPage(0), [filter, search, perPage])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.875rem' }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes modalIn { from { transform: scale(0.96) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes dropIn  { from { transform: translateY(-6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .m-inp:focus { border-color: ${C.goldBorder} !important; box-shadow: 0 0 0 3px rgba(var(--rgb-acc),0.08); }
        .gal-card  { transition: transform .22s ease, box-shadow .22s ease; }
        .gal-card:hover { transform: translateY(-2px); box-shadow: 0 12px 36px rgba(0,0,0,0.45); }
        .gal-img   { transition: transform .45s ease; }
        .gal-card:hover .gal-img { transform: scale(1.05); }
        .btn-g:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(var(--rgb-acc),0.3); }
        .btn-cat:hover { border-color: var(--col-text) !important; color: ${C.white} !important; background: rgba(var(--rgb-hi),0.08) !important; }
        .gal-filter:hover { border-color: var(--col-text) !important; color: var(--col-text) !important; }
        .sp-modal-close:hover { background: rgba(var(--rgb-hi),0.1) !important; }
        .gal-vis-btn  { transition: all .18s; }
        .gal-edit-btn { transition: all .18s; }
        .gal-del-btn  { transition: all .18s; }
        .gal-vis-btn:hover  { background: ${C.goldBg} !important; border-color: ${C.goldBorder} !important; color: ${C.gold} !important; }
        .gal-edit-btn:hover { background: ${C.goldBg} !important; border-color: ${C.goldBorder} !important; color: ${C.gold} !important; }
        .gal-del-btn:hover  { background: rgba(248,113,113,0.18) !important; border-color: rgba(248,113,113,0.5) !important; color: ${C.red} !important; }
        .cat-del-row-btn:hover { background: rgba(248,113,113,0.18) !important; border-color: rgba(248,113,113,0.45) !important; color: ${C.red} !important; }
        .gal-newcat-btn:hover { border-color: ${C.goldBorder} !important; color: ${C.gold} !important; background: ${C.goldBg} !important; }
        .color-swatch:hover { transform: scale(1.18); }
        @media (max-width: 640px) {
          .gal-grid    { grid-template-columns: repeat(2, 1fr) !important; gap: 0.5rem !important; }
          .gal-hdr     { flex-direction: column; align-items: flex-start !important; gap: 10px; }
          .gal-hdr-btn { align-self: flex-end; }
          .gal-vis-btn, .gal-edit-btn, .gal-del-btn { width: 40px !important; height: 40px !important; border-radius: 10px !important; }
          .gal-act-bar { padding: 8px !important; gap: 5px !important; }
        }
        @media (min-width: 641px) and (max-width: 1024px) {
          .gal-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="gal-hdr" style={{ flexShrink: 0, paddingBottom: '0.875rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: '0.3rem' }}>Studio</p>
          <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.6rem,2.5vw,2.2rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.2rem' }}>Gallery</h1>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', color: C.muted }}><span style={{ color: C.white, fontWeight: 600 }}>{images.length}</span> photos</span>
            {hidden.length > 0 && <span style={{ fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', color: C.muted }}><span style={{ color: 'var(--col-text)', fontWeight: 600 }}>{hidden.length}</span> archived</span>}
          </div>
        </div>
        <div className="gal-hdr-btn" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={() => setCatModal(true)} className="btn-cat"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.55rem 1rem', borderRadius: 10, background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.dim, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .2s', whiteSpace: 'nowrap' }}>
            <Tag size={13} /> Categories
          </button>
          <button onClick={openAdd} className="btn-g"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.1rem', borderRadius: 10, background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .2s', whiteSpace: 'nowrap' }}>
            <Plus size={14} /> Add Photo
          </button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-text)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search by title or stylist…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inp, paddingLeft: '2rem', fontSize: '0.82rem' }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--col-text)', display: 'flex', alignItems: 'center', padding: 2 }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {/* All */}
        <button onClick={() => setFilter('all')} className="gal-filter"
          style={{ padding: '3px 11px', borderRadius: 20, fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', border: `1px solid ${filter === 'all' ? C.goldBorder : C.border}`, background: filter === 'all' ? C.goldBg : 'transparent', color: filter === 'all' ? C.gold : C.muted, flexShrink: 0 }}>
          All
        </button>

        {/* Dynamic category filters */}
        {galCats.map(cat => {
          const active = filter === cat.name
          const count  = images.filter(i => i.category === cat.name).length
          if (count === 0) return null
          return (
            <button key={cat.id} onClick={() => setFilter(cat.name)} className="gal-filter"
              style={{ padding: '3px 11px', borderRadius: 20, fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', border: `1px solid ${active ? cat.color + '55' : C.border}`, background: active ? cat.color + '18' : 'transparent', color: active ? cat.color : C.muted, flexShrink: 0 }}>
              {cat.name}
              <span style={{ marginLeft: 4, opacity: 0.65 }}>{count}</span>
            </button>
          )
        })}

        {/* Archived */}
        {hidden.length > 0 && (
          <button onClick={() => setFilter('archived')} className="gal-filter"
            style={{ padding: '3px 11px', borderRadius: 20, fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s', border: `1px solid ${filter === 'archived' ? 'rgba(248,113,113,0.45)' : C.border}`, background: filter === 'archived' ? 'rgba(248,113,113,0.1)' : 'transparent', color: filter === 'archived' ? C.red : C.muted, flexShrink: 0 }}>
            Archived
            <span style={{ marginLeft: 4, opacity: 0.65 }}>{hidden.length}</span>
          </button>
        )}
      </div>

      {/* ── Grid ───────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading ? (
          <div className="gal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shimmer" style={{ aspectRatio: '4/5', borderRadius: 12, background: C.card }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 240, gap: '0.75rem' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Image size={20} color="rgba(var(--rgb-hi),0.12)" strokeWidth={1} />
            </div>
            <p style={{ color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif' }}>
              {search.trim() ? `No results for "${search.trim()}"` : filter === 'archived' ? 'No archived photos' : filter === 'all' ? 'No photos yet' : `No ${filter} photos`}
            </p>
          </div>
        ) : (
          <>
            <div className="gal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              {paged.map(img => {
                const isHidden = img.visible === false
                const catDef   = galCats.find(c => c.name === img.category)
                const catColor = catDef?.color || C.goldDim
                return (
                  <div key={img.id} className="gal-card"
                    style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${isHidden ? 'rgba(var(--rgb-hi),0.05)' : C.border}`, background: C.card }}>

                    <div style={{ aspectRatio: '4/5', overflow: 'hidden', position: 'relative' }}>
                      {img.image_url
                        ? <img src={img.image_url} alt={img.title || ''} className="gal-img"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', objectPosition: 'top center', filter: isHidden ? 'brightness(0.3) saturate(0.4)' : 'none', transition: 'filter .25s' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--col-modal)' }}>
                            <Image size={24} color="rgba(var(--rgb-hi),0.1)" strokeWidth={1} />
                          </div>
                      }
                      {isHidden && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                          <EyeOff size={26} color="var(--col-text)" />
                        </div>
                      )}
                      {img.category && catDef && (
                        <div style={{ position: 'absolute', top: 8, left: 8 }}>
                          <span style={{ fontSize: 8, padding: '2px 7px', borderRadius: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', color: catColor, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{img.category}</span>
                        </div>
                      )}
                    </div>

                    {/* Action bar */}
                    <div className="gal-act-bar" style={{ padding: '8px 9px', borderTop: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: 4 }}>
                        {img.title
                          ? <p style={{ color: C.dim, fontSize: '0.72rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.title}</p>
                          : <p style={{ color: 'var(--col-text)', fontSize: '0.68rem', fontFamily: 'DM Sans,sans-serif', fontStyle: 'italic' }}>No title</p>
                        }
                        {img.stylists?.name && <p style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{img.stylists.name}</p>}
                      </div>
                      <button onClick={() => toggleVisible(img.id, img.visible !== false)} className="gal-vis-btn" title={isHidden ? 'Make visible' : 'Archive'}
                        style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1px solid ${isHidden ? C.goldBorder : C.border}`, background: isHidden ? C.goldBg : 'rgba(var(--rgb-hi),0.04)', color: isHidden ? C.gold : C.muted }}>
                        {isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button onClick={() => openEdit(img)} className="gal-edit-btn" title="Edit"
                        style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1px solid ${C.border}`, background: 'rgba(var(--rgb-hi),0.04)', color: C.muted }}>
                        <Edit2 size={14} />
                      </button>
                      {isAdmin && (
                        <button onClick={() => openDelete(img)} className="gal-del-btn" title="Delete"
                          style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.06)', color: 'rgba(248,113,113,0.5)' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <Pager page={page} total={filtered.length} perPage={perPage} onChange={setPage} />
          </>
        )}
      </div>

      {/* ── Add / Edit Modal ─────────────────────────────── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.82)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ width: '100%', maxWidth: 480, background: C.modal, border: `1px solid ${C.goldBorder}`, borderRadius: 24, overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 48px 120px rgba(0,0,0,.7)', animation: 'modalIn .2s ease' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ height: 3, background: 'linear-gradient(90deg,var(--col-acc),var(--col-acc2),rgba(var(--rgb-acc),0.1))', flexShrink: 0 }} />

            <div style={{ padding: '1.5rem 1.75rem 1.25rem', flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }}>
                  {modal === 'add' ? 'New Photo' : 'Edit Photo'}
                </p>
                <h2 className="font-display font-light" style={{ fontSize: '1.75rem', color: C.white, lineHeight: 1.05 }}>
                  {modal === 'add' ? 'Add Photo' : editing?.title || 'Edit Photo'}
                </h2>
              </div>
              <button onClick={closeModal} className="sp-modal-close"
                style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all .18s', marginTop: 2 }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ height: 1, background: C.border, flexShrink: 0 }} />

            <div style={{ overflowY: 'auto', flex: 1, padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Photo upload */}
              <div>
                <label style={lbl}>Photo</label>
                <label style={{ cursor: 'pointer', display: 'block' }}>
                  <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
                  <div style={{ borderRadius: 14, overflow: 'hidden', border: `2px dashed ${(filePreview || form.image_url) ? C.goldBorder : 'rgba(var(--rgb-hi),0.1)'}`, background: 'var(--col-modal)', transition: 'border-color .2s', aspectRatio: '16/7', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {(filePreview || form.image_url)
                      ? <img src={filePreview || form.image_url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', objectPosition: 'top center' }} />
                      : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <Image size={24} color="var(--col-text)" />
                          <p style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>Click to upload</p>
                          <p style={{ fontSize: 9, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>JPG · PNG · WEBP</p>
                        </div>
                    }
                  </div>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <p style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>{(filePreview || form.image_url) ? 'Click to change photo' : ''}</p>
                  {filePreview && <button onClick={() => { setFile(null); setFilePreview('') }} style={{ fontSize: 9, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', padding: 0 }}>Remove</button>}
                </div>
              </div>

              {/* Title */}
              <div>
                <label style={lbl}>Title <span style={{ textTransform: 'none', letterSpacing: 0, color: C.muted, fontSize: 9 }}>(optional)</span></label>
                <input value={form.title} onChange={set('title')} placeholder="e.g. Summer balayage" className="m-inp" style={inp} />
              </div>

              {/* Category + Stylist */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ ...lbl, marginBottom: 0 }}>Category</label>
                    <button type="button" onClick={() => setCatModal(true)} className="gal-newcat-btn"
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 6, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: 9, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}>
                      <Plus size={8} /> New
                    </button>
                  </div>
                  <Select
                    value={form.category}
                    onChange={v => setForm(p => ({ ...p, category: v }))}
                    options={galCats.map(c => ({ value: c.name, label: c.name, dot: c.color }))}
                  />
                </div>
                <div>
                  <label style={lbl}>Stylist <span style={{ textTransform: 'none', letterSpacing: 0, color: C.muted, fontSize: 9 }}>(optional)</span></label>
                  <Select
                    value={form.stylist_id}
                    onChange={v => setForm(p => ({ ...p, stylist_id: v }))}
                    options={[{ value: '', label: 'None' }, ...stylists.map(s => ({ value: s.id, label: s.name }))]}
                  />
                </div>
              </div>

              {/* Visible toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.1rem', borderRadius: 13, background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}` }}>
                <div>
                  <p style={{ fontSize: '0.83rem', color: C.dim, fontFamily: 'DM Sans,sans-serif', fontWeight: 500, marginBottom: 2 }}>Visible to visitors</p>
                  <p style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>Shown in the public gallery</p>
                </div>
                <div style={{ width: 44, height: 26, borderRadius: 13, background: form.visible ? C.gold : 'rgba(var(--rgb-hi),0.1)', position: 'relative', transition: 'background .22s', flexShrink: 0, cursor: 'pointer', boxShadow: form.visible ? '0 0 14px rgba(var(--rgb-acc),0.4)' : 'none' }}
                  onClick={() => setForm(p => ({ ...p, visible: !p.visible }))}>
                  <div style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.25)', transition: 'left .22s', left: form.visible ? 21 : 3 }} />
                </div>
              </div>

            </div>

            <div style={{ height: 1, background: C.border, flexShrink: 0 }} />
            <div style={{ padding: '1.1rem 1.75rem 1.5rem', flexShrink: 0, display: 'flex', gap: '0.75rem' }}>
              <button onClick={closeModal}
                style={{ flex: 1, padding: '0.72rem', borderRadius: 12, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={save} disabled={saving || (!file && !form.image_url)}
                style={{ flex: 2, padding: '0.72rem', borderRadius: 12, background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: (saving || (!file && !form.image_url)) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: (saving || (!file && !form.image_url)) ? 0.5 : 1, boxShadow: (saving || (!file && !form.image_url)) ? 'none' : '0 4px 20px rgba(var(--rgb-acc),0.28)', transition: 'opacity .2s, box-shadow .2s' }}>
                {saving
                  ? <div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,.25)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                  : <><Save size={13} /> {modal === 'add' ? 'Add Photo' : 'Save Changes'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Categories Modal ──────────────────────────── */}
      {catModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={e => { if (e.target === e.currentTarget) closeCatModal() }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 400, background: C.modal, border: `1px solid ${C.goldBorder}`, borderRadius: 22, overflow: 'hidden', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 40px 100px rgba(0,0,0,.75)', animation: 'modalIn .2s ease' }}>

            <div style={{ height: 3, background: 'linear-gradient(90deg,var(--col-acc),var(--col-acc2),rgba(var(--rgb-acc),0.1))', flexShrink: 0 }} />

            <div style={{ padding: '1.25rem 1.5rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 3 }}>Gallery</p>
                <h2 className="font-display font-light" style={{ fontSize: '1.55rem', color: C.white, lineHeight: 1 }}>Categories</h2>
              </div>
              <button onClick={closeCatModal} className="sp-modal-close"
                style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .18s' }}>
                <X size={14} />
              </button>
            </div>

            {/* Category list */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {galCats.length === 0 ? (
                <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
                  <p style={{ color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif' }}>No categories yet — add one below.</p>
                </div>
              ) : (
                <div style={{ padding: '0.375rem 0' }}>
                  {galCats.map(cat => (
                    <div key={cat.id}>
                      <div style={{ display: 'flex', alignItems: 'center', padding: '0.625rem 1.5rem', gap: 10 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: cat.color, flexShrink: 0, boxShadow: `0 0 8px ${cat.color}66` }} />
                        <span style={{ flex: 1, color: C.white, fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 500 }}>{cat.name}</span>
                        <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Sans,sans-serif', marginRight: 6 }}>{images.filter(i => i.category === cat.name).length} photos</span>
                        {isAdmin && catDelId !== cat.id && (
                          <button onClick={() => setCatDelId(cat.id)}
                            className="cat-del-row-btn"
                            style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.15)', color: 'rgba(248,113,113,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all .15s' }}>
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                      {catDelId === cat.id && (
                        <div style={{ margin: '0 1rem 0.75rem', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 11, padding: '0.875rem' }}>
                          <p style={{ fontSize: '0.72rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', marginBottom: 10, lineHeight: 1.5 }}>
                            Delete <span style={{ color: C.white, fontWeight: 500 }}>{cat.name}</span>? This cannot be undone.
                          </p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setCatDelId(null)}
                              style={{ flex: 1, padding: '0.5rem', borderRadius: 8, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>
                              Cancel
                            </button>
                            <button onClick={deleteGalCat} disabled={catDeleting}
                              style={{ flex: 1, padding: '0.5rem', borderRadius: 8, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)', color: C.red, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: catDeleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all .15s' }}>
                              {catDeleting
                                ? <div style={{ width: 12, height: 12, border: '2px solid rgba(248,113,113,0.3)', borderTopColor: C.red, borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                                : <><Trash2 size={11} /> Delete</>}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add category form */}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '1.25rem 1.5rem 1.5rem', flexShrink: 0 }}>
              <label style={{ ...lbl, marginBottom: 10 }}>New Category</label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                {COLOR_PRESETS.map(color => (
                  <button key={color} type="button" onClick={() => setNewCatColor(color)} className="color-swatch"
                    style={{ width: 22, height: 22, borderRadius: '50%', background: color, border: newCatColor === color ? '2.5px solid #fff' : '2.5px solid transparent', cursor: 'pointer', flexShrink: 0, boxShadow: newCatColor === color ? `0 0 10px ${color}99` : 'none', transition: 'all .15s', outline: 'none' }} />
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: 10, width: 10, height: 10, borderRadius: '50%', background: newCatColor, boxShadow: `0 0 6px ${newCatColor}99`, pointerEvents: 'none' }} />
                  <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveGalCat()}
                    placeholder="Category name…" className="m-inp"
                    style={{ ...inp, paddingLeft: '1.75rem' }} />
                </div>
                <button onClick={saveGalCat} disabled={addingCat || !newCatName.trim()}
                  style={{ padding: '0.55rem 1rem', borderRadius: 9, background: newCatName.trim() ? `linear-gradient(135deg,${C.gold},var(--col-acc2))` : 'rgba(var(--rgb-hi),0.06)', color: newCatName.trim() ? 'var(--col-bg)' : C.muted, border: 'none', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, fontSize: '0.8rem', cursor: (addingCat || !newCatName.trim()) ? 'not-allowed' : 'pointer', transition: 'all .2s', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {addingCat
                    ? <div style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,.3)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                    : <><Plus size={12} /> Add</>}
                </button>
              </div>

              {newCatName.trim() && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>Preview:</span>
                  <span style={{ padding: '3px 10px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 500, border: `1px solid ${newCatColor}55`, background: newCatColor + '22', color: newCatColor, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: newCatColor, display: 'inline-block' }} />
                    {newCatName}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Photo confirmation ─────────────────────────── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 400, background: C.modal, border: '1px solid rgba(248,113,113,0.25)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.7)', animation: 'modalIn .2s ease' }}>
            <div style={{ height: 3, background: 'linear-gradient(90deg,#f87171,#ef4444,rgba(248,113,113,0.1))' }} />
            <div style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.redBg, border: `1px solid ${C.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <ShieldAlert size={22} color={C.red} strokeWidth={1.5} />
                </div>
                <h2 className="font-display font-light" style={{ fontSize: '1.55rem', color: C.white, lineHeight: 1.1, marginBottom: '0.4rem' }}>Delete Photo</h2>
                <p style={{ fontSize: '0.78rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', lineHeight: 1.6 }}>
                  Permanently delete <span style={{ color: C.white }}>{deleteTarget.title}</span>?<br />This action cannot be undone.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.625rem' }}>
                <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '0.65rem', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={confirmDelete} disabled={deleting} style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'linear-gradient(135deg,#f87171,#ef4444)', color: 'var(--col-text)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: deleting ? 0.6 : 1 }}>
                  {deleting ? <div style={{ width: 14, height: 14, border: '2px solid rgba(var(--rgb-hi),.3)', borderTopColor: 'var(--col-text)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> : <><Trash2 size={13} /> Delete Photo</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
