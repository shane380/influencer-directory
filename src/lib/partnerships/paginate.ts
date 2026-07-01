// Fetch EVERY row from a Supabase query, defeating PostgREST's default 1000-row
// cap. The per-ad-per-day tables (creator_ad_performance_daily) and the daily
// revenue table easily exceed 1000 rows over a multi-week window, so a single
// .select() silently truncates the result and undercounts the totals.
//
// `makeQuery(from, to)` must apply `.range(from, to)` and a STABLE `.order()`
// (order by the unique "id" column) so consecutive pages never skip or overlap.
export async function fetchAllRows<T = any>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const out: T[] = [];
  for (;;) {
    const { data, error } = await makeQuery(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}
