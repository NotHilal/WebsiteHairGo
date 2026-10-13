import { useState, useEffect, useRef } from 'react'
import { Plus, Edit2, Trash2, X, Save, User, Upload, Link2, ChevronDown, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getOrFetch, invalidate } from '../../lib/cache'
import { useLogAction } from '../../hooks/useLogAction'
import Pager from '../../lib/Pager'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const C = {
  card: 'var(--col-modal)', gold: 'var(--col-acc)', goldDim: 'var(--col-acc)',
  goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)',
  subtle: 'rgba(var(--rgb-hi),0.06)', border: 'rgba(var(--rgb-hi),0.07)', modal: 'var(--col-modal)',
  green: '#34d399', greenBg: 'rgba(52,211,153,0.1)', greenBorder: 'rgba(52,211,153,0.18)',
}

const EMPTY = { name: '', bio: '', photo_url: '', profile_id: '', hourly_rate: '' }
const inp   = { width: '100%', background: 'rgba(var(--rgb-hi),0.05)', border: '1px solid rgba(var(--rgb-hi),0.1)', borderRadius: 9, padding: '0.55rem 0.8rem', fontSize: '0.85rem', color: 'var(--col-text)', outline: 'none', fontFamily: 'DM Sans,sans-serif', fontWeight: 300, transition: 'border-color .2s', boxSizing: 'border-box' }
const lbl   = { display: 'block', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }

function CustomSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const selected = options.find(o => o.value === value)
  const hasValue = !!value
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(p => !p)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.8rem', background: hasValue ? 'rgba(52,211,153,0.05)' : 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${hasValue ? C.greenBorder : 'rgba(var(--rgb-hi),0.1)'}`, borderRadius: 9, color: hasValue ? C.green : 'var(--col-text)', fontSize: '0.85rem', fontFamily: 'DM Sans,sans-serif', fontWeight: hasValue ? 500 : 300, cursor: 'pointer', transition: 'all .2s', textAlign: 'left', boxSizing: 'border-box' }}>
        {hasValue && <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}88`, flexShrink: 0 }} />}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label || 'No account linked'}
        </span>
        <ChevronDown size={12} color={hasValue ? C.green : 'var(--col-text)'} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .22s', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, zIndex: 200, background: 'var(--col-card)', border: `1px solid ${C.goldBorder}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 56px rgba(0,0,0,0.65), 0 0 0 1px rgba(var(--rgb-hi),0.03)' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg,var(--col-acc),var(--col-acc2),rgba(var(--rgb-acc),0.1))' }} />
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {options.map(opt => {
              const isActive = opt.value === value
              return (
                <button key={opt.value || '__none__'} type="button"
                  onClick={() => { if (!opt.disabled) { onChange(opt.value); setOpen(false) } }}
                  disabled={opt.disabled}
                  className={opt.disabled ? '' : 'csel-opt'}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: isActive ? 'rgba(52,211,153,0.06)' : 'transparent', border: 'none', borderBottom: `1px solid ${C.border}`, cursor: opt.disabled ? 'not-allowed' : 'pointer', color: opt.disabled ? 'var(--col-text)' : isActive ? C.green : 'var(--col-text)', fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', textAlign: 'left', transition: 'background .12s' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? C.green : 'transparent', border: isActive ? 'none' : `1px solid var(--col-text)`, flexShrink: 0, transition: 'all .15s' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
                  {opt.sublabel && <span style={{ fontSize: '0.65rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', flexShrink: 0 }}>{opt.sublabel}</span>}
                  {isActive && <Check size={10} color={C.green} style={{ flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function StudioStylists() {
  const log = useLogAction()
  const [stylists,     setStylists]     = useState([])
  const [staff,        setStaff]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [page,         setPage]         = useState(0)
  const [modal,        setModal]        = useState(null)
  const [form,         setForm]         = useState(EMPTY)
  const [saving,       setSaving]       = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [localPreview, setLocalPreview] = useState(null)
  const [dragOver,     setDragOver]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, name }
  const [deleting,     setDeleting]     = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [stylistData, staffData] = await getOrFetch('studio_stylists', async () => {
      const [{ data: stys }, { data: staff }, { data: rates }] = await Promise.all([
        supabase.from('stylists').select('*').order('display_order'),
        // Any staff account can be linked, so a manager who also cuts hair stays bookable
        supabase.from('profiles').select('id, full_name, email, role').in('role', ['artist', 'manager', 'admin']).order('full_name'),
        // Rates live in a private table, not on the public stylists row
        supabase.from('stylist_rates').select('stylist_id, hourly_rate'),
      ])
      const rateOf = Object.fromEntries((rates || []).map(r => [r.stylist_id, r.hourly_rate]))
      return [(stys || []).map(s => ({ ...s, hourly_rate: rateOf[s.id] ?? null })), staff || []]
    }, 5 * 60_000)
    setStylists(stylistData)
    setStaff(staffData)
    setLoading(false)
  }

  async function uploadPhoto(file) {
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return null }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return null }
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('stylists').upload(path, file, { upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('stylists').getPublicUrl(path)
      return data.publicUrl
    } catch (err) { toast.error('Upload failed: ' + err.message); return null }
    finally { setUploading(false) }
  }

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    setLocalPreview(URL.createObjectURL(file))
    setForm(p => ({ ...p, _pendingFile: file }))
  }

  async function save() {
    if (!form.name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      let photo_url = form.photo_url || ''
      if (form._pendingFile) {
        const url = await uploadPhoto(form._pendingFile)
        if (!url) { setSaving(false); return }
        photo_url = url
      }
      const { hourly_rate, ...rest } = form
      delete rest._pendingFile
      const payload = { ...rest, photo_url, profile_id: rest.profile_id || null }
      const { data: saved, error } = modal === 'add'
        ? await supabase.from('stylists').insert({ ...payload, display_order: stylists.length }).select('id').single()
        : await supabase.from('stylists').update(payload).eq('id', form.id).select('id').single()
      if (error) throw error
      const rate = hourly_rate === '' || hourly_rate == null ? null : parseFloat(hourly_rate)
      const { error: rateErr } = await supabase.from('stylist_rates')
        .upsert({ stylist_id: saved.id, hourly_rate: Number.isFinite(rate) ? rate : null, updated_at: new Date().toISOString() })
      if (rateErr) throw rateErr
      toast.success(modal === 'add' ? 'Stylist added' : 'Stylist updated')
      if (modal === 'add') {
        log('stylist.created', { entityType: 'stylist', details: { message: `created stylist "${form.name}"` } })
      } else {
        const prev = stylists.find(s => s.id === form.id)
        if (prev?.profile_id && !payload.profile_id) {
          log('stylist.unlinked', { entityType: 'stylist', entityId: form.id, details: { message: `unlinked account from stylist "${form.name}"` } })
        } else {
          log('stylist.edited', { entityType: 'stylist', entityId: form.id, details: { message: `edited stylist "${form.name}"` } })
        }
      }
      setModal(null); setLocalPreview(null); invalidate('studio_stylists'); invalidate('studio_home_display'); invalidate('studio_gallery'); load()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  function del(id) {
    const name = stylists.find(s => s.id === id)?.name || 'Unknown'
    setDeleteTarget({ id, name })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      // Upcoming clients would be left without a stylist
      const { count: upcoming } = await supabase.from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('stylist_id', deleteTarget.id).neq('status', 'cancelled')
        .gte('date', format(new Date(), 'yyyy-MM-dd'))
      if (upcoming > 0) {
        toast.error(`${deleteTarget.name} has ${upcoming} upcoming booking${upcoming !== 1 ? 's' : ''} — move or cancel them first.`)
        return
      }
      const { error } = await supabase.from('stylists').delete().eq('id', deleteTarget.id)
      if (error?.code === '23503') {
        toast.error(`${deleteTarget.name} has timesheets or pay history, which must be kept. Unlink their account instead to remove them from bookings.`)
        return
      }
      if (error) throw error
      toast.success('Team member removed')
      invalidate('studio_stylists'); invalidate('studio_home_display'); invalidate('studio_gallery')
      log('stylist.deleted', { entityType: 'stylist', entityId: deleteTarget.id, details: { message: `deleted stylist "${deleteTarget.name}"` } })
      setDeleteTarget(null)
      load()
    } catch (err) { toast.error(err.message) }
    finally { setDeleting(false) }
  }

  function openEdit(s) {
    setForm({ ...s, profile_id: s.profile_id || '' })
    setLocalPreview(null)
    setModal('edit')
  }

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const linkedCount = stylists.filter(s => s.profile_id).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .m-inp:focus    { border-color: ${C.goldBorder} !important; box-shadow: 0 0 0 3px rgba(var(--rgb-acc),0.08); }
        .sty-card       { transition: border-color .2s, box-shadow .2s; }
        .sty-card:hover { border-color: rgba(var(--rgb-acc),0.22) !important; box-shadow: 0 8px 32px rgba(0,0,0,0.35); }
        .sty-img        { transition: transform .5s ease; }
        .sty-card:hover .sty-img { transform: scale(1.05); }
        .sty-edit:hover { background: rgba(var(--rgb-acc),0.16) !important; border-color: rgba(var(--rgb-acc),0.45) !important; color: ${C.gold} !important; }
        .sty-del:hover  { background: rgba(248,113,113,0.12) !important; border-color: rgba(248,113,113,0.3) !important; color: #f87171 !important; }
        .btn-g:hover    { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(var(--rgb-acc),0.3); }
        .drop-zone:hover { border-color: ${C.goldBorder} !important; background: ${C.goldBg} !important; }
        .csel-opt:hover { background: rgba(var(--rgb-hi),0.04) !important; }
        @media (max-width: 520px) {
          .sty-2col { grid-template-columns: 1fr !important; }
          .sty-hdr  { flex-wrap: wrap; gap: 0.75rem !important; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="sty-hdr" style={{ flexShrink: 0, marginBottom: '1.25rem', paddingBottom: '1.1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: '0.3rem' }}>Team</p>
          <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.6rem,2.5vw,2.2rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.2rem' }}>Stylists</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
              <span style={{ color: C.white, fontWeight: 600 }}>{stylists.length}</span> team members
            </span>
            {linkedCount > 0 && (
              <span style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                <span style={{ color: C.green, fontWeight: 600 }}>{linkedCount}</span> linked
              </span>
            )}
          </div>
        </div>
        <button onClick={() => { setForm(EMPTY); setLocalPreview(null); setModal('add') }} className="btn-g"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0.55rem 1.1rem', borderRadius: 10, background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .2s' }}>
          <Plus size={14} /> Add Stylist
        </button>
      </div>

      {/* ── Card grid ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.875rem' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 120, borderRadius: 16, background: C.card, border: `1px solid ${C.border}` }} className="shimmer" />
            ))}
          </div>
        ) : stylists.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, gap: '0.75rem', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={26} color="var(--col-text)" strokeWidth={1} />
            </div>
            <p style={{ color: C.white, fontSize: '0.9rem', fontFamily: 'DM Sans,sans-serif' }}>No team members yet</p>
            <p style={{ color: C.muted, fontSize: '0.78rem', fontFamily: 'DM Sans,sans-serif' }}>Add your first stylist to get started</p>
            <button onClick={() => { setForm(EMPTY); setLocalPreview(null); setModal('add') }} className="btn-g"
              style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 7, padding: '0.55rem 1.1rem', borderRadius: 10, background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .2s' }}>
              <Plus size={14} /> Add Stylist
            </button>
          </div>
        ) : (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.875rem' }}>
            {stylists.slice(page * 6, (page + 1) * 6).map(s => {
              return (
                <div key={s.id} className="sty-card"
                  style={{ background: C.card, border: `1px solid ${s.profile_id ? C.greenBorder : C.border}`, borderRadius: 16, overflow: 'hidden', display: 'flex', minHeight: 120 }}>

                  {/* Photo */}
                  <div style={{ width: 110, flexShrink: 0, position: 'relative', overflow: 'hidden', background: 'var(--col-modal)' }}>
                    {s.photo_url
                      ? <img src={s.photo_url} alt={s.name} className="sty-img"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(var(--rgb-acc),0.05), rgba(var(--rgb-acc),0.03))' }}>
                          <User size={32} color="rgba(var(--rgb-acc),0.18)" strokeWidth={1} />
                        </div>
                    }
                    {/* Right-side gradient for smooth blend into card */}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 55%, rgba(22,22,32,0.85))' }} />
                    {/* Display order badge */}
                    <div style={{ position: 'absolute', top: 7, left: 7, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 700 }}>{(s.display_order ?? 0) + 1}</span>
                    </div>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, padding: '0.875rem 1rem 0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>

                    {/* Name row + actions */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="font-display" style={{ color: C.white, fontSize: '1.1rem', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => openEdit(s)} className="sty-edit"
                          style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--col-acc)', border: '1px solid rgba(var(--rgb-acc),0.18)', color: 'var(--col-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s' }}>
                          <Edit2 size={11} />
                        </button>
                        <button onClick={() => del(s.id)} className="sty-del"
                          style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.12)', color: 'rgba(248,113,113,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s' }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: C.border, marginTop: 2, marginBottom: 2 }} />

                    {/* Bio */}
                    {s.bio && (
                      <p style={{ color: C.muted, fontSize: '0.7rem', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {s.bio}
                      </p>
                    )}


                    {/* Footer: instagram + rate + linked */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 2, gap: 4, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {s.hourly_rate != null && s.hourly_rate !== '' && (
                          <span style={{ fontSize: 8, padding: '2px 8px', borderRadius: 9999, background: C.goldBg, border: `1px solid ${C.goldBorder}`, color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.06em' }}>
                            ${parseFloat(s.hourly_rate).toFixed(2)}/hr
                          </span>
                        )}
                      </div>
                      {s.profile_id
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 8, padding: '2px 8px', borderRadius: 9999, background: C.greenBg, border: `1px solid ${C.greenBorder}`, color: C.green, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} />
                            Linked
                          </span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 8, padding: '2px 8px', borderRadius: 9999, background: C.subtle, border: `1px solid ${C.border}`, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            <Link2 size={8} />
                            Not linked
                          </span>
                      }
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <Pager page={page} total={stylists.length} onChange={setPage} />
          </>
        )}
      </div>

      {/* ── Modal ────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={e => { if (e.target === e.currentTarget) { setModal(null); setLocalPreview(null) } }}>
          <div style={{ width: '100%', maxWidth: 480, background: C.modal, border: `1px solid ${C.goldBorder}`, borderRadius: 20, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 40px 100px rgba(0,0,0,.65)' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ height: 3, background: 'linear-gradient(90deg,var(--col-acc),var(--col-acc2),rgba(var(--rgb-acc),0.15))' }} />

            <div style={{ padding: '1.75rem' }}>
              {/* Modal header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 5 }}>
                    {modal === 'add' ? 'New Member' : 'Edit Member'}
                  </p>
                  <h2 className="font-display font-light" style={{ fontSize: '1.6rem', color: C.white, lineHeight: 1 }}>
                    {modal === 'add' ? 'Add Stylist' : form.name || 'Edit Stylist'}
                  </h2>
                </div>
                <button onClick={() => { setModal(null); setLocalPreview(null) }}
                  style={{ width: 32, height: 32, borderRadius: '50%', background: C.subtle, border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Name */}
                <div><label style={lbl}>Name <span style={{ color: C.gold }}>*</span></label><input value={form.name} onChange={set('name')} placeholder="Sophie Laurent" className="m-inp" style={inp} /></div>

                {/* Hourly rate */}
                <div style={{ padding: '1rem', borderRadius: 12, background: C.goldBg, border: `1px solid ${C.goldBorder}` }}>
                  <label style={{ ...lbl, color: C.goldDim, marginBottom: 4 }}>Hourly Rate</label>
                  <p style={{ fontSize: '0.7rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', marginBottom: 8 }}>
                    Used to auto-calculate pay runs from timesheet hours.
                  </p>
                  <div style={{ position: 'relative', maxWidth: 160 }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.goldDim, fontFamily: 'DM Sans,sans-serif', fontSize: '0.85rem', pointerEvents: 'none' }}>$</span>
                    <input
                      type="number" min="0" step="0.5"
                      value={form.hourly_rate || ''}
                      onChange={set('hourly_rate')}
                      placeholder="0.00"
                      className="m-inp"
                      style={{ ...inp, paddingLeft: '1.75rem' }}
                    />
                  </div>
                </div>

                {/* Bio */}
                <div><label style={lbl}>Bio</label><textarea value={form.bio || ''} onChange={set('bio')} rows={2} placeholder="Short bio about this stylist…" className="m-inp" style={{ ...inp, resize: 'none' }} /></div>

                {/* Photo upload */}
                <div>
                  <label style={lbl}>Photo</label>
                  <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = '' }} />

                  {(localPreview || form.photo_url) ? (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 68, height: 90, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, flexShrink: 0 }}>
                        <img src={localPreview || form.photo_url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                        <button type="button" onClick={() => fileRef.current?.click()}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, background: C.subtle, border: `1px solid ${C.border}`, color: C.dim, fontSize: 10, fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>
                          <Upload size={11} /> Change photo
                        </button>
                        <button type="button" onClick={() => { setLocalPreview(null); setForm(p => ({ ...p, photo_url: '', _pendingFile: undefined })) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 10, fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>
                          <X size={11} /> Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="drop-zone"
                      onClick={() => fileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                      style={{ border: `1.5px dashed ${dragOver ? C.gold : 'rgba(var(--rgb-hi),0.1)'}`, borderRadius: 12, padding: '1.25rem', textAlign: 'center', cursor: 'pointer', background: dragOver ? C.goldBg : 'rgba(var(--rgb-hi),0.02)', transition: 'all .2s' }}>
                      <Upload size={18} color={dragOver ? C.gold : 'var(--col-text)'} style={{ margin: '0 auto 0.5rem' }} />
                      <p style={{ fontSize: '0.78rem', color: dragOver ? C.gold : C.muted, fontFamily: 'DM Sans,sans-serif', marginBottom: 2 }}>Click or drag & drop</p>
                      <p style={{ fontSize: 9, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>JPG, PNG, WebP · max 5 MB</p>
                    </div>
                  )}
                  {uploading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: C.goldDim, fontSize: '0.75rem', fontFamily: 'DM Sans,sans-serif' }}>
                      <div style={{ width: 12, height: 12, border: `2px solid ${C.goldBorder}`, borderTopColor: C.gold, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                      Uploading…
                    </div>
                  )}
                </div>


                {/* Linked account */}
                <div style={{ padding: '1rem', borderRadius: 12, background: 'rgba(52,211,153,0.04)', border: `1px solid ${C.greenBorder}` }}>
                  <label style={{ ...lbl, color: C.green, marginBottom: 4 }}>
                    <Link2 size={9} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} />
                    Linked Account
                  </label>
                  <p style={{ fontSize: '0.7rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', marginBottom: 8 }}>
                    Link a staff account so they can clock in/out from their own login.
                  </p>
                  <CustomSelect
                    value={form.profile_id || ''}
                    onChange={v => setForm(p => ({ ...p, profile_id: v }))}
                    options={[
                      { value: '', label: 'No account linked' },
                      ...staff.map(u => {
                        const takenBy = stylists.find(s => s.profile_id === u.id && s.id !== form.id)
                        return {
                          value: u.id,
                          label: u.full_name || u.email,
                          sublabel: takenBy ? `→ ${takenBy.name}` : null,
                          disabled: !!takenBy,
                        }
                      })
                    ]}
                  />
                </div>

              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '0.625rem', marginTop: '1.5rem' }}>
                <button onClick={() => { setModal(null); setLocalPreview(null) }}
                  style={{ flex: 1, padding: '0.65rem', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={save} disabled={saving || uploading}
                  style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: `linear-gradient(135deg,${C.gold},var(--col-acc2))`, color: 'var(--col-bg)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: (saving || uploading) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: (saving || uploading) ? 0.6 : 1 }}>
                  {saving
                    ? <div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,.25)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                    : <><Save size={13} /> {modal === 'add' ? 'Add Stylist' : 'Save Changes'}</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 380, background: 'var(--col-modal)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.7)' }}>

            <div style={{ height: 3, background: 'linear-gradient(90deg,#f87171,#ef4444,rgba(248,113,113,0.1))' }} />

            <div style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <Trash2 size={22} color="#f87171" strokeWidth={1.5} />
                </div>
                <h2 className="font-display font-light" style={{ fontSize: '1.55rem', color: 'var(--col-text)', lineHeight: 1.1, marginBottom: '0.4rem' }}>
                  Delete Artist
                </h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.6 }}>
                  Are you sure you want to delete <span style={{ color: 'var(--col-text)', fontWeight: 600 }}>{deleteTarget.name}</span>?
                  <br />This will remove their profile and all related data permanently.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.625rem' }}>
                <button onClick={() => setDeleteTarget(null)}
                  style={{ flex: 1, padding: '0.65rem', borderRadius: 10, background: 'transparent', border: '1px solid rgba(var(--rgb-hi),0.09)', color: 'var(--col-text)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}>
                  Cancel
                </button>
                <button onClick={confirmDelete} disabled={deleting}
                  style={{ flex: 2, padding: '0.65rem', borderRadius: 10, background: 'linear-gradient(135deg,#f87171,#ef4444)', color: 'var(--col-text)', fontSize: '0.8rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: deleting ? 0.6 : 1, transition: 'all .2s' }}>
                  {deleting
                    ? <div style={{ width: 14, height: 14, border: '2px solid rgba(var(--rgb-hi),.3)', borderTopColor: 'var(--col-text)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                    : <><Trash2 size={13} /> Delete Permanently</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
