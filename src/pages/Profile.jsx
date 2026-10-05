import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Package, Tag, Star, Clock, X, Edit2, Check, LogOut, ShoppingCart, Trash2, Download, Receipt, Scissors, ChevronRight, Minus, Plus, Phone, MessageSquare, Lock, Eye, EyeOff } from 'lucide-react'
import jsPDF from 'jspdf'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import StripeCheckout from '../components/payment/StripeCheckout'
import { Copy, CheckCheck } from 'lucide-react'
import { useLogAction } from '../hooks/useLogAction'

const TABS = ['Appointments', 'Cart', 'Orders', 'Rewards']

const STATUS_MAP = {
  pending:   { label: 'Pending',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  confirmed: { label: 'Confirmed', color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  completed: { label: 'Completed', color: 'var(--col-acc)', bg: 'rgba(var(--rgb-acc),0.12)'  },
  active:    { label: 'Awaiting Pickup', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  retrieved: { label: 'Picked Up', color: 'var(--col-acc)', bg: 'rgba(var(--rgb-acc),0.12)'  },
  expired:   { label: 'Expired',   color: 'var(--col-text)', bg: 'rgba(var(--rgb-hi),0.06)' },
}

function StatusPill({ status }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.pending
  return <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 15, fontWeight: 500, color: s.color, background: s.bg, whiteSpace: 'nowrap' }}>{s.label}</span>
}

function Countdown({ expiresAt, onExpired }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000)))
  const expired = useRef(false)

  useEffect(() => {
    const id = setInterval(() => {
      const rem = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000))
      setSecs(rem)
      if (rem === 0 && !expired.current) { expired.current = true; onExpired() }
    }, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const m = Math.floor(secs / 60)
  const s = secs % 60
  const urgent = secs < 60
  return (
    <span style={{ fontSize: 15, fontFamily: 'DM Sans, sans-serif', color: urgent ? '#f87171' : '#f59e0b', fontWeight: 600 }}>
      {m}:{String(s).padStart(2, '0')}
    </span>
  )
}

const ease = [0.22, 1, 0.36, 1]
const S1 = 'rgba(var(--rgb-hi),0.04)'
const BD = 'rgba(var(--rgb-hi),0.07)'

export default function Profile() {
  const { user, profile, fetchProfile } = useAuth()
  const { cartItems, cartTotal, removeFromCart, commitQtyUpdate, expireItem, clearCart } = useCart()
  const navigate  = useNavigate()
  const location  = useLocation()
  const log       = useLogAction()

  const [tab, setTab]             = useState(() => {
    const t = location.state?.tab
    return TABS.includes(t) ? t : 'Appointments'
  })
  const [appointments, setAppts]  = useState([])
  const [orders, setOrders]       = useState([])
  const [coupons, setCoupons]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [editName, setEditName]   = useState(false)
  const [nameInput, setNameInput] = useState(profile?.full_name || '')
  const [loggingOut, setOut]      = useState(false)
  const [newPass,     setNewPass]     = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showNewPass, setShowNewPass] = useState(false)
  const [showConf,    setShowConf]    = useState(false)
  const [changingPass,  setChangingPass]  = useState(false)
  const [changePwModal, setChangePwModal] = useState(false)
  const [receipt,   setReceipt]   = useState(null)
  const [apptPage,  setApptPage]  = useState(0)
  const [ordPage,   setOrdPage]   = useState(0)
  const [coupPage,  setCoupPage]  = useState(0)
  const [apptFilter,   setApptFilter]   = useState('upcoming')
  const [ordFilter,    setOrdFilter]    = useState('pickup')
  const [rewardFilter, setRewardFilter] = useState('active')
  const [coupPerPage,  setCoupPerPage]  = useState(() => window.innerWidth <= 640 ? 3 : 4)
  const PER_PAGE = 3

  // Payment modal state
  const [payStep,      setPayStep]      = useState(null)
  const [clientSecret, setClientSecret] = useState(null)
  const [reserving,    setReserving]    = useState(false)

  // Cart coupon state
  const [cartCouponCode,      setCartCouponCode]      = useState('')
  const [cartCoupon,          setCartCoupon]          = useState(null)
  const [cartCouponError,     setCartCouponError]     = useState(null)
  const [validatingCartCode,  setValidatingCartCode]  = useState(false)

  // Contact Us popup state
  const [contactAppt,    setContactAppt]    = useState(null)
  const [contactMsg,     setContactMsg]     = useState('')
  const [contactSending, setContactSending] = useState(false)

  const cartFinalTotal = cartCoupon
    ? Math.max(0, cartTotal - parseFloat(cartCoupon.discount_value))
    : cartTotal



  useEffect(() => { if (user) loadAll() }, [user])

  useEffect(() => {
    const handler = () => setCoupPerPage(window.innerWidth <= 640 ? 3 : 4)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  async function loadAll() {
    const [{ data: a }, { data: o }, { data: c }] = await Promise.all([
      supabase.from('appointments').select('*, stylists(id, name, photo_url), services(id, name, price, duration)').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('preorders').select('*, products(name,image_url,price)').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('user_coupons').select('*, coupons(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    setAppts(a || [])
    setOrders(o || [])
    setCoupons(c || [])
    setLoading(false)
  }

  async function handleContactSend() {
    if (!contactAppt || !contactMsg.trim()) return
    setContactSending(true)
    try {
      const appt = contactAppt
      const stylistName = appt.stylists?.name || 'Any stylist'
      const serviceName = appt.services?.name || 'Service'
      const apptDate = new Date(appt.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      const apptTime = appt.time?.slice(0, 5) || ''
      const userName = profile?.full_name || user?.email || 'Client'

      const prefilledTitle = `${userName} — ${serviceName} on ${apptDate} at ${apptTime}`
      const fullContent = contactMsg.trim()

      const { data: ticket, error: ticketErr } = await supabase.from('tickets').insert({
        user_id: user.id,
        title: prefilledTitle,
        status: 'open',
        recipient_id: null,
        appointment_id: appt.id,
      }).select('id').single()
      if (ticketErr) console.error('ticket insert error:', ticketErr)

      if (ticket) {
        await supabase.from('ticket_messages').insert({
          ticket_id: ticket.id,
          sender_id: user.id,
          content: fullContent,
          is_from_admin: false,
          read: false,
        })
      }
      log('ticket.opened', {
        entityType: 'ticket',
        details: { message: `opened support ticket for "${serviceName} on ${apptDate} at ${apptTime}"` },
      })
      setContactAppt(null)
      setContactMsg('')
      navigate('/chat')
    } catch (e) {
      toast.error('Failed to send message')
    } finally {
      setContactSending(false)
    }
  }

  async function saveName() {
    await supabase.from('profiles').update({ full_name: nameInput }).eq('id', user.id)
    log('profile.name_updated', {
      details: { message: `updated display name to "${nameInput}"` },
    })
    await fetchProfile(user.id)
    setEditName(false)
    toast.success('Name updated')
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (newPass.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (newPass !== confirmPass) { toast.error('Passwords do not match'); return }
    setChangingPass(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) throw error
      toast.success('Password updated')
      setNewPass(''); setConfirmPass('')
      setChangePwModal(false)
    } catch (err) {
      toast.error(err.message || 'Failed to update password')
    } finally {
      setChangingPass(false)
    }
  }

  async function handleLogout() {
    setOut(true)
    await supabase.auth.signOut()
    navigate('/')
  }

  async function validateCartCoupon() {
    const code = cartCouponCode.trim().toUpperCase()
    if (!code) return
    setValidatingCartCode(true)
    setCartCouponError(null)
    try {
      const { data: found } = await supabase.rpc('lookup_coupon', { p_code: code })
      const coupon = found?.[0]
      if (!coupon) { setCartCouponError('Invalid coupon code'); return }
      if (coupon.discount_type === 'percentage') { setCartCouponError('Percentage coupons can only be applied to appointments'); return }
      if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) { setCartCouponError('This coupon has expired'); return }
      if (coupon.max_uses != null && coupon.current_uses >= coupon.max_uses) { setCartCouponError('This coupon has been fully redeemed'); return }
      setCartCoupon(coupon)
      setCartCouponCode('')
    } finally {
      setValidatingCartCode(false)
    }
  }

  async function startCartPayment() {
    if (cartItems.length === 0) return
    setPayStep('loading')
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          type: 'cart',
          couponCode: cartCoupon?.code ?? null,
          label: `${cartItems.length} item${cartItems.length !== 1 ? 's' : ''} from HairGo Store`,
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

  async function reserveInStore() {
    if (cartItems.length === 0) return
    setReserving(true)
    try {
      // The server checks stock, creates the reservation and empties the cart
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: { type: 'reserve-cart' },
      })
      if (error || !data?.ok) throw new Error(data?.error)
      await clearCart()
      setCartCoupon(null); setCartCouponCode('')
      const itemSummary = cartItems.map(i => `${i.quantity}× ${i.products?.name || 'item'}`).join(', ')
      log('order.placed', {
        details: { message: `placed in-store order: ${itemSummary} (pay in store)` },
      })
      toast.success('Items reserved! Come pay in store within 7 days.')
      loadAll()
      setTab('Orders')
    } catch (err) {
      toast.error(err.message || 'Could not reserve items — please try again')
    } finally {
      setReserving(false)
    }
  }

  async function completeCartPayment(paymentIntentId) {
    try {
      // The server creates the order from the verified Stripe payment
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: { type: 'finalize', paymentIntentId },
      })
      if (error || !data?.ok) throw new Error(data?.error)

      await clearCart()
      setCartCoupon(null); setCartCouponCode('')
      setPayStep(null); setClientSecret(null)
      const itemSummary = cartItems.map(i => `${i.quantity}× ${i.products?.name || 'item'}`).join(', ')
      log('order.placed', {
        details: { message: `placed online order: ${itemSummary}${cartCoupon ? ` (coupon: ${cartCoupon.code})` : ''} — paid online` },
      })
      toast.success('Payment confirmed! Come pick up your order.')
      loadAll()
      setTab('Orders')
    } catch {
      toast.error('Payment succeeded but order failed — contact us')
    }
  }

  function downloadReceipt(order) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const W   = 210
    const ml  = 18
    const mr  = 18

    const navy  = [30,  50,  80]
    const cream = [250, 249, 246]
    const steel = [46,  111, 163]
    const muted = [154, 163, 174]
    const ink   = [90,  99,  112]
    const line  = [220, 218, 212]
    const fmt   = (n) => `$${Number(n).toFixed(2)}`

    const orderId    = order.id.slice(0, 8).toUpperCase()
    const orderDate  = format(new Date(order.created_at), 'MMMM d, yyyy')
    const customer   = profile?.full_name || user?.email || 'Customer'
    const unitPrice  = parseFloat(order.products?.price || 0)
    const subtotal   = unitPrice * (order.quantity || 1)
    const discount   = parseFloat(order.discount_amount) || 0
    const total      = Math.max(0, subtotal - discount)
    const isPaid     = order.payment_status === 'paid'
    const isInStore  = order.payment_status === 'pay_in_store'

    // Page background
    doc.setFillColor(...cream); doc.rect(0, 0, W, 297, 'F')

    // Navy header
    doc.setFillColor(...navy); doc.rect(0, 0, W, 36, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(22); doc.setTextColor(250, 249, 246)
    doc.text('Hair', ml, 22)
    doc.setFont('helvetica', 'bold')
    doc.text('Go', ml + doc.getTextWidth('Hair'), 22)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setCharSpace(1.2)
    doc.text('AUCKLAND, NEW ZEALAND', ml, 29); doc.setCharSpace(0)

    // Steel accent band
    doc.setFillColor(...steel); doc.rect(0, 36, W, 14, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(250, 249, 246); doc.setCharSpace(1.5)
    doc.text('PURCHASE RECEIPT', ml, 44); doc.setCharSpace(0)

    // Meta row
    let y = 62
    const rx = W - mr
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted); doc.setCharSpace(0.8)
    doc.text('PREPARED FOR', ml, y); doc.setCharSpace(0)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...navy)
    doc.text(customer, ml, y + 6)

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted); doc.setCharSpace(0.8)
    doc.text('ORDER NUMBER', rx, y, { align: 'right' }); doc.setCharSpace(0)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy)
    doc.text(`#${orderId}`, rx, y + 6, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted); doc.setCharSpace(0.8)
    doc.text('DATE', rx, y + 14, { align: 'right' }); doc.setCharSpace(0)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...ink)
    doc.text(orderDate, rx, y + 20, { align: 'right' })
    y += 34

    // Divider + items header
    doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(ml, y, W - mr, y); y += 8
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...muted); doc.setCharSpace(1)
    doc.text('ITEM', ml, y); doc.text('QTY', W / 2, y, { align: 'center' }); doc.text('PRICE', W - mr, y, { align: 'right' }); doc.setCharSpace(0)
    y += 4; doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(ml, y, W - mr, y); y += 6

    // Item row
    doc.setFillColor(244, 243, 240); doc.rect(ml - 2, y - 4, W - ml - mr + 4, 8, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...navy)
    doc.text(order.products?.name || 'Product', ml, y)
    doc.setTextColor(...ink); doc.text(String(order.quantity || 1), W / 2, y, { align: 'center' })
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...steel)
    doc.text(fmt(subtotal), W - mr, y, { align: 'right' })
    y += 12

    // Totals
    doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(ml, y, W - mr, y); y += 7
    const totalsL = W / 2 + 10
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink)
    doc.text('Subtotal', totalsL, y); doc.text(fmt(subtotal), W - mr, y, { align: 'right' }); y += 7
    if (discount > 0) {
      doc.setTextColor(34, 160, 100)
      doc.text(`Discount (${order.coupon_code})`, totalsL, y)
      doc.text(`-${fmt(discount)}`, W - mr, y, { align: 'right' }); y += 7
    }
    doc.setDrawColor(...steel); doc.setLineWidth(0.4); doc.line(totalsL, y, W - mr, y); y += 6
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy)
    doc.text('TOTAL', totalsL, y)
    doc.setTextColor(...steel); doc.text(fmt(total), W - mr, y, { align: 'right' }); y += 10

    // Payment method
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted)
    doc.text(isPaid ? 'Paid via Stripe' : isInStore ? 'Pay in store' : 'Payment pending', W - mr, y, { align: 'right' }); y += 14

    // Payment status box
    if (isPaid) {
      doc.setFillColor(235, 244, 251); doc.roundedRect(ml, y, W - ml - mr, 16, 2, 2, 'F')
      doc.setDrawColor(...steel); doc.setLineWidth(0.4); doc.roundedRect(ml, y, W - ml - mr, 16, 2, 2, 'S')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...steel)
      doc.text('Payment confirmed', ml + 5, y + 7)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...ink)
      doc.text(`${fmt(total)} processed via Stripe`, ml + 5, y + 13)
    } else {
      doc.setFillColor(254, 243, 219); doc.roundedRect(ml, y, W - ml - mr, 16, 2, 2, 'F')
      doc.setDrawColor(146, 98, 10); doc.setLineWidth(0.4); doc.roundedRect(ml, y, W - ml - mr, 16, 2, 2, 'S')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(146, 98, 10)
      doc.text(isInStore ? 'Pay in store' : 'Payment pending', ml + 5, y + 7)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 80, 10)
      doc.text(isInStore ? `Please bring ${fmt(total)} to the salon when picking up your order.` : 'Awaiting payment.', ml + 5, y + 13)
    }

    // Footer
    const footerY = 272
    doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(ml, footerY, W - mr, footerY)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted)
    doc.text('Thank you for shopping with HairGo.', W / 2, footerY + 6, { align: 'center' })
    doc.setFontSize(7); doc.setCharSpace(0.5)
    doc.text('hairgo.co.nz  ·  Auckland, New Zealand', W / 2, footerY + 12, { align: 'center' }); doc.setCharSpace(0)

    doc.save(`HairGo-Receipt-${orderId}.pdf`)
  }

  function downloadApptReceipt(appt) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const W   = 210
    const ml  = 18
    const mr  = 18

    const navy    = [30,  50,  80]
    const cream   = [250, 249, 246]
    const steel   = [46,  111, 163]
    const muted   = [154, 163, 174]
    const ink     = [90,  99,  112]
    const line    = [220, 218, 212]
    const amber   = [146, 98,  10]
    const amberBg = [254, 243, 219]

    const apptId       = appt.id.slice(0, 8).toUpperCase()
    const apptDate     = format(new Date(appt.date), 'MMMM d, yyyy')
    const issuedDate   = appt.created_at ? format(new Date(appt.created_at), 'MMMM d, yyyy') : apptDate
    const timeStr      = appt.time ? appt.time.slice(0, 5) : ''
    const customer     = profile?.full_name || user?.email || 'Customer'
    const price        = parseFloat(appt.services?.price || 0)
    const couponMatch  = appt.notes?.match(/\[Coupon: (\S+) — .+? · Final: \$([0-9.]+)\]/)
    const couponCode   = couponMatch?.[1] || null
    const finalPrice   = couponMatch ? parseFloat(couponMatch[2]) : price
    const discount     = couponMatch ? price - parseFloat(couponMatch[2]) : 0
    const isPaid       = appt.payment_status === 'paid'
    const fmt          = (n) => `$${Number(n).toFixed(2)}`

    // Page background
    doc.setFillColor(...cream); doc.rect(0, 0, W, 297, 'F')

    // Navy header
    doc.setFillColor(...navy); doc.rect(0, 0, W, 36, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(22); doc.setTextColor(250, 249, 246)
    doc.text('Hair', ml, 22)
    doc.setFont('helvetica', 'bold')
    doc.text('Go', ml + doc.getTextWidth('Hair'), 22)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setCharSpace(1.2)
    doc.text('AUCKLAND, NEW ZEALAND', ml, 29); doc.setCharSpace(0)

    // Steel accent band
    doc.setFillColor(...steel); doc.rect(0, 36, W, 14, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(250, 249, 246); doc.setCharSpace(1.5)
    doc.text('APPOINTMENT RECEIPT', ml, 44); doc.setCharSpace(0)

    // Meta row
    let y = 62
    const rx = W - mr
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted); doc.setCharSpace(0.8)
    doc.text('CLIENT', ml, y); doc.setCharSpace(0)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...navy)
    doc.text(customer, ml, y + 6)

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted); doc.setCharSpace(0.8)
    doc.text('RECEIPT NUMBER', rx, y, { align: 'right' }); doc.setCharSpace(0)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy)
    doc.text(`#${apptId}`, rx, y + 6, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted); doc.setCharSpace(0.8)
    doc.text('ISSUED', rx, y + 14, { align: 'right' }); doc.setCharSpace(0)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...ink)
    doc.text(issuedDate, rx, y + 20, { align: 'right' })
    y += 34

    // Divider
    doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(ml, y, W - mr, y); y += 10

    // Appointment detail rows
    const rows = [
      ['SERVICE',  appt.services?.name || '—'],
      ['STYLIST',  appt.stylists?.name || '—'],
      ['DATE',     apptDate],
      ['TIME',     timeStr || '—'],
      ...(appt.services?.duration ? [['DURATION', `${appt.services.duration} min`]] : []),
    ]
    rows.forEach(([label, value], i) => {
      if (i % 2 === 0) { doc.setFillColor(244, 243, 240); doc.rect(ml - 2, y - 5, W - ml - mr + 4, 9, 'F') }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...muted); doc.setCharSpace(0.8)
      doc.text(label, ml, y); doc.setCharSpace(0)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...navy)
      doc.text(value, W - mr, y, { align: 'right' }); y += 10
    })
    y += 4

    // Price block
    doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(ml, y, W - mr, y); y += 8
    const totalsL = W / 2 + 10
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink)
    doc.text('Service total', totalsL, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ink)
    doc.text(fmt(price), W - mr, y, { align: 'right' }); y += 7

    if (discount > 0) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(34, 160, 100)
      doc.text(`Discount (${couponCode})`, totalsL, y)
      doc.text(`-${fmt(discount)}`, W - mr, y, { align: 'right' }); y += 7
    }

    doc.setDrawColor(...steel); doc.setLineWidth(0.4); doc.line(totalsL, y, W - mr, y); y += 6
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy)
    doc.text('TOTAL', totalsL, y)
    doc.setTextColor(...steel); doc.setFontSize(16)
    doc.text(fmt(finalPrice), W - mr, y + 1, { align: 'right' }); y += 14

    // Payment status box
    if (isPaid) {
      doc.setFillColor(235, 244, 251); doc.roundedRect(ml, y, W - ml - mr, 16, 2, 2, 'F')
      doc.setDrawColor(...steel); doc.setLineWidth(0.4); doc.roundedRect(ml, y, W - ml - mr, 16, 2, 2, 'S')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...steel)
      doc.text('Payment confirmed', ml + 5, y + 7)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...ink)
      doc.text(`${fmt(finalPrice)} processed via Stripe`, ml + 5, y + 13)
    } else {
      doc.setFillColor(...amberBg); doc.roundedRect(ml, y, W - ml - mr, 16, 2, 2, 'F')
      doc.setDrawColor(...amber); doc.setLineWidth(0.4); doc.roundedRect(ml, y, W - ml - mr, 16, 2, 2, 'S')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...amber)
      doc.text('Pay in store', ml + 5, y + 7)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 80, 10)
      doc.text(`Please bring ${fmt(finalPrice)} to the salon at the time of your appointment.`, ml + 5, y + 13)
    }
    y += 24

    // Cancellation note
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...muted)
    doc.text('Need to reschedule or cancel? Please contact us at least 24 hours before your appointment.', ml, y, { maxWidth: W - ml - mr })

    // Footer
    const footerY = 272
    doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(ml, footerY, W - mr, footerY)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted)
    doc.text('Thank you for choosing HairGo.', W / 2, footerY + 6, { align: 'center' })
    doc.setFontSize(7); doc.setCharSpace(0.5)
    doc.text('hairgo.co.nz  ·  Auckland, New Zealand', W / 2, footerY + 12, { align: 'center' }); doc.setCharSpace(0)

    doc.save(`HairGo-Appointment-${apptId}.pdf`)
  }

  const totalVisits     = profile?.points || 0
  const stampsThisCycle = totalVisits % 5
  const remaining       = stampsThisCycle === 0 ? 5 : 5 - stampsThisCycle
  const initial  = (profile?.full_name || user?.email)?.[0]?.toUpperCase()
  const name     = profile?.full_name || user?.email?.split('@')[0] || 'Guest'
  const isAdmin  = profile?.role === 'admin'
  const upcoming = appointments.filter(a => a.status === 'confirmed' || a.status === 'pending').length
  const now = new Date()
  const activeCoupons = coupons.filter(({ used, coupons: c }) =>
    !used && !(c?.expiry_date && new Date(c.expiry_date) < now)
  ).length
  const card = { background: S1, border: `1px solid ${BD}`, borderRadius: 16 }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(70px, 10vw, 90px) clamp(12px, 4vw, 24px) 32px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Hero ── */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}
          style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', border: `1px solid ${BD}`, background: S1 }}>

          {/* Top accent line */}
          <div style={{ height: 3, background: 'linear-gradient(90deg, transparent, var(--col-acc2) 25%, var(--col-acc) 50%, var(--col-acc2) 75%, transparent)' }} />

          {/* Avatar + info */}
          <div style={{ padding: '22px 22px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 58, height: 58, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, var(--col-acc), var(--col-acc2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Cormorant Garamond", serif', fontSize: 28, color: 'var(--col-bg)', boxShadow: '0 0 28px rgba(var(--rgb-acc),0.3)' }}>
              {initial || '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName()}
                    style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(var(--rgb-acc),0.45)', color: 'var(--col-text)', fontFamily: '"Cormorant Garamond", serif', fontSize: 22, outline: 'none', flex: 1, minWidth: 0 }} autoFocus />
                  <button onClick={saveName} style={{ background: 'none', border: 'none', color: 'var(--col-acc)', cursor: 'pointer', padding: 2 }}><Check size={13}/></button>
                  <button onClick={() => setEditName(false)} style={{ background: 'none', border: 'none', color: 'var(--col-text)', cursor: 'pointer', padding: 2 }}><X size={13}/></button>
                </div>
              ) : (
                <button onClick={() => { setEditName(true); setNameInput(profile?.full_name || '') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, maxWidth: '100%' }}>
                  <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 24, color: 'var(--col-text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <Edit2 size={11} style={{ color: 'var(--col-text)', opacity: 0.35, flexShrink: 0 }} />
                </button>
              )}
              <p style={{ fontSize: 15, color: 'var(--col-text)', opacity: 0.45, fontFamily: 'DM Sans,sans-serif', marginBottom: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-block', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 600, color: 'var(--col-bg)', background: 'var(--col-acc)', padding: '3px 10px', borderRadius: 5 }}>
                  {isAdmin ? 'Admin' : `${totalVisits} visit${totalVisits !== 1 ? 's' : ''}`}
                </span>
                <button onClick={() => { setChangePwModal(true); setNewPass(''); setConfirmPass(''); setShowNewPass(false); setShowConf(false) }}
                  style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${BD}`, color: 'var(--col-text)', fontSize: 11, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.1em', cursor: 'pointer', opacity: 0.5, transition: 'opacity 0.2s, border-color 0.2s, color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = 'rgba(var(--rgb-acc),0.35)'; e.currentTarget.style.color = 'var(--col-acc)' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.borderColor = BD; e.currentTarget.style.color = 'var(--col-text)' }}>
                  <Lock size={11} /> Change Password
                </button>
              </div>
            </div>
          </div>

          {/* Loyalty progress bar */}
          <div style={{ padding: '0 22px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--col-text)', opacity: 0.38, fontFamily: 'DM Sans,sans-serif' }}>Loyalty</span>
              <span style={{ fontSize: 15, fontFamily: 'DM Sans,sans-serif', color: totalVisits > 0 && stampsThisCycle === 0 ? 'var(--col-acc)' : 'var(--col-text)', opacity: totalVisits > 0 && stampsThisCycle === 0 ? 1 : 0.5 }}>
                {totalVisits === 0
                  ? '5 visits · unlock 30% off'
                  : stampsThisCycle === 0
                    ? 'Reward unlocked — check Rewards'
                    : `${stampsThisCycle} / 5 · ${remaining} more for 30% off`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: 5 }).map((_, i) => {
                const filled = totalVisits > 0 && stampsThisCycle === 0 ? true : i < stampsThisCycle
                return (
                  <motion.div key={i}
                    initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.1 + i * 0.07, ease }}
                    style={{ flex: 1, height: 5, borderRadius: 3, background: filled ? 'linear-gradient(90deg, var(--col-acc2), var(--col-acc))' : BD, boxShadow: filled ? '0 0 8px rgba(var(--rgb-acc),0.4)' : 'none', transformOrigin: 'left' }} />
                )
              })}
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ display: 'flex', borderTop: `1px solid ${BD}` }}>
            {[
              { label: 'Upcoming',  value: upcoming },
              { label: 'Cart',      value: cartItems.reduce((s, i) => s + i.quantity, 0) },
              { label: 'Coupons',   value: activeCoupons },
            ].map(({ label, value }, i) => (
              <div key={label} style={{ flex: 1, padding: '14px 8px', textAlign: 'center', borderRight: i < 2 ? `1px solid ${BD}` : 'none' }}>
                <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 30, color: value > 0 ? 'var(--col-acc)' : 'var(--col-text)', lineHeight: 1, marginBottom: 3 }}>{value}</div>
                <div style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--col-text)', opacity: 0.4, fontFamily: 'DM Sans,sans-serif' }}>{label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Tabs + content ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1, ease }}
          className="profile-tab-panel" style={{ ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div className="profile-tab-bar">
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setApptPage(0); setOrdPage(0) }} className="profile-tab-btn"
                style={{ fontWeight: tab === t ? 600 : 400, color: tab === t ? 'var(--col-acc)' : 'var(--col-text)', borderBottom: `2px solid ${tab === t ? 'var(--col-acc)' : 'transparent'}`, marginBottom: -1 }}>
                {t}
                {t === 'Cart' && cartItems.length > 0 && (
                  <span style={{ marginLeft: 4, fontSize: 14, background: 'var(--col-acc)', color: 'var(--col-bg)', padding: '1px 5px', borderRadius: 9999 }}>
                    {cartItems.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease }}>

                {/* ── Cart ── */}
                {tab === 'Cart' && (
                  <div>
                    {cartItems.length === 0 ? (
                      <EmptyState icon={ShoppingCart} text="Your cart is empty." action="Browse the store" link="/store" />
                    ) : (
                      <>
                        {cartItems.map((item, i) => (
                          <CartItemRow
                            key={item.id}
                            item={item}
                            isLast={i === cartItems.length - 1}
                            onRemove={removeFromCart}
                            onCommit={commitQtyUpdate}
                            onExpired={expireItem}
                            BD={BD}
                          />
                        ))}

                        {/* Coupon code input */}
                        {cartCoupon ? (
                          <div style={{ padding: '10px 20px', borderTop: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(52,211,153,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Check size={12} color="#34d399"/>
                              <span style={{ fontSize: 15, fontFamily: '"Courier New", monospace', letterSpacing: '0.06em', color: '#34d399' }}>{cartCoupon.code}</span>
                              <span style={{ fontSize: 14, fontFamily: 'DM Sans,sans-serif', color: 'rgba(52,211,153,0.65)' }}>— ${parseFloat(cartCoupon.discount_value).toFixed(2)} off</span>
                            </div>
                            <button onClick={() => setCartCoupon(null)}
                              style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.55)', cursor: 'pointer', padding: '2px 4px', fontSize: 15, fontFamily: 'DM Sans,sans-serif', lineHeight: 1 }}>
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div style={{ padding: '10px 20px', borderTop: `1px solid ${BD}` }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input
                                value={cartCouponCode}
                                onChange={e => { setCartCouponCode(e.target.value.toUpperCase()); setCartCouponError(null) }}
                                onKeyDown={e => e.key === 'Enter' && validateCartCoupon()}
                                placeholder="Coupon code"
                                style={{ flex: 1, background: S1, border: `1px solid ${cartCouponError ? 'rgba(248,113,113,0.4)' : BD}`, borderRadius: 8, padding: '7px 12px', fontSize: 14, color: 'var(--col-text)', outline: 'none', fontFamily: '"Courier New", monospace', letterSpacing: '0.06em', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                              />
                              <button onClick={validateCartCoupon} disabled={!cartCouponCode.trim() || validatingCartCode}
                                style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid rgba(var(--rgb-acc),0.25)`, background: 'rgba(var(--rgb-acc),0.07)', color: 'var(--col-acc)', fontSize: 15, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.08em', cursor: (!cartCouponCode.trim() || validatingCartCode) ? 'not-allowed' : 'pointer', opacity: (!cartCouponCode.trim() || validatingCartCode) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
                                <Tag size={10}/>{validatingCartCode ? '…' : 'Apply'}
                              </button>
                            </div>
                            {cartCouponError && (
                              <p style={{ fontSize: 15, color: '#f87171', fontFamily: 'DM Sans,sans-serif', marginTop: 5 }}>{cartCouponError}</p>
                            )}
                          </div>
                        )}

                        {/* Cart footer */}
                        <div style={{ padding: '14px 20px', borderTop: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <p style={{ fontSize: 15, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--col-text)', fontFamily: 'DM Sans, sans-serif', marginBottom: 3 }}>Total</p>
                            {cartCoupon && (
                              <p style={{ fontSize: '1.1rem', color: 'var(--col-text)', opacity: 0.4, textDecoration: 'line-through', lineHeight: 1, marginBottom: 2, fontFamily: 'DM Sans,sans-serif' }}>${cartTotal.toFixed(2)}</p>
                            )}
                            <p className="font-display" style={{ fontSize: '1.6rem', color: 'var(--col-acc)', lineHeight: 1 }}>${cartFinalTotal.toFixed(2)}</p>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <button onClick={startCartPayment} disabled={payStep === 'loading' || reserving} className="btn-gold" style={{ padding: '10px 22px', fontSize: 15, justifyContent: 'center', borderRadius: 10 }}>
                              {payStep === 'loading'
                                ? <div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.25)', borderTopcolor: 'var(--col-bg)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                : 'Pay Online'
                              }
                            </button>
                            <button onClick={reserveInStore} disabled={payStep === 'loading' || reserving}
                              style={{ padding: '10px 22px', borderRadius: 10, border: '1px solid rgba(var(--rgb-acc),0.25)', background: 'var(--col-acc)', color: 'var(--col-bg)', fontSize: 15, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: (payStep === 'loading' || reserving) ? 'not-allowed' : 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              {reserving
                                ? <div style={{ width: 12, height: 12, border: '2px solid rgba(var(--rgb-acc),0.3)', borderTopColor: 'var(--col-acc)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                : 'Pay In Store'
                              }
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── Appointments ── */}
                {tab === 'Appointments' && (() => {
                  const filtered = appointments
                    .filter(a =>
                      apptFilter === 'upcoming' ? (a.status === 'confirmed' || a.status === 'pending') :
                      apptFilter === 'completed' ? a.status === 'completed' : a.status === 'cancelled'
                    )
                    .sort((a, b) => {
                      const dateCmp = apptFilter === 'upcoming'
                        ? a.date.localeCompare(b.date)
                        : b.date.localeCompare(a.date)
                      if (dateCmp !== 0) return dateCmp
                      return apptFilter === 'upcoming'
                        ? (a.time || '').localeCompare(b.time || '')
                        : (b.time || '').localeCompare(a.time || '')
                    })
                  const pageAppts = filtered.slice(apptPage * PER_PAGE, (apptPage + 1) * PER_PAGE)
                  const apptCounts = {
                    upcoming:  appointments.filter(a => a.status === 'confirmed' || a.status === 'pending').length,
                    completed: appointments.filter(a => a.status === 'completed').length,
                    cancelled: appointments.filter(a => a.status === 'cancelled').length,
                  }
                  return (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: `1px solid ${BD}`, flexWrap: 'wrap' }}>
                      {[['upcoming','Upcoming'],['completed','Completed'],['cancelled','Cancelled']].map(([key, label]) => (
                        <button key={key} onClick={() => { setApptFilter(key); setApptPage(0) }}
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 14px', borderRadius:20, fontSize:15, letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:'DM Sans,sans-serif', fontWeight: apptFilter===key ? 600 : 400, cursor:'pointer', border:`1px solid ${apptFilter===key ? 'rgba(var(--rgb-acc),0.4)' : BD}`, background: apptFilter===key ? 'rgba(var(--rgb-acc),0.1)' : 'transparent', color: apptFilter===key ? 'var(--col-acc)' : 'var(--col-text)', transition:'all 0.15s' }}>
                          {label}
                          {apptCounts[key] > 0 && <span style={{ fontSize:14, fontWeight:700, background:'rgba(var(--rgb-acc),0.15)', color:'var(--col-acc)', padding:'1px 6px', borderRadius:10 }}>{apptCounts[key]}</span>}
                        </button>
                      ))}
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 220 }}>
                    {loading ? (
                      Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} style={{ height: 150, borderRadius: 12, background: S1 }} className="shimmer" />
                      ))
                    ) : pageAppts.length === 0 ? (
                      <EmptyState icon={Calendar}
                        text={apptFilter === 'upcoming' ? 'No upcoming appointments.' : apptFilter === 'completed' ? 'No completed appointments yet.' : 'No cancelled appointments.'}
                        action={apptFilter === 'upcoming' ? 'Book now' : undefined}
                        link={apptFilter === 'upcoming' ? '/appointments' : undefined} />
                    ) : (
                      pageAppts.map(appt => {
                        const s = STATUS_MAP[appt.status] ?? STATUS_MAP.pending
                        const apptDate = format(new Date(appt.date), 'MMM d, yyyy')
                        const isUpcoming = appt.status === 'confirmed' || appt.status === 'pending'
                        const couponMatch = appt.notes?.match(/\[Coupon: (\S+) — (.+?) · Final: \$([0-9.]+)\]/)
                        const discountedPrice = couponMatch ? couponMatch[3] : null
                        return (
                          <div key={appt.id} style={{ borderRadius: 16, border: `1px solid ${isUpcoming ? 'rgba(var(--rgb-acc),0.28)' : BD}`, overflow: 'hidden', background: 'var(--col-bg)', boxShadow: isUpcoming ? '0 4px 24px rgba(var(--rgb-acc),0.08)' : 'none', display: 'flex', transition: 'box-shadow 0.2s' }}>

                            {/* Left accent bar */}
                            <div style={{ width: 3, flexShrink: 0, background: isUpcoming ? 'linear-gradient(to bottom, var(--col-acc), var(--col-acc2))' : 'transparent' }} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                              {/* Header */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 0' }}>
                                <span style={{ fontSize: 15, fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)', opacity: 0.3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                  #{appt.id.slice(0, 8).toUpperCase()}
                                </span>
                                <span style={{ fontSize: 14, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {s.label}
                                </span>
                              </div>

                              {/* Main content */}
                              <div style={{ padding: '10px 14px 12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                  <div style={{ minWidth: 0 }}>
                                    <p className="font-display" style={{ color: 'var(--col-text)', fontSize: '1.25rem', fontWeight: 400, lineHeight: 1.1, marginBottom: 4 }}>{appt.services?.name || '—'}</p>
                                    {appt.stylists?.name && (
                                      <p style={{ color: 'var(--col-text)', opacity: 0.5, fontSize: 15, fontFamily: 'DM Sans,sans-serif' }}>
                                        with {appt.stylists.name}{appt.services?.duration ? ` · ${appt.services.duration} min` : ''}
                                      </p>
                                    )}
                                  </div>
                                  {appt.services?.price && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 10 }}>
                                      {discountedPrice ? (
                                        <>
                                          <span className="font-display" style={{ color: 'var(--col-text)', fontSize: '1rem', opacity: 0.35, textDecoration: 'line-through', lineHeight: 1.2 }}>
                                            ${appt.services.price}
                                          </span>
                                          <span className="font-display" style={{ color: '#34d399', fontSize: '1.25rem', lineHeight: 1.2 }}>
                                            ${discountedPrice}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="font-display" style={{ color: isUpcoming ? 'var(--col-acc)' : 'var(--col-text)', fontSize: '1.25rem' }}>
                                          ${appt.services.price}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Date/time pill */}
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: isUpcoming ? 'rgba(var(--rgb-acc),0.07)' : 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${isUpcoming ? 'rgba(var(--rgb-acc),0.2)' : BD}` }}>
                                  <Calendar size={10} color={isUpcoming ? 'var(--col-acc)' : 'var(--col-text)'} />
                                  <span style={{ fontSize: 15, color: isUpcoming ? 'var(--col-acc)' : 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: isUpcoming ? 600 : 400 }}>{apptDate}</span>
                                  {appt.time && (
                                    <>
                                      <div style={{ width: 1, height: 10, background: 'rgba(var(--rgb-hi),0.15)' }} />
                                      <Clock size={10} color={isUpcoming ? 'var(--col-acc)' : 'var(--col-text)'} />
                                      <span style={{ fontSize: 15, color: isUpcoming ? 'var(--col-acc)' : 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: isUpcoming ? 600 : 400 }}>{appt.time.slice(0, 5)}</span>
                                    </>
                                  )}
                                </div>

                                {couponMatch && (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '5px 10px', borderRadius: 8, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)' }}>
                                    <Tag size={10} color="#34d399" />
                                    <span style={{ fontSize: 15, fontFamily: 'DM Sans,sans-serif', color: '#34d399', letterSpacing: '0.06em' }}>
                                      {couponMatch[1]} — {couponMatch[2]}
                                    </span>
                                  </div>
                                )}

                                {isUpcoming && (
                                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-start' }}>
                                    <button onClick={() => { setContactAppt(appt); setContactMsg('') }}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(var(--rgb-acc),0.08)', border: '1px solid rgba(var(--rgb-acc),0.22)', color: 'var(--col-acc)', fontSize: 13, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
                                      <MessageSquare size={12} /> Contact Us
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Footer */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderTop: `1px solid ${BD}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: appt.payment_status === 'paid' ? '#34d399' : appt.payment_status === 'pay_in_store' ? '#f59e0b' : 'rgba(var(--rgb-hi),0.3)' }} />
                                  <span style={{ fontSize: 14, color: 'var(--col-text)', opacity: 0.45, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.06em' }}>
                                    {appt.payment_status === 'paid' ? 'Paid online' : appt.payment_status === 'pay_in_store' ? 'Pay in store' : 'No payment on file'}
                                  </span>
                                </div>
                                {(appt.payment_status === 'paid' || appt.payment_status === 'pay_in_store') && (
                                  <button onClick={() => downloadApptReceipt(appt)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7, background: 'rgba(var(--rgb-acc),0.08)', border: '1px solid rgba(var(--rgb-acc),0.2)', color: 'var(--col-acc)', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                                    <Download size={9} /> Receipt
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                    </div>
                    <Pager page={apptPage} total={Math.ceil(filtered.length / PER_PAGE)} onChange={setApptPage} />
                  </div>
                  )
                })()}

                {/* ── Orders ── */}
                {tab === 'Orders' && (() => {
                  const allGroups = Object.values(
                    orders.reduce((acc, o) => {
                      const key = o.order_group_id || o.id
                      if (!acc[key]) acc[key] = []
                      acc[key].push(o)
                      return acc
                    }, {})
                  ).sort((a, b) => new Date(b[0].created_at) - new Date(a[0].created_at))

                  const filteredGroups = allGroups.filter(g =>
                    ordFilter === 'pickup' ? g[0].status === 'active' : (g[0].status === 'retrieved' || g[0].status === 'expired')
                  )
                  const pageGroups = filteredGroups.slice(ordPage * PER_PAGE, (ordPage + 1) * PER_PAGE)
                  const ordCounts = {
                    pickup:    allGroups.filter(g => g[0].status === 'active').length,
                    completed: allGroups.filter(g => g[0].status === 'retrieved' || g[0].status === 'expired').length,
                  }
                  return (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: `1px solid ${BD}`, flexWrap: 'wrap' }}>
                      {[['pickup','Awaiting Pickup'],['completed','Completed']].map(([key, label]) => (
                        <button key={key} onClick={() => { setOrdFilter(key); setOrdPage(0) }}
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 14px', borderRadius:20, fontSize:15, letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:'DM Sans,sans-serif', fontWeight: ordFilter===key ? 600 : 400, cursor:'pointer', border:`1px solid ${ordFilter===key ? 'rgba(var(--rgb-acc),0.4)' : BD}`, background: ordFilter===key ? 'rgba(var(--rgb-acc),0.1)' : 'transparent', color: ordFilter===key ? 'var(--col-acc)' : 'var(--col-text)', transition:'all 0.15s' }}>
                          {label}
                          {ordCounts[key] > 0 && <span style={{ fontSize:14, fontWeight:700, background:'rgba(var(--rgb-acc),0.15)', color:'var(--col-acc)', padding:'1px 6px', borderRadius:10 }}>{ordCounts[key]}</span>}
                        </button>
                      ))}
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 220 }}>
                    {loading ? (
                      Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} style={{ height: 140, borderRadius: 12, background: S1 }} className="shimmer" />
                      ))
                    ) : pageGroups.length === 0 ? (
                      <EmptyState icon={Package}
                        text={ordFilter === 'pickup' ? 'No orders awaiting pickup.' : 'No completed orders yet.'}
                        action={ordFilter === 'pickup' ? 'Browse the store' : undefined}
                        link={ordFilter === 'pickup' ? '/store' : undefined} />
                    ) : (
                      pageGroups.map(group => {
                        const first = group[0]
                        const s = STATUS_MAP[first.status] ?? STATUS_MAP.active
                        const groupTotal = group.reduce((sum, o) => sum + (parseFloat(o.products?.price) || 0) * o.quantity, 0)
                        const groupDiscount = parseFloat(first.discount_amount) || 0
                        const groupPaid = groupDiscount > 0 ? Math.max(0, groupTotal - groupDiscount) : groupTotal
                        const groupId = (first.order_group_id || first.id).slice(0, 8).toUpperCase()
                        return (
                          <div key={groupId} style={{ borderRadius: 14, border: `1px solid ${BD}`, overflow: 'hidden', background: 'rgba(var(--rgb-hi),0.02)' }}>

                            {/* Order header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${BD}`, background: 'rgba(var(--rgb-hi),0.02)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Package size={11} color="var(--col-text)" />
                                <span style={{ fontSize: 14, fontFamily: 'monospace', color: 'var(--col-text)', letterSpacing: '0.08em' }}>#{groupId}</span>
                                <span style={{ fontSize: 14, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>·</span>
                                <span style={{ fontSize: 14, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>{format(new Date(first.created_at), 'MMM d, yyyy')}</span>
                              </div>
                              <span style={{ fontSize: 14, padding: '3px 9px', borderRadius: 20, background: s.bg, color: s.color, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {s.label}
                              </span>
                            </div>

                            {/* Items */}
                            {group.map((order, i) => {
                              const itemTotal = ((parseFloat(order.products?.price) || 0) * order.quantity)
                              const isSingleWithDiscount = group.length === 1 && groupDiscount > 0
                              return (
                              <div key={order.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < group.length - 1 ? `1px solid ${BD}` : 'none' }}>
                                <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--col-card)', border: `1px solid ${BD}`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {order.products?.image_url
                                    ? <img src={order.products.image_url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity 0.3s ease' }} onLoad={e => { e.currentTarget.style.opacity = '1' }} />
                                    : <Package size={16} color="rgba(var(--rgb-hi),0.12)" />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ color: 'var(--col-text)', fontSize: 15, fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {order.products?.name}
                                  </p>
                                  <p style={{ color: 'var(--col-text)', fontSize: 15, fontFamily: 'DM Sans,sans-serif', opacity: 0.5 }}>
                                    Qty {order.quantity}{order.products?.price ? ` · $${parseFloat(order.products.price).toFixed(2)} each` : ''}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
                                  {isSingleWithDiscount && (
                                    <span style={{ fontSize: '0.8rem', color: 'var(--col-text)', opacity: 0.4, textDecoration: 'line-through', fontFamily: 'DM Sans,sans-serif' }}>
                                      ${itemTotal.toFixed(2)}
                                    </span>
                                  )}
                                  <span className="font-display" style={{ color: 'var(--col-acc)', fontSize: '1.15rem', lineHeight: 1 }}>
                                    ${isSingleWithDiscount ? groupPaid.toFixed(2) : itemTotal.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                              )
                            })}

                            {/* Footer */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderTop: `1px solid ${BD}`, background: 'rgba(var(--rgb-hi),0.01)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: first.payment_status === 'paid' ? '#34d399' : '#f59e0b', flexShrink: 0 }} />
                                  <span style={{ fontSize: 14, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.08em' }}>
                                    {first.payment_status === 'paid' ? 'Paid via Stripe' : first.payment_status === 'pay_in_store' ? 'Pay in store' : 'Payment pending'}
                                  </span>
                                </div>
                                {first.coupon_code && groupDiscount > 0 && (
                                  <span style={{ fontSize: 13, color: '#34d399', fontFamily: 'DM Sans,sans-serif', paddingLeft: 11 }}>
                                    {first.coupon_code} — ${groupDiscount.toFixed(2)} off
                                  </span>
                                )}
                                {first.payment_status === 'pay_in_store' && first.expires_at && first.status === 'active' && (
                                  <span style={{ fontSize: 15, color: 'rgba(245,158,11,0.55)', fontFamily: 'DM Sans,sans-serif', paddingLeft: 11 }}>
                                    Hold expires {format(new Date(first.expires_at), 'MMM d')}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                {group.length > 1 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                    {groupDiscount > 0 && (
                                      <span style={{ fontSize: '0.8rem', color: 'var(--col-text)', opacity: 0.4, textDecoration: 'line-through', fontFamily: 'DM Sans,sans-serif' }}>
                                        ${groupTotal.toFixed(2)}
                                      </span>
                                    )}
                                    <span className="font-display" style={{ color: 'var(--col-acc)', fontSize: '1.1rem' }}>
                                      ${groupPaid.toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                <button onClick={() => setReceipt(first)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, background: 'var(--col-acc)', border: '1px solid rgba(var(--rgb-acc),0.18)', color: 'var(--col-bg)', fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                                  <Receipt size={10} /> Receipt
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                    </div>
                    <Pager page={ordPage} total={Math.ceil(filteredGroups.length / PER_PAGE)} onChange={setOrdPage} />
                  </div>
                  )
                })()}

                {/* ── Rewards ── */}
                {tab === 'Rewards' && (() => {
                  const now = new Date()
                  const activeCouponsList = coupons.filter(({ used, coupons: c }) => !used && !(c?.expiry_date && new Date(c.expiry_date) < now))
                  const pastCouponsList   = coupons.filter(({ used, coupons: c }) => used || !!(c?.expiry_date && new Date(c.expiry_date) < now))
                  const displayList = rewardFilter === 'active' ? activeCouponsList : pastCouponsList
                  return (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: `1px solid ${BD}`, flexWrap: 'wrap' }}>
                      {[['active','Available'],['past','Used & Expired']].map(([key, label]) => {
                        const count = key === 'active' ? activeCouponsList.length : pastCouponsList.length
                        return (
                          <button key={key} onClick={() => { setRewardFilter(key); setCoupPage(0) }}
                            style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 14px', borderRadius:20, fontSize:15, letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:'DM Sans,sans-serif', fontWeight: rewardFilter===key ? 600 : 400, cursor:'pointer', border:`1px solid ${rewardFilter===key ? 'rgba(var(--rgb-acc),0.4)' : BD}`, background: rewardFilter===key ? 'rgba(var(--rgb-acc),0.1)' : 'transparent', color: rewardFilter===key ? 'var(--col-acc)' : 'var(--col-text)', transition:'all 0.15s' }}>
                            {label}
                            {count > 0 && <span style={{ fontSize:14, fontWeight:700, background:'rgba(var(--rgb-acc),0.15)', color:'var(--col-acc)', padding:'1px 6px', borderRadius:10 }}>{count}</span>}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {loading ? (
                        Array.from({ length: 2 }).map((_, i) => <div key={i} style={{ height: 90, borderRadius: 14, background: S1 }} className="shimmer" />)
                      ) : coupons.length === 0 ? (
                        <EmptyState icon={Star} text="No coupons yet. Complete 5 visits to unlock your 30% reward." />
                      ) : displayList.length === 0 ? (
                        <EmptyState icon={Star} text={rewardFilter === 'active' ? 'No available coupons right now.' : 'No used or expired coupons.'} />
                      ) : (
                        displayList.slice(coupPage * coupPerPage, (coupPage + 1) * coupPerPage).map(({ id, coupons: c, used }) => {
                          const expired = !used && !!(c?.expiry_date && new Date(c.expiry_date) < now)
                          return <CouponCard key={id} coupon={c} used={used} expired={expired} />
                        })
                      )}
                    </div>
                    <Pager page={coupPage} total={Math.ceil(displayList.length / coupPerPage)} onChange={setCoupPage} />
                  </div>
                  )
                })()}

              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Sign out ── */}
        <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, delay: 0.2, ease }}
          onClick={handleLogout} disabled={loggingOut}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: 'var(--col-text)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.16em', cursor: 'pointer', transition: 'color 0.2s, border-color 0.2s', flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--col-text)'; e.currentTarget.style.borderColor = 'var(--col-text)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--col-text)'; e.currentTarget.style.borderColor = BD }}>
          {loggingOut ? <svg className="animate-spin" style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> : <LogOut size={13} />}
          {loggingOut ? 'Signing out' : 'Sign Out'}
        </motion.button>
      </div>

      {/* ── Change Password modal ── */}
      <AnimatePresence>
        {changePwModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !changingPass && setChangePwModal(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 400, background: 'var(--col-modal)', border: '1px solid rgba(var(--rgb-acc),0.18)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
              <div style={{ height: 3, background: 'linear-gradient(90deg, var(--col-acc), var(--col-acc2))' }} />
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                  <div>
                    <p style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--col-acc)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 4 }}>Account</p>
                    <h3 style={{ color: 'var(--col-text)', fontFamily: '"Cormorant Garamond",serif', fontSize: '1.35rem', fontWeight: 500, margin: 0 }}>Change Password</h3>
                  </div>
                  <button onClick={() => setChangePwModal(false)} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.05)', border: `1px solid ${BD}`, color: 'var(--col-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <X size={13} />
                  </button>
                </div>
                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--col-text)', opacity: 0.45, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }}>New Password</p>
                    <div style={{ position: 'relative' }}>
                      <Lock size={12} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-text)', opacity: 0.35, pointerEvents: 'none' }} />
                      <input type={showNewPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} required
                        placeholder="Min. 8 chars" autoFocus
                        style={{ width: '100%', background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${BD}`, borderRadius: 10, padding: '11px 40px 11px 36px', fontSize: '0.85rem', color: 'var(--col-text)', outline: 'none', fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                        onFocus={e => e.target.style.borderColor = 'rgba(var(--rgb-acc),0.45)'}
                        onBlur={e => e.target.style.borderColor = BD} />
                      <button type="button" onClick={() => setShowNewPass(!showNewPass)}
                        style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--col-text)', opacity: 0.4, padding: 2 }}>
                        {showNewPass ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--col-text)', opacity: 0.45, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, marginBottom: 6 }}>Confirm Password</p>
                    <div style={{ position: 'relative' }}>
                      <Lock size={12} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-text)', opacity: 0.35, pointerEvents: 'none' }} />
                      <input type={showConf ? 'text' : 'password'} value={confirmPass} onChange={e => setConfirmPass(e.target.value)} required
                        placeholder="Repeat new password"
                        style={{ width: '100%', background: 'rgba(var(--rgb-hi),0.04)', border: `1px solid ${BD}`, borderRadius: 10, padding: '11px 40px 11px 36px', fontSize: '0.85rem', color: 'var(--col-text)', outline: 'none', fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                        onFocus={e => e.target.style.borderColor = 'rgba(var(--rgb-acc),0.45)'}
                        onBlur={e => e.target.style.borderColor = BD} />
                      <button type="button" onClick={() => setShowConf(!showConf)}
                        style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--col-text)', opacity: 0.4, padding: 2 }}>
                        {showConf ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button type="button" onClick={() => setChangePwModal(false)} disabled={changingPass}
                      style={{ flex: 1, padding: '0.65rem', borderRadius: 9, background: 'transparent', border: `1px solid ${BD}`, color: 'var(--col-text)', opacity: 0.6, fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', cursor: changingPass ? 'not-allowed' : 'pointer' }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={changingPass || !newPass || !confirmPass}
                      style={{ flex: 1, padding: '0.65rem', borderRadius: 9, border: 'none', background: (newPass && confirmPass) ? 'linear-gradient(135deg, var(--col-acc), var(--col-acc2))' : 'rgba(var(--rgb-hi),0.06)', color: (newPass && confirmPass) ? 'var(--col-bg)' : 'var(--col-text)', fontSize: '0.82rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, cursor: (changingPass || !newPass || !confirmPass) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: changingPass ? 0.6 : 1, transition: 'all 0.2s' }}>
                      {changingPass
                        ? <><div style={{ width: 13, height: 13, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Updating…</>
                        : <><Lock size={12} /> Update</>}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Receipt modal ── */}
      <AnimatePresence>
        {receipt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setReceipt(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>

            <motion.div initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
              id="receipt-print-area"
              style={{ width: '100%', maxWidth: 380, background: 'var(--col-modal)', border: '1px solid rgba(var(--rgb-acc),0.18)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.9)' }}>

              {/* Gold top bar */}
              <div style={{ height: 3, background: 'linear-gradient(90deg, var(--col-acc), #E8D5A3, var(--col-acc2))' }} />

              <div style={{ padding: '24px 26px 26px' }}>

                {/* Brand */}
                <div style={{ textAlign: 'center', marginBottom: 20, paddingBottom: 18, borderBottom: '1px solid rgba(var(--rgb-hi),0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 5 }}>
                    <Scissors size={13} color="var(--col-acc)" />
                    <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.5rem', color: 'var(--col-text)', letterSpacing: '0.04em' }}>
                      Hair<span style={{ color: 'var(--col-acc)' }}>Go</span>
                    </span>
                  </div>
                  <p style={{ fontSize: 15, color: 'var(--col-text)', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif' }}>
                    Premium Hair Studio · Auckland, NZ
                  </p>
                </div>

                {/* Order # + Date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 15, color: 'var(--col-text)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', marginBottom: 4 }}>Order</p>
                    <p style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--col-text)', letterSpacing: '0.1em' }}>#{receipt.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 15, color: 'var(--col-text)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', marginBottom: 4 }}>Date</p>
                    <p style={{ fontSize: 14, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>{format(new Date(receipt.created_at), 'MMM d, yyyy')}</p>
                  </div>
                </div>

                {/* Customer */}
                <div style={{ marginBottom: 18, padding: '10px 12px', background: 'rgba(var(--rgb-hi),0.03)', border: '1px solid rgba(var(--rgb-hi),0.06)', borderRadius: 10 }}>
                  <p style={{ fontSize: 15, color: 'var(--col-text)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', marginBottom: 4 }}>Customer</p>
                  <p style={{ fontSize: 14, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>{profile?.full_name || user?.email}</p>
                </div>

                {/* Items header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 15, color: 'var(--col-text)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif' }}>Item</span>
                  <span style={{ fontSize: 15, color: 'var(--col-text)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif' }}>Amount</span>
                </div>

                {/* Item row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderTop: '1px solid rgba(var(--rgb-hi),0.06)', borderBottom: '1px solid rgba(var(--rgb-hi),0.06)', marginBottom: 14 }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <p style={{ fontSize: 15, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, marginBottom: 3 }}>{receipt.products?.name}</p>
                    <p style={{ fontSize: 15, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif' }}>
                      {receipt.quantity} × ${parseFloat(receipt.products?.price || 0).toFixed(2)}
                    </p>
                  </div>
                  <span style={{ fontSize: 14, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600, flexShrink: 0 }}>
                    ${((parseFloat(receipt.products?.price) || 0) * receipt.quantity).toFixed(2)}
                  </span>
                </div>

                {/* Discount row */}
                {receipt.coupon_code && parseFloat(receipt.discount_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontFamily: 'DM Sans,sans-serif', color: '#34d399' }}>{receipt.coupon_code} — discount</span>
                    <span style={{ fontSize: 13, fontFamily: 'DM Sans,sans-serif', color: '#34d399', fontWeight: 600 }}>−${parseFloat(receipt.discount_amount).toFixed(2)}</span>
                  </div>
                )}

                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <span style={{ fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)', fontWeight: 600 }}>Total</span>
                  <span className="font-display gold-gradient" style={{ fontSize: '1.6rem', lineHeight: 1 }}>
                    {receipt.coupon_code && parseFloat(receipt.discount_amount) > 0
                      ? `$${Math.max(0, ((parseFloat(receipt.products?.price) || 0) * receipt.quantity) - parseFloat(receipt.discount_amount)).toFixed(2)}`
                      : `$${((parseFloat(receipt.products?.price) || 0) * receipt.quantity).toFixed(2)}`}
                  </span>
                </div>

                {/* Payment badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 14px', background: receipt.payment_status === 'paid' ? 'rgba(52,211,153,0.08)' : 'rgba(245,158,11,0.08)', borderRadius: 10, border: `1px solid ${receipt.payment_status === 'paid' ? 'rgba(52,211,153,0.2)' : 'rgba(245,158,11,0.2)'}`, marginBottom: 22 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: receipt.payment_status === 'paid' ? '#34d399' : '#f59e0b', flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontFamily: 'DM Sans,sans-serif', color: receipt.payment_status === 'paid' ? '#34d399' : '#f59e0b', fontWeight: 600, letterSpacing: '0.1em' }}>
                    {receipt.payment_status === 'paid' ? 'Paid via Stripe' : receipt.payment_status === 'pay_in_store' ? 'Pay in store' : 'Payment pending'}
                  </span>
                </div>

                <p style={{ textAlign: 'center', fontSize: 15, color: 'var(--col-text)', fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.14em', marginBottom: 20 }}>
                  Thank you for shopping with HairGo.
                </p>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setReceipt(null)}
                    style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.08)', color: 'var(--col-text)', fontSize: 15, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>
                    Close
                  </button>
                  <button onClick={() => downloadReceipt(receipt)}
                    style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'linear-gradient(135deg, var(--col-acc), var(--col-acc2))', border: 'none', color: 'var(--col-bg)', fontSize: 15, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Download size={12} /> Download PDF
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stripe modal ── */}
      {payStep === 'form' && clientSecret && (
        <StripeCheckout
          clientSecret={clientSecret}
          amount={cartFinalTotal.toFixed(2)}
          label={`${cartItems.length} item${cartItems.length !== 1 ? 's' : ''} from HairGo Store`}
          onSuccess={completeCartPayment}
          onCancel={() => { setPayStep(null); setClientSecret(null) }}
        />
      )}


      {/* ── Contact Us popup ── */}
      <AnimatePresence>
        {contactAppt && (
          <motion.div
            key="contact-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setContactAppt(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          >
            <motion.div
              key="contact-card"
              initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              onClick={e => e.stopPropagation()}
              className="contact-card"
              style={{ width: '100%', maxWidth: 660, borderRadius: 24, background: 'var(--col-modal)', border: `1px solid rgba(var(--rgb-acc),0.14)`, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(var(--rgb-acc),0.06)', maxHeight: '90vh', overflowY: 'auto' }}
            >
              {/* Accent bar */}
              <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, var(--col-acc2) 20%, var(--col-acc) 50%, var(--col-acc2) 80%, transparent)', position: 'sticky', top: 0, zIndex: 2 }} />

              {/* Hero header */}
              <div className="contact-header" style={{ padding: '24px 28px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ display: 'block', fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--col-acc)', marginBottom: 5 }}>Hair Go</span>
                  <span className="font-display contact-title" style={{ fontSize: '1.9rem', color: 'var(--col-text)', letterSpacing: '0.02em', lineHeight: 1.1 }}>Get in Touch</span>
                  <p className="contact-subtitle" style={{ marginTop: 5, fontSize: 13, color: 'var(--col-text)', opacity: 0.45, fontFamily: 'DM Sans,sans-serif', fontWeight: 300 }}>We'll get back to you as soon as possible.</p>
                </div>
                <button onClick={() => setContactAppt(null)}
                  style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(var(--rgb-hi),0.06)', border: `1px solid ${BD}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--col-text)', opacity: 0.55, flexShrink: 0, transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(var(--rgb-hi),0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.background = 'rgba(var(--rgb-hi),0.06)' }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Two-panel body */}
              <div className="contact-panels" style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', padding: '0 0 28px' }}>

                {/* LEFT — call */}
                <div className="contact-left" style={{ padding: '0 28px', display: 'flex', flexDirection: 'column', position: 'relative', textAlign: 'center' }}>
                  {/* "Call Us" pinned top-left */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginBottom: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(var(--rgb-acc),0.1)', border: '1px solid rgba(var(--rgb-acc),0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Phone size={13} color="var(--col-acc)" />
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--col-text)', fontWeight: 600, opacity: 0.7 }}>Call Us</span>
                  </div>

                  {/* Phone + hours centered in remaining space */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 8 }}>
                    <a href="tel:0211555429"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, textDecoration: 'none', padding: '12px 18px', borderRadius: 14, background: 'rgba(var(--rgb-acc),0.07)', border: '1px solid rgba(var(--rgb-acc),0.18)', transition: 'all 0.2s', width: '100%' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--rgb-acc),0.13)'; e.currentTarget.style.borderColor = 'rgba(var(--rgb-acc),0.32)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--rgb-acc),0.07)'; e.currentTarget.style.borderColor = 'rgba(var(--rgb-acc),0.18)' }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--col-acc3), var(--col-acc2))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(var(--rgb-acc),0.3)' }}>
                        <Phone size={15} color="var(--col-bg)" />
                      </div>
                      <span style={{ fontSize: '1.2rem', fontFamily: 'DM Sans,sans-serif', fontWeight: 700, color: 'var(--col-text)', letterSpacing: '0.06em' }}>021 155 5429</span>
                    </a>

                    <div style={{ width: '100%', borderRadius: 12, background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${BD}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[['Mon – Fri', '9:00 – 19:00'], ['Sat – Sun', '10:00 – 18:00']].map(([day, time]) => (
                        <div key={day} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)', opacity: 0.45 }}>{day}</span>
                          <span style={{ fontSize: 12, fontFamily: 'DM Sans,sans-serif', color: 'var(--col-acc)', fontWeight: 500 }}>{time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Divider with OR */}
                <div className="contact-divider" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 0 }}>
                  <div style={{ flex: 1, width: 1, background: `rgba(var(--rgb-hi),0.07)`, minHeight: 40 }} />
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--col-modal)', border: `1px solid rgba(var(--rgb-hi),0.09)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                    <span style={{ fontSize: 10, fontFamily: 'DM Sans,sans-serif', fontWeight: 500, letterSpacing: '0.08em', color: 'var(--col-text)', opacity: 0.35, textTransform: 'uppercase' }}>or</span>
                  </div>
                  <div style={{ flex: 1, width: 1, background: `rgba(var(--rgb-hi),0.07)`, minHeight: 40 }} />
                </div>

                {/* RIGHT — message */}
                <div className="contact-right" style={{ padding: '0 28px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(var(--rgb-acc),0.1)', border: '1px solid rgba(var(--rgb-acc),0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MessageSquare size={13} color="var(--col-acc)" />
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'DM Sans,sans-serif', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--col-text)', fontWeight: 600, opacity: 0.7 }}>Message</span>
                  </div>

                  {/* Appointment pill */}
                  <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 10, background: 'rgba(var(--rgb-acc),0.06)', border: '1px solid rgba(var(--rgb-acc),0.14)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Scissors size={11} color="var(--col-acc)" />
                      <span style={{ fontSize: 12, fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)', opacity: 0.7 }}>{contactAppt.services?.name || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={11} color="var(--col-acc)" />
                      <span style={{ fontSize: 12, fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)', opacity: 0.7 }}>
                        {new Date(contactAppt.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {contactAppt.time ? ` · ${contactAppt.time.slice(0, 5)}` : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Star size={11} color="var(--col-acc)" />
                      <span style={{ fontSize: 12, fontFamily: 'DM Sans,sans-serif', color: 'var(--col-text)', opacity: 0.7 }}>{contactAppt.stylists?.name || 'Any stylist'}</span>
                    </div>
                  </div>

                  <textarea
                    value={contactMsg}
                    onChange={e => setContactMsg(e.target.value)}
                    placeholder="Tell us what you need — cancel, reschedule, or any question…"
                    rows={5}
                    style={{ width: '100%', padding: '13px 14px', borderRadius: 12, background: 'rgba(var(--rgb-hi),0.03)', border: `1px solid ${BD}`, color: 'var(--col-text)', fontSize: 14, fontFamily: 'DM Sans,sans-serif', fontWeight: 300, lineHeight: 1.6, resize: 'none', outline: 'none', transition: 'border-color 0.2s', marginBottom: 12 }}
                    onFocus={e => e.target.style.borderColor = 'rgba(var(--rgb-acc),0.45)'}
                    onBlur={e => e.target.style.borderColor = BD}
                  />

                  <button
                    onClick={handleContactSend}
                    disabled={contactSending || !contactMsg.trim()}
                    style={{ width: '100%', padding: '13px', borderRadius: 12, background: contactMsg.trim() ? 'linear-gradient(135deg, var(--col-acc3) 0%, var(--col-acc2) 50%, var(--col-acc) 100%)' : 'rgba(var(--rgb-hi),0.05)', border: contactMsg.trim() ? 'none' : `1px solid ${BD}`, color: contactMsg.trim() ? 'var(--col-bg)' : 'var(--col-text)', fontSize: 12, fontFamily: 'DM Sans,sans-serif', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: contactMsg.trim() && !contactSending ? 'pointer' : 'not-allowed', opacity: contactSending ? 0.6 : 1, transition: 'all 0.25s', boxShadow: contactMsg.trim() ? '0 8px 24px rgba(var(--rgb-acc),0.25)' : 'none' }}
                  >
                    {contactSending ? 'Sending…' : 'Send Message'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 600px) {
          .profile-tab-panel { min-height: 320px; }
        }

        /* ── Contact popup mobile ── */
        @media (max-width: 540px) {
          .contact-card {
            border-radius: 20px !important;
            margin: 0 !important;
          }
          .contact-header {
            padding: 18px 18px 12px !important;
          }
          .contact-title {
            font-size: 1.5rem !important;
          }
          .contact-subtitle {
            font-size: 12px !important;
          }
          .contact-panels {
            grid-template-columns: 1fr !important;
            padding-bottom: 20px !important;
          }
          .contact-left {
            padding: 0 18px !important;
            align-items: flex-start !important;
            text-align: left !important;
          }

          /* horizontal OR divider */
          .contact-divider {
            flex-direction: row !important;
            height: auto !important;
            margin: 20px 18px !important;
            align-items: center !important;
          }
          .contact-divider > div:first-child,
          .contact-divider > div:last-child {
            flex: 1 !important;
            width: auto !important;
            height: 1px !important;
            min-height: unset !important;
          }

          /* message section stacked (now second on mobile) */
          .contact-right {
            padding: 16px 18px 0 !important;
            border-top: 1px solid rgba(var(--rgb-hi), 0.07) !important;
            align-items: flex-start !important;
          }
        }
      `}</style>
    </div>
  )
}

function CouponCard({ coupon: c, used, expired }) {
  const [copied, setCopied] = useState(false)
  const inactive = used || expired
  function copy() {
    if (!c?.code || inactive) return
    navigator.clipboard.writeText(c.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const discountLabel = c?.discount_type === 'percentage' ? `${c.discount_value}%` : `$${c?.discount_value}`
  const leftBg = used
    ? 'rgba(255,255,255,0.02)'
    : expired
      ? 'rgba(239,68,68,0.06)'
      : 'linear-gradient(160deg, #3D5A73 0%, #B8D4E8 100%)'
  const topLabel = used ? 'Used reward' : expired ? 'Expired reward' : 'Loyalty Reward'
  const topLabelColor = used ? 'rgba(255,255,255,0.25)' : expired ? 'rgba(239,68,68,0.45)' : '#B8D4E8'
  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', opacity: inactive ? 0.6 : 1 }}>
      <div style={{ border: `1px solid ${used ? 'rgba(255,255,255,0.06)' : expired ? 'rgba(239,68,68,0.15)' : 'rgba(184,212,232,0.3)'}`, borderRadius: 16, display: 'flex', overflow: 'hidden', background: '#111116' }}>

        {/* Left: discount badge */}
        <div style={{ flexShrink: 0, width: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 8px', background: leftBg, position: 'relative' }}>
          <span className="font-display" style={{ fontSize: '2.2rem', lineHeight: 1, fontWeight: 400, color: expired ? 'rgba(255,255,255,0.4)' : '#fff' }}>{discountLabel}</span>
          <span style={{ fontSize: 15, letterSpacing: '0.22em', textTransform: 'uppercase', color: expired ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.65)', fontFamily: 'DM Sans,sans-serif', marginTop: 4 }}>OFF</span>
          <div style={{ position: 'absolute', top: -10, right: -10, width: 20, height: 20, borderRadius: '50%', background: '#111116', zIndex: 2 }} />
          <div style={{ position: 'absolute', bottom: -10, right: -10, width: 20, height: 20, borderRadius: '50%', background: '#111116', zIndex: 2 }} />
        </div>

        {/* Perforated divider */}
        <div style={{ width: 1, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 0', position: 'relative' }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ width: 1, height: 5, background: 'rgba(255,255,255,0.1)' }} />)}
          <Scissors size={10} style={{ color: 'rgba(255,255,255,0.22)', position: 'absolute', top: '50%', transform: 'translateY(-50%) rotate(90deg)' }} />
        </div>

        {/* Right: code + info */}
        <div style={{ flex: 1, padding: '16px 16px 16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, minWidth: 0 }}>
          <p style={{ fontSize: 15, letterSpacing: '0.22em', textTransform: 'uppercase', color: topLabelColor, fontFamily: 'DM Sans,sans-serif', margin: 0 }}>{topLabel}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, padding: '7px 12px', borderRadius: 8, minWidth: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ fontFamily: '"Courier New", monospace', fontSize: 15, letterSpacing: '0.14em', color: inactive ? 'rgba(240,240,240,0.4)' : '#f0f0f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{c?.code}</span>
            </div>
            {!inactive && (
              <button onClick={copy} style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, cursor: 'pointer', background: copied ? 'rgba(52,211,153,0.12)' : '#B8D4E8', border: `1px solid ${copied ? 'rgba(52,211,153,0.3)' : 'rgba(184,212,232,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}>
                {copied ? <CheckCheck size={13} color="#34d399" /> : <Copy size={13} color="#0a0a0a" />}
              </button>
            )}
          </div>
          {c?.expiry_date && (
            <p style={{ fontSize: 14, color: expired ? 'rgba(239,68,68,0.55)' : 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans,sans-serif', margin: 0 }}>
              {expired ? 'Expired' : 'Expires'} {format(new Date(c.expiry_date), 'MMM d, yyyy')}
            </p>
          )}
        </div>
      </div>
      {used && (
        <div style={{ position: 'absolute', top: '50%', right: 20, transform: 'translateY(-50%) rotate(-12deg)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '3px 10px' }}>
          <span style={{ fontSize: 14, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Used</span>
        </div>
      )}
      {expired && (
        <div style={{ position: 'absolute', top: '50%', right: 20, transform: 'translateY(-50%) rotate(-12deg)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '3px 10px' }}>
          <span style={{ fontSize: 14, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(239,68,68,0.5)', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Expired</span>
        </div>
      )}
    </div>
  )
}

function CartItemRow({ item, isLast, onRemove, onCommit, onExpired, BD }) {
  const [qty, setQty]         = useState(item.quantity)
  const committedRef          = useRef(item.quantity) // last qty saved to DB
  const debounceRef           = useRef(null)
  const itemRef               = useRef(item)

  useEffect(() => { itemRef.current = item }, [item])

  // Sync local qty if context changes externally (e.g. expiry revert)
  useEffect(() => {
    if (item.quantity !== committedRef.current) {
      setQty(item.quantity)
      committedRef.current = item.quantity
    }
  }, [item.quantity])

  function change(newQty) {
    if (newQty <= 0) { onRemove(itemRef.current); return }
    setQty(newQty) // instant UI
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onCommit(itemRef.current, committedRef.current, newQty)
      committedRef.current = newQty
    }, 400)
  }

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const price = parseFloat(item.products?.price) || 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: isLast ? 'none' : `1px solid ${BD}` }}>
      <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--col-card)', border: `1px solid ${BD}`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {item.products?.image_url
          ? <img src={item.products.image_url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity 0.3s ease' }} onLoad={e => { e.currentTarget.style.opacity = '1' }} />
          : <Package size={16} style={{ color: 'var(--col-text)' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: 'var(--col-text)', fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>
          {item.products?.name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Qty stepper */}
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(var(--rgb-hi),0.05)', border: '1px solid rgba(var(--rgb-hi),0.1)', borderRadius: 8 }}>
            <button
              onClick={() => change(qty - 1)}
              disabled={qty <= 1}
              style={{ width: 30, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: qty <= 1 ? 'var(--col-text)' : 'var(--col-text)', background: 'none', border: 'none', cursor: qty <= 1 ? 'not-allowed' : 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => { if (qty > 1) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => e.currentTarget.style.color = qty <= 1 ? 'var(--col-text)' : 'var(--col-text)'}>
              <Minus size={10} />
            </button>
            <span style={{ width: 26, textAlign: 'center', color: 'var(--col-text)', fontSize: 15, fontWeight: 700, fontFamily: 'DM Sans,sans-serif', userSelect: 'none' }}>
              {qty}
            </span>
            <button
              onClick={() => change(qty + 1)}
              disabled={qty >= (item.products?.stock ?? Infinity)}
              style={{ width: 30, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: qty >= (item.products?.stock ?? Infinity) ? 'var(--col-text)' : 'var(--col-text)', background: 'none', border: 'none', cursor: qty >= (item.products?.stock ?? Infinity) ? 'not-allowed' : 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => { if (qty < (item.products?.stock ?? Infinity)) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => e.currentTarget.style.color = qty >= (item.products?.stock ?? Infinity) ? 'var(--col-text)' : 'var(--col-text)'}>
              <Plus size={10} />
            </button>
          </div>
          <span style={{ color: 'var(--col-acc)', fontSize: 15, fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
            ${(price * qty).toFixed(2)}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <Countdown expiresAt={item.expires_at} onExpired={() => onExpired(item)} />
        <button onClick={() => onRemove(item)}
          style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  )
}

function Pager({ page, total, onChange }) {
  if (total <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 12 }}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.08)', color: page === 0 ? 'var(--col-text)' : 'var(--col-text)', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
        ‹
      </button>

      {Array.from({ length: total }).map((_, i) => (
        <button key={i} onClick={() => onChange(i)}
          style={{ width: 30, height: 30, borderRadius: 8, border: i === page ? '1px solid rgba(var(--rgb-acc),0.4)' : '1px solid rgba(var(--rgb-hi),0.08)', background: i === page ? 'var(--col-acc)' : 'rgba(var(--rgb-hi),0.04)', color: i === page ? 'var(--col-bg)' : 'var(--col-text)', cursor: 'pointer', fontSize: 15, fontFamily: 'DM Sans,sans-serif', fontWeight: i === page ? 700 : 400, transition: 'all 0.2s' }}>
          {i + 1}
        </button>
      ))}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page === total - 1}
        style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(var(--rgb-hi),0.04)', border: '1px solid rgba(var(--rgb-hi),0.08)', color: page === total - 1 ? 'var(--col-text)' : 'var(--col-text)', cursor: page === total - 1 ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
        ›
      </button>
    </div>
  )
}

function EmptyState({ icon: Icon, text, action, link }) {
  const navigate = useNavigate()
  return (
    <div style={{ padding: '36px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Icon size={22} style={{ color: 'var(--col-text)' }} />
      <p style={{ color: 'var(--col-text)', fontSize: 15, textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>{text}</p>
      {action && link && (
        <button onClick={() => navigate(link)} style={{ marginTop: 4, padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(var(--rgb-acc),0.25)', background: 'var(--col-acc)', color: 'var(--col-bg)', fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.14em', cursor: 'pointer' }}>
          {action}
        </button>
      )}
    </div>
  )
}
