import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { inviteId, creatorName, email, password, commissionRate } = body;

  if (!inviteId || !creatorName || !email || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: creatorName, role: 'creator' },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const userId = authData.user.id;

  // Generate affiliate code
  const affiliateCode = creatorName
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);

  const { error: creatorError } = await supabase.from('creators').insert({
    invite_id: inviteId,
    user_id: userId,
    creator_name: creatorName,
    email,
    commission_rate: commissionRate || 10,
    affiliate_code: affiliateCode,
  });

  if (creatorError) {
    return NextResponse.json({ error: creatorError.message }, { status: 500 });
  }

  // Mark invite as accepted
  await supabase
    .from('creator_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', inviteId);

  return NextResponse.json({ success: true });
}
