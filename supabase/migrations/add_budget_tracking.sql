-- Budget Tracking Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Create payment status enum
CREATE TYPE payment_status_type AS ENUM ('not_paid', 'deposit_paid', 'paid_on_post', 'paid_in_full');

-- Create monthly budgets table
CREATE TABLE monthly_budgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL UNIQUE,
  budget_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create influencer rate cards table
CREATE TABLE influencer_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  ugc_rate DECIMAL(10,2),
  collab_post_rate DECIMAL(10,2),
  organic_post_rate DECIMAL(10,2),
  whitelisting_rate DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(influencer_id)
);

-- Create influencer media kits table
CREATE TABLE influencer_media_kits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create campaign deals table
CREATE TABLE campaign_deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  deliverables JSONB DEFAULT '[]'::JSONB,
  total_deal_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_status payment_status_type NOT NULL DEFAULT 'not_paid',
  deposit_amount DECIMAL(10,2),
  deposit_paid_date DATE,
  final_paid_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(campaign_id, influencer_id)
);

-- Create indexes
CREATE INDEX idx_monthly_budgets_month ON monthly_budgets(month DESC);
CREATE INDEX idx_influencer_rates_influencer ON influencer_rates(influencer_id);
CREATE INDEX idx_influencer_media_kits_influencer ON influencer_media_kits(influencer_id);
CREATE INDEX idx_campaign_deals_campaign ON campaign_deals(campaign_id);
CREATE INDEX idx_campaign_deals_influencer ON campaign_deals(influencer_id);
CREATE INDEX idx_campaign_deals_payment_status ON campaign_deals(payment_status);

-- Create triggers for updated_at (uses existing function from schema.sql)
CREATE TRIGGER update_monthly_budgets_updated_at
  BEFORE UPDATE ON monthly_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_influencer_rates_updated_at
  BEFORE UPDATE ON influencer_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_deals_updated_at
  BEFORE UPDATE ON campaign_deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencer_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencer_media_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_deals ENABLE ROW LEVEL SECURITY;

-- Monthly budgets policies
CREATE POLICY "Authenticated users can view all monthly budgets"
  ON monthly_budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert monthly budgets"
  ON monthly_budgets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update monthly budgets"
  ON monthly_budgets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete monthly budgets"
  ON monthly_budgets FOR DELETE TO authenticated USING (true);

-- Influencer rates policies
CREATE POLICY "Authenticated users can view all influencer rates"
  ON influencer_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert influencer rates"
  ON influencer_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update influencer rates"
  ON influencer_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete influencer rates"
  ON influencer_rates FOR DELETE TO authenticated USING (true);

-- Influencer media kits policies
CREATE POLICY "Authenticated users can view all influencer media kits"
  ON influencer_media_kits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert influencer media kits"
  ON influencer_media_kits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update influencer media kits"
  ON influencer_media_kits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete influencer media kits"
  ON influencer_media_kits FOR DELETE TO authenticated USING (true);

-- Campaign deals policies
CREATE POLICY "Authenticated users can view all campaign deals"
  ON campaign_deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert campaign deals"
  ON campaign_deals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update campaign deals"
  ON campaign_deals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete campaign deals"
  ON campaign_deals FOR DELETE TO authenticated USING (true);

-- Create storage bucket for media kits
INSERT INTO storage.buckets (id, name, public)
VALUES ('media-kits', 'media-kits', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for media kits bucket
CREATE POLICY "Authenticated users can upload media kits"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media-kits');

CREATE POLICY "Public can view media kits"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'media-kits');

CREATE POLICY "Authenticated users can update media kits"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media-kits');

CREATE POLICY "Authenticated users can delete media kits"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media-kits');
