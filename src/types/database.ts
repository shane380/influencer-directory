export type PartnershipType = 'unassigned' | 'gifted_no_ask' | 'gifted_soft_ask' | 'gifted_deliverable_ask' | 'gifted_recurring' | 'paid';
export type Tier = 'S' | 'A' | 'B' | 'C';
export type RelationshipStatus = 'prospect' | 'contacted' | 'followed_up' | 'lead_dead' | 'order_placed' | 'order_delivered' | 'order_follow_up_sent' | 'order_follow_up_two_sent' | 'posted';
export type CampaignStatus = 'planning' | 'active' | 'completed' | 'cancelled';
export type ClothingSize = 'XS' | 'S' | 'M' | 'L' | 'XL';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
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
}

export interface CampaignWithInfluencers extends Campaign {
  campaign_influencers: (CampaignInfluencer & { influencer: Influencer })[];
}

export interface InfluencerWithCampaigns extends Influencer {
  campaign_influencers: (CampaignInfluencer & { campaign: Campaign })[];
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
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
}
