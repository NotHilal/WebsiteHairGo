// Salon opening hours. Keep in sync with supabase/functions/_shared/booking.ts.
// Keys are getDay() values: 0 = Sunday … 6 = Saturday. Times in minutes.
export const OPEN_HOURS = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map(d => [d, { open: 9 * 60, close: 18 * 60 }])
)

export const HOURS_LABELS = [
  { day: 'Mon – Sun', time: '9:00 – 18:00' },
]

// Every bookable start time the salon offers (hourly)
export const SLOTS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00']

export const toMins = hhmm => {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

// Start times on `date` where a `durationMins` service fits inside opening hours
export function slotsForDay(date, durationMins = 60) {
  const hours = OPEN_HOURS[date.getDay()]
  if (!hours) return []
  return SLOTS.filter(s => toMins(s) >= hours.open && toMins(s) + durationMins <= hours.close)
}
