// @ts-nocheck
// Booking rules shared by create-payment-intent (pay online) and
// book-in-store (pay at the salon). Everything a customer pays or is
// promised is worked out here, never in the browser.

export const TIME_ZONE = 'Pacific/Auckland'

// Opening hours in minutes from midnight. Keep in sync with src/lib/hours.js.
// 0 = Sunday … 6 = Saturday
const OPEN_HOURS = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map(d => [d, { open: 9 * 60, close: 18 * 60 }])
)

export const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

const toMins = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

function nowInNZ() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, mins: (Number(parts.hour) % 24) * 60 + Number(parts.minute) }
}

export function applyDiscount(price: number, c) {
  const value = parseFloat(c.discount_value) || 0
  const discounted = c.discount_type === 'percentage' ? price * (1 - value / 100) : price - value
  return Math.max(0, Math.round(discounted * 100) / 100)
}

export function couponUsable(c) {
  if (!c?.active) return false
  if (c.expiry_date && new Date(c.expiry_date) < new Date()) return false
  if (c.max_uses != null && (c.current_uses ?? 0) >= c.max_uses) return false
  return true
}

async function hasEnoughPoints(admin, userId: string, c) {
  if (!(c.min_points_required > 0)) return true
  if (!userId) return false
  const { data } = await admin.from('profiles').select('points').eq('id', userId).single()
  return (data?.points ?? 0) >= c.min_points_required
}

// A code typed in by the customer: a public promo, or a personal coupon they own
export async function resolveCodeCoupon(admin, userId: string | null, code: string) {
  const { data: c } = await admin.from('coupons').select('*')
    .eq('code', String(code).trim().toUpperCase()).eq('active', true).maybeSingle()
  if (!c || !couponUsable(c)) return null
  let uc = null
  if (userId) {
    const { data } = await admin.from('user_coupons').select('id, used')
      .eq('user_id', userId).eq('coupon_id', c.id).maybeSingle()
    uc = data
  }
  if (uc?.used) return null
  if (!uc && !c.is_public) return null
  if (!(await hasEnoughPoints(admin, userId, c))) return null
  return { coupon: c, userCouponId: uc?.id ?? null }
}

// A coupon card the signed-in customer picked from their account
export async function resolveUserCoupon(admin, userId: string, userCouponId: string) {
  if (!userId || !isUuid(userCouponId)) return null
  const { data: uc } = await admin.from('user_coupons')
    .select('id, used, coupons(*)').eq('id', userCouponId).eq('user_id', userId).maybeSingle()
  const c = uc?.coupons
  if (!uc || uc.used || !couponUsable(c)) return null
  if (!(await hasEnoughPoints(admin, userId, c))) return null
  return { coupon: c, userCouponId: uc.id }
}

export function couponNote(c, finalPrice: number) {
  const off = c.discount_type === 'percentage' ? `${c.discount_value}% off` : `$${c.discount_value} off`
  return `[Coupon: ${c.code} — ${off} · Final: $${finalPrice.toFixed(2)}]`
}

// Checks that a slot can be booked: real service and stylist, inside opening
// hours, not in the past, not blocked, and not overlapping another booking.
// Returns { service } on success or { error, status } on failure.
export async function validateSlot(admin, { serviceId, stylistId, date, time, ignoreAppointmentId = null }) {
  if (!isUuid(serviceId) || !isUuid(stylistId)) return { error: 'Please choose a service and a stylist', status: 400 }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^\d{2}:\d{2}$/.test(time ?? '')) {
    return { error: 'Please choose a date and time', status: 400 }
  }

  const [{ data: service }, { data: stylist }] = await Promise.all([
    admin.from('services').select('id, name, price, duration').eq('id', serviceId).eq('active', true).maybeSingle(),
    admin.from('stylists').select('id, name, profile_id').eq('id', stylistId).maybeSingle(),
  ])
  if (!service) return { error: 'This service is no longer available', status: 404 }
  if (!stylist?.profile_id) return { error: 'This stylist is not taking bookings', status: 404 }

  const duration = service.duration || 60
  const start = toMins(time)
  const end = start + duration

  const hours = OPEN_HOURS[new Date(`${date}T00:00:00Z`).getUTCDay()]
  if (!hours || start < hours.open || end > hours.close) {
    return { error: 'That time is outside our opening hours', status: 400 }
  }

  const now = nowInNZ()
  if (date < now.date || (date === now.date && start <= now.mins)) {
    return { error: 'That time has already passed', status: 400 }
  }

  const [{ data: closed }, { data: blockedHours }, { data: booked }] = await Promise.all([
    admin.from('blocked_dates').select('id').eq('date', date).eq('status', 'approved')
      .or(`stylist_id.is.null,stylist_id.eq.${stylistId}`).limit(1),
    admin.from('blocked_hours').select('hour').eq('date', date)
      .or(`stylist_id.is.null,stylist_id.eq.${stylistId}`),
    admin.from('appointments').select('id, time, duration_minutes').eq('stylist_id', stylistId)
      .eq('date', date).neq('status', 'cancelled'),
  ])
  if (closed?.length) return { error: 'That day is not available', status: 409 }
  if ((blockedHours || []).some(h => { const m = toMins(h.hour); return m >= start && m < end })) {
    return { error: 'That time is not available', status: 409 }
  }
  const clash = (booked || []).some(a => {
    if (a.id === ignoreAppointmentId) return false
    const s = toMins(a.time)
    return start < s + (a.duration_minutes || 60) && end > s
  })
  if (clash) return { error: 'That time slot is no longer available', status: 409 }

  return { service, stylist }
}

// Postgres codes for "slot already taken" (unique index / overlap constraint)
export const isSlotTaken = (err) => err?.code === '23505' || err?.code === '23P01'
