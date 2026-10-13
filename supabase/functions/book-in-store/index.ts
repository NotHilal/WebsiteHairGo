// @ts-nocheck
// Creates a pay-in-store booking for a signed-in customer or a guest. The
// slot, price and coupon are all checked here so the browser can't book
// outside opening hours, over another booking, or with a made-up discount.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { applyDiscount, couponNote, resolveCodeCoupon, resolveUserCoupon, validateSlot, isSlotTaken } from '../_shared/booking.ts'

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limits
const MAX_ATTEMPTS_PER_IP_PER_HOUR = 6
const MAX_UPCOMING_PER_GUEST_EMAIL = 3
const MAX_UPCOMING_PER_USER        = 6

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...CORS, 'Content-Type': 'application/json' }, status,
  })
}

// Names and contact details end up in emails and the studio — keep them plain
const cleanText = (v, max) => String(v ?? '')
  .replace(/https?:\/\/\S+|www\.\S+/gi, '')
  .replace(/[<>]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Signed-in customer if the request carries their JWT, otherwise a guest
  let user = null
  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data } = await userClient.auth.getUser()
    user = data?.user ?? null
  }

  try {
    const { serviceId, stylistId, date, time, notes, couponId, couponCode, guest } = await req.json()

    // ── Rate limit by IP ──────────────────────────────────────────────────
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: attempts } = await admin.from('booking_attempts')
      .select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', hourAgo)
    if ((attempts ?? 0) >= MAX_ATTEMPTS_PER_IP_PER_HOUR) {
      return json({ error: 'Too many bookings from this connection — please call us to book.' }, 429)
    }
    await admin.from('booking_attempts').insert({ ip })

    // ── Who is booking ────────────────────────────────────────────────────
    let guestName = null, guestEmail = null, guestPhone = null
    const today = new Date().toISOString().slice(0, 10)
    if (user) {
      const { count } = await admin.from('appointments').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).neq('status', 'cancelled').gte('date', today)
      if ((count ?? 0) >= MAX_UPCOMING_PER_USER) {
        return json({ error: 'You already have several upcoming bookings — please call us to add more.' }, 429)
      }
    } else {
      guestName  = cleanText(guest?.name, 60)
      guestPhone = cleanText(guest?.phone, 30)
      guestEmail = String(guest?.email ?? '').trim().toLowerCase().slice(0, 120)
      if (!guestName || !guestPhone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
        return json({ error: 'Please fill in your name, phone and email' }, 400)
      }
      const { count } = await admin.from('appointments').select('id', { count: 'exact', head: true })
        .ilike('guest_email', guestEmail).neq('status', 'cancelled').gte('date', today)
      if ((count ?? 0) >= MAX_UPCOMING_PER_GUEST_EMAIL) {
        return json({ error: 'This email already has several upcoming bookings — please call us or sign in.' }, 429)
      }
    }

    // ── Slot ──────────────────────────────────────────────────────────────
    const slot = await validateSlot(admin, { serviceId, stylistId, date, time })
    if (slot.error) return json({ error: slot.error }, slot.status)
    const { service, stylist } = slot

    // ── Coupon ────────────────────────────────────────────────────────────
    const basePrice = parseFloat(service.price)
    const applied = user && couponId
      ? await resolveUserCoupon(admin, user.id, couponId)
      : couponCode ? await resolveCodeCoupon(admin, user?.id ?? null, couponCode) : null
    if ((couponId || couponCode) && !applied) return json({ error: 'That coupon can no longer be used' }, 400)
    const finalPrice = applied ? applyDiscount(basePrice, applied.coupon) : basePrice

    // ── Create the booking ────────────────────────────────────────────────
    const id = crypto.randomUUID()
    const row = {
      id,
      user_id:         user?.id ?? null,
      guest_name:      guestName,
      guest_email:     guestEmail,
      guest_phone:     guestPhone,
      stylist_id:      stylistId,
      service_id:      serviceId,
      date,
      time,
      notes:           [cleanText(notes, 380), applied ? couponNote(applied.coupon, finalPrice) : ''].filter(Boolean).join('\n') || null,
      status:          'confirmed',
      payment_status:  'pay_in_store',
      final_price:     finalPrice,
      discount_amount: applied ? Math.round((basePrice - finalPrice) * 100) / 100 : null,
      coupon_id:       applied?.coupon.id ?? null,
    }
    const { error: insErr } = await admin.from('appointments').insert(row)
    if (isSlotTaken(insErr)) return json({ error: 'That time slot was just taken — please pick another time' }, 409)
    if (insErr) throw insErr

    if (applied) {
      const { data: consumed } = await admin.rpc('consume_coupon', {
        p_coupon_id: applied.coupon.id, p_user_coupon_id: applied.userCouponId,
      })
      if (consumed === false) {
        // Spent on another booking a moment ago — book at the normal price
        await admin.from('appointments').update({
          final_price: basePrice, discount_amount: null, coupon_id: null,
          notes: cleanText(notes, 380) || null,
        }).eq('id', id)
        row.final_price = basePrice
      }
    }

    let who = guestName
    if (user) {
      const { data: prof } = await admin.from('profiles').select('full_name').eq('id', user.id).single()
      who = prof?.full_name || user.email
    }
    await admin.from('activity_logs').insert({
      actor_id:   user?.id ?? null,
      actor_name: who || 'Client',
      actor_role: user ? 'user' : 'guest',
      action:     'appointment.booked',
      entity_type: 'appointment',
      entity_id:  id,
      details: {
        message: `${who || 'A client'} booked ${service.name} with ${stylist.name} on ${date} at ${time} · Pay in store`,
        service: service.name, stylist: stylist.name, date, time, payment_status: 'pay_in_store',
      },
    })

    return json({ ok: true, appointmentId: id, finalPrice: row.final_price })
  } catch (err) {
    console.error('book-in-store error:', err.message)
    return json({ error: 'Could not book appointment — please try again' }, 400)
  }
})
