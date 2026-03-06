CREATE TABLE IF NOT EXISTS creator_product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  influencer_order_id uuid REFERENCES influencer_orders(id) ON DELETE SET NULL,
  shopify_variant_id text,
  product_name text NOT NULL,
  reactions text[] DEFAULT '{}',
  wear_context text[] DEFAULT '{}',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE creator_product_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can insert their own feedback"
  ON creator_product_feedback FOR INSERT
  WITH CHECK (creator_id IN (
    SELECT id FROM creators WHERE user_id = auth.uid()
  ));

CREATE POLICY "Creators can view their own feedback"
  ON creator_product_feedback FOR SELECT
  USING (creator_id IN (
    SELECT id FROM creators WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access on feedback"
  ON creator_product_feedback FOR ALL
  USING (auth.role() = 'service_role');
