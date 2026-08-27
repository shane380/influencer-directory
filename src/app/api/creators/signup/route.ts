import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getShopifyAccessToken, getShopifyStoreUrl } from '@/lib/shopify';
import { sendEmail } from '@/lib/email';
import { syncCreator } from '@/lib/meta-sync';
import { isEmailTriggerEnabled } from '@/lib/app-settings';
import { welcomeEmail } from '@/lib/email-templates';
import { CREATOR_TERMS_CURRENT, CREATOR_TERMS_KEY } from '@/lib/terms/versions';
import { AFFILIATE_DISCOUNT_PERCENT } from '@/lib/affiliate-program';
import { recordTermsAcceptance, requestClientInfo } from '@/lib/terms/record-acceptance';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// The customer-facing discount is the program standard, NOT the commission
// rate. These were the same value until now, so a 10%-commission partner's code
// gave 10% off instead of the 15% the terms promise.
async function createShopifyDiscountCode(
  affiliateCode: string,
  creatorName: string,
  inviteId: string
) {
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();

  if (!storeUrl || !accessToken) {
    console.error('Shopify credentials not configured, skipping discount code creation');
    await supabase
      .from('creator_invites')
      .update({ shopify_code_status: 'failed' })
      .eq('id', inviteId);
    return;
  }

  try {
    // Step 1: Create price rule
    const priceRuleRes = await fetch(
      `https://${storeUrl}/admin/api/2024-01/price_rules.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_rule: {
            title: `${affiliateCode.toUpperCase()} — ${creatorName}`,
            target_type: 'line_item',
            target_selection: 'all',
            allocation_method: 'across',
            value_type: 'percentage',
            value: `-${AFFILIATE_DISCOUNT_PERCENT}.0`,
            customer_selection: 'all',
            starts_at: new Date().toISOString(),
            once_per_customer: false,
          },
        }),
      }
    );

    if (!priceRuleRes.ok) {
      const errBody = await priceRuleRes.text();
      console.error(`Shopify price rule creation failed for ${affiliateCode}:`, errBody);
      await supabase
        .from('creator_invites')
        .update({ shopify_code_status: 'failed' })
        .eq('id', inviteId);
      return;
    }

    const priceRuleData = await priceRuleRes.json();
    const priceRuleId = priceRuleData.price_rule.id;

    // Step 2: Create discount code under the price rule
    const discountRes = await fetch(
      `https://${storeUrl}/admin/api/2024-01/price_rules/${priceRuleId}/discount_codes.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          discount_code: {
            code: affiliateCode.toUpperCase(),
          },
        }),
      }
    );

    if (!discountRes.ok) {
      const errBody = await discountRes.text();
      console.error(`Shopify discount code creation failed for ${affiliateCode}:`, errBody);
      await supabase
        .from('creator_invites')
        .update({
          shopify_price_rule_id: String(priceRuleId),
          shopify_code_status: 'failed',
        })
        .eq('id', inviteId);
      return;
    }

    const discountData = await discountRes.json();
    const discountCodeId = discountData.discount_code.id;

    // Success — update invite with Shopify IDs
    await supabase
      .from('creator_invites')
      .update({
        shopify_price_rule_id: String(priceRuleId),
        shopify_discount_code_id: String(discountCodeId),
        shopify_code_status: 'active',
      })
      .eq('id', inviteId);

    console.log(`Shopify discount code created: ${affiliateCode.toUpperCase()} (price_rule=${priceRuleId}, discount_code=${discountCodeId})`);
  } catch (err) {
    console.error(`Shopify discount code creation error for ${affiliateCode}:`, err);
    await supabase
      .from('creator_invites')
      .update({ shopify_code_status: 'failed' })
      .eq('id', inviteId);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { inviteId, creatorName, password, commissionRate, postUrl } = body;
  const email = (body.email || '').trim().toLowerCase();

  if (!inviteId || !creatorName || !email || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Affiliate codes are issued only when whoever built the invite selected an
  // affiliate deal (or the affiliate add-on). Previously every partner got a
  // code regardless, which left gift-card and retainer creators holding codes
  // they were never meant to have.
  const { data: signupInvite } = await supabase
    .from('creator_invites')
    .select('has_affiliate')
    .eq('id', inviteId)
    .single();
  const isAffiliate = !!(signupInvite as any)?.has_affiliate;

  // Create auth user — or reuse existing one (e.g. team member also becoming a partner)
  let userId: string;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: creatorName, role: 'creator' },
  });

  if (authError) {
    // If user already exists, look them up and add creator role
    if (authError.message?.toLowerCase().includes('already') || authError.message?.toLowerCase().includes('exists')) {
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existingUser = listData?.users?.find((u: { email?: string }) => u.email === email);
      if (!existingUser) {
        return NextResponse.json({ error: 'Could not find existing user' }, { status: 400 });
      }
      userId = existingUser.id;
      // Update metadata to include creator role alongside existing role
      const existingMeta = existingUser.user_metadata || {};
      await supabase.auth.admin.updateUserById(userId, {
        password,
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
    // Fire and forget — don't block the signup response
    createShopifyDiscountCode(
      affiliateCode,
      creatorName,
      inviteId
    ).catch((err) => console.error('Background Shopify discount creation failed:', err));
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
