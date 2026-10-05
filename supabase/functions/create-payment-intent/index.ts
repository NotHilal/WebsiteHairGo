// @ts-nocheck
import Stripe from 'https://esm.sh/stripe@12.18.0?target=deno&no-check=true'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CURRENCY, packItems, fulfilPaymentIntent } from '../_shared/fulfil.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...CORS, 'Content-Type': 'application/json' }, status,
  })
}

const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

function applyDiscount(price: number, c) {
  return c.discount_type === 'percentage'
    ? Math.max(0, price * (1 - c.discount_value / 100))
    : Math.max(0, price - parseFloat(c.discount_value))
}

function couponUsable(c) {
  if (!c?.active) return false
  if (c.expiry_date && new Date(c.expiry_date) < new Date()) return false
  if (c.max_uses != null && (c.current_uses ?? 0) >= c.max_uses) return false
  return true
}

// A code typed in by the customer: a public promo, or a personal coupon they own
async function resolveCodeCoupon(admin, userId: string, code: string) {
  const { data: c } = await admin.from('coupons').select('*')
    .eq('code', String(code).trim().toUpperCase()).eq('active', true).maybeSingle()
  if (!c || !couponUsable(c)) return null
  const { data: uc } = await admin.from('user_coupons').select('id, used')
    .eq('user_id', userId).eq('coupon_id', c.id).maybeSingle()
  if (uc?.used) return null
  if (!uc && !c.is_public) return null
  return { coupon: c, userCouponId: uc?.id ?? null }
}

async function loadCart(admin, userId: string) {
  const { data: items, error } = await admin
    .from('cart_items')
    .select('product_id, quantity, products(id, name, price, stock, available)')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
  if (error || !items?.length) return { error: 'Cart is empty or expired' }
  for (const item of items) {
    if (!(item.quantity > 0)) return { error: 'Invalid quantity in cart' }
    if (!item.products?.available) return { error: 'A product in your cart is no longer available' }
    if ((item.products?.stock ?? 0) < item.quantity) return { error: 'Insufficient stock for one or more items' }
  }
  return { items }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const body = await req.json()
    const { type, serviceId, stylistId, date, time, notes, couponId, couponCode, paymentIntentId, label } = body

    // ── Finalize a paid checkout ─────────────────────────────────────────────
    // Called by the browser after Stripe confirms the card payment. The
    // booking/order is created here from the PaymentIntent's own metadata.
    if (type === 'finalize') {
      if (!paymentIntentId) return json({ error: 'paymentIntentId required' }, 400)
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (pi.metadata?.user_id !== user.id) return json({ error: 'Payment not found' }, 404)
      return json(await fulfilPaymentIntent(stripe, adminClient, pi))
    }

    // ── Reserve cart items to pay in store ───────────────────────────────────
    if (type === 'reserve-cart') {
      const { items, error } = await loadCart(adminClient, user.id)
      if (error) return json({ error }, 400)

      const orderGroupId = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      // Take the stock first so two customers can't reserve the last item
      const taken = []
      for (const i of items) {
        const { error: stockErr } = await adminClient.rpc('decrement_product_stock', {
          p_product_id: i.product_id, p_quantity: i.quantity,
        })
        if (stockErr) {
          for (const t of taken) {
            const { data: p } = await adminClient.from('products').select('stock').eq('id', t.product_id).single()
            await adminClient.from('products').update({ stock: (p?.stock ?? 0) + t.quantity }).eq('id', t.product_id)
          }
          return json({ error: `Not enough stock for ${i.products.name}` }, 400)
        }
        taken.push(i)
      }

      const { error: insErr } = await adminClient.from('preorders').insert(items.map(i => ({
        user_id: user.id, product_id: i.product_id, quantity: i.quantity,
        status: 'active', payment_status: 'pay_in_store', expires_at: expiresAt,
        order_group_id: orderGroupId,
      })))
      if (insErr) throw insErr

      await adminClient.from('cart_items').delete().eq('user_id', user.id)
      return json({ ok: true, orderGroupId })
    }

    // ── Mark coupon used (pay-in-store booking) ──────────────────────────────
    // No Stripe payment involved — staff apply the discount in the salon.
    if (type === 'mark-coupon-used') {
      if (!couponId) return json({ error: 'couponId required' }, 400)
      const { data: uc } = await adminClient.from('user_coupons')
        .select('coupon_id, used').eq('id', couponId).eq('user_id', user.id).single()
      if (uc && !uc.used) {
        await adminClient.rpc('consume_coupon', { p_coupon_id: uc.coupon_id, p_user_coupon_id: couponId })
      }
      return json({ ok: true })
    }

    // ── Create payment intent ────────────────────────────────────────────────
    let amountCents: number
    let description: string
    let metadata: Record<string, string> = { user_id: user.id }

    if (type === 'appointment') {
      if (!isUuid(serviceId) || !isUuid(stylistId)) return json({ error: 'serviceId and stylistId are required' }, 400)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^\d{2}:\d{2}$/.test(time ?? '')) {
        return json({ error: 'date (YYYY-MM-DD) and time (HH:MM) are required' }, 400)
      }
      const todayNZ = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
      if (date < todayNZ) return json({ error: 'That date is in the past' }, 400)

      const { data: service } = await adminClient.from('services')
        .select('price, name').eq('id', serviceId).eq('active', true).maybeSingle()
      if (!service) return json({ error: 'Service not found' }, 404)

      const { data: stylist } = await adminClient.from('stylists')
        .select('id').eq('id', stylistId).maybeSingle()
      if (!stylist) return json({ error: 'Stylist not found' }, 404)

      const { data: clash } = await adminClient.from('appointments').select('id')
        .eq('stylist_id', stylistId).eq('date', date).eq('time', time)
        .neq('status', 'cancelled').limit(1)
      if (clash?.length) return json({ error: 'That time slot is no longer available' }, 409)

      const basePrice = parseFloat(service.price)
      let price = basePrice
      let applied = null  // { coupon, userCouponId }

      if (couponId) {
        const { data: uc } = await adminClient.from('user_coupons')
          .select('id, used, coupons(*)').eq('id', couponId).eq('user_id', user.id).maybeSingle()
        const c = uc?.coupons
        if (uc && !uc.used && couponUsable(c)) {
          let canApply = true
          if (c.min_points_required > 0) {
            const { data: prof } = await adminClient.from('profiles').select('points').eq('id', user.id).single()
            if ((prof?.points ?? 0) < c.min_points_required) canApply = false
          }
          if (canApply) applied = { coupon: c, userCouponId: uc.id }
        }
      } else if (couponCode) {
        applied = await resolveCodeCoupon(adminClient, user.id, couponCode)
      }

      let couponNote = ''
      if (applied) {
        const c = applied.coupon
        price = applyDiscount(basePrice, c)
        couponNote = `[Coupon: ${c.code} — ${c.discount_type === 'percentage' ? `${c.discount_value}% off` : `$${c.discount_value} off`} · Final: $${price.toFixed(2)}]`
        metadata.coupon_id = c.id
        if (applied.userCouponId) metadata.user_coupon_id = applied.userCouponId
      }

      metadata = {
        ...metadata,
        kind: 'appointment',
        service_id: serviceId,
        stylist_id: stylistId,
        date,
        time,
        notes: [String(notes ?? '').slice(0, 380), couponNote].filter(Boolean).join('\n'),
      }
      amountCents = Math.round(price * 100)
      description = String(label ?? `Appointment: ${service.name}`).slice(0, 300)

    } else if (type === 'cart') {
      const { items, error } = await loadCart(adminClient, user.id)
      if (error) return json({ error }, 400)

      let total = items.reduce((s, i) => s + parseFloat(i.products.price) * i.quantity, 0)

      if (couponCode) {
        const applied = await resolveCodeCoupon(adminClient, user.id, couponCode)
        if (applied && applied.coupon.discount_type === 'fixed') {
          total = Math.max(0, total - parseFloat(applied.coupon.discount_value))
          metadata.coupon_id = applied.coupon.id
          metadata.coupon_code = applied.coupon.code
          metadata.discount_amount = String(applied.coupon.discount_value)
          if (applied.userCouponId) metadata.user_coupon_id = applied.userCouponId
        }
      }

      metadata = { ...metadata, kind: 'cart', ...packItems(items) }
      amountCents = Math.round(total * 100)
      description = String(label ?? `HairGo Store — ${items.length} item${items.length !== 1 ? 's' : ''}`).slice(0, 300)

    } else {
      return json({ error: 'type must be "appointment", "cart", "finalize", "reserve-cart" or "mark-coupon-used"' }, 400)
    }

    if (amountCents <= 0) return json({ error: 'Amount must be positive' }, 400)
    if (!Deno.env.get('STRIPE_SECRET_KEY')) return json({ error: 'Stripe not configured' }, 500)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: CURRENCY,
      description,
      metadata,
      payment_method_types: ['card'],
    })

    return json({ client_secret: paymentIntent.client_secret, payment_intent_id: paymentIntent.id })

  } catch (err) {
    console.error('create-payment-intent error:', err.message)
    return json({ error: 'Something went wrong — please try again' }, 400)
  }
})
