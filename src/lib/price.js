// What the client pays for a booking: the price the server recorded when it
// was booked, else the coupon note on older bookings, else the list price.
export function apptFinalPrice(appt) {
  if (appt?.final_price != null) return parseFloat(appt.final_price)
  const m = appt?.notes?.match(/Final: \$([0-9.]+)\]/)
  if (m) return parseFloat(m[1])
  return parseFloat(appt?.services?.price || 0)
}

// Price of one store order line at the time of sale (older rows: current price)
export const linePrice = o => parseFloat(o.unit_price ?? o.products?.price) || 0
