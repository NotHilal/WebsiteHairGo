import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, ChevronLeft, ChevronRight, Check, User, ArrowRight, Sparkles, Calendar, Scissors, Star, X, Info, Mail, UserPlus, Tag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { getOrFetch } from '../lib/cache'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isBefore, startOfDay, getDay, getHours
} from 'date-fns'
import toast from 'react-hot-toast'
import StripeCheckout from '../components/payment/StripeCheckout'

function fmtDur(min) {
  const h = Math.floor(min / 60), m = min % 60
  if (h && m) return `${h}h ${m}m`
  if (h)      return `${h}h`
  return `${m}m`
}

// Returns true if booking `slot` for `durationMins` would overlap any blocked hour
function slotOverlapsBlocked(slot, durationMins, blockedSlots) {
  const [sh, sm] = slot.split(':').map(Number)
  const slotStart = sh * 60 + sm
  const slotEnd   = slotStart + durationMins
  return blockedSlots.some(bh => {
    const [bh_h, bh_m] = bh.split(':').map(Number)
    const blockedMin = bh_h * 60 + bh_m
    return blockedMin >= slotStart && blockedMin < slotEnd
  })
}

const STEPS = ['Service', 'Stylist', 'Date & Time', 'Confirm']
const SLOTS = ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const SERVICES_PER_PAGE = 4

const slide = {
  initial: { opacity:0, x:24 },
  animate: { opacity:1, x:0, transition:{ duration:0.45, ease:[0.22,1,0.36,1] } },
  exit:    { opacity:0, x:-16, transition:{ duration:0.2 } },
}

export default function Appointments() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [step,     setStep]     = useState(0)
  const [services, setServices] = useState([])
  const [stylists, setStylists] = useState([])
  const [blocked,  setBlocked]  = useState([])
  const [taken,       setTaken]       = useState([])
  const [blockedSlots, setBlockedSlots] = useState([])
  const [month,    setMonth]    = useState(new Date())
  const [saving,       setSaving]       = useState(false)
  const [done,         setDone]         = useState(false)
  const [payInStore,   setPayInStore]   = useState(false)
  const [guestInfo,    setGuestInfo]    = useState({ name:'', phone:'', email:'' })
  const [showPromo,    setShowPromo]    = useState(true)
  const [sel,          setSel]          = useState(() => ({
    service: null,
    stylist: null,
    date: null,
    time: null,
    notes: '',
  }))
  const [genderFilter, setGenderFilter] = useState('all')
  const [preview,      setPreview]      = useState(null)
  const [payStep,      setPayStep]      = useState(null)
  const [clientSecret, setClientSecret] = useState(null)
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [appliedCoupon,    setAppliedCoupon]    = useState(null)
  const [couponCode,       setCouponCode]       = useState('')
  const [showAllCoupons,   setShowAllCoupons]   = useState(false)
  const [couponError,      setCouponError]      = useState(null)
  const [validatingCode,   setValidatingCode]   = useState(false)
  const [stylistDayOffs,   setStylistDayOffs]   = useState([])
  const [servicesPage,     setServicesPage]     = useState(0)

  useEffect(() => {
    const TTL = 5 * 60_000
    Promise.all([
      getOrFetch('services_all', async () => {
        const { data } = await supabase.from('services').select('*').order('category')
        return data || []
      }, TTL),
      getOrFetch('stylists_artists', async () => {
        const { data } = await supabase
          .from('stylists')
          .select('*')
          .not('profile_id', 'is', null)
          .order('display_order')
        return data || []
      }, TTL),
      getOrFetch('blocked_dates', async () => {
        const { data } = await supabase.from('blocked_dates').select('date').is('stylist_id', null).eq('status', 'approved')
        return (data || []).map(b => b.date)
      }, 2 * 60_000),
    ]).then(([svc, sty, blk]) => {
      setServices(svc)
      setStylists(sty)
      setBlocked(blk)
    })
  }, [])

  useEffect(() => {
    if (!sel.stylist) { setStylistDayOffs([]); return }
    supabase
      .from('blocked_dates')
      .select('date')
      .eq('stylist_id', sel.stylist.id)
      .eq('status', 'approved')
      .then(({ data }) => setStylistDayOffs((data || []).map(d => d.date)))
  }, [sel.stylist?.id])

  useEffect(() => {
    if (!sel.date || !sel.stylist) return
    const dateStr = format(sel.date, 'yyyy-MM-dd')
    if (stylistDayOffs.includes(dateStr)) { setTaken([...SLOTS]); setBlockedSlots([]); return }
    const apptQuery = supabase.from('appointments').select('time, services(duration)').eq('stylist_id', sel.stylist.id).eq('date', dateStr).neq('status', 'cancelled')
    Promise.all([
      apptQuery,
      supabase.from('blocked_hours').select('hour').eq('date', dateStr).or(`stylist_id.eq.${sel.stylist.id},stylist_id.is.null`),
    ]).then(([{ data: appts }, { data: hours }]) => {
      const selectedDur = sel.service?.duration || 60
      const takenSet = new Set()

      for (const appt of (appts || [])) {
        const [h, m] = appt.time.slice(0, 5).split(':').map(Number)
        const apptStart = h * 60 + m
        const apptDur = appt.services?.duration || 60
        const apptEnd = apptStart + apptDur

        for (const slot of SLOTS) {
          const [sh, sm] = slot.split(':').map(Number)
          const slotMin = sh * 60 + sm
          const slotEnd = slotMin + selectedDur

          // Block if slot falls inside an existing appointment's range
          if (slotMin >= apptStart && slotMin < apptEnd) takenSet.add(slot)
          // Block if booking selected service here would overlap an existing appointment
          if (slotMin < apptStart && slotEnd > apptStart) takenSet.add(slot)
        }
      }

      setTaken([...takenSet])
      setBlockedSlots((hours || []).map(h => h.hour))
    })
  }, [sel.date, sel.stylist, sel.service, stylistDayOffs])

  /* scroll to top on every step change */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  /* fetch user's unused coupons when reaching confirm step */
  useEffect(() => {
    if (step !== 3 || !user) return
    setAppliedCoupon(null)
    setCouponCode('')
    setCouponError(null)
    setShowAllCoupons(false)
    supabase
      .from('user_coupons')
      .select('id, used, coupons(id, code, discount_type, discount_value, expiry_date, active)')
      .eq('user_id', user.id)
      .eq('used', false)
      .then(({ data }) => {
        const now = new Date()
        const valid = (data || []).filter(uc => {
          const c = uc.coupons
          if (!c || !c.active) return false
          if (c.expiry_date && new Date(c.expiry_date) < now) return false
          return true
        })
        setAvailableCoupons(valid)

        // Restore coupon selection that survived navigation or token refresh
        const KEY = `hg_booking_coupon_${user.id}`
        const saved = sessionStorage.getItem(KEY)
        if (!saved) return
        try {
          const { isManual, id } = JSON.parse(saved)
          if (!isManual && id) {
            const match = valid.find(uc => uc.id === id)
            if (match) setAppliedCoupon(match)
            else sessionStorage.removeItem(KEY) // no longer in available list (e.g. already used)
          }
        } catch { sessionStorage.removeItem(KEY) }
      })
  }, [step, user])

  const days     = eachDayOfInterval({ start:startOfMonth(month), end:endOfMonth(month) })
  const startPad = getDay(startOfMonth(month))
  const isOff    = d => isBefore(d, startOfDay(new Date())) || blocked.includes(format(d,'yyyy-MM-dd')) || (sel.stylist && stylistDayOffs.includes(format(d,'yyyy-MM-dd')))

  const guestInfoValid = user || (
    guestInfo.name.trim() !== '' &&
    guestInfo.phone.trim() !== '' &&
    /\S+@\S+\.\S+/.test(guestInfo.email)
  )

  const basePrice  = parseFloat(sel.service?.price || 0)
  const finalPrice = appliedCoupon
    ? appliedCoupon.coupons.discount_type === 'percentage'
      ? Math.max(0, basePrice * (1 - appliedCoupon.coupons.discount_value / 100))
      : Math.max(0, basePrice - appliedCoupon.coupons.discount_value)
    : basePrice

  async function logBooking(paymentStatus) {
    try {
      await supabase.from('activity_logs').insert({
        actor_id:   user?.id   || null,
        actor_name: user ? (profile?.full_name || user.email) : guestInfo.name,
        actor_role: user ? (profile?.role || 'user') : 'guest',
        action:     'appointment.booked',
        details: {
          message: `${user ? (profile?.full_name || 'Client') : guestInfo.name} booked ${sel.service.name} with ${sel.stylist.name} on ${format(sel.date, 'MMM d')} at ${sel.time}${paymentStatus === 'pay_in_store' ? ' · Pay in store' : ' · Paid online'}`,
          service:        sel.service.name,
          stylist:        sel.stylist.name,
          date:           format(sel.date, 'yyyy-MM-dd'),
          time:           sel.time,
          payment_status: paymentStatus,
        },
      })
    } catch {
      // logging is non-critical
    }
  }

  async function sendConfirmationEmail(appointmentId) {
    if (!appointmentId) return
    try {
      // The server looks up the booking and its email address itself
      await supabase.functions.invoke('send-appointment-confirmation', {
        body: { appointmentId },
      })
    } catch (err) {
      toast.error('Email error: ' + (err?.message || JSON.stringify(err)))
    }
  }

  async function validateCouponCode() {
    const code = couponCode.trim().toUpperCase()
    if (!code) return
    setValidatingCode(true)
    setCouponError(null)
    try {
      const { data: found } = await supabase.rpc('lookup_coupon', { p_code: code })
      const coupon = found?.[0]
      if (!coupon) { setCouponError('Invalid coupon code'); return }
      if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) { setCouponError('This coupon has expired'); return }
      if (coupon.max_uses != null && coupon.current_uses >= coupon.max_uses) { setCouponError('This coupon has been fully redeemed'); return }

      if (user) {
        // For logged-in users: get or create a user_coupons row so the code is
        // treated identically to an admin-assigned card from this point on.
        const { data: ucId, error: claimErr } = await supabase.rpc('claim_promo_coupon', { p_code: code })
        if (claimErr) { setCouponError(claimErr.message || 'Could not apply coupon — please try again'); return }
        const { data: uc, error: ucErr } = await supabase.from('user_coupons')
          .select('id, used, coupons(id, code, discount_type, discount_value, expiry_date, active)')
          .eq('id', ucId).single()
        if (ucErr || !uc) { setCouponError('Could not apply coupon — please try again'); return }

        if (uc.used) { setCouponError('You have already used this coupon'); return }

        // Add to card list if not already present (shows the new card as selected)
        setAvailableCoupons(prev => prev.find(c => c.id === uc.id) ? prev : [...prev, uc])
        setAppliedCoupon(uc)
        sessionStorage.setItem(`hg_booking_coupon_${user.id}`, JSON.stringify({ isManual: false, id: uc.id, code: coupon.code }))
      } else {
        // Guest — no user_coupons row possible, keep code reference directly
        setAppliedCoupon({ id: null, isManual: true, coupons: coupon })
      }
      setCouponCode('')
    } finally {
      setValidatingCode(false)
    }
  }

  async function startPayment() {
    if (!guestInfoValid) return toast.error('Please fill in your contact information')
    setPayStep('loading')
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          type: 'appointment',
          serviceId: sel.service.id,
          stylistId: sel.stylist.id,
          date: format(sel.date, 'yyyy-MM-dd'),
          time: sel.time,
          notes: sel.notes,
          couponId: (!appliedCoupon?.isManual && appliedCoupon?.id) ? appliedCoupon.id : null,
          couponCode: appliedCoupon?.isManual ? appliedCoupon.coupons.code : null,
          label: `${sel.service.name} with ${sel.stylist.name} — ${format(sel.date, 'MMM d')} at ${sel.time}`,
        },
      })
      if (error) throw error
      setClientSecret(data.client_secret)
      setPayStep('form')
    } catch (err) {
      toast.error(err.message || 'Could not start payment')
      setPayStep(null)
    }
  }

  async function completeBooking(paymentIntentId) {
    setSaving(true)
    try {
      // The server creates the booking from the verified Stripe payment
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: { type: 'finalize', paymentIntentId },
      })
      if (error) throw error
      if (!data?.ok) {
        toast.error(data?.error || 'Payment succeeded but booking failed — please contact us', { duration: 8000 })
        setPayStep(null); setClientSecret(null)
        return
      }

      await Promise.all([
        sendConfirmationEmail(data.appointmentId),
        logBooking('paid'),
      ])
      if (user) sessionStorage.removeItem(`hg_booking_coupon_${user.id}`)
      setDone(true)
    } catch {
      toast.error('Payment succeeded but booking failed — please contact us')
    } finally {
      setSaving(false)
    }
  }

  async function bookInStore() {
    if (!guestInfoValid) return toast.error('Please fill in your contact information')
    setSaving(true)
    try {
      const couponNote = appliedCoupon
        ? `[Coupon: ${appliedCoupon.coupons.code} — ${appliedCoupon.coupons.discount_type === 'percentage' ? `${appliedCoupon.coupons.discount_value}% off` : `$${appliedCoupon.coupons.discount_value} off`} · Final: $${finalPrice.toFixed(2)}]`
        : ''
      const row = {
        stylist_id: sel.stylist.id, service_id: sel.service.id,
        date: format(sel.date, 'yyyy-MM-dd'), time: sel.time,
        notes: [sel.notes, couponNote].filter(Boolean).join('\n'),
        status: 'confirmed', payment_status: 'pay_in_store',
        // Generated here so guests (who can't read rows back) can still get an email
        id: crypto.randomUUID(),
      }
      if (user) row.user_id = user.id
      else { row.guest_name = guestInfo.name; row.guest_phone = guestInfo.phone; row.guest_email = guestInfo.email }
      const { error } = await supabase.from('appointments').insert(row)
      if (error?.code === '23505') throw new Error('That time slot was just taken — please pick another time')
      if (error) throw error
      if (appliedCoupon && !appliedCoupon.isManual) {
        await supabase.functions.invoke('create-payment-intent', {
          body: { type: 'mark-coupon-used', couponId: appliedCoupon.id },
        })
      }
      await Promise.all([
        sendConfirmationEmail(row.id),
        logBooking('pay_in_store'),
      ])
      if (user) sessionStorage.removeItem(`hg_booking_coupon_${user.id}`)
      setPayInStore(true)
      setDone(true)
    } catch (err) {
      toast.error(err.message || 'Could not book appointment')
    } finally {
      setSaving(false)
    }
  }



  /* ── Success ── */
  if (done) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', overflow:'hidden', position:'relative' }}>
      <div style={{ position:'absolute', top:'40%', left:'50%', transform:'translate(-50%,-50%)', width:600, height:600, background:'radial-gradient(circle, rgba(var(--rgb-acc),0.09) 0%, transparent 65%)', pointerEvents:'none', zIndex:0 }} />
      <motion.div initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} transition={{ type:'spring', damping:22 }}
        style={{ textAlign:'center', maxWidth:480, position:'relative', zIndex:1 }}>
        <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:'spring', damping:14, delay:0.15 }}
          style={{ width:112, height:112, borderRadius:'50%', background:'linear-gradient(135deg,var(--col-acc),var(--col-acc2))', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 2.5rem', boxShadow:'0 24px 80px rgba(var(--rgb-acc),0.5), 0 0 0 20px rgba(var(--rgb-acc),0.07)' }}>
          <Check size={48} color="var(--col-bg)" strokeWidth={2.5}/>
        </motion.div>
        <h2 className="font-display font-light" style={{ fontSize:'clamp(2.5rem,5vw,4.5rem)', color:'var(--col-text)', marginBottom:'1rem', lineHeight:1 }}>
          You're <span className="gold-gradient" style={{ fontStyle:'italic' }}>booked!</span>
        </h2>
        <div className="gold-bar"/>
        {payInStore && (
          <div style={{ padding:'12px 18px', borderRadius:12, background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.15)', margin:'1.25rem auto 0', maxWidth:380 }}>
            <p style={{ color:'rgba(245,158,11,0.85)', fontSize:'1.01rem', fontFamily:'DM Sans,sans-serif', lineHeight:1.7, margin:0 }}>
              Your slot is reserved — please bring <strong style={{ color:'#f59e0b' }}>${finalPrice.toFixed(2)}</strong> to pay at the salon.{appliedCoupon && sel.service?.price && <span style={{ fontSize:'0.9rem', opacity:0.6 }}> ({sel.service.price} − coupon)</span>}
            </p>
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'10px 16px', borderRadius:10, background:'rgba(var(--rgb-hi),0.03)', border:'1px solid rgba(var(--rgb-hi),0.06)', margin:'1rem auto 0', maxWidth:380 }}>
          <Mail size={12} color="var(--col-text)" strokeWidth={1.5}/>
          <p style={{ color: 'var(--col-text)', fontSize:'0.94rem', fontFamily:'DM Sans,sans-serif', margin:0 }}>
            Confirmation sent to <span style={{ color: 'var(--col-text)' }}>{user ? user.email : guestInfo.email}</span>
          </p>
        </div>
        <p style={{ color: 'var(--col-text)', fontSize:'1.08rem', lineHeight:1.9, margin:'1.5rem auto 2rem' }}>
          <strong style={{ color:'var(--col-text)' }}>{format(sel.date,'MMMM d, yyyy')}</strong> at <strong style={{ color:'var(--col-text)' }}>{sel.time}</strong> · <strong style={{ color:'var(--col-text)' }}>{sel.stylist?.name}</strong>
        </p>
        <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:8, marginBottom:'2.5rem' }}>
          {[sel.service?.name, `$${sel.service?.price}`, sel.service?.duration ? fmtDur(sel.service.duration) : null].filter(Boolean).map((l,i)=>(
            <span key={i} style={{ padding:'6px 16px', borderRadius:9999, background:'rgba(var(--rgb-acc),0.12)', border:'1px solid rgba(var(--rgb-acc),0.3)', fontSize:13, color:'var(--col-acc)', fontFamily:'DM Sans,sans-serif' }}>{l}</span>
          ))}
        </div>
        <button className="btn-gold" onClick={() => navigate('/profile')}>
          Go to Profile <ArrowRight size={15}/>
        </button>
      </motion.div>
    </div>
  )

  const filteredServices = genderFilter === 'all'
    ? services
    : services.filter(s => s.gender === genderFilter || s.gender === 'mixed' || !s.gender)
  const totalServicePages = Math.max(1, Math.ceil(filteredServices.length / SERVICES_PER_PAGE))
  const pagedServices = filteredServices.length
    ? filteredServices.slice(servicesPage * SERVICES_PER_PAGE, (servicesPage + 1) * SERVICES_PER_PAGE)
    : services.length
      ? []
      : Array.from({length: SERVICES_PER_PAGE}, (_, i) => ({id:i,name:'',price:'',duration:0,category:''}))

  /* ── Main layout ── */
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', paddingTop:68, paddingBottom:(sel.service||sel.stylist||sel.date)?88:0 }}>

      {/* ── Mobile step bar (shown only when sidebar is hidden) ── */}
      <div className="appt-mobile-steps" style={{ display:'none', padding:'1rem 1.25rem 0.75rem', borderBottom:'1px solid rgba(var(--rgb-acc),0.1)', background:'var(--col-bg2)', position:'sticky', top:68, zIndex:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0 }}>
          {STEPS.map((s, i) => {
            const isActive = i===step, isDone = i<step
            return (
              <div key={s} style={{ display:'flex', alignItems:'center' }}>
                <div onClick={() => isDone && setStep(i)}
                  style={{ display:'flex', alignItems:'center', gap:6, cursor:isDone?'pointer':'default' }}>
                  <div style={{ width:24, height:24, borderRadius:'50%', flexShrink:0, background:isActive?'linear-gradient(135deg,var(--col-acc),var(--col-acc2))':isDone?'var(--col-acc)':'rgba(var(--rgb-hi),0.05)', border:isActive?'none':isDone?'1px solid rgba(var(--rgb-acc),0.35)':'1px solid rgba(var(--rgb-hi),0.08)', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .3s', boxShadow:isActive?'0 4px 14px rgba(var(--rgb-acc),0.45)':'none' }}>
                    {isDone ? <Check size={10} color="var(--col-bg)"/> : <span style={{ fontSize:12, fontWeight:600, color:isActive?'var(--col-bg)':'var(--col-text)', fontFamily:'DM Sans,sans-serif' }}>{i+1}</span>}
                  </div>
                  <span style={{ fontSize:11, letterSpacing:'0.14em', textTransform:'uppercase', fontFamily:'DM Sans,sans-serif', color:isActive?'var(--col-text)':isDone?'var(--col-acc)':'var(--col-text)', fontWeight:isActive?600:300 }}>{s}</span>
                </div>
                {i < STEPS.length - 1 && <div style={{ width:20, height:1, background:isDone?'var(--col-acc)':'rgba(var(--rgb-hi),0.07)', margin:'0 6px', flexShrink:0 }} />}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display:'flex', flex:1 }}>

      {/* ── LEFT STEP PANEL ── */}
      <div className="appt-step-panel" style={{
        width:300, flexShrink:0, position:'sticky', top:68,
        height:'calc(100vh - 68px)', overflowY:'auto',
        background:'var(--col-bg2)', borderRight:'1px solid rgba(var(--rgb-acc),0.14)',
        display:'flex', flexDirection:'column', padding:'3rem 2rem', zIndex:10,
      }}>
        {/* Top ambient glow */}
        <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:360, height:240, background:'radial-gradient(ellipse, rgba(var(--rgb-acc),0.1) 0%, transparent 70%)', pointerEvents:'none' }} />

        {/* Brand */}
        <div style={{ marginBottom:'3rem', position:'relative' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,var(--col-acc),var(--col-acc2))', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 20px rgba(var(--rgb-acc),0.38)', flexShrink:0 }}>
              <Scissors size={13} color="var(--col-bg)" style={{ transform:'rotate(45deg)' }}/>
            </div>
            <div>
              <span className="font-display" style={{ fontSize:'1.68rem', color:'var(--col-text)', lineHeight:1 }}>Hair<span style={{ color:'var(--col-acc)' }}>Go</span></span>
              <span style={{ display:'block', fontSize:12, letterSpacing:'0.22em', textTransform:'uppercase', color: 'var(--col-text)', fontFamily:'DM Sans,sans-serif', marginTop:3 }}>Book your appointment</span>
            </div>
          </div>
          <div style={{ height:1, background:'linear-gradient(90deg,rgba(var(--rgb-acc),0.2),transparent)', marginTop:6 }} />
        </div>

        {/* Steps */}
        <div style={{ position:'relative', marginBottom:'2rem' }}>
          <div style={{ position:'absolute', left:15, top:26, height:'calc(100% - 52px)', width:1, background:'linear-gradient(to bottom,rgba(var(--rgb-acc),0.22),rgba(var(--rgb-hi),0.04))' }} />
          {STEPS.map((s, i) => {
            const isActive = i===step, isDone = i<step
            return (
              <div key={s} onClick={() => isDone && setStep(i)}
                style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'0.85rem 0', cursor:isDone?'pointer':'default', position:'relative', zIndex:1 }}>
                <div style={{
                  width:32, height:32, borderRadius:'50%', flexShrink:0, marginTop:1,
                  background: isActive ? 'linear-gradient(135deg,var(--col-acc),var(--col-acc2))' : isDone ? 'var(--col-acc)' : 'var(--col-bg2)',
                  border: isActive ? 'none' : isDone ? '1px solid rgba(var(--rgb-acc),0.35)' : '1px solid rgba(var(--rgb-hi),0.1)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  boxShadow: isActive ? '0 6px 24px rgba(var(--rgb-acc),0.5)' : 'none',
                  transition:'all 0.4s ease',
                }}>
                  {isDone ? <Check size={13} color="var(--col-bg)"/> : <span style={{ fontSize:15, fontWeight:600, color:isActive?'var(--col-bg)':'var(--col-text)', fontFamily:'DM Sans,sans-serif' }}>{i+1}</span>}
                </div>
                <div style={{ paddingTop:3 }}>
                  <span style={{ fontSize:15, letterSpacing:'0.16em', textTransform:'uppercase', fontFamily:'DM Sans,sans-serif', color:isActive?'var(--col-text)':isDone?'var(--col-acc)':'var(--col-text)', fontWeight:isActive?600:300, transition:'color 0.3s', display:'block' }}>{s}</span>
                  {isDone && (
                    <span style={{ fontSize:13, color: 'var(--col-acc)', fontFamily:'DM Sans,sans-serif', marginTop:3, display:'block', lineHeight:1 }}>
                      {i===0 && sel.service?.name}
                      {i===1 && sel.stylist?.name}
                      {i===2 && sel.date && format(sel.date,'MMM d')}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Divider */}
        <div style={{ height:1, background:'linear-gradient(90deg,rgba(var(--rgb-acc),0.15),transparent)', marginBottom:'1.75rem' }} />

        {/* Live summary */}
        <div style={{ flex:1 }}>
          <p style={{ fontSize:12, letterSpacing:'0.22em', textTransform:'uppercase', color: 'var(--col-text)', fontFamily:'DM Sans,sans-serif', marginBottom:'1.25rem' }}>Your selection</p>
          <div style={{ display:'flex', flexDirection:'column', gap:'1.1rem' }}>
            {[
              { label:'Service', value:sel.service?.name, sub:sel.service?.price?`$${sel.service.price}`:null },
              { label:'Stylist', value:sel.stylist?.name },
              { label:'Date',    value:sel.date?format(sel.date,'MMM d, yyyy'):null },
              { label:'Time',    value:sel.time },
            ].map(({ label, value, sub }) => (
              <div key={label}>
                <p style={{ fontSize:12, letterSpacing:'0.18em', textTransform:'uppercase', color: 'var(--col-text)', fontFamily:'DM Sans,sans-serif', marginBottom:5 }}>{label}</p>
                {value
                  ? <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <p style={{ fontSize:'1.2rem', color: 'var(--col-text)', fontFamily:'DM Sans,sans-serif', lineHeight:1.3 }}>{value}</p>
                      {sub && <span style={{ fontSize:15, color:'var(--col-acc)', fontFamily:'DM Sans,sans-serif', fontWeight:500 }}>{sub}</span>}
                    </div>
                  : <div style={{ height:1, width:24, background:'rgba(var(--rgb-hi),0.1)', marginTop:6 }} />
                }
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CENTER CONTENT ── */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ maxWidth:720, margin:'0 auto', padding:'2rem 2rem' }} className="appt-content-wrap">
          <AnimatePresence mode="wait">

            {/* ── STEP 0: Service ── */}
            {step===0 && (
              <motion.div key="s0" {...slide}>
                <div style={{ textAlign:'center', marginBottom:28 }}>
                  <h1 className="font-display font-light" style={{ color:'var(--col-text)', fontSize:'clamp(3rem,5.5vw,4.6rem)', marginBottom:8, lineHeight:1.05 }}>
                    What would you like<br/>
                    <span className="gold-gradient" style={{ fontStyle:'italic' }}>today?</span>
                  </h1>
                  <p style={{ color: 'var(--col-text)', fontSize:'1.2rem', fontFamily:'DM Sans,sans-serif' }}>
                    Tap a card to book instantly · use <Info size={13} style={{ display:'inline', verticalAlign:'middle' }}/> for details
                  </p>
                </div>

                {/* Gender filter toggle */}
                <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:28, flexWrap:'wrap' }}>
                  {[
                    { value:'all',   label:'All Services', color:'var(--col-acc)' },
                    { value:'man',   label:'Men',          color:'#60a5fa' },
                    { value:'woman', label:'Women',        color:'#f472b6' },
                  ].map(({ value, label, color }) => {
                    const isActive = genderFilter === value
                    return (
                      <button key={value} onClick={() => { setGenderFilter(value); setServicesPage(0) }}
                        style={{ padding:'7px 20px', borderRadius:9999, border:`1px solid ${isActive ? color+'55' : 'rgba(var(--rgb-hi),0.08)'}`, background:isActive ? `${color}18` : 'transparent', color:isActive ? color : 'var(--col-text)', fontSize:15, fontFamily:'DM Sans,sans-serif', fontWeight:700, cursor:'pointer', transition:'all .2s', letterSpacing:'0.12em', textTransform:'uppercase' }}>
                        {label}
                      </button>
                    )
                  })}
                </div>

                {!user && showPromo && (
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:14, background:'rgba(96,165,250,0.07)', border:'1px solid rgba(96,165,250,0.18)', marginBottom:24, position:'relative' }}>
                    <div style={{ width:34, height:34, borderRadius:'50%', background:'rgba(96,165,250,0.12)', border:'1px solid rgba(96,165,250,0.22)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <UserPlus size={15} color="#60a5fa" strokeWidth={1.5}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ color:'#60a5fa', fontSize:'1.01rem', fontFamily:'DM Sans,sans-serif', fontWeight:600, margin:'0 0 2px' }}>Get 30% off your service</p>
                      <p style={{ color:'rgba(96,165,250,0.6)', fontSize:'0.9rem', fontFamily:'DM Sans,sans-serif', margin:0, lineHeight:1.5 }}>Create a free account and earn a 30% discount after a few completed appointments.</p>
                    </div>
                    <button onClick={() => setShowPromo(false)} style={{ flexShrink:0, width:22, height:22, borderRadius:'50%', background:'rgba(var(--rgb-hi),0.05)', border:'1px solid rgba(var(--rgb-hi),0.08)', color: 'var(--col-text)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                      <X size={11}/>
                    </button>
                  </div>
                )}

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(270px, 1fr))', gap:'1.25rem' }}>
                  {pagedServices.map((svc) => {
                    const isActive = sel.service?.id === svc.id
                    return (
                      <div key={svc.id} className="appt-svc-card"
                        onClick={() => { setSel(p=>({...p,service:svc})); setStep(1) }}
                        style={{ height:260, borderRadius:18, overflow:'hidden', position:'relative', cursor:'pointer',
                                 border: isActive ? '2px solid rgba(var(--rgb-acc),0.7)' : '1px solid rgba(var(--rgb-hi),0.06)',
                                 boxShadow: isActive ? '0 0 0 4px rgba(var(--rgb-acc),0.12),0 16px 48px rgba(0,0,0,0.5)' : '0 6px 24px rgba(0,0,0,0.35)',
                                 transition:'all 0.35s cubic-bezier(0.22,1,0.36,1)' }}>

                        <div style={{ position:'absolute', inset:0 }}>
                          {svc.image_url
                            ? <img src={svc.image_url} alt={svc.name} className="appt-svc-img" loading="lazy" decoding="async"
                                style={{ width:'100%', height:'100%', objectFit:'cover', transition:'transform 0.7s cubic-bezier(0.22,1,0.36,1)' }} />
                            : <div style={{ width:'100%', height:'100%', background:'radial-gradient(ellipse at 25% 30%, rgba(var(--rgb-acc),0.14) 0%, rgba(var(--rgb-acc),0.04) 50%, var(--col-bg2) 100%)' }}>
                                {svc.name && <span className="font-display" style={{ position:'absolute', bottom:-10, right:14, fontSize:'8rem', color: 'var(--col-acc)', lineHeight:1, userSelect:'none' }}>{svc.name.charAt(0)}</span>}
                              </div>
                          }
                          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom,rgba(0,0,0,0.04) 0%,rgba(6,6,10,0.55) 45%,rgba(6,6,10,0.98) 100%)' }} />
                          <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,rgba(var(--rgb-acc),${isActive?'0.9':'0.4'}),transparent)` }} />
                        </div>

                        {svc.category && (
                          <div style={{ position:'absolute', top:12, left:12, zIndex:2 }}>
                            <span style={{ fontSize:11, padding:'4px 10px', borderRadius:20, background:'rgba(0,0,0,0.58)', backdropFilter:'blur(8px)', color: 'rgba(255,255,255,0.9)', fontFamily:'DM Sans,sans-serif', fontWeight:600, letterSpacing:'0.15em', textTransform:'uppercase', border:'1px solid rgba(255,255,255,0.12)' }}>
                              {svc.category}
                            </span>
                          </div>
                        )}

                        <button onClick={e => { e.stopPropagation(); setPreview(svc) }}
                          className="appt-info-btn"
                          style={{ position:'absolute', top:10, right:isActive?48:10, zIndex:3, width:30, height:30, borderRadius:'50%', background:'rgba(0,0,0,0.55)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s', flexShrink:0 }}>
                          <Info size={12}/>
                        </button>

                        {isActive && (
                          <div style={{ position:'absolute', top:10, right:10, zIndex:3, width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,var(--col-acc),var(--col-acc2))', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(var(--rgb-acc),0.5)' }}>
                            <Check size={14} color="var(--col-bg)" strokeWidth={2.5}/>
                          </div>
                        )}

                        <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'1.25rem 1.4rem 1.3rem', zIndex:2 }}>
                          <div style={{ height:1, background:`linear-gradient(90deg,rgba(var(--rgb-acc),${isActive?'0.5':'0.22'}),transparent)`, marginBottom:'0.7rem' }} />
                          <h3 className="font-display" style={{ fontSize:'2.16rem', color:'#fff', lineHeight:1.1, marginBottom:'0.6rem', fontWeight:400 }}>{svc.name}</h3>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            {svc.price && <span className="font-display" style={{ fontSize:'2.5rem', color:'#B8D4E8', lineHeight:1, textShadow:isActive?'0 0 28px rgba(184,212,232,0.5)':'none' }}>${svc.price}</span>}
                            {svc.duration>0 && (
                              <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.1)' }}>
                                <Clock size={11} color="rgba(255,255,255,0.7)" strokeWidth={1.5}/>
                                <span style={{ fontSize:14, color:'rgba(255,255,255,0.85)', fontFamily:'DM Sans,sans-serif', fontWeight:600 }}>{fmtDur(svc.duration)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {filteredServices.length > SERVICES_PER_PAGE && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:16, marginTop:28 }}>
                    <button
                      disabled={servicesPage === 0}
                      onClick={() => { setServicesPage(p => p - 1); window.scrollTo({top:0,behavior:'smooth'}) }}
                      className="appt-back-btn"
                      style={{ width:38, height:38, borderRadius:10, background:'rgba(var(--rgb-hi),0.04)', border:'1px solid rgba(var(--rgb-hi),0.07)', color:'var(--col-text)', display:'flex', alignItems:'center', justifyContent:'center', cursor:servicesPage===0?'not-allowed':'pointer', opacity:servicesPage===0?0.3:1, transition:'all 0.25s', flexShrink:0 }}>
                      <ChevronLeft size={14}/>
                    </button>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {Array.from({length:totalServicePages}).map((_,i) => (
                        <button key={i} onClick={() => { setServicesPage(i); window.scrollTo({top:0,behavior:'smooth'}) }}
                          style={{ width:i===servicesPage?28:8, height:8, borderRadius:9999, border:'none', cursor:'pointer', transition:'all 0.3s cubic-bezier(0.22,1,0.36,1)', background:i===servicesPage?'var(--col-acc)':'rgba(var(--rgb-hi),0.12)', flexShrink:0 }}/>
                      ))}
                    </div>
                    <button
                      disabled={servicesPage >= totalServicePages - 1}
                      onClick={() => { setServicesPage(p => p + 1); window.scrollTo({top:0,behavior:'smooth'}) }}
                      className="appt-back-btn"
                      style={{ width:38, height:38, borderRadius:10, background:'rgba(var(--rgb-hi),0.04)', border:'1px solid rgba(var(--rgb-hi),0.07)', color:'var(--col-text)', display:'flex', alignItems:'center', justifyContent:'center', cursor:servicesPage>=totalServicePages-1?'not-allowed':'pointer', opacity:servicesPage>=totalServicePages-1?0.3:1, transition:'all 0.25s', flexShrink:0 }}>
                      <ChevronRight size={14}/>
                    </button>
                  </div>
                )}

                {/* Service detail modal */}
                <AnimatePresence>
                  {preview && (
                    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                      style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.82)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}
                      onClick={() => setPreview(null)}>
                      <motion.div
                        initial={{ opacity:0, scale:0.93, y:16 }} animate={{ opacity:1, scale:1, y:0 }} exit={{ opacity:0, scale:0.93, y:8 }}
                        transition={{ type:'spring', damping:26, stiffness:340 }}
                        onClick={e => e.stopPropagation()}
                        style={{ width:'100%', maxWidth:460, background:'var(--col-modal)', border:'1px solid rgba(var(--rgb-acc),0.15)', borderRadius:22, overflow:'hidden', boxShadow:'0 40px 100px rgba(0,0,0,0.7)' }}>

                        {preview.image_url ? (
                          <div style={{ height:200, position:'relative', overflow:'hidden' }}>
                            <img src={preview.image_url} alt={preview.name} loading="lazy" decoding="async" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                            <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom,transparent 30%,rgba(14,14,20,0.95) 100%)' }}/>
                            <button onClick={() => setPreview(null)} style={{ position:'absolute', top:12, right:12, width:32, height:32, borderRadius:'50%', background:'rgba(0,0,0,0.55)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }} className="preview-close"><X size={14}/></button>
                            <div style={{ position:'absolute', bottom:14, left:18, right:18 }}>
                              <h2 className="font-display font-light" style={{ fontSize:'2.16rem', color:'#fff', lineHeight:1.1, marginBottom:preview.category?3:0 }}>{preview.name}</h2>
                              {preview.category && <span style={{ fontSize:11, letterSpacing:'0.2em', textTransform:'uppercase', color:'#B8D4E8', fontFamily:'DM Sans,sans-serif' }}>{preview.category}</span>}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ height:3, background:'linear-gradient(90deg,var(--col-acc),var(--col-acc2),rgba(var(--rgb-acc),0.2))' }}/>
                            <div style={{ padding:'1.5rem 1.5rem 0.75rem', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                              <div>
                                <h2 className="font-display font-light" style={{ fontSize:'2.16rem', color:'var(--col-text)', lineHeight:1.1, marginBottom:4 }}>{preview.name}</h2>
                                {preview.category && <span style={{ fontSize:11, letterSpacing:'0.2em', textTransform:'uppercase', color:'var(--col-acc)', fontFamily:'DM Sans,sans-serif' }}>{preview.category}</span>}
                              </div>
                              <button onClick={() => setPreview(null)} style={{ width:32, height:32, borderRadius:'50%', background:'rgba(var(--rgb-hi),0.06)', border:'1px solid rgba(var(--rgb-hi),0.1)', color: 'var(--col-text)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }} className="preview-close"><X size={14}/></button>
                            </div>
                          </>
                        )}

                        <div style={{ height:1, background:'rgba(var(--rgb-hi),0.06)', margin:'0.875rem 1.5rem 0' }}/>
                        <div style={{ display:'flex', gap:8, padding:'1rem 1.5rem', flexWrap:'wrap' }}>
                          {preview.price && (
                            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'0.45rem 1rem', borderRadius:9999, background:'var(--col-acc)', border:'1px solid rgba(var(--rgb-acc),0.2)' }}>
                              <span style={{ fontSize:12, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--col-bg)', fontFamily:'DM Sans,sans-serif' }}>Price</span>
                              <span className="font-display" style={{ fontSize:'1.32rem', color:'var(--col-bg)' }}>${preview.price}</span>
                            </div>
                          )}
                          {preview.duration>0 && (
                            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'0.45rem 1rem', borderRadius:9999, background:'rgba(var(--rgb-hi),0.04)', border:'1px solid rgba(var(--rgb-hi),0.08)' }}>
                              <Clock size={11} color="var(--col-text)" strokeWidth={1.5}/>
                              <span style={{ fontSize:'0.98rem', color: 'var(--col-text)', fontFamily:'DM Sans,sans-serif' }}>{fmtDur(preview.duration)}</span>
                            </div>
                          )}
                        </div>
                        {preview.description && (
                          <div style={{ padding:'0 1.5rem 1.25rem' }}>
                            <p style={{ color: 'var(--col-text)', fontSize:'1.06rem', lineHeight:1.85, fontFamily:'DM Sans,sans-serif', fontWeight:300 }}>{preview.description}</p>
                          </div>
                        )}
                        <div style={{ padding:'1.25rem 1.5rem', borderTop:'1px solid rgba(var(--rgb-hi),0.06)', display:'flex', gap:8 }}>
                          <button onClick={() => setPreview(null)} style={{ flex:1, padding:'0.7rem', borderRadius:10, background:'rgba(var(--rgb-hi),0.04)', border:'1px solid rgba(var(--rgb-hi),0.08)', color: 'var(--col-text)', fontSize:13, letterSpacing:'0.14em', textTransform:'uppercase', fontFamily:'DM Sans,sans-serif', cursor:'pointer', transition:'all 0.2s' }} className="preview-cancel">Close</button>
                          <button onClick={() => { setSel(p=>({...p,service:preview})); setPreview(null); setStep(1) }} className="btn-gold" style={{ flex:2, padding:'0.7rem', fontSize:13, justifyContent:'center' }}>
                            Book This Service <ArrowRight size={13}/>
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* ── STEP 1: Stylist ── */}
            {step===1 && (
              <motion.div key="s1" {...slide}>
                <div style={{ display:'flex', justifyContent:'flex-start', marginBottom:16 }}>
                  <button onClick={() => setStep(0)} className="appt-back-btn" style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:10, background:'rgba(var(--rgb-hi),0.04)', border:'1px solid rgba(var(--rgb-hi),0.07)', color: 'var(--col-text)', cursor:'pointer', fontSize:15, letterSpacing:'0.14em', textTransform:'uppercase', fontFamily:'DM Sans,sans-serif', transition:'all 0.3s' }}>
                    <ChevronLeft size={13}/> Back
                  </button>
                </div>
                <div style={{ textAlign:'center', marginBottom:36 }}>
                  <h1 className="font-display font-light" style={{ color:'var(--col-text)', fontSize:'clamp(2.8rem,5.5vw,4.2rem)', marginBottom:6, lineHeight:1.1 }}>
                    Who should take<br/><span className="gold-gradient" style={{ fontStyle:'italic' }}>care of you?</span>
                  </h1>
                  <p style={{ color: 'var(--col-text)', fontSize:'1.2rem', fontFamily:'DM Sans,sans-serif' }}>
                    {sel.service?.name}{sel.service?.price && ` · $${sel.service.price}`}
                  </p>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:'1.1rem' }}>
                  {(stylists.length ? stylists : Array.from({length:4},(_,i)=>({id:i,name:'',title:''}))).map((sty) => {
                    const isActive = sel.stylist?.id === sty.id
                    return (
                      <button key={sty.id} onClick={() => { setSel(p=>({...p,stylist:sty})); setStep(2) }}
                        className="appt-sty-card"
                        style={{ padding:0, borderRadius:18, cursor:'pointer', overflow:'hidden',
                                 border: isActive ? '2px solid rgba(var(--rgb-acc),0.6)' : '1px solid rgba(var(--rgb-hi),0.07)',
                                 background:'rgba(var(--rgb-hi),0.02)', transition:'all 0.35s ease',
                                 boxShadow: isActive ? '0 0 0 4px rgba(var(--rgb-acc),0.1),0 8px 40px rgba(var(--rgb-acc),0.12)' : '0 4px 20px rgba(0,0,0,0.3)',
                                 position:'relative' }}>
                        <div style={{ aspectRatio:'1/1', background:'linear-gradient(135deg,rgba(var(--rgb-acc),0.08),rgba(var(--rgb-acc),0.04))', position:'relative', overflow:'hidden' }}>
                          {sty.photo_url
                            ? <img src={sty.photo_url} alt={sty.name} loading="lazy" decoding="async" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top center' }}/>
                            : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <User size={40} color="rgba(var(--rgb-acc),0.18)" strokeWidth={1}/>
                              </div>
                          }
                          {isActive && (
                            <div style={{ position:'absolute', inset:0, background:'rgba(var(--rgb-acc),0.22)' }}>
                              <div style={{ position:'absolute', top:10, right:10, width:26, height:26, borderRadius:'50%', background:'linear-gradient(135deg,var(--col-acc),var(--col-acc2))', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(var(--rgb-acc),0.4)' }}>
                                <Check size={12} color="var(--col-bg)" strokeWidth={2.5}/>
                              </div>
                            </div>
                          )}
                          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:60, background:'linear-gradient(to top,rgba(0,0,0,0.55),transparent)' }}/>
                        </div>
                        <div style={{ padding:'0.9rem 1rem 1rem', textAlign:'center', borderTop:`1px solid ${isActive?'var(--col-acc)':'rgba(var(--rgb-hi),0.04)'}` }}>
                          <p className="font-display" style={{ color:'var(--col-text)', fontSize:'1.56rem', marginBottom:4 }}>{sty.name}</p>
                          {sty.title && <p style={{ fontSize:12, color: 'var(--col-text)', letterSpacing:'0.18em', textTransform:'uppercase', fontFamily:'DM Sans,sans-serif' }}>{sty.title}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: Date & Time ── */}
            {step===2 && (
              <motion.div key="s2" {...slide}>
                <div style={{ display:'flex', justifyContent:'flex-start', marginBottom:16 }}>
                  <button onClick={() => setStep(1)} className="appt-back-btn" style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:10, background:'rgba(var(--rgb-hi),0.04)', border:'1px solid rgba(var(--rgb-hi),0.07)', color: 'var(--col-text)', cursor:'pointer', fontSize:15, letterSpacing:'0.14em', textTransform:'uppercase', fontFamily:'DM Sans,sans-serif', transition:'all 0.3s' }}>
                    <ChevronLeft size={13}/> Back
                  </button>
                </div>
                <div style={{ textAlign:'center', marginBottom:28 }}>
                  <h1 className="font-display font-light" style={{ color:'var(--col-text)', fontSize:'clamp(2.6rem,4.2vw,3.6rem)', marginBottom:4, lineHeight:1.1 }}>
                    When works <span className="gold-gradient" style={{ fontStyle:'italic' }}>for you?</span>
                  </h1>
                  <p style={{ color: 'var(--col-text)', fontSize:'1.15rem', fontFamily:'DM Sans,sans-serif' }}>
                    {sel.service?.name} with {sel.stylist?.name}
                  </p>
                </div>

                <div style={{ background:'rgba(var(--rgb-hi),0.02)', border:'1px solid rgba(var(--rgb-hi),0.07)', borderRadius:16, padding:'1.1rem 1.4rem', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <button onClick={() => setMonth(subMonths(month,1))} className="appt-nav-btn" style={{ width:32, height:32, borderRadius:9, background:'rgba(var(--rgb-hi),0.04)', border:'1px solid rgba(var(--rgb-hi),0.07)', display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--col-text)', cursor:'pointer', transition:'all 0.3s' }}>
                      <ChevronLeft size={13}/>
                    </button>
                    <span className="font-display" style={{ color:'var(--col-text)', fontSize:'1.58rem' }}>{format(month,'MMMM yyyy')}</span>
                    <button onClick={() => setMonth(addMonths(month,1))} className="appt-nav-btn" style={{ width:32, height:32, borderRadius:9, background:'rgba(var(--rgb-hi),0.04)', border:'1px solid rgba(var(--rgb-hi),0.07)', display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--col-text)', cursor:'pointer', transition:'all 0.3s' }}>
                      <ChevronRight size={13}/>
                    </button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:6 }}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i) => (
                      <div key={i} style={{ textAlign:'center', fontSize:13, color: 'var(--col-text)', letterSpacing:'0.08em', padding:'3px 0', fontFamily:'DM Sans,sans-serif', textTransform:'uppercase' }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
                    {Array.from({length:startPad}).map((_,i)=><div key={`p${i}`} style={{ height:44 }}/>)}
                    {days.map(day => {
                      const off=isOff(day), isSel=sel.date&&isSameDay(day,sel.date), isToday=isSameDay(day,new Date())
                      return (
                        <button key={day.toString()} disabled={off} onClick={() => setSel(p=>({...p,date:day,time:null}))} className="appt-day-btn"
                          style={{ height:44, borderRadius:10, fontSize:'1.2rem', fontFamily:'DM Sans,sans-serif',
                            cursor:off?'not-allowed':'pointer', transition:'all 0.2s ease',
                            border:isToday&&!isSel?'1px solid rgba(var(--rgb-acc),0.35)':'1px solid transparent',
                            background:isSel?'linear-gradient(135deg,var(--col-acc),var(--col-acc2))':'transparent',
                            color:isSel?'var(--col-bg)':off?'rgba(var(--rgb-hi),0.08)':isToday?'var(--col-acc)':'var(--col-text)',
                            fontWeight:isSel?700:400, boxShadow:isSel?'0 4px 16px rgba(var(--rgb-acc),0.4)':'none',
                          }}>{format(day,'d')}</button>
                      )
                    })}
                  </div>
                </div>

                <div style={{ background:'rgba(var(--rgb-hi),0.02)', border:'1px solid rgba(var(--rgb-hi),0.07)', borderRadius:16, padding:'1rem 1.4rem' }}>
                  {sel.date ? (
                    <>
                      <div style={{ display:'flex', alignItems:'center', marginBottom:12 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <Calendar size={11} color="var(--col-acc)" strokeWidth={1.5}/>
                          <span style={{ fontSize:12, letterSpacing:'0.13em', textTransform:'uppercase', color:'var(--col-acc)', fontFamily:'DM Sans,sans-serif' }}>{format(sel.date,'EEEE, MMMM d')}</span>
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1px 1fr', gap:'0 14px' }}>
                        {[
                          ['Morning',   SLOTS.filter(s => parseInt(s) < 13)],
                          ['Afternoon', SLOTS.filter(s => parseInt(s) >= 13)],
                        ].map(([label, slots], col) => (
                          col===0 ? (
                            <div key={label}>
                              <p style={{ fontSize:13, letterSpacing:'0.16em', textTransform:'uppercase', color: 'var(--col-text)', fontFamily:'DM Sans,sans-serif', marginBottom:8 }}>{label}</p>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
                                {slots.map(slot => {
                                  const isPast = sel.date && isSameDay(sel.date,new Date()) && parseInt(slot)<=getHours(new Date())
                                  const tk = taken.includes(slot)||slotOverlapsBlocked(slot, sel.service?.duration||60, blockedSlots)||isPast
                                  const isSel = sel.time===slot
                                  return (
                                    <button key={slot} disabled={tk} onClick={() => setSel(p=>({...p,time:slot}))} className="appt-slot-btn"
                                      style={{ padding:'0.45rem 0', borderRadius:8, fontSize:'1.06rem', fontFamily:'DM Sans,sans-serif', cursor:tk?'not-allowed':'pointer', transition:'all 0.2s ease', border:isSel?'none':'1px solid rgba(var(--rgb-hi),0.07)', background:isSel?'linear-gradient(135deg,var(--col-acc),var(--col-acc2))':'rgba(var(--rgb-hi),0.02)', color:isSel?'var(--col-bg)':tk?'rgba(var(--rgb-hi),0.08)':'var(--col-text)', fontWeight:isSel?700:300, textDecoration:tk?'line-through':'none', boxShadow:isSel?'0 4px 14px rgba(var(--rgb-acc),0.35)':'none' }}>
                                      {slot}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ) : [
                            <div key="divider" style={{ background:'rgba(var(--rgb-hi),0.06)', borderRadius:1 }}/>,
                            <div key={label}>
                              <p style={{ fontSize:13, letterSpacing:'0.16em', textTransform:'uppercase', color: 'var(--col-text)', fontFamily:'DM Sans,sans-serif', marginBottom:8 }}>{label}</p>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:5 }}>
                                {slots.map(slot => {
                                  const isPast = sel.date && isSameDay(sel.date,new Date()) && parseInt(slot)<=getHours(new Date())
                                  const tk = taken.includes(slot)||slotOverlapsBlocked(slot, sel.service?.duration||60, blockedSlots)||isPast
                                  const isSel = sel.time===slot
                                  return (
                                    <button key={slot} disabled={tk} onClick={() => setSel(p=>({...p,time:slot}))} className="appt-slot-btn"
                                      style={{ padding:'0.45rem 0', borderRadius:8, fontSize:'1.06rem', fontFamily:'DM Sans,sans-serif', cursor:tk?'not-allowed':'pointer', transition:'all 0.2s ease', border:isSel?'none':'1px solid rgba(var(--rgb-hi),0.07)', background:isSel?'linear-gradient(135deg,var(--col-acc),var(--col-acc2))':'rgba(var(--rgb-hi),0.02)', color:isSel?'var(--col-bg)':tk?'rgba(var(--rgb-hi),0.08)':'var(--col-text)', fontWeight:isSel?700:300, textDecoration:tk?'line-through':'none', boxShadow:isSel?'0 4px 14px rgba(var(--rgb-acc),0.35)':'none' }}>
                                      {slot}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ]
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'0.75rem 0', color: 'var(--col-text)', fontSize:'0.96rem', fontFamily:'DM Sans,sans-serif', fontStyle:'italic' }}>
                      <Calendar size={14} strokeWidth={1.2}/> Pick a date to see available times
                    </div>
                  )}
                </div>
                {sel.time && (
                  <div style={{ marginTop:14, display:'flex', justifyContent:'flex-end' }}>
                    <button className="btn-gold" onClick={() => setStep(3)} style={{ padding:'8px 22px', fontSize:12, gap:6 }}>
                      Continue <ArrowRight size={12}/>
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── STEP 3: Confirm ── */}
            {step===3 && (
              <motion.div key="s3" {...slide}>
                <div style={{ display:'flex', justifyContent:'flex-start', marginBottom:16 }}>
                  <button onClick={() => setStep(2)} className="appt-back-btn" style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:10, background:'rgba(var(--rgb-hi),0.04)', border:'1px solid rgba(var(--rgb-hi),0.07)', color: 'var(--col-text)', cursor:'pointer', fontSize:15, letterSpacing:'0.14em', textTransform:'uppercase', fontFamily:'DM Sans,sans-serif', transition:'all 0.3s' }}>
                    <ChevronLeft size={13}/> Back
                  </button>
                </div>
                <div style={{ textAlign:'center', marginBottom:32 }}>
                  <h1 className="font-display font-light" style={{ color:'var(--col-text)', fontSize:'clamp(2.8rem,5.5vw,4.2rem)', marginBottom:6, lineHeight:1.1 }}>
                    Almost there,<br/><span className="gold-gradient" style={{ fontStyle:'italic' }}>let's confirm.</span>
                  </h1>
                  <p style={{ color: 'var(--col-text)', fontSize:'1.2rem', fontFamily:'DM Sans,sans-serif' }}>Review your appointment details</p>
                </div>

                <div style={{ borderRadius:18, overflow:'hidden', border:'1px solid rgba(var(--rgb-acc),0.14)', marginBottom:20, position:'relative' }}>
                  {sel.service?.image_url ? (
                    <div style={{ height:140, position:'relative', overflow:'hidden' }}>
                      <img src={sel.service.image_url} alt={sel.service.name} loading="lazy" decoding="async" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                      <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom,rgba(0,0,0,0.15) 0%,rgba(14,14,20,0.93) 100%)' }}/>
                      <div style={{ position:'absolute', bottom:14, left:20, right:20, display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
                        <h3 className="font-display" style={{ color:'var(--col-text)', fontSize:'2.28rem', lineHeight:1 }}>{sel.service.name}</h3>
                        <span className="font-display" style={{ color:'var(--col-acc)', fontSize:'2.5rem', lineHeight:1 }}>${sel.service.price}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ height:3, background:'linear-gradient(90deg,var(--col-acc),var(--col-acc2),rgba(var(--rgb-acc),0.2))' }}/>
                  )}

                  <div style={{ background:'rgba(var(--rgb-hi),0.02)', position:'relative' }}>
                    <div style={{ position:'absolute', top:0, right:0, width:160, height:160, background:'radial-gradient(circle,rgba(var(--rgb-acc),0.05) 0%,transparent 70%)', pointerEvents:'none' }}/>
                    {[
                      ...(!sel.service?.image_url ? [{ label:'Service', value:sel.service?.name, extra:`$${sel.service?.price}` }] : []),
                      { label:'Stylist',  value:sel.stylist?.name },
                      { label:'Date',     value:sel.date?format(sel.date,'EEEE, MMMM d, yyyy'):'' },
                      { label:'Time',     value:sel.time },
                      ...(sel.service?.duration?[{ label:'Duration', value:fmtDur(sel.service.duration) }]:[]),
                    ].map(({ label, value, extra }, i, arr) => (
                      <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.9rem 1.5rem', borderBottom:i<arr.length-1?'1px solid rgba(var(--rgb-hi),0.04)':'none' }}>
                        <span style={{ fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', color: 'var(--col-text)', fontFamily:'DM Sans,sans-serif' }}>{label}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ color: 'var(--col-text)', fontSize:'1.2rem', fontFamily:'DM Sans,sans-serif', fontWeight:300 }}>{value}</span>
                          {extra && <span style={{ padding:'2px 10px', borderRadius:9999, background:'var(--col-acc)', border:'1px solid rgba(var(--rgb-acc),0.2)', fontSize:13, color:'var(--col-acc)', fontFamily:'DM Sans,sans-serif' }}>{extra}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom:18 }}>
                  <label style={{ display:'block', fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', color: 'var(--col-text)', marginBottom:8, fontFamily:'DM Sans,sans-serif' }}>Notes (optional)</label>
                  <textarea value={sel.notes} onChange={e=>setSel(p=>({...p,notes:e.target.value}))} rows={3}
                    placeholder="Any special requests or preferences..."
                    className="appt-textarea"
                    style={{ width:'100%', background:'rgba(var(--rgb-hi),0.02)', border:'1px solid rgba(var(--rgb-hi),0.07)', borderRadius:12, padding:'0.9rem 1.1rem', fontSize:'1.2rem', color:'var(--col-text)', outline:'none', fontFamily:'DM Sans,sans-serif', fontWeight:300, resize:'none', transition:'border-color 0.3s', boxSizing:'border-box' }}
                  />
                </div>

                {/* ── Coupons ── */}
                {user && (
                  <div style={{ marginBottom:18 }}>
                    {/* Pre-assigned user coupons */}
                    {availableCoupons.length > 0 && (
                      <>
                        <p style={{ fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--col-text)', marginBottom:8, fontFamily:'DM Sans,sans-serif' }}>Your coupons</p>
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {(showAllCoupons ? availableCoupons : availableCoupons.slice(0, 3)).map(uc => {
                            const c = uc.coupons
                            const isApplied = appliedCoupon?.id === uc.id
                            const discLabel = c.discount_type === 'percentage' ? `${c.discount_value}% off` : `$${c.discount_value} off`
                            return (
                              <button key={uc.id} onClick={() => {
                                if (isApplied) { setAppliedCoupon(null); if (user) sessionStorage.removeItem(`hg_booking_coupon_${user.id}`) }
                                else { setAppliedCoupon(uc); setCouponCode(''); setCouponError(null); if (user) sessionStorage.setItem(`hg_booking_coupon_${user.id}`, JSON.stringify({ isManual: false, id: uc.id, code: uc.coupons.code })) }
                              }}
                                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.7rem 1rem', borderRadius:12, cursor:'pointer', transition:'all 0.2s',
                                  background: isApplied ? 'rgba(52,211,153,0.06)' : 'rgba(var(--rgb-hi),0.02)',
                                  border: isApplied ? '1px solid rgba(52,211,153,0.25)' : '1px solid rgba(var(--rgb-hi),0.07)',
                                }}>
                                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                  <div style={{ width:28, height:28, borderRadius:8, background: isApplied ? 'rgba(52,211,153,0.1)' : 'rgba(var(--rgb-hi),0.04)', border: isApplied ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(var(--rgb-hi),0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                    {isApplied ? <Check size={13} color="#34d399" strokeWidth={2.5}/> : <Star size={11} color="var(--col-text)" strokeWidth={1.5}/>}
                                  </div>
                                  <span style={{ fontSize:'1.17rem', fontFamily:'"Courier New", monospace', letterSpacing:'0.08em', color: isApplied ? '#34d399' : 'var(--col-text)', fontWeight: isApplied ? 700 : 400 }}>{c.code}</span>
                                </div>
                                <span style={{ fontSize:'1.12rem', fontFamily:'DM Sans,sans-serif', color: isApplied ? '#34d399' : 'var(--col-text)', fontWeight: isApplied ? 600 : 400 }}>{discLabel}</span>
                              </button>
                            )
                          })}
                          {availableCoupons.length > 3 && (
                            <button onClick={() => setShowAllCoupons(p => !p)}
                              style={{ alignSelf:'center', background:'none', border:'none', color:'var(--col-acc)', fontFamily:'DM Sans,sans-serif', fontSize:'0.85rem', fontWeight:600, cursor:'pointer', padding:'4px 0', letterSpacing:'0.02em' }}>
                              {showAllCoupons ? 'Show less' : `Show ${availableCoupons.length - 3} more`}
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {/* Coupon code input — hidden once any coupon is applied */}
                    {!appliedCoupon && (
                      <div style={{ marginTop: availableCoupons.length > 0 ? 12 : 0 }}>
                        <p style={{ fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--col-text)', marginBottom:8, fontFamily:'DM Sans,sans-serif' }}>
                          {availableCoupons.length > 0 ? 'Or enter a coupon code' : 'Have a coupon code?'}
                        </p>
                        <div style={{ display:'flex', gap:8 }}>
                          <input
                            value={couponCode}
                            onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null) }}
                            onKeyDown={e => e.key === 'Enter' && validateCouponCode()}
                            placeholder="ENTER CODE"
                            style={{ flex:1, background:'rgba(var(--rgb-hi),0.02)', border:`1px solid ${couponError ? 'rgba(248,113,113,0.4)' : 'rgba(var(--rgb-hi),0.07)'}`, borderRadius:10, padding:'0.65rem 1rem', fontSize:'1.1rem', color:'var(--col-text)', outline:'none', fontFamily:'"Courier New", monospace', letterSpacing:'0.08em', transition:'border-color 0.2s', boxSizing:'border-box' }}
                          />
                          <button onClick={validateCouponCode} disabled={!couponCode.trim() || validatingCode}
                            style={{ padding:'0.65rem 1.1rem', borderRadius:10, border:'1px solid rgba(var(--rgb-acc),0.3)', background:'rgba(var(--rgb-acc),0.08)', color:'var(--col-acc)', cursor: (!couponCode.trim() || validatingCode) ? 'not-allowed' : 'pointer', opacity: (!couponCode.trim() || validatingCode) ? 0.5 : 1, fontSize:13, fontFamily:'DM Sans,sans-serif', fontWeight:500, letterSpacing:'0.06em', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6, transition:'all 0.2s' }}>
                            <Tag size={12}/>{validatingCode ? 'Checking…' : 'Apply'}
                          </button>
                        </div>
                        {couponError && <p style={{ fontSize:12, color:'#f87171', fontFamily:'DM Sans,sans-serif', marginTop:5 }}>{couponError}</p>}
                      </div>
                    )}

                    {/* Applied summary — shown for both user_coupons and manual codes */}
                    {appliedCoupon && (
                      <div style={{ padding:'0.65rem 0.9rem', marginTop:10, borderRadius:10, background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.18)' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                            <Check size={13} color="#34d399" style={{ flexShrink:0 }}/>
                            <span style={{ fontSize:'1.05rem', fontFamily:'"Courier New", monospace', letterSpacing:'0.06em', color:'#34d399', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{appliedCoupon.coupons.code}</span>
                            <span style={{ fontSize:'0.85rem', fontFamily:'DM Sans,sans-serif', color:'rgba(52,211,153,0.7)', flexShrink:0 }}>applied</span>
                          </div>
                          <button onClick={() => { setAppliedCoupon(null); setCouponCode(''); setCouponError(null); if (user) sessionStorage.removeItem(`hg_booking_coupon_${user.id}`) }}
                            style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:6, color:'#f87171', cursor:'pointer', padding:'3px 10px', fontSize:11, fontFamily:'DM Sans,sans-serif', fontWeight:600, flexShrink:0, whiteSpace:'nowrap' }}>
                            Remove
                          </button>
                        </div>
                        <div style={{ display:'flex', alignItems:'baseline', gap:8, marginTop:5 }}>
                          <span style={{ fontSize:'1rem', fontFamily:'DM Sans,sans-serif', color:'var(--col-text)', textDecoration:'line-through', opacity:0.45 }}>${basePrice.toFixed(2)}</span>
                          <span style={{ fontSize:'1.2rem', fontFamily:'DM Sans,sans-serif', color:'#34d399', fontWeight:700 }}>${finalPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!user && (
                  <div style={{ marginBottom:18 }}>
                    <p style={{ fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', color: 'var(--col-text)', marginBottom:10, fontFamily:'DM Sans,sans-serif' }}>Your contact information</p>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {[
                        { key:'name',  type:'text',  placeholder:'Full name *' },
                        { key:'phone', type:'tel',   placeholder:'Phone number *' },
                        { key:'email', type:'email', placeholder:'Email address *' },
                      ].map(({ key, type, placeholder }) => (
                        <input key={key} type={type} placeholder={placeholder} value={guestInfo[key]}
                          onChange={e => setGuestInfo(p => ({ ...p, [key]: e.target.value }))}
                          className="appt-textarea"
                          style={{ width:'100%', background:'rgba(var(--rgb-hi),0.02)', border:`1px solid ${guestInfo[key] ? 'rgba(96,165,250,0.3)' : 'rgba(var(--rgb-hi),0.07)'}`, borderRadius:12, padding:'0.75rem 1.1rem', fontSize:'1.2rem', color:'var(--col-text)', outline:'none', fontFamily:'DM Sans,sans-serif', fontWeight:300, transition:'border-color 0.3s', boxSizing:'border-box' }}
                        />
                      ))}
                    </div>
                    <p style={{ fontSize:'1.03rem', color: 'var(--col-text)', fontFamily:'DM Sans,sans-serif', marginTop:8 }}>
                      A confirmation email will be sent to you after booking.
                    </p>
                  </div>
                )}

                <>
                    <div style={{ display:'flex', gap:10 }}>
                      <button className="btn-gold" onClick={startPayment} disabled={payStep==='loading'||saving||!guestInfoValid} style={{ flex:1, justifyContent:'center', borderRadius:10 }}>
                        {payStep==='loading'
                          ? <div style={{ width:16,height:16,border:'2px solid rgba(0,0,0,0.25)',borderTopColor:'var(--col-bg)',borderRadius:'50%',animation:'spin 0.8s linear infinite' }}/>
                          : <>Pay Online &nbsp;${finalPrice.toFixed(2)} <ArrowRight size={15}/></>
                        }
                      </button>
                      <button onClick={bookInStore} disabled={saving||payStep==='loading'||!guestInfoValid}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px 16px', borderRadius:10, border:'1px solid rgba(var(--rgb-acc),0.28)', background:'var(--col-acc)', color:'var(--col-bg)', cursor: (saving||payStep==='loading'||!guestInfoValid) ? 'not-allowed' : 'pointer', opacity:(saving||payStep==='loading'||!guestInfoValid)?0.5:1, fontSize:15, fontFamily:'DM Sans,sans-serif', fontWeight:500, letterSpacing:'0.04em', transition:'all 0.25s' }}>
                        {saving
                          ? <div style={{ width:16,height:16,border:'2px solid rgba(var(--rgb-acc),0.25)',borderTopColor:'var(--col-acc)',borderRadius:'50%',animation:'spin 0.8s linear infinite' }}/>
                          : 'Pay in Store'
                        }
                      </button>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:12 }}>
                      <Sparkles size={10} color="rgba(var(--rgb-acc),0.4)"/>
                      <p style={{ fontSize:11, color: 'var(--col-text)', letterSpacing:'0.12em', fontFamily:'DM Sans,sans-serif' }}>Every completed visit counts toward your 30% reward</p>
                    </div>
                  </>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* ── RIGHT SPACER (balances left panel) ── */}
      <div className="appt-side-spacer" style={{ width:300, flexShrink:0 }} />

      {/* ── Stripe payment modal ── */}
      {payStep==='form' && clientSecret && (
        <StripeCheckout
          clientSecret={clientSecret}
          amount={finalPrice.toFixed(2)}
          label={`${sel.service?.name} with ${sel.stylist?.name}`}
          onSuccess={completeBooking}
          onCancel={() => { setPayStep(null); setClientSecret(null) }}
        />
      )}

      <style>{`
        @keyframes spin { to { transform:rotate(360deg) } }

        .appt-svc-card:hover { transform:translateY(-5px) !important; box-shadow:0 24px 60px rgba(0,0,0,0.6) !important; border-color:rgba(var(--rgb-acc),0.35) !important; }
        .appt-svc-card:hover .appt-svc-img { transform:scale(1.07) !important; }
        .appt-info-btn:hover { color:var(--col-text) !important; background:rgba(var(--rgb-hi),0.12) !important; border-color:var(--col-text) !important; }
        .appt-sty-card:hover { border-color:rgba(var(--rgb-acc),0.3) !important; transform:translateY(-4px) !important; box-shadow:0 16px 48px rgba(var(--rgb-acc),0.1) !important; }
        .appt-back-btn:hover { color:var(--col-text) !important; border-color:rgba(var(--rgb-hi),0.13) !important; background:rgba(var(--rgb-hi),0.07) !important; }
        .appt-nav-btn:hover { background:rgba(var(--rgb-acc),0.09) !important; border-color:rgba(var(--rgb-acc),0.22) !important; color:var(--col-acc) !important; }
        .appt-day-btn:not(:disabled):hover { background:rgba(var(--rgb-acc),0.1) !important; color:var(--col-acc) !important; }
        .appt-slot-btn:not(:disabled):hover { border-color:rgba(var(--rgb-acc),0.28) !important; background:rgba(var(--rgb-acc),0.07) !important; color:var(--col-acc) !important; }
        .appt-textarea:focus { border-color:rgba(var(--rgb-acc),0.35) !important; }
        .appt-textarea::placeholder { color: var(--col-text); }
        .preview-close:hover { background:rgba(var(--rgb-hi),0.1) !important; color:var(--col-text) !important; }
        .preview-cancel:hover { background:rgba(var(--rgb-hi),0.07) !important; color:var(--col-text) !important; }

        @media (max-width:900px) {
          .appt-step-panel { display:none !important; }
          .appt-side-spacer { display:none !important; }
          .appt-mobile-steps { display:block !important; }
        }
        .appt-step-panel::-webkit-scrollbar { display:none; }
        @media (max-width:900px) {
          .appt-content-wrap { padding: 1rem 1.25rem !important; }
        }
        @media (max-width:600px) {
          .appt-svc-card { height:220px !important; }
          .appt-content-wrap { padding: 0.75rem 1.25rem !important; }
        }
      `}</style>
      </div>
    </div>
  )
}
