import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function insertCreator(data: Record<string, unknown>) {
  const { error } = await supabase.from('creators').insert(data);
  if (error?.code === '23503') {
    console.log('[creators/signup] FK violation, retrying after 2s delay...');
    await new Promise(r => setTimeout(r, 2000));
    return await supabase.from('creators').insert(data);
  }
  return { error };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { inviteId, userId, creatorName, email, commissionRate, affiliateCode } = body;

  console.log('[creators/signup] Received:', { inviteId, userId, creatorName, email, commissionRate, affiliateCode });

  if (!inviteId || !userId || !creatorName || !email) {
    console.log('[creators/signup] Missing required fields');
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { error: creatorError } = await insertCreator({
    invite_id: inviteId,
    user_id: userId,
    creator_name: creatorName,
    email,
    commission_rate: commissionRate,
    affiliate_code: affiliateCode,
  });

  if (creatorError) {
    console.log('[creators/signup] Insert error:', creatorError.message, creatorError.details, creatorError.code);
    return NextResponse.json({ error: creatorError.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from('creator_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', inviteId);

  if (updateError) {
    console.log('[creators/signup] Invite update error:', updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  console.log('[creators/signup] Success for user:', userId);
  return NextResponse.json({ success: true });
}
