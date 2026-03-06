import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getShopifyAccessToken, getShopifyStoreUrl } from '@/lib/shopify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createShopifyDiscountCode(
  affiliateCode: string,
  creatorName: string,
  commissionRate: number,
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
            value: `-${commissionRate}.0`,
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

  // Get invite details for discount code creation (non-blocking)
  const { data: invite } = await supabase
    .from('creator_invites')
    .select('has_affiliate, ad_spend_percentage')
    .eq('id', inviteId)
    .single();

  if (invite?.has_affiliate) {
    // Fire and forget — don't block the signup response
    createShopifyDiscountCode(
      affiliateCode,
      creatorName,
      commissionRate || 10,
      inviteId
    ).catch((err) => console.error('Background Shopify discount creation failed:', err));
  }

  return NextResponse.json({ success: true });
}
