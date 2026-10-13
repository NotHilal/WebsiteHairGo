// Supabase returns at most 1000 rows per request. This keeps asking for the
// next page until everything is loaded. `build` must return a fresh query
// (with its filters and order) each time it is called.
const PAGE = 1000

export async function fetchAll(build) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) return { data: rows, error: null }
  }
}
