"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  CampaignInfluencer,
  ProductSelection,
  ShopifyOrderStatus,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  Loader2,
  Plus,
  Minus,
  Trash2,
  ExternalLink,
  Package,
  User,
  ShoppingCart,
  Check,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

interface OrderDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  influencer: Influencer;
  campaignInfluencer: CampaignInfluencer;
}

interface ShopifyProduct {
  product_id: number;
  variant_id: number;
  title: string;
  variant_title: string | null;
  sku: string;
  price: string;
  inventory: number;
  image: string | null;
  status: string;
}

interface ShopifyCustomer {
  id: number;
  email: string;
  name: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  address?: {
    address1: string;
    address2?: string | null;
    city: string;
    province: string;
    zip: string;
    country: string;
  } | null;
}

interface CartItem extends ProductSelection {
  title: string;
  variant_title?: string | null;
  price: string;
  image?: string | null;
}

const orderStatusColors: Record<ShopifyOrderStatus, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  placed: "bg-blue-100 text-blue-800",
  fulfilled: "bg-green-100 text-green-800",
};

const orderStatusLabels: Record<ShopifyOrderStatus, string> = {
  draft: "Draft",
  placed: "Placed",
  fulfilled: "Fulfilled",
};

export function OrderDialog({
  open,
  onClose,
  onSave,
  influencer,
  campaignInfluencer,
}: OrderDialogProps) {
  const [skuSearch, setSkuSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ShopifyProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [shopifyCustomer, setShopifyCustomer] = useState<ShopifyCustomer | null>(null);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<ShopifyCustomer[]>([]);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerConfirmed, setCustomerConfirmed] = useState(false);
  const [showCreateCustomerForm, setShowCreateCustomerForm] = useState(false);
  const [showEditCustomerForm, setShowEditCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
  });

  const [creatingOrder, setCreatingOrder] = useState(false);
  const [savingSelects, setSavingSelects] = useState(false);
  const [selectsSaved, setSelectsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderCreated, setOrderCreated] = useState(false);
  const [orderAdminUrl, setOrderAdminUrl] = useState<string | null>(null);

  const supabase = createClient();

  // Initialize cart from existing product selections
  useEffect(() => {
    if (open && campaignInfluencer.product_selections) {
      setCart(campaignInfluencer.product_selections as CartItem[]);
    } else {
      setCart([]);
    }
    setSkuSearch("");
    setSearchResults([]);
    setError(null);
    setOrderCreated(false);
    setOrderAdminUrl(null);
    setSelectsSaved(false);
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setShowCustomerSearch(false);
    setCustomerConfirmed(false);
    setShowCreateCustomerForm(false);
    // Pre-fill form with influencer data
    const nameParts = influencer.name.split(" ");
    setNewCustomerForm({
      email: influencer.email || "",
      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" ") || "",
      phone: influencer.phone || "",
      address: influencer.mailing_address || "",
    });
  }, [open, campaignInfluencer, influencer]);

  // Auto-match customer by name or email when dialog opens
  useEffect(() => {
    async function matchCustomer() {
      if (!open) {
        setShopifyCustomer(null);
        return;
      }

      // If influencer already has a linked Shopify customer, fetch their details
      if (influencer.shopify_customer_id) {
        try {
          const response = await fetch(
            `/api/shopify/customers?id=${influencer.shopify_customer_id}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data.customer) {
              setShopifyCustomer(data.customer);
              setCustomerConfirmed(true);
              setCustomerSearching(false);
              return;
            }
          }
        } catch (err) {
          console.error("Error fetching linked customer:", err);
        }
        // If fetch fails, clear the invalid customer ID and continue with search
      }

      setCustomerSearching(true);
      setCustomerError(null);

      try {
        // First try to match by name
        const nameResponse = await fetch(
          `/api/shopify/customers?name=${encodeURIComponent(influencer.name)}`
        );

        if (nameResponse.ok) {
          const nameData = await nameResponse.json();
          if (nameData.customers && nameData.customers.length > 0) {
            setShopifyCustomer(nameData.customers[0]);
            // Save the customer ID to the influencer record
            await (supabase.from("influencers") as any)
              .update({ shopify_customer_id: String(nameData.customers[0].id) })
              .eq("id", influencer.id);
            setCustomerSearching(false);
            return;
          }
        }

        // If no name match and we have an email, try email
        if (influencer.email) {
          const emailResponse = await fetch(
            `/api/shopify/customers?email=${encodeURIComponent(influencer.email)}`
          );

          if (emailResponse.ok) {
            const emailData = await emailResponse.json();
            if (emailData.customers && emailData.customers.length > 0) {
              setShopifyCustomer(emailData.customers[0]);
              // Save the customer ID to the influencer record
              await (supabase.from("influencers") as any)
                .update({ shopify_customer_id: String(emailData.customers[0].id) })
                .eq("id", influencer.id);
              setCustomerSearching(false);
              return;
            }
          }
        }

        // No match found
        setShopifyCustomer(null);
      } catch (err) {
        console.error("Error matching customer:", err);
      } finally {
        setCustomerSearching(false);
      }
    }

    matchCustomer();
  }, [open, influencer, supabase]);

  const handleProductSearch = async () => {
    if (!skuSearch.trim()) return;

    setSearching(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/shopify/products?query=${encodeURIComponent(skuSearch)}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to search products");
      }

      const data = await response.json();
      setSearchResults(data.products || []);

      if (data.products.length === 0) {
        setError("No products found matching that SKU");
      }
    } catch (err: any) {
      setError(err.message || "Failed to search products");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAddToCart = (product: ShopifyProduct) => {
    const existingIndex = cart.findIndex(
      (item) => item.variant_id === String(product.variant_id)
    );

    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      setCart(newCart);
    } else {
      setCart([
        ...cart,
        {
          sku: product.sku,
          variant_id: String(product.variant_id),
          quantity: 1,
          title: product.title,
          variant_title: product.variant_title,
          price: product.price,
          image: product.image,
        },
      ]);
    }
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    newCart[index].quantity += delta;
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1);
    }
    setCart(newCart);
  };

  const handleRemoveFromCart = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const handleClearSelects = async () => {
    setSavingSelects(true);
    setError(null);

    try {
      const { error: updateError } = await (supabase.from("campaign_influencers") as any)
        .update({
          product_selections: null,
        })
        .eq("id", campaignInfluencer.id);

      if (updateError) throw updateError;

      setCart([]);
      setSelectsSaved(true);
      onSave();
    } catch (err: any) {
      setError(err.message || "Failed to clear selects");
    } finally {
      setSavingSelects(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerForm.email) {
      setCustomerError("Email is required to create a Shopify customer.");
      return;
    }

    setCreatingCustomer(true);
    setCustomerError(null);

    try {
      const response = await fetch("/api/shopify/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newCustomerForm.email,
          first_name: newCustomerForm.first_name || undefined,
          last_name: newCustomerForm.last_name || undefined,
          phone: newCustomerForm.phone || undefined,
          address: newCustomerForm.address || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create customer");
      }

      const data = await response.json();
      setShopifyCustomer(data.customer);
      setCustomerConfirmed(true);
      setShowCustomerSearch(false);
      setShowCreateCustomerForm(false);

      // Save the customer ID to the influencer record
      await (supabase.from("influencers") as any)
        .update({ shopify_customer_id: String(data.customer.id) })
        .eq("id", influencer.id);

      // Also update influencer email if it was empty
      if (!influencer.email && newCustomerForm.email) {
        await (supabase.from("influencers") as any)
          .update({ email: newCustomerForm.email })
          .eq("id", influencer.id);
      }
    } catch (err: any) {
      const errorMessage = err.message || "Failed to create customer";

      // If email already exists, offer to find the customer
      if (errorMessage.toLowerCase().includes("already exists") || errorMessage.toLowerCase().includes("taken")) {
        setCustomerError("A customer with this email already exists in Shopify.");
        // Auto-search for the existing customer
        try {
          const searchResponse = await fetch(
            `/api/shopify/customers?email=${encodeURIComponent(newCustomerForm.email)}`
          );
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.customers && searchData.customers.length > 0) {
              setCustomerSearchResults(searchData.customers);
              setShowCreateCustomerForm(false);
              setShowCustomerSearch(true);
              setCustomerError("Found existing customer with this email - click to select:");
            }
          }
        } catch {
          // Ignore search errors
        }
      } else {
        setCustomerError(errorMessage);
      }
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handleShowCreateCustomerForm = () => {
    setShowCustomerSearch(false);
    setShowCreateCustomerForm(true);
    setShowEditCustomerForm(false);
    setCustomerError(null);
  };

  const handleShowEditCustomerForm = () => {
    if (shopifyCustomer) {
      setNewCustomerForm({
        email: shopifyCustomer.email || "",
        first_name: shopifyCustomer.first_name || "",
        last_name: shopifyCustomer.last_name || "",
        phone: shopifyCustomer.phone || "",
        address: shopifyCustomer.address?.address1 || "",
      });
      setShowEditCustomerForm(true);
      setShowCreateCustomerForm(false);
      setCustomerError(null);
    }
  };

  const handleUpdateCustomer = async () => {
    if (!shopifyCustomer) return;

    setEditingCustomer(true);
    setCustomerError(null);

    try {
      const response = await fetch("/api/shopify/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: shopifyCustomer.id,
          email: newCustomerForm.email || undefined,
          first_name: newCustomerForm.first_name || undefined,
          last_name: newCustomerForm.last_name || undefined,
          phone: newCustomerForm.phone || undefined,
          address: newCustomerForm.address || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update customer");
      }

      const data = await response.json();
      setShopifyCustomer(data.customer);
      setShowEditCustomerForm(false);
    } catch (err: any) {
      setCustomerError(err.message || "Failed to update customer");
    } finally {
      setEditingCustomer(false);
    }
  };

  const handleCustomerSearch = async () => {
    if (!customerSearchQuery.trim()) return;

    setCustomerSearching(true);
    setCustomerError(null);

    try {
      const response = await fetch(
        `/api/shopify/customers?name=${encodeURIComponent(customerSearchQuery)}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to search customers");
      }

      const data = await response.json();
      setCustomerSearchResults(data.customers || []);

      if (data.customers.length === 0) {
        setCustomerError("No customers found matching that name");
      }
    } catch (err: any) {
      setCustomerError(err.message || "Failed to search customers");
      setCustomerSearchResults([]);
    } finally {
      setCustomerSearching(false);
    }
  };

  const handleSelectCustomer = async (customer: ShopifyCustomer) => {
    setShopifyCustomer(customer);
    setCustomerConfirmed(true);
    setShowCustomerSearch(false);
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);

    // Save the customer ID to the influencer record
    await (supabase.from("influencers") as any)
      .update({ shopify_customer_id: String(customer.id) })
      .eq("id", influencer.id);
  };

  const handleConfirmCustomer = async () => {
    if (!shopifyCustomer) return;

    setCustomerConfirmed(true);

    // Save the customer ID to the influencer record
    await (supabase.from("influencers") as any)
      .update({ shopify_customer_id: String(shopifyCustomer.id) })
      .eq("id", influencer.id);
  };

  const handleChangeCustomer = () => {
    setShopifyCustomer(null);
    setCustomerConfirmed(false);
    setShowCustomerSearch(true);
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
  };

  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      setError("Please add at least one product to the order");
      return;
    }

    setCreatingOrder(true);
    setError(null);

    try {
      const response = await fetch("/api/shopify/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: shopifyCustomer?.id,
          line_items: cart.map((item) => ({
            variant_id: item.variant_id,
            quantity: item.quantity,
          })),
          note: `Influencer gifting - ${influencer.name} (@${influencer.instagram_handle})`,
          tags: "influencer-gifting",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create order");
      }

      const data = await response.json();

      // Save order info to campaign_influencers
      const productSelectionsForDB = cart.map((item) => ({
        sku: item.sku,
        variant_id: item.variant_id,
        quantity: item.quantity,
        title: item.title,
        price: item.price,
      }));

      await (supabase.from("campaign_influencers") as any)
        .update({
          shopify_order_id: String(data.order.id),
          shopify_order_status: "draft" as ShopifyOrderStatus,
          product_selections: productSelectionsForDB,
        })
        .eq("id", campaignInfluencer.id);

      setOrderCreated(true);
      setOrderAdminUrl(data.order.admin_url);
      onSave();
    } catch (err: any) {
      setError(err.message || "Failed to create order");
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleSaveSelects = async () => {
    // Only block if cart is empty AND there were no existing selects to clear
    if (cart.length === 0 && !hasExistingSelects) {
      setError("Please add at least one product");
      return;
    }

    setSavingSelects(true);
    setError(null);

    try {
      const productSelectionsForDB = cart.length > 0
        ? cart.map((item) => ({
            sku: item.sku,
            variant_id: item.variant_id,
            quantity: item.quantity,
            title: item.title,
            variant_title: item.variant_title,
            price: item.price,
            image: item.image,
          }))
        : null; // Clear selects if cart is empty

      const { error: updateError } = await (supabase.from("campaign_influencers") as any)
        .update({
          product_selections: productSelectionsForDB,
        })
        .eq("id", campaignInfluencer.id);

      if (updateError) throw updateError;

      setSelectsSaved(true);
      onSave();
    } catch (err: any) {
      setError(err.message || "Failed to save selects");
    } finally {
      setSavingSelects(false);
    }
  };

  const hasExistingOrder = Boolean(campaignInfluencer.shopify_order_id);
  const hasExistingSelects = Boolean(campaignInfluencer.product_selections && (campaignInfluencer.product_selections as CartItem[]).length > 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-8" onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            {hasExistingOrder ? "View Order" : hasExistingSelects ? "Edit Selects" : "Add Selects"} - {influencer.name}
          </DialogTitle>
        </DialogHeader>

        {orderCreated ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-medium">Draft Order Created</h3>
            <p className="text-gray-600">
              The draft order has been created in Shopify. You can review and complete it there.
            </p>
            {orderAdminUrl && (
              <Button
                variant="outline"
                onClick={() => window.open(orderAdminUrl, "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View in Shopify
              </Button>
            )}
          </div>
        ) : hasExistingOrder ? (
          <div className="space-y-6">
            {/* Existing Order Status */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Order Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      className={
                        orderStatusColors[
                          campaignInfluencer.shopify_order_status || "draft"
                        ]
                      }
                    >
                      {orderStatusLabels[campaignInfluencer.shopify_order_status || "draft"]}
                    </Badge>
                    <span className="text-sm text-gray-600">
                      Order #{campaignInfluencer.shopify_order_id}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL || "your-store.myshopify.com"}/admin/draft_orders/${campaignInfluencer.shopify_order_id}`,
                      "_blank"
                    )
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View in Shopify
                </Button>
              </div>
            </div>

            {/* Order Items */}
            {campaignInfluencer.product_selections && (
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Order Items
                </h3>
                <div className="space-y-2">
                  {(campaignInfluencer.product_selections as CartItem[]).map(
                    (item, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{item.title}</p>
                          <p className="text-sm text-gray-500">
                            SKU: {item.sku} | Qty: {item.quantity}
                          </p>
                        </div>
                        <p className="text-gray-600">${item.price}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Customer Section */}
            <div className="border-b pb-6">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Shopify Customer
              </h3>

              {customerSearching ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching for customer...
                </div>
              ) : shopifyCustomer && customerConfirmed && !showEditCustomerForm ? (
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">{shopifyCustomer.name}</p>
                      <p className="text-sm text-gray-600">{shopifyCustomer.email}</p>
                      {shopifyCustomer.phone && (
                        <p className="text-sm text-gray-500">{shopifyCustomer.phone}</p>
                      )}
                      {shopifyCustomer.address && (
                        <p className="text-sm text-gray-500 mt-1">
                          {shopifyCustomer.address.address1}
                          {shopifyCustomer.address.city && `, ${shopifyCustomer.address.city}`}
                          {shopifyCustomer.address.province && `, ${shopifyCustomer.address.province}`}
                          {shopifyCustomer.address.zip && ` ${shopifyCustomer.address.zip}`}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleShowEditCustomerForm}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleChangeCustomer}
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                </div>
              ) : shopifyCustomer && customerConfirmed && showEditCustomerForm ? (
                <div className="space-y-4 bg-blue-50 p-4 rounded-lg">
                  <p className="font-medium text-sm">Edit Customer Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit_customer_first_name" className="text-sm">First Name</Label>
                      <Input
                        id="edit_customer_first_name"
                        value={newCustomerForm.first_name}
                        onChange={(e) => setNewCustomerForm({ ...newCustomerForm, first_name: e.target.value })}
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit_customer_last_name" className="text-sm">Last Name</Label>
                      <Input
                        id="edit_customer_last_name"
                        value={newCustomerForm.last_name}
                        onChange={(e) => setNewCustomerForm({ ...newCustomerForm, last_name: e.target.value })}
                        placeholder="Last name"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="edit_customer_email" className="text-sm">Email</Label>
                    <Input
                      id="edit_customer_email"
                      type="email"
                      value={newCustomerForm.email}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit_customer_phone" className="text-sm">Phone</Label>
                    <Input
                      id="edit_customer_phone"
                      type="tel"
                      value={newCustomerForm.phone}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                      placeholder="Phone number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit_customer_address" className="text-sm">Address</Label>
                    <Input
                      id="edit_customer_address"
                      value={newCustomerForm.address}
                      onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                      placeholder="Street address"
                    />
                  </div>

                  {customerError && (
                    <p className="text-sm text-red-600">{customerError}</p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleUpdateCustomer}
                      disabled={editingCustomer}
                    >
                      {editingCustomer ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Changes"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowEditCustomerForm(false);
                        setCustomerError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : shopifyCustomer && !customerConfirmed ? (
                <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-900">Found a matching customer - please confirm:</p>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="font-medium">{shopifyCustomer.name}</p>
                    <p className="text-sm text-gray-600">{shopifyCustomer.email || "No email"}</p>
                    {shopifyCustomer.phone && (
                      <p className="text-sm text-gray-500">{shopifyCustomer.phone}</p>
                    )}
                    {shopifyCustomer.address && (
                      <p className="text-sm text-gray-500 mt-1">
                        {shopifyCustomer.address.address1}
                        {shopifyCustomer.address.address2 && `, ${shopifyCustomer.address.address2}`}
                        {shopifyCustomer.address.city && `, ${shopifyCustomer.address.city}`}
                        {shopifyCustomer.address.province && `, ${shopifyCustomer.address.province}`}
                        {shopifyCustomer.address.zip && ` ${shopifyCustomer.address.zip}`}
                        {shopifyCustomer.address.country && `, ${shopifyCustomer.address.country}`}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleConfirmCustomer}>
                      <Check className="h-4 w-4 mr-1" />
                      Confirm
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleChangeCustomer}>
                      <Search className="h-4 w-4 mr-1" />
                      Search Different
                    </Button>
                  </div>
                </div>
              ) : influencer.email ? (
                <div className="bg-yellow-50 p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-800 mb-2">
                    <AlertCircle className="h-4 w-4" />
                    No Shopify customer found for {influencer.email}
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCreateCustomer}
                    disabled={creatingCustomer}
                  >
                    {creatingCustomer ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Customer in Shopify
                      </>
                    )}
                  </Button>
                  {customerError && (
                    <p className="text-sm text-red-600 mt-2">{customerError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-yellow-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-yellow-800">
                      <AlertCircle className="h-4 w-4" />
                      No Shopify customer found for {influencer.name}
                    </div>
                  </div>

                  {!showCustomerSearch ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCustomerSearch(true)}
                      >
                        <Search className="h-4 w-4 mr-2" />
                        Search Customers
                      </Button>
                      {influencer.email && (
                        <Button
                          size="sm"
                          onClick={handleCreateCustomer}
                          disabled={creatingCustomer}
                        >
                          {creatingCustomer ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4 mr-2" />
                          )}
                          Create Customer
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Search by customer name..."
                          value={customerSearchQuery}
                          onChange={(e) => setCustomerSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleCustomerSearch();
                            }
                          }}
                        />
                        <Button onClick={handleCustomerSearch} disabled={customerSearching}>
                          {customerSearching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Search"
                          )}
                        </Button>
                      </div>

                      {customerSearchResults.length > 0 && (
                        <div className="border rounded-lg max-h-40 overflow-y-auto">
                          {customerSearchResults.map((customer) => (
                            <button
                              key={customer.id}
                              type="button"
                              className="w-full p-3 flex items-center justify-between hover:bg-gray-50 border-b last:border-b-0 text-left"
                              onClick={() => handleSelectCustomer(customer)}
                            >
                              <div>
                                <p className="font-medium">{customer.name}</p>
                                <p className="text-sm text-gray-500">{customer.email}</p>
                              </div>
                              <Plus className="h-4 w-4 text-gray-400" />
                            </button>
                          ))}
                        </div>
                      )}

                      {customerError && (
                        <p className="text-sm text-red-600">{customerError}</p>
                      )}

                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleShowCreateCustomerForm}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create New Customer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowCustomerSearch(false);
                            setCustomerSearchQuery("");
                            setCustomerSearchResults([]);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {showCreateCustomerForm && (
                    <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                      <p className="font-medium text-sm">Create New Shopify Customer</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="new_customer_first_name" className="text-sm">First Name</Label>
                          <Input
                            id="new_customer_first_name"
                            value={newCustomerForm.first_name}
                            onChange={(e) => setNewCustomerForm({ ...newCustomerForm, first_name: e.target.value })}
                            placeholder="First name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="new_customer_last_name" className="text-sm">Last Name</Label>
                          <Input
                            id="new_customer_last_name"
                            value={newCustomerForm.last_name}
                            onChange={(e) => setNewCustomerForm({ ...newCustomerForm, last_name: e.target.value })}
                            placeholder="Last name"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="new_customer_email" className="text-sm">Email *</Label>
                        <Input
                          id="new_customer_email"
                          type="email"
                          value={newCustomerForm.email}
                          onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                          placeholder="email@example.com"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="new_customer_phone" className="text-sm">Phone</Label>
                        <Input
                          id="new_customer_phone"
                          type="tel"
                          value={newCustomerForm.phone}
                          onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                          placeholder="Phone number"
                        />
                      </div>
                      <div>
                        <Label htmlFor="new_customer_address" className="text-sm">Address</Label>
                        <Input
                          id="new_customer_address"
                          value={newCustomerForm.address}
                          onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                          placeholder="Street address"
                        />
                      </div>

                      {customerError && (
                        <p className="text-sm text-red-600">{customerError}</p>
                      )}

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleCreateCustomer}
                          disabled={creatingCustomer || !newCustomerForm.email}
                        >
                          {creatingCustomer ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            "Create Customer"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowCreateCustomerForm(false);
                            setCustomerError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Product Search */}
            <div>
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Add Products
              </h3>
              <div className="flex gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by product name or SKU..."
                    value={skuSearch}
                    onChange={(e) => setSkuSearch(e.target.value)}
                    className="pl-10"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleProductSearch();
                      }
                    }}
                  />
                </div>
                <Button onClick={handleProductSearch} disabled={searching}>
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Search"
                  )}
                </Button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="border rounded-lg max-h-64 overflow-y-auto mb-4">
                  {searchResults.map((product) => (
                    <div
                      key={`${product.product_id}-${product.variant_id}`}
                      className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-gray-50"
                    >
                      {product.image ? (
                        <Image
                          src={product.image}
                          alt={product.title}
                          width={48}
                          height={48}
                          className="rounded object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                          <Package className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{product.title}</p>
                        {product.variant_title && (
                          <p className="text-sm text-gray-500">{product.variant_title}</p>
                        )}
                        <p className="text-sm text-gray-500">
                          SKU: {product.sku} | Stock: {product.inventory}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${product.price}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddToCart(product)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart / Selects */}
            {cart.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Product Selects ({cart.length})
                    {hasExistingSelects && !selectsSaved && (
                      <Badge variant="secondary" className="text-xs">Saved</Badge>
                    )}
                  </h3>
                  {hasExistingSelects && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={handleClearSelects}
                      disabled={savingSelects}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear All
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {cart.map((item, index) => (
                    <div
                      key={`${item.variant_id}-${index}`}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.title}</p>
                        {item.variant_title && (
                          <p className="text-sm text-gray-500">{item.variant_title}</p>
                        )}
                        <p className="text-sm text-gray-500">SKU: {item.sku}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateQuantity(index, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateQuantity(index, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => handleRemoveFromCart(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>
        )}

        {!orderCreated && !hasExistingOrder && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={handleSaveSelects}
              disabled={savingSelects || (cart.length === 0 && !hasExistingSelects)}
            >
              {savingSelects ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : selectsSaved ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Saved
                </>
              ) : (
                "Save"
              )}
            </Button>
            <Button
              onClick={handleCreateOrder}
              disabled={creatingOrder || cart.length === 0 || !shopifyCustomer || !customerConfirmed}
              title={!shopifyCustomer || !customerConfirmed ? "Please confirm a customer first" : ""}
            >
              {creatingOrder ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Draft Order"
              )}
            </Button>
          </DialogFooter>
        )}

        {(orderCreated || hasExistingOrder) && (
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
