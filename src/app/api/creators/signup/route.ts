import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse, after } from 'next/server';
import { createShopifyDiscountCode } from '@/lib/shopify-affiliate';
import { sendEmail } from '@/lib/email';
import { syncCreator } from '@/lib/meta-sync';
import { isEmailTriggerEnabled } from '@/lib/app-settings';
import { welcomeEmail } from '@/lib/email-templates';
import { CREATOR_TERMS_CURRENT, CREATOR_TERMS_KEY } from '@/lib/terms/versions';
import { recordTermsAcceptance, requestClientInfo } from '@/lib/terms/record-acceptance';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { inviteId, creatorName, password, postUrl } = body;
  const email = (body.email || '').trim().toLowerCase();

  if (!inviteId || !creatorName || !email || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // The invite is the only thing that authorises a signup, so it has to be a
  // real one that is still open. Without this check the route would create an
  // account (or, worse, touch an existing one) for anyone who posted to it.
  const { data: signupInvite } = await supabase
    .from('creator_invites')
    .select('id, status, expires_at, has_affiliate, commission_rate')
    .eq('id', inviteId)
    .maybeSingle();
  const inviteRow = signupInvite as any;
  if (!inviteRow) {
    return NextResponse.json({ error: 'This invite link is not valid.' }, { status: 403 });
  }
  if (inviteRow.status !== 'pending') {
    return NextResponse.json(
      { error: 'This invite has already been used. Please log in instead.' },
      { status: 409 }
    );
  }
  if (inviteRow.expires_at && new Date(inviteRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This invite has expired.' }, { status: 403 });
  }

  // Affiliate codes are issued only when whoever built the invite selected an
  // affiliate deal (or the affiliate add-on). Previously every partner got a
  // code regardless, which left gift-card and retainer creators holding codes
  // they were never meant to have.
  const isAffiliate = !!inviteRow.has_affiliate;
  // The rate comes from the invite, never from the request body.
  const commissionRate = inviteRow.commission_rate;

  // Create auth user — or reuse existing one (e.g. team member also becoming a partner)
  let userId: string;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: creatorName, role: 'creator' },
  });

  if (authError) {
    if (authError.message?.toLowerCase().includes('already') || authError.message?.toLowerCase().includes('exists')) {
      // The email already has an account. Only link it to this invite if the
      // caller proves they own it by supplying its CURRENT password — never
      // set a new one here, or this public route becomes a way to take over
      // any account by email.
      const verifier = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: signIn, error: signInError } = await verifier.auth.signInWithPassword({ email, password });
      if (signInError || !signIn?.user) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Enter that account\'s current password to continue, or reset it from the login page first.' },
          { status: 409 }
        );
      }
      userId = signIn.user.id;
      const existingMeta = signIn.user.user_metadata || {};
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { ...existingMeta, full_name: existingMeta.full_name || creatorName, creator_role: true },
      });
    } else {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }
  } else {
    userId = authData.user.id;
  }

  // Check if a creator record already exists for this user (prevents duplicates on re-signup)
  const { data: existingCreator } = await supabase
    .from('creators')
    .select('id, affiliate_code')
    .eq('user_id', userId)
    .limit(1);

  let affiliateCode = '';
  let creatorError: any = null;

  if (existingCreator && existingCreator.length > 0) {
    // Creator already exists — update email if needed and skip creation
    affiliateCode = (existingCreator[0] as any).affiliate_code || '';
    await supabase
      .from('creators')
      .update({ email })
      .eq('id', existingCreator[0].id);
  } else if (!isAffiliate) {
    // Non-affiliate deal: create the partner with no code at all.
    const { error } = await supabase.from('creators').insert({
      invite_id: inviteId,
      user_id: userId,
      creator_name: creatorName,
      email,
      commission_rate: 0,
      affiliate_code: null,
    });
    creatorError = error;
  } else {
    // Generate affiliate code — retry with random suffix on collision
    const baseCode = creatorName
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12);

    affiliateCode = baseCode;

    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from('creators').insert({
        invite_id: inviteId,
        user_id: userId,
        creator_name: creatorName,
        email,
        commission_rate: commissionRate ?? 0,
        affiliate_code: affiliateCode,
      });

      if (!error) {
        creatorError = null;
        break;
      }

      if (error.message?.includes('creators_affiliate_code_key')) {
        // Code collision — append random digits and retry
        const suffix = String(Math.floor(Math.random() * 900) + 100);
        affiliateCode = baseCode.slice(0, 9) + suffix;
        creatorError = error;
        continue;
      }

      creatorError = error;
      break;
    }
  }

  if (creatorError) {
    return NextResponse.json({ error: creatorError.message }, { status: 500 });
  }

  // Record what the agree checkbox on the invite page actually agreed to. If
  // this fails the signup still succeeds — the creator is simply asked again by
  // the dashboard terms gate on first login, which is the safe fallback.
  const { data: signedCreator } = await supabase
    .from('creators')
    .select('id, email')
    .eq('user_id', userId)
    .single();

  if (signedCreator) {
    const { ip, userAgent } = requestClientInfo(request);

    const acceptanceError = await recordTermsAcceptance(supabase, {
      creatorId: (signedCreator as any).id,
      userId,
      email: (signedCreator as any).email,
      documentKey: CREATOR_TERMS_KEY,
      version: CREATOR_TERMS_CURRENT,
      source: 'invite_signup',
      ip,
      userAgent,
    });
    if (acceptanceError) {
      console.error('Failed to record terms acceptance:', acceptanceError.message);
    }
  }

  // Mark invite as accepted
  await supabase
    .from('creator_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', inviteId);

  // Get invite details for background tasks
  const { data: invite } = await (supabase.from('creator_invites') as any)
    .select('has_affiliate, has_ad_spend, is_existing_creator, ad_spend_percentage, content_source, influencer_id, influencer:influencers!creator_invites_influencer_id_fkey(instagram_handle)')
    .eq('id', inviteId)
    .single();

  // Persist the post URL on the invite if partner provided one for existing content
  if (postUrl && invite?.content_source === 'existing') {
    await (supabase.from('creator_invites') as any)
      .update({ existing_content_url: postUrl })
      .eq('id', inviteId);
  }

  if (invite?.has_affiliate) {
    // Runs after the response is sent. A bare fire-and-forget promise gets
    // frozen with the function on Vercel and the Shopify fetch dies mid-flight
    // (seen as "fetch failed / other side closed"); after() keeps the function
    // alive until the sync finishes.
    after(async () => {
      const result = await createShopifyDiscountCode(affiliateCode, creatorName, inviteId);
      if (!result.ok) {
        console.error(`Shopify discount code sync failed for invite ${inviteId}: ${result.error}`);
      }
    });
  }

  // Fire and forget — sync Meta ads so dashboard has data on first login (existing creators only)
  if (invite?.is_existing_creator && invite?.has_ad_spend && invite?.influencer?.instagram_handle) {
    syncCreator(invite.influencer.instagram_handle, invite.influencer_id)
      .catch((err) => console.error('Background Meta ad sync failed:', err));
  }

  // Fire and forget — send welcome email with login link
  (async () => {
    try {
      const enabled = await isEmailTriggerEnabled('welcome');
      if (!enabled) return;

      const firstName = creatorName.split(' ')[0];
      const { subject, html } = await welcomeEmail({
        firstName,
        email,
        recipientEmail: email,
      });
      await sendEmail({ to: email, subject, html });
    } catch (err) {
      console.error('Welcome email failed:', err);
    }
  })();

  return NextResponse.json({ success: true });
}
