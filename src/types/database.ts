export type PartnershipType = 'unassigned' | 'gifted_no_ask' | 'gifted_soft_ask' | 'gifted_deliverable_ask' | 'gifted_recurring' | 'paid';
export type Tier = 'S' | 'A' | 'B' | 'C';
export type RelationshipStatus = 'prospect' | 'contacted' | 'followed_up' | 'lead_dead' | 'creator_wants_paid' | 'order_placed' | 'order_delivered' | 'order_follow_up_sent' | 'order_follow_up_two_sent' | 'posted';
export type CampaignStatus = 'planning' | 'active' | 'completed' | 'cancelled';
export type ClothingSize = 'XS' | 'S' | 'M' | 'L' | 'XL';
export type PaymentStatus = 'not_paid' | 'deposit_paid' | 'paid_on_post' | 'paid_in_full';
export type DeliverableType = 'ugc' | 'collab_post' | 'organic_post' | 'whitelisting' | 'other';
export type ContentPostedType = 'none' | 'stories' | 'in_feed_post' | 'reel' | 'tiktok';
export type ApprovalStatus = 'pending' | 'approved' | 'declined';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  profile_photo_url: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface Influencer {
  id: string;
  name: string;
  instagram_handle: string;
  profile_photo_url: string | null;
  follower_count: number;
  email: string | null;
  phone: string | null;
  mailing_address: string | null;
  agent_name: string | null;
  agent_email: string | null;
  agent_phone: string | null;
  partnership_type: PartnershipType;
  tier: Tier;
  relationship_status: RelationshipStatus;
  top_size: ClothingSize | null;
  bottoms_size: ClothingSize | null;
  notes: string | null;
  last_contacted_at: string | null;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  shopify_customer_id: string | null;
}

export interface InfluencerInsert {
  name: string;
  instagram_handle: string;
  profile_photo_url?: string | null;
  follower_count: number;
  email?: string | null;
  phone?: string | null;
  mailing_address?: string | null;
  agent_name?: string | null;
  agent_email?: string | null;
  agent_phone?: string | null;
  partnership_type: PartnershipType;
  tier: Tier;
  relationship_status: RelationshipStatus;
  top_size?: ClothingSize | null;
  bottoms_size?: ClothingSize | null;
  notes?: string | null;
  last_contacted_at?: string | null;
  created_by?: string | null;
  assigned_to?: string | null;
  shopify_customer_id?: string | null;
}

export interface InfluencerUpdate extends Partial<InfluencerInsert> {
  id: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: CampaignStatus;
  collection_deck_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignInsert {
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: CampaignStatus;
  collection_deck_url?: string | null;
}

export type ShopifyOrderStatus = 'draft' | 'placed' | 'fulfilled';

export interface ProductSelection {
  sku: string;
  variant_id: string;
  quantity: number;
  title?: string;
  price?: string;
}

export interface CampaignInfluencer {
  id: string;
  campaign_id: string;
  influencer_id: string;
  compensation: string | null;
  notes: string | null;
  added_at: string;
  status: RelationshipStatus;
  partnership_type: PartnershipType;
  shopify_order_id: string | null;
  shopify_order_status: ShopifyOrderStatus | null;
  product_selections: ProductSelection[] | null;
  content_posted: ContentPostedType;
  approval_status: ApprovalStatus | null;
  approval_note: string | null;
  approved_at: string | null;
  approved_by: string | null;
}

export interface CampaignInfluencerInsert {
  campaign_id: string;
  influencer_id: string;
  compensation?: string | null;
  notes?: string | null;
  status?: RelationshipStatus;
  partnership_type?: PartnershipType;
  shopify_order_id?: string | null;
  shopify_order_status?: ShopifyOrderStatus | null;
  product_selections?: ProductSelection[] | null;
  content_posted?: ContentPostedType;
  approval_status?: ApprovalStatus | null;
  approval_note?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
}

export interface CampaignWithInfluencers extends Campaign {
  campaign_influencers: (CampaignInfluencer & { influencer: Influencer })[];
}

export interface InfluencerWithCampaigns extends Influencer {
  campaign_influencers: (CampaignInfluencer & { campaign: Campaign })[];
}

// Budget Tracking Types

export interface MonthlyBudget {
  id: string;
  month: string;
  budget_amount: number;
  created_at: string;
  updated_at: string;
}

export interface MonthlyBudgetInsert {
  month: string;
  budget_amount: number;
}

export interface InfluencerRates {
  id: string;
  influencer_id: string;
  ugc_rate: number | null;
  collab_post_rate: number | null;
  organic_post_rate: number | null;
  whitelisting_rate: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InfluencerRatesInsert {
  influencer_id: string;
  ugc_rate?: number | null;
  collab_post_rate?: number | null;
  organic_post_rate?: number | null;
  whitelisting_rate?: number | null;
  notes?: string | null;
}

export interface InfluencerMediaKit {
  id: string;
  influencer_id: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  uploaded_at: string;
}

export interface InfluencerMediaKitInsert {
  influencer_id: string;
  file_url: string;
  file_name: string;
  file_size?: number | null;
}

export interface Deliverable {
  description: string;
  rate: number;
  quantity: number;
}

export interface CampaignDeal {
  id: string;
  campaign_id: string;
  influencer_id: string;
  deliverables: Deliverable[];
  total_deal_value: number;
  payment_status: PaymentStatus;
  deposit_amount: number | null;
  deposit_paid_date: string | null;
  final_paid_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignDealInsert {
  campaign_id: string;
  influencer_id: string;
  deliverables?: Deliverable[];
  total_deal_value?: number;
  payment_status?: PaymentStatus;
  deposit_amount?: number | null;
  deposit_paid_date?: string | null;
  final_paid_date?: string | null;
  notes?: string | null;
}

export interface CampaignDealWithInfluencer extends CampaignDeal {
  influencer: Influencer;
}

export interface CampaignDealWithDetails extends CampaignDeal {
  influencer: Influencer;
  campaign: Campaign;
}

export interface InfluencerWithRates extends Influencer {
  rates?: InfluencerRates | null;
  media_kits?: InfluencerMediaKit[];
}

// Shopify Order History Types

export interface OrderLineItem {
  product_name: string;
  variant_title: string | null;
  sku: string;
  quantity: number;
}

export interface InfluencerOrder {
  id: string;
  influencer_id: string;
  shopify_order_id: string;
  shopify_customer_id: string;
  order_number: string;
  order_date: string;
  total_amount: number;
  is_gift: boolean;
  line_items: OrderLineItem[];
  created_at: string;
  synced_at: string;
}

export interface InfluencerOrderInsert {
  influencer_id: string;
  shopify_order_id: string;
  shopify_customer_id: string;
  order_number: string;
  order_date: string;
  total_amount?: number;
  is_gift?: boolean;
  line_items?: OrderLineItem[];
}

export interface Database {
  public: {
    Tables: {
      influencers: {
        Row: Influencer;
        Insert: InfluencerInsert;
        Update: Partial<InfluencerInsert>;
        Relationships: [];
      };
      campaigns: {
        Row: Campaign;
        Insert: CampaignInsert;
        Update: Partial<CampaignInsert>;
        Relationships: [];
      };
      campaign_influencers: {
        Row: CampaignInfluencer;
        Insert: CampaignInfluencerInsert;
        Update: Partial<CampaignInfluencerInsert>;
        Relationships: [];
      };
      monthly_budgets: {
        Row: MonthlyBudget;
        Insert: MonthlyBudgetInsert;
        Update: Partial<MonthlyBudgetInsert>;
        Relationships: [];
      };
      influencer_rates: {
        Row: InfluencerRates;
        Insert: InfluencerRatesInsert;
        Update: Partial<InfluencerRatesInsert>;
        Relationships: [];
      };
      influencer_media_kits: {
        Row: InfluencerMediaKit;
        Insert: InfluencerMediaKitInsert;
        Update: Partial<InfluencerMediaKitInsert>;
        Relationships: [];
      };
      campaign_deals: {
        Row: CampaignDeal;
        Insert: CampaignDealInsert;
        Update: Partial<CampaignDealInsert>;
        Relationships: [];
      };
      influencer_orders: {
        Row: InfluencerOrder;
        Insert: InfluencerOrderInsert;
        Update: Partial<InfluencerOrderInsert>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
