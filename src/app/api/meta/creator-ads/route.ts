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

  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

  const filtering = JSON.stringify([
    { field: 'name', operator: 'CONTAIN', value: handle },
  ]);

  const fields = 'name,status,creative{thumbnail_url,image_url,video_id},insights.date_preset(maximum){spend,impressions}';

  const url = `https://graph.facebook.com/v19.0/${actId}/ads?` +
    `fields=${fields}` +
    `&filtering=${encodeURIComponent(filtering)}` +
    `&limit=50` +
    `&access_token=${accessToken}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      return NextResponse.json({ ads: [], error: data.error.message });
    }

    const ads = await Promise.all((data.data || []).map(async (ad: any) => {
      // Strip handle prefix patterns: "@handle // " or "handle // " or "handle//"
      let displayName = ad.name || '';
      displayName = displayName
        .replace(new RegExp(`@?${handle}\\s*\\/\\/\\s*`, 'i'), '')
        .trim();

      // Resolve thumbnail
      let thumbnail = null;
      const creative = ad.creative;
      if (creative?.video_id && accessToken) {
        try {
          const thumbRes = await fetch(
            `https://graph.facebook.com/v19.0/${creative.video_id}/thumbnails?access_token=${accessToken}`
          );
          const thumbData = await thumbRes.json();
          thumbnail = thumbData.data?.[0]?.uri || null;
        } catch {}
      }
      if (!thumbnail && creative?.image_url) {
        thumbnail = creative.image_url;
      }
      if (!thumbnail && creative?.thumbnail_url) {
        thumbnail = creative.thumbnail_url;
      }

      const insights = ad.insights?.data?.[0];

      return {
        name: displayName,
        status: ad.status,
        spend: insights?.spend || '0.00',
        impressions: insights?.impressions || '0',
        thumbnail,
      };
    }));

    return NextResponse.json({ ads });
  } catch (err: any) {
    return NextResponse.json({ ads: [], error: err.message });
  }
}
