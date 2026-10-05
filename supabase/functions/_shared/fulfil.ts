// @ts-nocheck
// Turns a succeeded Stripe PaymentIntent into the appointment or store order
// it paid for. Used by create-payment-intent (the browser's "finalize" call)
// and by stripe-webhook (in case the browser closes before finalizing).
//
// Everything written here comes from the PaymentIntent's metadata, which only
// create-payment-intent sets — the browser can't mark anything as paid itself.

export const CURRENCY = 'nzd'

// Stripe metadata values max out at 500 chars, so cart items are split across keys
export function packItems(items: { product_id: string; quantity: number }[]) {
  const s = items.map(i => `${i.product_id}:${i.quantity}`).join(',')
  const out: Record<string, string> = {}
  for (let i = 0, n = 0; i < s.length; i += 450, n++) out[`items_${n}`] = s.slice(i, i + 450)
  return out
}

function unpackItems(md: Record<string, string>) {
  let s = ''
  for (let n = 0; md[`items_${n}`] !== undefined; n++) s += md[`items_${n}`]
  if (!s) return []
  return s.split(',').map(p => {
    const [product_id, q] = p.split(':')
    return { product_id, quantity: parseInt(q, 10) }
  })
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function findAppointment(admin, piId: string) {
  // Another caller (webhook vs browser) may be mid-way through creating it
  for (let i = 0; i < 6; i++) {
    const { data } = await admin.from('appointments').select('id')
      .eq('payment_intent_id', piId).order('created_at').limit(1).maybeSingle()
    if (data) return data.id
    await sleep(500)
  }
  return null
}

export async function fulfilPaymentIntent(stripe, admin, pi) {
  if (pi.status !== 'succeeded') return { ok: false, error: 'Payment not confirmed' }
  if (pi.currency !== CURRENCY) return { ok: false, error: 'Unexpected payment currency' }

  const md = pi.metadata ?? {}
  if (md.kind !== 'appointment' && md.kind !== 'cart') return { ok: false, error: 'Unknown payment' }

  // Claim the payment — only the first caller creates the booking/order
  const { error: claimErr } = await admin.from('fulfilled_payments')
    .insert({ payment_intent_id: pi.id, kind: md.kind, user_id: md.user_id || null })
  if (claimErr) {
    if (claimErr.code !== '23505') throw claimErr
    if (md.kind === 'appointment') {
      const appointmentId = await findAppointment(admin, pi.id)
      if (!appointmentId) return { ok: false, error: 'This payment was refunded or could not be booked — please contact us' }
      return { ok: true, appointmentId }
    }
    return { ok: true }
  }

  try {
    return md.kind === 'appointment'
      ? await fulfilAppointment(stripe, admin, pi, md)
      : await fulfilCart(admin, pi, md)
  } catch (err) {
    // Release the claim so the webhook retry / browser can try again
    await admin.from('fulfilled_payments').delete().eq('payment_intent_id', pi.id)
    throw err
  }
}

async function fulfilAppointment(stripe, admin, pi, md) {
  const { data, error } = await admin.from('appointments').insert({
    user_id:           md.user_id,
    stylist_id:        md.stylist_id,
    service_id:        md.service_id,
    date:              md.date,
    time:              md.time,
    notes:             md.notes || null,
    status:            'confirmed',
    payment_status:    'paid',
    payment_intent_id: pi.id,
  }).select('id').single()

  if (error) {
    if (error.code === '23505') {
      // Someone booked the same slot while this customer was paying
      await stripe.refunds.create({ payment_intent: pi.id })
      return { ok: false, refunded: true, error: 'That time slot was just taken by someone else — your payment has been fully refunded. Please pick another time.' }
    }
    throw error
  }

  if (md.coupon_id) {
    const { data: consumed } = await admin.rpc('consume_coupon', {
      p_coupon_id: md.coupon_id, p_user_coupon_id: md.user_coupon_id || null,
    })
    if (consumed === false) {
      // Same coupon was spent on another payment first — flag it for staff
      await admin.from('appointments')
        .update({ notes: [md.notes, '⚠ Coupon was already used on another booking — collect the discount difference in store.'].filter(Boolean).join('\n') })
        .eq('id', data.id)
    }
  }

  return { ok: true, appointmentId: data.id }
}

async function fulfilCart(admin, pi, md) {
  const items = unpackItems(md)
  if (!items.length) return { ok: false, error: 'Order has no items' }

  const orderGroupId = crypto.randomUUID()
  const { error } = await admin.from('preorders').insert(items.map(i => ({
    user_id:           md.user_id,
    product_id:        i.product_id,
    quantity:          i.quantity,
    status:            'active',
    payment_status:    'paid',
    payment_intent_id: pi.id,
    order_group_id:    orderGroupId,
    ...(md.coupon_code ? { coupon_code: md.coupon_code, discount_amount: parseFloat(md.discount_amount) } : {}),
  })))
  if (error) throw error

  for (const i of items) {
    const { error: stockErr } = await admin.rpc('decrement_product_stock', {
      p_product_id: i.product_id, p_quantity: i.quantity,
    })
    // Already paid — staff will see the order and can sort out the shortfall
    if (stockErr) console.error('stock decrement failed:', i.product_id, stockErr.message)
  }

  await admin.from('cart_items').delete()
    .eq('user_id', md.user_id).in('product_id', items.map(i => i.product_id))

  if (md.coupon_id) {
    await admin.rpc('consume_coupon', { p_coupon_id: md.coupon_id, p_user_coupon_id: md.user_coupon_id || null })
  }

  return { ok: true, orderGroupId }
}
