import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get('handle');
  if (!handle) {
    return NextResponse.json({ error: 'handle is required' }, { status: 400 });
  }

  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!adAccountId || !accessToken) {
    return NextResponse.json({ ads: [], error: 'Meta API not configured' });
  }

  const filtering = JSON.stringify([
    { field: 'name', operator: 'STARTS_WITH', value: `${handle}//` },
  ]);

  const url = `https://graph.facebook.com/v19.0/${adAccountId}/ads?` +
    `fields=name,status,insights.date_preset(lifetime){spend},creative{thumbnail_url}` +
    `&filtering=${encodeURIComponent(filtering)}` +
    `&limit=50` +
    `&access_token=${accessToken}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      console.log('[meta/creator-ads] API error:', data.error.message);
      return NextResponse.json({ ads: [], error: data.error.message });
    }

    const ads = (data.data || []).map((ad: any) => ({
      name: ad.name?.replace(`${handle}//`, '') || ad.name,
      status: ad.status,
      spend: ad.insights?.data?.[0]?.spend || '0.00',
      thumbnail: ad.creative?.thumbnail_url || null,
    }));

    return NextResponse.json({ ads });
  } catch (err: any) {
    console.log('[meta/creator-ads] Fetch error:', err.message);
    return NextResponse.json({ ads: [], error: err.message });
  }
}
