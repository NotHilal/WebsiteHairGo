import { differenceInMinutes } from 'date-fns'

// Unpaid break deducted from a shift of 6 hours or more
export const BREAK_THRESHOLD_MINS = 6 * 60
export const BREAK_MINS = 30

// Paid minutes for one timesheet entry (0 while still clocked in)
export function sheetMins(t) {
  if (!t.clock_out) return 0
  const raw = Math.max(0, differenceInMinutes(new Date(t.clock_out), new Date(t.clock_in)))
  return raw >= BREAK_THRESHOLD_MINS ? raw - BREAK_MINS : raw
}

export const breakLabel = t => {
  if (!t.clock_out) return 'None'
  const raw = differenceInMinutes(new Date(t.clock_out), new Date(t.clock_in))
  return raw >= BREAK_THRESHOLD_MINS ? `${BREAK_MINS} min` : 'None'
}
