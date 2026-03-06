import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle');
  if (!handle) {
    return NextResponse.json({ error: 'handle is required' }, { status: 400 });
  }

  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!adAccountId || !accessToken) {
    return NextResponse.json({ ads: [], totals: { spend: 0, impressions: 0 }, monthly: [], error: 'Meta API not configured' });
  }

  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const filtering = JSON.stringify([
    { field: 'name', operator: 'CONTAIN', value: handle },
  ]);

  // Fetch ads with all-time insights + monthly breakdown
  const fields = 'name,status,creative{thumbnail_url},insights.date_preset(maximum){spend,impressions}';

  const url = `https://graph.facebook.com/v19.0/${actId}/ads?` +
    `fields=${fields}` +
    `&filtering=${encodeURIComponent(filtering)}` +
    `&limit=50` +
    `&access_token=${accessToken}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    console.log(`[creator-ads] handle="${handle}" filter=${filtering} results=${data.data?.length ?? 0}`, data.error ? `error: ${data.error.message}` : '');

    if (data.error) {
      return NextResponse.json({ ads: [], totals: { spend: 0, impressions: 0 }, monthly: [], error: data.error.message });
    }

    // Fetch monthly breakdown at ad-account level for this creator's ads
    const monthlyInsightsUrl = `https://graph.facebook.com/v19.0/${actId}/insights?` +
      `fields=spend,impressions` +
      `&filtering=${encodeURIComponent(filtering)}` +
      `&time_increment=monthly` +
      `&date_preset=last_3d` + // will try last_90d below
      `&level=account` +
      `&access_token=${accessToken}`;

    // Actually, Meta doesn't support filtering on account-level insights.
    // Instead, get monthly insights per ad and aggregate.
    const adIds = (data.data || []).map((ad: any) => ad.id);
    let monthly: { month: string; spend: number; impressions: number }[] = [];

    if (adIds.length > 0) {
      // Fetch last 90 days of insights per ad with monthly granularity
      const monthlyPromises = adIds.map(async (adId: string) => {
        const mUrl = `https://graph.facebook.com/v19.0/${adId}/insights?` +
          `fields=spend,impressions` +
          `&time_increment=monthly` +
          `&date_preset=last_90d` +
          `&access_token=${accessToken}`;
        try {
          const mRes = await fetch(mUrl);
          const mData = await mRes.json();
          return mData.data || [];
        } catch {
          return [];
        }
      });

      const allMonthlyData = await Promise.all(monthlyPromises);
      const monthMap: Record<string, { spend: number; impressions: number }> = {};

      for (const adMonthly of allMonthlyData) {
        for (const row of adMonthly) {
          // date_start is like "2026-01-01"
          const monthKey = row.date_start?.substring(0, 7); // "2026-01"
          if (!monthMap[monthKey]) monthMap[monthKey] = { spend: 0, impressions: 0 };
          monthMap[monthKey].spend += parseFloat(row.spend || '0');
          monthMap[monthKey].impressions += parseInt(row.impressions || '0');
        }
      }

      monthly = Object.entries(monthMap)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, vals]) => ({ month, ...vals }));
    }

    let totalSpend = 0;
    let totalImpressions = 0;

    const ads = await Promise.all((data.data || []).map(async (ad: any) => {
      let displayName = ad.name || '';
      displayName = displayName
        .replace(new RegExp(`@?${handle}\\s*\\/\\/\\s*`, 'i'), '')
        .trim();

      const thumbnailUrl = ad.creative?.thumbnail_url || null;

      let previewHtml = null;
      try {
        const previewRes = await fetch(
          `https://graph.facebook.com/v19.0/${ad.id}/previews?ad_format=MOBILE_FEED_STANDARD&access_token=${accessToken}`
        );
        const previewData = await previewRes.json();
        previewHtml = previewData.data?.[0]?.body || null;
      } catch {}

      const insights = ad.insights?.data?.[0];
      const spend = parseFloat(insights?.spend || '0');
      const impressions = parseInt(insights?.impressions || '0');

      totalSpend += spend;
      totalImpressions += impressions;

      return {
        name: displayName,
        status: ad.status,
        spend: spend.toFixed(2),
        impressions: String(impressions),
        thumbnailUrl,
        previewHtml,
      };
    }));

    return NextResponse.json({
      ads,
      totals: { spend: totalSpend, impressions: totalImpressions },
      monthly,
    });
  } catch (err: any) {
    return NextResponse.json({ ads: [], totals: { spend: 0, impressions: 0 }, monthly: [], error: err.message });
  }
}
