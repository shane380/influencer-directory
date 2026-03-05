import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { inviteId, userId, creatorName, email, commissionRate, affiliateCode } = body;

  if (!inviteId || !userId || !creatorName || !email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { error: creatorError } = await supabase.from('creators').insert({
    invite_id: inviteId,
    user_id: userId,
    creator_name: creatorName,
    email,
    commission_rate: commissionRate,
    affiliate_code: affiliateCode,
  });

  if (creatorError) {
    return NextResponse.json({ error: creatorError.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from('creator_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', inviteId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
