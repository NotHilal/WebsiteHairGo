// @ts-nocheck
import Stripe from 'https://esm.sh/stripe@12.18.0?target=deno&no-check=true'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CURRENCY, packItems, fulfilPaymentIntent } from '../_shared/fulfil.ts'
import { applyDiscount, couponNote, resolveCodeCoupon, resolveUserCoupon, validateSlot } from '../_shared/booking.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

// Stripe's minimum charge for NZD
const MIN_CHARGE_CENTS = 50

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...CORS, 'Content-Type': 'application/json' }, status,
  })
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
  if (!user) return json({ error: 'Please sign in to pay online' }, 401)

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

      let applied = null
      if (couponCode) {
        applied = await resolveCodeCoupon(adminClient, user.id, couponCode)
        if (!applied || applied.coupon.discount_type !== 'fixed') {
          return json({ error: 'That coupon can no longer be used' }, 400)
        }
      }
      const subtotal = items.reduce((s, i) => s + parseFloat(i.products.price) * i.quantity, 0)
      const discount = applied ? Math.min(subtotal, parseFloat(applied.coupon.discount_value)) : 0

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
            await adminClient.rpc('increment_product_stock', { p_product_id: t.product_id, p_quantity: t.quantity })
          }
          return json({ error: `Not enough stock for ${i.products.name}` }, 400)
        }
        taken.push(i)
      }

      // The order discount is stored once, on the first item
      const { error: insErr } = await adminClient.from('preorders').insert(items.map((i, n) => ({
        user_id: user.id, product_id: i.product_id, quantity: i.quantity,
        unit_price: parseFloat(i.products.price),
        status: 'active', payment_status: 'pay_in_store', expires_at: expiresAt,
        order_group_id: orderGroupId,
        ...(applied && n === 0 ? { coupon_code: applied.coupon.code, discount_amount: discount } : {}),
      })))
      if (insErr) throw insErr

      if (applied) {
        await adminClient.rpc('consume_coupon', { p_coupon_id: applied.coupon.id, p_user_coupon_id: applied.userCouponId })
      }

      await adminClient.from('cart_items').delete().eq('user_id', user.id)
      return json({ ok: true, orderGroupId })
    }

    // ── Create payment intent ────────────────────────────────────────────────
    let amountCents: number
    let description: string
    let metadata: Record<string, string> = { user_id: user.id }

    if (type === 'appointment') {
      const slot = await validateSlot(adminClient, { serviceId, stylistId, date, time })
      if (slot.error) return json({ error: slot.error }, slot.status)
      const { service } = slot

      const basePrice = parseFloat(service.price)
      const applied = couponId
        ? await resolveUserCoupon(adminClient, user.id, couponId)
        : couponCode ? await resolveCodeCoupon(adminClient, user.id, couponCode) : null
      if ((couponId || couponCode) && !applied) return json({ error: 'That coupon can no longer be used' }, 400)

      const price = applied ? applyDiscount(basePrice, applied.coupon) : basePrice
      if (applied) {
        metadata.coupon_id = applied.coupon.id
        metadata.discount_amount = (basePrice - price).toFixed(2)
        if (applied.userCouponId) metadata.user_coupon_id = applied.userCouponId
      }

      metadata = {
        ...metadata,
        kind: 'appointment',
        service_id: serviceId,
        stylist_id: stylistId,
        date,
        time,
        notes: [String(notes ?? '').slice(0, 380), applied ? couponNote(applied.coupon, price) : ''].filter(Boolean).join('\n'),
      }
      amountCents = Math.round(price * 100)
      description = String(label ?? `Appointment: ${service.name}`).slice(0, 300)

      if (amountCents < MIN_CHARGE_CENTS) {
        return json({ error: 'Your coupon covers this booking — choose "Pay in store" to confirm it.' }, 400)
      }

    } else if (type === 'cart') {
      const { items, error } = await loadCart(adminClient, user.id)
      if (error) return json({ error }, 400)

      let total = items.reduce((s, i) => s + parseFloat(i.products.price) * i.quantity, 0)

      if (couponCode) {
        const applied = await resolveCodeCoupon(adminClient, user.id, couponCode)
        if (!applied || applied.coupon.discount_type !== 'fixed') {
          return json({ error: 'That coupon can no longer be used' }, 400)
        }
        const discount = Math.min(total, parseFloat(applied.coupon.discount_value))
        total -= discount
        metadata.coupon_id = applied.coupon.id
        metadata.coupon_code = applied.coupon.code
        metadata.discount_amount = discount.toFixed(2)
        if (applied.userCouponId) metadata.user_coupon_id = applied.userCouponId
      }

      metadata = { ...metadata, kind: 'cart', ...packItems(items) }
      amountCents = Math.round(total * 100)
      description = String(label ?? `HairGo Store — ${items.length} item${items.length !== 1 ? 's' : ''}`).slice(0, 300)

      if (amountCents < MIN_CHARGE_CENTS) {
        return json({ error: 'Your coupon covers this order — choose "Pay in store" to reserve it.' }, 400)
      }

    } else {
      return json({ error: 'type must be "appointment", "cart", "finalize" or "reserve-cart"' }, 400)
    }

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
