"use client";

import { useState, useEffect, useRef } from "react";
import { Influencer, InfluencerOrder } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ShoppingBag,
  RefreshCw,
  Search,
  Loader2,
  ExternalLink,
  Gift,
  Package,
  User,
  Check
} from "lucide-react";

interface ShopifyCustomer {
  id: number;
  email: string;
  name: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  orders_count?: number;
  total_spent?: string;
  address?: {
    address1: string;
    address2?: string | null;
    city: string;
    province: string;
    zip: string;
    country: string;
  } | null;
}

interface InfluencerOrdersTabProps {
  influencer: Influencer | null;
  orders: InfluencerOrder[];
  loadingOrders: boolean;
  onRefreshOrders: () => void;
  onLinkCustomer: (customerId: string) => void;
  refreshingOrders: boolean;
  shopifyCustomer: ShopifyCustomer | null;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// Shopify admin URL helper
// Note: Store name is hardcoded since NEXT_PUBLIC_ env vars are needed for client components
const SHOPIFY_STORE_NAME = "namasletica";

function getShopifyAdminUrl(path: string): string {
  return `https://admin.shopify.com/store/${SHOPIFY_STORE_NAME}/${path}`;
}

export function InfluencerOrdersTab({
  influencer,
  orders,
  loadingOrders,
  onRefreshOrders,
  onLinkCustomer,
  refreshingOrders,
  shopifyCustomer,
}: InfluencerOrdersTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ShopifyCustomer[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const hasAutoSearched = useRef(false);

  // Auto-search when no customer linked - prefer email over name for reliability
  useEffect(() => {
    if (
      influencer &&
      !influencer.shopify_customer_id &&
      !shopifyCustomer &&
      (influencer.email || influencer.name) &&
      !hasAutoSearched.current
    ) {
      hasAutoSearched.current = true;
      const query = influencer.email || influencer.name;
      setSearchQuery(query);
      // Auto-search after a brief delay
      const timer = setTimeout(() => {
        searchCustomers(query);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [influencer, shopifyCustomer]);

  // Reset auto-search flag when influencer changes
  useEffect(() => {
    hasAutoSearched.current = false;
  }, [influencer?.id]);

  const searchCustomers = async (query: string) => {
    if (!query.trim()) return;

    setSearching(true);
    setSearchError(null);

    try {
      const param = query.includes("@") ? "email" : "name";
      const response = await fetch(
        `/api/shopify/customers?${param}=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        throw new Error("Failed to search customers");
      }

      const data = await response.json();
      setSearchResults(data.customers || []);

      if (data.customers?.length === 0) {
        setSearchError("No customers found matching that search");
      }
    } catch (err: any) {
      setSearchError(err.message || "Failed to search customers");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = () => {
    searchCustomers(searchQuery);
  };

  // Calculate summary stats
  const totalOrders = orders.length;
  const totalItems = orders.reduce(
    (sum, order) => sum + order.line_items.reduce((s, li) => s + li.quantity, 0),
    0
  );
  const lastOrderDate = orders.length > 0 ? orders[0].order_date : null;

  // No influencer selected
  if (!influencer) {
    return (
      <div className="text-center py-8 text-gray-500">
        <ShoppingBag className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>Save the influencer first to view order history</p>
      </div>
    );
  }

  // No Shopify customer linked - show inline search
  if (!influencer.shopify_customer_id && !shopifyCustomer) {
    return (
      <div className="space-y-4 pt-4">
        <div className="text-sm text-gray-600 mb-2">Link Shopify Customer</div>

        {/* Inline Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
          />
          <Button onClick={handleSearch} disabled={searching}>
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Loading State */}
        {searching && searchResults.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
            <p className="text-sm">Searching Shopify customers...</p>
          </div>
        )}

        {/* Error */}
        {searchError && !searching && (
          <p className="text-sm text-gray-500 text-center py-2">{searchError}</p>
        )}

        {/* Results */}
        {searchResults.length > 0 && (
          <div className="border rounded-lg max-h-64 overflow-y-auto">
            {searchResults.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="w-full p-3 flex items-center justify-between hover:bg-gray-50 border-b last:border-b-0 text-left"
                onClick={() => onLinkCustomer(String(customer.id))}
              >
                <div>
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-gray-500">{customer.email}</p>
                  {customer.orders_count !== undefined && (
                    <p className="text-xs text-gray-400">
                      {customer.orders_count} orders
                    </p>
                  )}
                </div>
                <Check className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
        )}

        {/* No results and not searching */}
        {!searching && searchResults.length === 0 && !searchError && searchQuery && (
          <div className="text-center py-4 text-gray-400">
            <User className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">Press Enter or click Search</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Customer Card */}
      {shopifyCustomer && (
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">{shopifyCustomer.name}</p>
                <p className="text-sm text-gray-600">{shopifyCustomer.email}</p>
                {shopifyCustomer.address && (
                  <p className="text-xs text-gray-500 mt-1">
                    {shopifyCustomer.address.city}, {shopifyCustomer.address.province}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshOrders}
              disabled={refreshingOrders}
            >
              {refreshingOrders ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loadingOrders ? (
        <div className="text-center py-8">
          <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-gray-400" />
          <p className="text-gray-500">Loading orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>No recent orders found</p>
          <p className="text-sm mt-1">Shopify API shows orders from the last ~60 days</p>
          {influencer?.shopify_customer_id && (
            <a
              href={getShopifyAdminUrl(`customers/${influencer.shopify_customer_id}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-flex items-center gap-1"
            >
              View full history in Shopify
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{totalOrders} orders</span>
                <span className="mx-2">·</span>
                <span>{totalItems} items</span>
                {lastOrderDate && (
                  <>
                    <span className="mx-2">·</span>
                    <span>Last order: {formatDate(lastOrderDate)}</span>
                  </>
                )}
              </div>
              {influencer?.shopify_customer_id && (
                <a
                  href={getShopifyAdminUrl(`customers/${influencer.shopify_customer_id}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  Full history
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Showing orders from last ~60 days</p>
          </div>

          {/* Orders List */}
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="border rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatDate(order.order_date)}</span>
                    <a
                      href={getShopifyAdminUrl(`orders/${order.shopify_order_id}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                    >
                      {order.order_number}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {order.is_gift && (
                      <Badge className="bg-purple-100 text-purple-800">
                        <Gift className="h-3 w-3 mr-1" />
                        Gift
                      </Badge>
                    )}
                  </div>
                  {!order.is_gift && (
                    <span className="text-sm text-gray-600">
                      {formatCurrency(order.total_amount)}
                    </span>
                  )}
                </div>

                {/* Line Items */}
                <div className="pl-4 space-y-1">
                  {order.line_items.map((item, index) => (
                    <div
                      key={index}
                      className="text-sm text-gray-600 flex items-center gap-2"
                    >
                      <span className="text-gray-400">×{item.quantity}</span>
                      <span>{item.product_name}</span>
                      {item.variant_title && (
                        <span className="text-gray-400">({item.variant_title})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
