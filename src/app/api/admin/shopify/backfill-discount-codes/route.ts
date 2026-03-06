import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getShopifyAccessToken, getShopifyStoreUrl } from '@/lib/shopify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();

  if (!storeUrl || !accessToken) {
    return NextResponse.json({ error: 'Shopify credentials not configured' }, { status: 500 });
  }

  // Get all invites with has_affiliate that don't have an active Shopify code
  const { data: invites, error } = await (supabase.from as any)('creator_invites')
    .select('id, slug, has_affiliate, ad_spend_percentage, influencer:influencers!creator_invites_influencer_id_fkey(id, name, instagram_handle), shopify_code_status, shopify_price_rule_id')
    .eq('has_affiliate', true)
    .neq('shopify_code_status', 'active');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!invites || invites.length === 0) {
    return NextResponse.json({ message: 'No invites need backfill', results: [] });
  }

  const results: { name: string; status: string; detail: string }[] = [];

  for (const invite of invites) {
    // Get creator record to find affiliate code
    const { data: creator } = await (supabase.from as any)('creators')
      .select('affiliate_code, creator_name, commission_rate')
      .eq('invite_id', invite.id)
      .single();

    if (!creator || !creator.affiliate_code) {
      results.push({
        name: invite.influencer?.name || invite.slug,
        status: 'skipped',
        detail: 'No creator record or affiliate code found',
      });
      continue;
    }

    const code = creator.affiliate_code;
    const commissionRate = creator.commission_rate || 10;

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
              title: `${code.toUpperCase()} — ${creator.creator_name}`,
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
        await (supabase.from as any)('creator_invites')
          .update({ shopify_code_status: 'failed' })
          .eq('id', invite.id);
        results.push({
          name: creator.creator_name,
          status: 'failed',
          detail: `Price rule creation failed: ${errBody}`,
        });
        continue;
      }

      const priceRuleData = await priceRuleRes.json();
      const priceRuleId = priceRuleData.price_rule.id;

      // Step 2: Create discount code
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
              code: code.toUpperCase(),
            },
          }),
        }
      );

      if (!discountRes.ok) {
        const errBody = await discountRes.text();
        await (supabase.from as any)('creator_invites')
          .update({
            shopify_price_rule_id: String(priceRuleId),
            shopify_code_status: 'failed',
          })
          .eq('id', invite.id);
        results.push({
          name: creator.creator_name,
          status: 'failed',
          detail: `Discount code creation failed: ${errBody}`,
        });
        continue;
      }

      const discountData = await discountRes.json();
      const discountCodeId = discountData.discount_code.id;

      await (supabase.from as any)('creator_invites')
        .update({
          shopify_price_rule_id: String(priceRuleId),
          shopify_discount_code_id: String(discountCodeId),
          shopify_code_status: 'active',
        })
        .eq('id', invite.id);

      results.push({
        name: creator.creator_name,
        status: 'active',
        detail: `Created: code=${code.toUpperCase()}, price_rule=${priceRuleId}, discount_code=${discountCodeId}`,
      });
    } catch (err: any) {
      await (supabase.from as any)('creator_invites')
        .update({ shopify_code_status: 'failed' })
        .eq('id', invite.id);
      results.push({
        name: creator.creator_name,
        status: 'failed',
        detail: err.message || String(err),
      });
    }
  }

  return NextResponse.json({
    message: `Backfill complete: ${results.filter(r => r.status === 'active').length} created, ${results.filter(r => r.status === 'failed').length} failed, ${results.filter(r => r.status === 'skipped').length} skipped`,
    results,
  });
}
