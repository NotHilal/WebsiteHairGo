import { useState, useEffect, useMemo } from 'react'
import { Plus, X, Save, Trash2, Edit2, Search, Scissors, AlertTriangle, ChevronRight, ChevronLeft, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getOrFetch, invalidate } from '../../lib/cache'
import { fetchAll } from '../../lib/fetchAll'
import { useAuth } from '../../contexts/AuthContext'
import { useLogAction } from '../../hooks/useLogAction'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import Pager from '../../lib/Pager'

const C = {
  card: 'var(--col-modal)', card2: 'var(--col-card)',
  gold: 'var(--col-acc)', goldDim: 'var(--col-acc)', goldBg: 'rgba(var(--rgb-acc),0.08)', goldBorder: 'rgba(var(--rgb-acc),0.18)',
  white: 'var(--col-text)', dim: 'var(--col-text)', muted: 'var(--col-text)', faint: 'rgba(var(--rgb-hi),0.1)',
  border: 'rgba(var(--rgb-hi),0.07)', modal: 'var(--col-modal)',
}

const inp = { width: '100%', background: 'rgba(var(--rgb-hi),0.05)', border: '1px solid rgba(var(--rgb-hi),0.1)', borderRadius: 9, padding: '0.55rem 0.8rem', fontSize: '1.02rem', color: 'var(--col-text)', outline: 'none', fontFamily: 'DM Sans,sans-serif', fontWeight: 300, transition: 'border-color .2s', boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }
const EMPTY = { code: '', discount_type: 'percentage', discount_value: '', expiry_date: '', is_public: false, max_uses: '' }

function ModalWrap({ children, onClose, maxWidth = 440 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth, background: C.modal, border: `1px solid ${C.goldBorder}`, borderRadius: 18, padding: '2.1rem', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 40px 100px rgba(0,0,0,0.7)' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function TypeToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', border: '1px solid rgba(var(--rgb-hi),0.1)', borderRadius: 9, overflow: 'hidden' }}>
      {[['percentage', '% Percentage'], ['fixed', '$ Fixed']].map(([val, label]) => (
        <button key={val} type="button" onClick={() => onChange(val)}
          style={{ flex: 1, padding: '0.55rem 0.5rem', border: 'none', cursor: 'pointer', transition: 'all .15s', background: value === val ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.03)', color: value === val ? 'var(--col-bg)' : 'var(--col-text)', fontSize: '0.98rem', fontFamily: 'DM Sans,sans-serif', fontWeight: value === val ? 600 : 400, borderRight: val === 'percentage' ? '1px solid rgba(var(--rgb-hi),0.1)' : 'none' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

function CouponCard({ coupon, assignment, onEdit, onToggle, onDelete, onUnassign, onAssign, isExpired }) {
  const disc = coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `$${coupon.discount_value}`
  const usedByClient = assignment?.used === true
  const used = !coupon.active || usedByClient || isExpired
  const statusLabel = isExpired ? 'Expired' : (usedByClient || !coupon.active) ? 'Used' : 'Active'
  const statusColor = isExpired ? '#f59e0b' : used ? 'var(--col-text)' : '#34d399'
  const statusBg    = isExpired ? 'rgba(245,158,11,0.1)' : used ? 'rgba(var(--rgb-hi),0.04)' : 'rgba(52,211,153,0.1)'
  const statusBorder = isExpired ? 'rgba(245,158,11,0.25)' : used ? 'rgba(var(--rgb-hi),0.07)' : 'rgba(52,211,153,0.22)'
  const sharedBorder = `1px solid ${used ? C.border : C.goldBorder}`
  return (
    <div>
      {/* ── Desktop ── */}
      <div className="uc-desktop-card" style={{ display: 'flex', borderRadius: 14, overflow: 'hidden', border: sharedBorder, opacity: used ? 0.5 : 1, filter: used ? 'grayscale(0.35)' : 'none', transition: 'all .2s' }}>
        <div style={{ flexShrink: 0, width: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: used ? 'rgba(var(--rgb-hi),0.02)' : C.goldBg, borderRight: `1px dashed ${used ? C.border : C.goldBorder}`, padding: '14px 6px', position: 'relative' }}>
          <span className="font-display gold-gradient" style={{ fontSize: '2.1rem', lineHeight: 1, fontWeight: 400, filter: used ? 'grayscale(1)' : 'none' }}>{disc}</span>
          <span style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: used ? 'var(--col-text)' : C.goldDim, fontFamily: 'DM Sans,sans-serif', marginTop: 3 }}>OFF</span>
          <div style={{ position: 'absolute', top: -8, right: -8, width: 16, height: 16, borderRadius: '50%', background: 'var(--col-modal)' }} />
          <div style={{ position: 'absolute', bottom: -8, right: -8, width: 16, height: 16, borderRadius: '50%', background: 'var(--col-modal)' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: used ? 'rgba(var(--rgb-hi),0.01)' : C.card, minWidth: 0 }}>
          <div style={{ flex: '0 0 150px', padding: '6px 12px', borderRadius: 8, background: used ? 'rgba(var(--rgb-hi),0.03)' : 'var(--col-acc)', border: `1px solid ${used ? C.border : 'var(--col-acc)'}` }}>
            <span style={{ fontFamily: '"Courier New",monospace', fontSize: '0.98rem', color: used ? C.muted : 'var(--col-bg)', letterSpacing: '0.12em', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{coupon.code}</span>
          </div>
          <span style={{ fontSize: '0.84rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', flexShrink: 0 }}>
            {coupon.expiry_date ? `Exp. ${format(new Date(coupon.expiry_date), 'MMM d, yyyy')}` : 'No expiry'}
          </span>
          {assignment ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: C.goldBg, border: `1px solid ${C.goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: C.gold, fontFamily: '"Cormorant Garamond",serif', fontWeight: 600 }}>{assignment.name?.[0]?.toUpperCase() || '?'}</span>
              </div>
              <p style={{ fontSize: '0.86rem', color: C.dim, fontFamily: 'DM Sans,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{assignment.name}</p>
            </div>
          ) : (
            <span style={{ flex: 1, fontSize: '0.84rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontStyle: 'italic' }}>Not assigned</span>
          )}
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, flexShrink: 0, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor, background: statusBg, border: `1px solid ${statusBorder}` }}>{statusLabel}</span>
          <button onClick={() => onToggle(coupon.id, coupon.active, usedByClient)} className={used ? 'btn-mark-active' : 'btn-mark-used'} style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .18s', whiteSpace: 'nowrap', border: used ? `1px solid ${C.border}` : '1px solid rgba(248,113,113,0.22)', background: used ? 'rgba(var(--rgb-hi),0.04)' : 'rgba(248,113,113,0.07)', color: used ? C.muted : 'rgba(248,113,113,0.75)' }}>{used ? 'Mark active' : 'Mark used'}</button>
          {assignment
            ? <button onClick={() => onUnassign(coupon.id)} className="btn-unassign" style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .18s', whiteSpace: 'nowrap', border: '1px solid rgba(var(--rgb-hi),0.1)', background: 'rgba(var(--rgb-hi),0.03)', color: C.muted }}>Unassign</button>
            : <button onClick={() => onAssign(coupon)} className="btn-assign-uc" style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .18s', whiteSpace: 'nowrap', border: `1px solid ${C.goldBorder}`, background: C.goldBg, color: C.goldDim }}>Assign</button>
          }
          <button onClick={() => onEdit(coupon)} className="btn-edit-uc" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}`, background: 'rgba(var(--rgb-hi),0.03)', color: C.muted }}><Edit2 size={12} /></button>
          {onDelete && <button onClick={() => onDelete(coupon)} className="btn-del-uc" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(248,113,113,0.15)', background: 'rgba(248,113,113,0.05)', color: 'rgba(248,113,113,0.45)' }}><Trash2 size={12} /></button>}
        </div>
      </div>

      {/* ── Mobile card ── */}
      <div className="uc-mobile-card" style={{ display: 'none', borderRadius: 14, overflow: 'hidden', border: sharedBorder, opacity: used ? 0.55 : 1, filter: used ? 'grayscale(0.35)' : 'none', transition: 'all .2s' }}>
        {/* Top row: badge + code + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: used ? 'rgba(var(--rgb-hi),0.01)' : C.card }}>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: used ? 'rgba(var(--rgb-hi),0.03)' : C.goldBg, border: `1px dashed ${used ? C.border : C.goldBorder}`, borderRadius: 10, padding: '8px 12px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -6, right: -6, width: 12, height: 12, borderRadius: '50%', background: 'var(--col-modal)' }} />
            <div style={{ position: 'absolute', bottom: -6, right: -6, width: 12, height: 12, borderRadius: '50%', background: 'var(--col-modal)' }} />
            <span className="font-display gold-gradient" style={{ fontSize: '1.62rem', lineHeight: 1, filter: used ? 'grayscale(1)' : 'none' }}>{disc}</span>
            <span style={{ fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', color: used ? 'var(--col-text)' : C.goldDim, fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>OFF</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <div style={{ padding: '4px 10px', borderRadius: 7, background: used ? 'rgba(var(--rgb-hi),0.03)' : 'var(--col-acc)', border: `1px solid ${used ? C.border : 'var(--col-acc)'}`, overflow: 'hidden' }}>
                <span style={{ fontFamily: '"Courier New",monospace', fontSize: '1.06rem', color: used ? C.muted : 'var(--col-bg)', letterSpacing: '0.12em' }}>{coupon.code}</span>
              </div>
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, flexShrink: 0, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, textTransform: 'uppercase', color: statusColor, background: statusBg, border: `1px solid ${statusBorder}` }}>{statusLabel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
                {coupon.expiry_date ? `Exp. ${format(new Date(coupon.expiry_date), 'MMM d, yyyy')}` : 'No expiry'}
              </span>
              {assignment && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: C.goldBg, border: `1px solid ${C.goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 8, color: C.gold, fontFamily: '"Cormorant Garamond",serif', fontWeight: 600 }}>{assignment.name?.[0]?.toUpperCase() || '?'}</span>
                  </div>
                  <span style={{ fontSize: '0.82rem', color: C.dim, fontFamily: 'DM Sans,sans-serif' }}>{assignment.name}</span>
                </div>
              )}
              {!assignment && <span style={{ fontSize: '0.82rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontStyle: 'italic' }}>Not assigned</span>}
            </div>
          </div>
        </div>
        {/* Action row */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px', flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, background: 'rgba(var(--rgb-hi),0.01)' }}>
          <button onClick={() => onToggle(coupon.id, coupon.active, usedByClient)} className={used ? 'btn-mark-active' : 'btn-mark-used'}
            style={{ flex: 1, minWidth: 90, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .18s', whiteSpace: 'nowrap', border: used ? `1px solid ${C.border}` : '1px solid rgba(248,113,113,0.22)', background: used ? 'rgba(var(--rgb-hi),0.04)' : 'rgba(248,113,113,0.07)', color: used ? C.muted : 'rgba(248,113,113,0.75)' }}>
            {used ? 'Mark active' : 'Mark used'}
          </button>
          {assignment
            ? <button onClick={() => onUnassign(coupon.id)} className="btn-unassign"
                style={{ flex: 1, minWidth: 90, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .18s', border: '1px solid rgba(var(--rgb-hi),0.1)', background: 'rgba(var(--rgb-hi),0.03)', color: C.muted }}>
                Unassign
              </button>
            : <button onClick={() => onAssign(coupon)} className="btn-assign-uc"
                style={{ flex: 1, minWidth: 90, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all .18s', border: `1px solid ${C.goldBorder}`, background: C.goldBg, color: C.goldDim }}>
                Assign
              </button>
          }
          <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
            <button onClick={() => onEdit(coupon)} className="btn-edit-uc"
              style={{ width: 32, height: 32, borderRadius: 8, cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}`, background: 'rgba(var(--rgb-hi),0.03)', color: C.muted }}><Edit2 size={12} /></button>
            {onDelete && <button onClick={() => onDelete(coupon)} className="btn-del-uc"
              style={{ width: 32, height: 32, borderRadius: 8, cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(248,113,113,0.15)', background: 'rgba(248,113,113,0.05)', color: 'rgba(248,113,113,0.45)' }}><Trash2 size={12} /></button>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Selectable coupon mini card (used in assign step 1) ── */
function SelectableCouponCard({ coupon, selected, onSelect }) {
  const disc = coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `$${coupon.discount_value}`
  return (
    <button type="button" onClick={() => onSelect(coupon)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${selected ? C.goldBorder : C.border}`, background: selected ? C.goldBg : 'rgba(var(--rgb-hi),0.02)', cursor: 'pointer', transition: 'all .15s', textAlign: 'left' }}
      className="sel-card">
      <div style={{ width: 60, height: 52, borderRadius: 10, background: selected ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${selected ? C.goldBorder : C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '4px 6px' }}>
        <span className="font-display gold-gradient" style={{ fontSize: '1.32rem', lineHeight: 1, filter: selected ? 'none' : 'grayscale(1)' }}>{disc}</span>
        <span style={{ fontSize: 8, letterSpacing: '0.18em', color: selected ? C.goldDim : 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', marginTop: 2 }}>OFF</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: '"Courier New",monospace', fontSize: '0.98rem', color: selected ? C.gold : C.white, letterSpacing: '0.1em', marginBottom: 3 }}>{coupon.code}</p>
        <p style={{ fontSize: '0.84rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>
          {coupon.expiry_date ? `Expires ${format(new Date(coupon.expiry_date), 'MMM d, yyyy')}` : 'No expiry'}
        </p>
      </div>
      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selected ? C.gold : C.border}`, background: selected ? C.gold : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {selected && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--col-modal)' }} />}
      </div>
    </button>
  )
}

/* ── Main ──────────────────────────────────────────── */
export default function StudioCoupons() {
  const { isAdmin } = useAuth()
  const log = useLogAction()
  const [coupons,      setCoupons]      = useState([])
  const [users,        setUsers]        = useState([])
  const [assignments,  setAssignments]  = useState({})   // coupon_id → { name, used }
  const [assignedIds,  setAssignedIds]  = useState(new Set())
  const [loading,      setLoading]      = useState(true)
  const [modal,        setModal]        = useState(null)
  const [form,         setForm]         = useState(EMPTY)
  const [saving,       setSaving]       = useState(false)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page,         setPage]         = useState(0)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Assign wizard
  const [assignStep,   setAssignStep]   = useState(1)
  const [assignCoupon, setAssignCoupon] = useState(null)
  const [assignUser,   setAssignUser]   = useState(null)
  const [userSearch,   setUserSearch]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const result = await getOrFetch('studio_coupons', async () => {
      const [{ data: c }, { data: uc }, { data: u }] = await Promise.all([
        supabase.from('coupons').select('*').order('created_at', { ascending: false }),
        supabase.from('user_coupons').select('*, profiles(full_name)').order('created_at', { ascending: false }),
        fetchAll(() => supabase.from('profiles').select('*').order('created_at', { ascending: false }).order('id')),
      ])
      const map = {}
      const ids = new Set()
      ;(uc || []).forEach(r => {
        // Most recent holder; actions below target this one assignment only
        if (!map[r.coupon_id]) map[r.coupon_id] = { id: r.id, name: r.profiles?.full_name || 'Unknown', used: r.used }
        ids.add(r.coupon_id)
      })
      return { coupons: c || [], assignments: map, assignedIds: ids, users: u || [] }
    }, 2 * 60_000)
    setCoupons(result.coupons)
    setAssignments(result.assignments)
    setAssignedIds(result.assignedIds)
    setUsers(result.users)
    setLoading(false)
  }

  async function save() {
    if (!form.code.trim()) return toast.error('Code is required')
    if (!form.discount_value) return toast.error('Discount value is required')
    setSaving(true)
    try {
      const maxUses = form.max_uses === '' || form.max_uses == null ? null : parseInt(form.max_uses)
      const payload = {
        code: form.code.toUpperCase(), discount_type: form.discount_type, discount_value: parseFloat(form.discount_value),
        expiry_date: form.expiry_date || null,
        // Personal coupons can only be used by the clients they are assigned to
        is_public: !!form.is_public,
        max_uses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : null,
        // Editing keeps the current on/off state
        ...(modal === 'add' ? { active: true } : {}),
      }
      const { error } = modal === 'add'
        ? await supabase.from('coupons').insert(payload)
        : await supabase.from('coupons').update(payload).eq('id', form.id)
      if (error) throw error
      toast.success(modal === 'add' ? 'Coupon created' : 'Coupon updated')
      log(modal === 'add' ? 'coupon.created' : 'coupon.edited', { entityType: 'coupon', details: { message: `${modal === 'add' ? 'created' : 'edited'} coupon "${form.code.toUpperCase()}"` } })
      setModal(null); setForm(EMPTY); invalidate('studio_coupons'); load()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const { data: deleted, error } = await supabase.from('coupons').delete().eq('id', deleteTarget.id).select('id')
    if (error) { toast.error(error.message); return }
    if (!deleted?.length) { toast.error('Only an admin can delete coupons — switch it off instead'); return }
    setCoupons(prev => prev.filter(c => c.id !== deleteTarget.id))
    toast.success('Coupon deleted')
    log('coupon.deleted', { entityType: 'coupon', entityId: deleteTarget.id, details: { message: `deleted coupon "${deleteTarget.code}"` } })
    setDeleteTarget(null)
  }

  function openAssignForCoupon(coupon) {
    setAssignCoupon(coupon)
    setAssignStep(2)
    setAssignUser(null)
    setUserSearch('')
    setModal('assign')
  }

  async function unassignCoupon(couponId) {
    const assignmentId = assignments[couponId]?.id
    if (!assignmentId) return
    const { data: deleted, error } = await supabase.from('user_coupons').delete().eq('id', assignmentId).select('id')
    if (error) { toast.error(error.message); return }
    if (!deleted?.length) { toast.error('Only an admin can unassign coupons'); return }
    invalidate('studio_coupons')
    setAssignments(prev => { const next = { ...prev }; delete next[couponId]; return next })
    setAssignedIds(prev => { const next = new Set(prev); next.delete(couponId); return next })
    toast.success('Coupon unassigned')
  }

  async function toggleActive(id, currentActive, assignmentUsed = false) {
    if (currentActive && assignmentUsed) {
      // Coupon is still globally active but was used by the assigned client.
      // "Mark active" here means: let the client use it again — just reset user_coupons.used.
      const { error } = await supabase.from('user_coupons').update({ used: false }).eq('id', assignments[id]?.id)
      if (error) { toast.error(error.message); return }
      setAssignments(prev => prev[id] ? { ...prev, [id]: { ...prev[id], used: false } } : prev)
      invalidate('studio_coupons')
      toast.success('Marked as active')
      return
    }

    const { error } = await supabase.from('coupons').update({ active: !currentActive }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setCoupons(prev => prev.map(c => c.id === id ? { ...c, active: !currentActive } : c))

    // Sync user_coupons.used — active=true means used=false, active=false means used=true
    if (assignedIds.has(id) && assignments[id]?.id) {
      const { error: ucErr } = await supabase.from('user_coupons').update({ used: currentActive }).eq('id', assignments[id].id)
      if (ucErr) toast.error('Coupon status updated but could not sync assignment: ' + ucErr.message)
      else setAssignments(prev => prev[id] ? { ...prev, [id]: { ...prev[id], used: currentActive } } : prev)
    }

    invalidate('studio_coupons')
    toast.success(!currentActive ? 'Marked as active' : 'Marked as used')
  }

  async function confirmAssign() {
    if (!assignCoupon || !assignUser) return
    setSaving(true)
    try {
      const { data: uc, error } = await supabase.from('user_coupons').upsert({ user_id: assignUser.id, coupon_id: assignCoupon.id, granted_by: 'admin', used: false }, { onConflict: 'user_id,coupon_id' }).select('id').single()
      if (error) throw error
      setAssignedIds(prev => new Set([...prev, assignCoupon.id]))
      setAssignments(prev => ({ ...prev, [assignCoupon.id]: { id: uc.id, name: assignUser.full_name || 'Unknown', used: false } }))
      invalidate('studio_coupons')
      toast.success(`Coupon assigned to ${assignUser.full_name || 'client'}`)
      log('coupon.assigned', { entityType: 'coupon', entityId: assignCoupon.id, details: { message: `assigned coupon "${assignCoupon.code}" to ${assignUser.full_name || 'client'}` } })
      setModal(null); setAssignStep(1); setAssignCoupon(null); setAssignUser(null); setUserSearch('')
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const now = new Date()
  const isExp = c => !!(c.expiry_date && new Date(c.expiry_date) < now)
  const activeCount  = coupons.filter(c => c.active && !isExp(c)).length
  const usedCount    = coupons.filter(c => !c.active && !isExp(c)).length
  const expiredCount = coupons.filter(c => isExp(c)).length

  const filtered = useMemo(() => {
    const n = new Date()
    const priority = c => {
      const expired = !!(c.expiry_date && new Date(c.expiry_date) < n)
      if (expired) return 2
      if (!c.active) return 1
      return 0
    }
    return coupons.filter(c => {
      const expired = !!(c.expiry_date && new Date(c.expiry_date) < n)
      const matchStatus =
        statusFilter === 'all' ? true :
        statusFilter === 'expired' ? expired :
        statusFilter === 'used' ? (!c.active && !expired) :
        (c.active && !expired)
      const q = search.toLowerCase()
      return matchStatus && (!q || c.code.toLowerCase().includes(q))
    }).sort((a, b) => priority(a) - priority(b))
  }, [coupons, statusFilter, search])

  useEffect(() => setPage(0), [statusFilter, search])
  const paged = filtered.slice(page * 6, (page + 1) * 6)

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase()
    return users.filter(u => !q || u.full_name?.toLowerCase().includes(q) || u.phone?.includes(q))
  }, [users, userSearch])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .m-inp:focus       { border-color: ${C.goldBorder} !important; box-shadow: 0 0 0 3px rgba(var(--rgb-acc),0.08); }
        .uc-search:focus   { border-color: ${C.goldBorder} !important; }
        .uc-row:hover      { border-color: rgba(var(--rgb-acc),0.35) !important; }
        .btn-pill:hover    { border-color: ${C.goldBorder} !important; color: ${C.goldDim} !important; }
        .btn-mark-used:hover   { background: rgba(248,113,113,0.15) !important; border-color: rgba(248,113,113,0.35) !important; color: #f87171 !important; }
        .btn-mark-active:hover { background: rgba(52,211,153,0.1) !important; border-color: rgba(52,211,153,0.3) !important; color: #34d399 !important; }
        .btn-edit-uc:hover   { border-color: var(--col-text) !important; color: ${C.white} !important; background: rgba(var(--rgb-hi),0.07) !important; }
        .btn-unassign:hover  { border-color: var(--col-text) !important; color: ${C.white} !important; background: rgba(var(--rgb-hi),0.07) !important; }
        .btn-del-uc:hover  { background: rgba(248,113,113,0.15) !important; border-color: rgba(248,113,113,0.35) !important; color: #f87171 !important; }
        .btn-gold-sm:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(var(--rgb-acc),0.3); }
        .sel-card:hover    { border-color: ${C.goldBorder} !important; background: rgba(var(--rgb-acc),0.04) !important; }
        .user-row:hover    { background: rgba(var(--rgb-hi),0.04) !important; }
        .uc-mobile-card { display: none; }
        @media (max-width: 767px) {
          .uc-desktop-card { display: none !important; }
          .uc-mobile-card  { display: block !important; }
          .uc-hdr { flex-direction: column !important; align-items: flex-start !important; gap: 0.75rem !important; }
          .uc-hdr-btns { display: flex; gap: 6px; width: 100%; }
          .uc-hdr-btns > button { flex: 1; justify-content: center; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="uc-hdr" style={{ flexShrink: 0, paddingBottom: '1rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-display font-light" style={{ fontSize: 'clamp(1.92rem,3vw,2.64rem)', color: C.white, lineHeight: 1.1, marginBottom: '0.2rem' }}>Coupons</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.9rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>{coupons.length} total</span>
            {activeCount > 0 && <span style={{ fontSize: '0.84rem', color: '#34d399', fontFamily: 'DM Sans,sans-serif', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)', padding: '2px 8px', borderRadius: 20 }}>{activeCount} active</span>}
            {usedCount > 0 && <span style={{ fontSize: '0.84rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${C.border}`, padding: '2px 8px', borderRadius: 20 }}>{usedCount} used</span>}
            {expiredCount > 0 && <span style={{ fontSize: '0.84rem', color: '#f59e0b', fontFamily: 'DM Sans,sans-serif', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', padding: '2px 8px', borderRadius: 20 }}>{expiredCount} expired</span>}
          </div>
        </div>
        <div className="uc-hdr-btns" style={{ display: 'flex', gap: 7 }}>
          <button onClick={() => { setForm(EMPTY); setModal('add') }} className="btn-gold-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', borderRadius: 9, background: 'linear-gradient(135deg,var(--col-acc),var(--col-acc2))', color: 'var(--col-bg)', fontSize: '0.94rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .2s' }}>
            <Plus size={13} /> New Coupon
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={12} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by coupon code…" autoComplete="off" className="uc-search"
            style={{ width: '100%', boxSizing: 'border-box', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0.52rem 0.75rem 0.52rem 2.2rem', fontSize: '0.96rem', color: C.white, outline: 'none', fontFamily: 'DM Sans,sans-serif', transition: 'all .2s' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex' }}><X size={12} /></button>}
        </div>
        {[['all','All',coupons.length],['active','Active',activeCount],['used','Used',usedCount],['expired','Expired',expiredCount]].map(([val,label,count]) => (
          <button key={val} onClick={() => setStatusFilter(val)} className="btn-pill"
            style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', border: `1px solid ${statusFilter === val ? C.goldBorder : C.border}`, background: statusFilter === val ? C.goldBg : 'transparent', color: statusFilter === val ? C.gold : C.muted }}>
            {label} · {count}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 76, borderRadius: 14, background: C.card, border: `1px solid ${C.border}` }} className="shimmer" />)
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Scissors size={22} style={{ color: C.faint }} />
            </div>
            <p style={{ color: C.dim, fontSize: '1.06rem', fontFamily: 'DM Sans,sans-serif' }}>{coupons.length === 0 ? 'No coupons yet' : 'No results match your search'}</p>
            {(search || statusFilter !== 'all') && (
              <button onClick={() => { setSearch(''); setStatusFilter('all') }} style={{ padding: '5px 16px', borderRadius: 20, background: C.goldBg, border: `1px solid ${C.goldBorder}`, color: C.goldDim, fontSize: 13, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer' }}>Clear filters</button>
            )}
          </div>
        ) : (
          <>
          {paged.map(c => (
            <CouponCard key={c.id} coupon={c}
              assignment={assignments[c.id] || null}
              isExpired={isExp(c)}
              onEdit={c => { setForm({ code: c.code, discount_type: c.discount_type, discount_value: c.discount_value?.toString(), expiry_date: c.expiry_date || '', is_public: !!c.is_public, max_uses: c.max_uses?.toString() ?? '', id: c.id }); setModal('edit') }}
              onToggle={toggleActive}
              onUnassign={unassignCoupon}
              onAssign={openAssignForCoupon}
              onDelete={isAdmin ? setDeleteTarget : undefined} />
          ))}
          <Pager page={page} total={filtered.length} onChange={setPage} />
          </>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p style={{ flexShrink: 0, textAlign: 'right', fontSize: '0.84rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', opacity: 0.5 }}>{filtered.length} of {coupons.length}</p>
      )}

      {/* ── Create / Edit modal ── */}
      {(modal === 'add' || modal === 'edit') && (
        <ModalWrap onClose={() => { setModal(null); setForm(EMPTY) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.8rem' }}>
            <div>
              <h2 className="font-display" style={{ fontSize: '1.8rem', color: C.white, marginBottom: 3 }}>{modal === 'add' ? 'New Coupon' : 'Edit Coupon'}</h2>
              <p style={{ fontSize: '0.9rem', color: C.muted, fontFamily: 'DM Sans,sans-serif' }}>Fill in the discount details</p>
            </div>
            <button onClick={() => { setModal(null); setForm(EMPTY) }} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={14} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={lbl}>Coupon Code</label>
              <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. LOYAL30" className="m-inp" style={{ ...inp, fontFamily: '"Courier New", monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
            </div>
            <div>
              <label style={lbl}>Discount Type</label>
              <TypeToggle value={form.discount_type} onChange={v => setForm(p => ({ ...p, discount_type: v }))} />
            </div>
            <div>
              <label style={lbl}>Value</label>
              <input type="number" value={form.discount_value}
                onChange={e => setForm(p => ({ ...p, discount_value: p.discount_type === 'percentage' ? Math.min(100, Math.max(0, e.target.value)) : Math.max(0, e.target.value) }))}
                placeholder={form.discount_type === 'percentage' ? '30' : '15'}
                min={0} max={form.discount_type === 'percentage' ? 100 : undefined} className="m-inp" style={inp} />
            </div>
            <div>
              <label style={lbl}>Expiry Date <span style={{ textTransform: 'none', letterSpacing: 0, color: C.muted }}>(optional)</span></label>
              <input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} className="m-inp" style={inp} />
            </div>
            <div>
              <label style={lbl}>Max uses <span style={{ textTransform: 'none', letterSpacing: 0, color: C.muted }}>(optional, blank = unlimited)</span></label>
              <input type="number" min={1} value={form.max_uses} onChange={e => setForm(p => ({ ...p, max_uses: e.target.value }))} placeholder="e.g. 50" className="m-inp" style={inp} />
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.is_public} onChange={e => setForm(p => ({ ...p, is_public: e.target.checked }))} style={{ marginTop: 3 }} />
              <span style={{ fontSize: '0.9rem', color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.4 }}>
                Public promo code
                <span style={{ display: 'block', fontSize: '0.8rem', color: C.muted }}>Anyone with the code can use it. Leave unticked for a coupon you assign to specific clients.</span>
              </span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.625rem', marginTop: '1.8rem' }}>
            <button onClick={() => { setModal(null); setForm(EMPTY) }} style={{ flex: 1, padding: '0.6rem', borderRadius: 9, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.96rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ flex: 1, padding: '0.6rem', borderRadius: 9, background: 'linear-gradient(135deg,var(--col-acc),var(--col-acc2))', color: 'var(--col-bg)', fontSize: '0.96rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
              {saving ? <div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,.25)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> : <><Save size={13} /> {modal === 'add' ? 'Create' : 'Save'}</>}
            </button>
          </div>
        </ModalWrap>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <ModalWrap onClose={() => setDeleteTarget(null)}>
          <div style={{ height: 4, background: 'linear-gradient(90deg,#f87171,#ef4444)', borderRadius: '4px 4px 0 0', margin: '-1.75rem -1.75rem 1.5rem', width: 'calc(100% + 3.5rem)' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: '1.25rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={18} color="#f87171" />
            </div>
            <div>
              <h3 className="font-display" style={{ color: C.white, fontSize: '1.62rem', fontWeight: 500, marginBottom: 4 }}>Delete coupon?</h3>
              <p style={{ color: C.muted, fontSize: '0.94rem', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.5 }}>This action is permanent and cannot be undone.</p>
            </div>
          </div>

          {/* Coupon preview */}
          <div style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.12)', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1.8rem', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 9, background: 'var(--col-acc)', border: `1px solid ${C.goldBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="font-display gold-gradient" style={{ fontSize: '1.2rem', lineHeight: 1 }}>
                {deleteTarget.discount_type === 'percentage' ? `${deleteTarget.discount_value}%` : `$${deleteTarget.discount_value}`}
              </span>
            </div>
            <div>
              <p style={{ fontFamily: '"Courier New",monospace', color: C.gold, fontSize: '1.02rem', letterSpacing: '0.1em', marginBottom: 3 }}>{deleteTarget.code}</p>
              <p style={{ color: C.muted, fontSize: '0.86rem', fontFamily: 'DM Sans,sans-serif' }}>
                {deleteTarget.expiry_date ? `Expires ${format(new Date(deleteTarget.expiry_date), 'MMM d, yyyy')}` : 'No expiry'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '0.65rem', borderRadius: 9, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: '0.98rem', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>Cancel</button>
            <button onClick={confirmDelete} style={{ flex: 1, padding: '0.65rem', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#f87171,#ef4444)', color: 'var(--col-text)', fontSize: '0.98rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </ModalWrap>
      )}

      {/* ── Assign Coupon wizard ── */}
      {modal === 'assign' && (
        <ModalWrap onClose={() => setModal(null)} maxWidth={520}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {assignStep === 2 && (
                  <button onClick={() => setAssignStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', padding: 0 }}>
                    <ChevronLeft size={16} />
                  </button>
                )}
                <h2 className="font-display" style={{ fontSize: '1.8rem', color: C.white, fontWeight: 500 }}>
                  {assignStep === 1 ? 'Choose a Coupon' : 'Choose a Client'}
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {[1, 2].map(s => (
                  <div key={s} style={{ height: 3, width: s === assignStep ? 24 : 8, borderRadius: 2, background: s <= assignStep ? C.gold : C.border, transition: 'all .2s' }} />
                ))}
                <span style={{ fontSize: '0.84rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginLeft: 4 }}>Step {assignStep} of 2</span>
              </div>
            </div>
            <button onClick={() => setModal(null)} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${C.border}`, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={14} /></button>
          </div>

          {/* Step 1 — Pick coupon */}
          {assignStep === 1 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', marginBottom: '1.25rem' }}>
                {(() => {
                  const available = coupons.filter(c => c.active && !assignedIds.has(c.id))
                  if (available.length === 0) return (
                    <p style={{ color: C.muted, fontSize: '0.98rem', fontFamily: 'DM Sans,sans-serif', textAlign: 'center', padding: '2rem 0' }}>
                      All active coupons are already assigned
                    </p>
                  )
                  return available.map(c => (
                    <SelectableCouponCard key={c.id} coupon={c} selected={assignCoupon?.id === c.id} onSelect={setAssignCoupon} />
                  ))
                })()}
              </div>
              <button onClick={() => assignCoupon && setAssignStep(2)} disabled={!assignCoupon}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 9, background: assignCoupon ? 'linear-gradient(135deg,var(--col-acc),var(--col-acc2))' : 'rgba(var(--rgb-hi),0.05)', color: assignCoupon ? 'var(--col-bg)' : C.muted, fontSize: '0.98rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: assignCoupon ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .2s' }}>
                Next <ChevronRight size={14} />
              </button>
            </>
          )}

          {/* Step 2 — Pick user */}
          {assignStep === 2 && (
            <>
              {/* Chosen coupon reminder */}
              {assignCoupon && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 9, background: C.goldBg, border: `1px solid ${C.goldBorder}`, marginBottom: '1rem' }}>
                  <span className="font-display gold-gradient" style={{ fontSize: '1.2rem' }}>
                    {assignCoupon.discount_type === 'percentage' ? `${assignCoupon.discount_value}%` : `$${assignCoupon.discount_value}`} OFF
                  </span>
                  <span style={{ fontFamily: '"Courier New",monospace', fontSize: '0.94rem', color: C.gold, letterSpacing: '0.1em' }}>{assignCoupon.code}</span>
                </div>
              )}

              {/* Search */}
              <div style={{ position: 'relative', marginBottom: '0.9rem' }}>
                <Search size={12} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
                <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search client by name…" autoComplete="off"
                  style={{ ...inp, paddingLeft: '2.2rem' }} className="m-inp" />
                {userSearch && <button onClick={() => setUserSearch('')} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex' }}><X size={12} /></button>}
              </div>

              {/* Users list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto', marginBottom: '1.25rem' }}>
                {filteredUsers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                    <p style={{ color: C.muted, fontSize: '0.98rem', fontFamily: 'DM Sans,sans-serif', marginBottom: 4 }}>
                      {users.length === 0 ? 'No users registered yet' : 'No users match your search'}
                    </p>
                    {userSearch && (
                      <button onClick={() => setUserSearch('')} style={{ fontSize: 12, color: C.goldDim, background: 'none', border: `1px solid ${C.goldBorder}`, borderRadius: 20, padding: '3px 12px', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                        Clear search
                      </button>
                    )}
                    {users.length === 0 && (
                      <p style={{ color: 'var(--col-text)', fontSize: '0.86rem', fontFamily: 'DM Sans,sans-serif', marginTop: 4 }}>
                        Users need to register on the website first
                      </p>
                    )}
                  </div>
                ) : filteredUsers.map(u => {
                  const selected = assignUser?.id === u.id
                  const initials = u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
                  return (
                    <button key={u.id} type="button" onClick={() => setAssignUser(u)} className="user-row"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${selected ? C.goldBorder : C.border}`, background: selected ? C.goldBg : 'rgba(var(--rgb-hi),0.02)', cursor: 'pointer', transition: 'all .15s', textAlign: 'left' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: selected ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.04)', border: `1.5px solid ${selected ? C.goldBorder : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 13, color: selected ? C.gold : C.muted, fontFamily: '"Cormorant Garamond",serif', fontWeight: 600 }}>{initials}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <p style={{ fontSize: '0.98rem', color: selected ? C.white : C.dim, fontFamily: 'DM Sans,sans-serif', fontWeight: selected ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name || 'No name'}</p>
                          {u.role && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 9, background: u.role === 'admin' ? C.goldBg : 'rgba(var(--rgb-hi),0.05)', color: u.role === 'admin' ? C.goldDim : C.muted, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0 }}>{u.role}</span>}
                        </div>
                        <p style={{ fontSize: '0.82rem', color: C.muted, fontFamily: 'DM Sans,sans-serif', marginTop: 1 }}>{u.points || 0} visits</p>
                      </div>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selected ? C.gold : C.border}`, background: selected ? C.gold : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selected && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--col-modal)' }} />}
                      </div>
                    </button>
                  )
                })}
              </div>

              <button onClick={confirmAssign} disabled={!assignUser || saving}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 9, background: assignUser ? 'linear-gradient(135deg,var(--col-acc),var(--col-acc2))' : 'rgba(var(--rgb-hi),0.05)', color: assignUser ? 'var(--col-bg)' : C.muted, fontSize: '0.98rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, border: 'none', cursor: assignUser && !saving ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .2s', opacity: saving ? 0.6 : 1 }}>
                {saving ? <div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,.25)', borderTopColor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> : <><UserPlus size={14} /> Assign Coupon</>}
              </button>
            </>
          )}
        </ModalWrap>
      )}
    </div>
  )
}
