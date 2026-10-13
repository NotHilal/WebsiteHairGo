// @ts-nocheck
import Stripe from 'https://esm.sh/stripe@12.18.0?target=deno&no-check=true'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  // Admins and managers can cancel/refund anything; artists only appointments
  // with their own linked stylist profile.
  const { data: caller } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
  const role = caller?.role
  if (role !== 'admin' && role !== 'manager' && role !== 'artist') return json({ error: 'Forbidden' }, 403)

  try {
    const { type, id, refundPct: rawPct = 100 } = await req.json()
    const refundPct = Math.min(100, Math.max(0, Number(rawPct) || 0))
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return json({ error: 'Invalid id' }, 400)

    if (role === 'artist') {
      if (type === 'order' || type === 'cancel-with-credit') return json({ error: 'Forbidden' }, 403)
      const { data: appt } = await adminClient.from('appointments')
        .select('stylists(profile_id)').eq('id', id).maybeSingle()
      if ((appt as any)?.stylists?.profile_id !== user.id) return json({ error: 'Forbidden' }, 403)
    }

    if (type === 'cancel-with-credit') {
      // Cancel appointment and issue a store-credit coupon for 100% of what was paid.
      const { data: appt, error } = await adminClient
        .from('appointments')
        .select('id, payment_intent_id, payment_status, status, user_id, services(price)')
        .eq('id', id)
        .single()

      if (error || !appt) return json({ error: 'Appointment not found' }, 404)
      if (appt.status === 'cancelled') return json({ error: 'Already cancelled' }, 400)

      // Credit is only owed for money actually paid online
      if (appt.payment_status !== 'paid' || !appt.payment_intent_id) {
        return json({ error: 'This booking was not paid online — cancel it instead' }, 400)
      }
      if (!appt.user_id) return json({ error: 'Guest bookings can only be refunded' }, 400)
      const pi = await stripe.paymentIntents.retrieve(appt.payment_intent_id)
      const creditAmount = pi.amount / 100

      let couponCode: string | null = null
      if (creditAmount > 0) {
        const code = `CREDIT${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
        const expiry = new Date()
        expiry.setFullYear(expiry.getFullYear() + 1)
        const { data: coupon } = await adminClient.from('coupons').insert({
          code,
          discount_type: 'fixed',
          discount_value: creditAmount,
          active: true,
          max_uses: 1,
          current_uses: 0,
          is_public: false,
          expiry_date: expiry.toISOString().split('T')[0],
        }).select('id').single()

        if (coupon) {
          await adminClient.from('user_coupons').insert({
            user_id: appt.user_id,
            coupon_id: (coupon as any).id,
            used: false,
            granted_by: 'admin',
          })
          couponCode = code
        }
      }

      if (!couponCode) return json({ error: 'Could not create the store credit' }, 500)
      await adminClient.from('appointments').update({ status: 'cancelled', payment_status: 'credited' }).eq('id', id)
      return json({ ok: true, couponCode, creditAmount })
    }

    if (type === 'appointment') {
      const { data: appt, error } = await adminClient
        .from('appointments')
        .select('id, payment_intent_id, payment_status, status')
        .eq('id', id)
        .single()

      if (error || !appt) return json({ error: 'Appointment not found' }, 404)
      if (appt.status === 'cancelled') return json({ error: 'Already cancelled' }, 400)

      // Refund if paid via Stripe
      if (appt.payment_status === 'paid' && appt.payment_intent_id) {
        const pi = await stripe.paymentIntents.retrieve(appt.payment_intent_id)
        const refundAmount = Math.round(pi.amount * refundPct / 100)
        await stripe.refunds.create({ payment_intent: appt.payment_intent_id, amount: refundAmount })
        await adminClient
          .from('appointments')
          .update({ status: 'cancelled', payment_status: 'refunded' })
          .eq('id', id)
        return json({ refunded: true })
      }

      // Not paid via Stripe — just cancel
      await adminClient.from('appointments').update({ status: 'cancelled' }).eq('id', id)
      return json({ refunded: false })

    } else if (type === 'order') {
      // id here is the payment_intent_id (group key)
      const { data: items, error } = await adminClient
        .from('preorders')
        .select('id, product_id, quantity, payment_intent_id, payment_status, status, order_group_id')
        .or(`payment_intent_id.eq.${id},order_group_id.eq.${id}`)

      if (error || !items?.length) return json({ error: 'Order not found' }, 404)

      const first = items[0]
      const alreadyCancelled = items.every(i => i.status === 'cancelled')
      if (alreadyCancelled) return json({ error: 'Already cancelled' }, 400)

      const ids = items.map(i => i.id)

      // Items still waiting for pickup go back on the shelf. Expired holds were
      // already restocked by the nightly job; picked-up items left the store.
      async function restockActive() {
        for (const i of items) {
          if (i.status === 'active' && i.product_id && i.quantity > 0) {
            await adminClient.rpc('increment_product_stock', { p_product_id: i.product_id, p_quantity: i.quantity })
          }
        }
      }

      // Refund if paid via Stripe (one refund covers the whole payment intent)
      if (first.payment_status === 'paid' && first.payment_intent_id) {
        const pi = await stripe.paymentIntents.retrieve(first.payment_intent_id)
        const refundAmount = Math.round(pi.amount * refundPct / 100)
        await stripe.refunds.create({ payment_intent: first.payment_intent_id, amount: refundAmount })
        await adminClient
          .from('preorders')
          .update({ status: 'cancelled', payment_status: 'refunded' })
          .in('id', ids)
        await restockActive()
        return json({ refunded: true })
      }

      // Not paid via Stripe — just cancel
      await adminClient.from('preorders').update({ status: 'cancelled' }).in('id', ids)
      await restockActive()
      return json({ refunded: false })

    } else {
      return json({ error: 'type must be "appointment", "cancel-with-credit" or "order"' }, 400)
    }

  } catch (err) {
    console.error('process-refund error:', err.message)
    return json({ error: 'Could not process the cancellation — please try again' }, 500)
  }
})
