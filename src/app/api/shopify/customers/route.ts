import { NextRequest, NextResponse } from "next/server";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  addresses: {
    id: number;
    address1: string;
    address2: string | null;
    city: string;
    province: string;
    zip: string;
    country: string;
    country_code?: string | null;
  }[];
  default_address?: { id: number } | null;
}

interface ShopifyCustomersResponse {
  customers: ShopifyCustomer[];
}

// Normalize phone to E.164 format for Shopify
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  } else if (!phone.startsWith("+")) {
    return `+${digits}`;
  }
  return phone;
}

interface ShopifyCustomerResponse {
  customer: ShopifyCustomer;
}

// GET - Search customers by email
export async function GET(request: NextRequest) {
  const SHOPIFY_STORE_URL = getShopifyStoreUrl();
  const SHOPIFY_ACCESS_TOKEN = await getShopifyAccessToken();

  if (!SHOPIFY_STORE_URL) {
    return NextResponse.json(
      { error: "Shopify store URL not configured" },
      { status: 500 }
    );
  }

  if (!SHOPIFY_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "Shopify not connected. Please connect your Shopify store first.", needsAuth: true },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const email = searchParams.get("email");
  const name = searchParams.get("name");
  const id = searchParams.get("id");
  const phone = searchParams.get("phone");

  // If ID is provided, fetch single customer
  if (id) {
    try {
      const response = await fetch(
        `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${id}.json`,
        {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        return NextResponse.json(
          { error: "Customer not found" },
          { status: 404 }
        );
      }

      const data: ShopifyCustomerResponse = await response.json();

      return NextResponse.json({
        customer: {
          id: data.customer.id,
          email: data.customer.email,
          name: `${data.customer.first_name || ""} ${data.customer.last_name || ""}`.trim(),
          first_name: data.customer.first_name,
          last_name: data.customer.last_name,
          phone: data.customer.phone,
          address: data.customer.addresses?.[0] || null,
        },
      });
    } catch (error) {
      console.error("Shopify customer fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch customer" },
        { status: 500 }
      );
    }
  }

  if (!email && !name && !phone) {
    return NextResponse.json({ error: "Email, name, phone, or id is required" }, { status: 400 });
  }

  // Build search query - search by email, phone, or name
  let query = "";
  if (email) {
    query = `email:${email}`;
  } else if (phone) {
    query = `phone:${normalizePhone(phone)}`;
  } else if (name) {
    query = name; // Shopify searches across name fields
  }

  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/search.json?query=${encodeURIComponent(query)}`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Shopify API error:", errorText);
      return NextResponse.json(
        { error: "Failed to search customers in Shopify" },
        { status: response.status }
      );
    }

    const data: ShopifyCustomersResponse = await response.json();

    const customers = data.customers.map((customer) => ({
      id: customer.id,
      email: customer.email,
      name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      address: customer.addresses[0] || null,
    }));

    return NextResponse.json({ customers });
  } catch (error) {
    console.error("Shopify customer search error:", error);
    return NextResponse.json(
      { error: "Failed to search customers" },
      { status: 500 }
    );
  }
}

// PUT - Update an existing customer
export async function PUT(request: NextRequest) {
  const SHOPIFY_STORE_URL = getShopifyStoreUrl();
  const SHOPIFY_ACCESS_TOKEN = await getShopifyAccessToken();

  if (!SHOPIFY_STORE_URL) {
    return NextResponse.json(
      { error: "Shopify store URL not configured" },
      { status: 500 }
    );
  }

  if (!SHOPIFY_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "Shopify not connected. Please connect your Shopify store first.", needsAuth: true },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { id, email, first_name, last_name, phone, address, address2, city, province, zip, country_code } = body;

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const normalizedPhone = phone ? normalizePhone(phone) : undefined;

    const customerData: {
      customer: {
        id: number;
        email?: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
      };
    } = {
      customer: {
        id: Number(id),
        email: email || undefined,
        first_name: first_name || undefined,
        last_name: last_name || undefined,
        phone: normalizedPhone,
      },
    };

    const response = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${id}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customerData),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Shopify API error:", errorData);
      const errorMsg = typeof errorData.errors === "string"
        ? errorData.errors
        : errorData.errors
          ? Object.entries(errorData.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("; ")
          : "Failed to update customer in Shopify";
      return NextResponse.json(
        { error: errorMsg },
        { status: response.status }
      );
    }

    const data: ShopifyCustomerResponse = await response.json();

    // Update the address when a street line and/or country was provided. Target
    // the default address (what the shipping-name mapping reads) and keep it the
    // default so the structured country_code lands on default_address.
    if (address || country_code) {
      const addressPayload = {
        ...(address ? { address1: address } : {}),
        ...(address2 !== undefined ? { address2: address2 || "" } : {}),
        ...(city ? { city } : {}),
        ...(province ? { province } : {}),
        ...(zip ? { zip } : {}),
        ...(country_code ? { country_code } : {}),
        default: true,
      };
      const targetAddressId =
        data.customer.default_address?.id || data.customer.addresses?.[0]?.id;
      if (targetAddressId) {
        await fetch(
          `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${id}/addresses/${targetAddressId}.json`,
          {
            method: "PUT",
            headers: {
              "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ address: addressPayload }),
          }
        );
      } else {
        // Create a new address if none exists
        await fetch(
          `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${id}/addresses.json`,
          {
            method: "POST",
            headers: {
              "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ address: addressPayload }),
          }
        );
      }
    }

    // Fetch updated customer to get latest data
    const updatedResponse = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${id}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const updatedData: ShopifyCustomerResponse = await updatedResponse.json();

    return NextResponse.json({
      customer: {
        id: updatedData.customer.id,
        email: updatedData.customer.email,
        name: `${updatedData.customer.first_name || ""} ${updatedData.customer.last_name || ""}`.trim(),
        first_name: updatedData.customer.first_name,
        last_name: updatedData.customer.last_name,
        phone: updatedData.customer.phone,
        address: updatedData.customer.addresses?.[0] || null,
      },
    });
  } catch (error) {
    console.error("Shopify customer update error:", error);
    return NextResponse.json(
      { error: "Failed to update customer" },
      { status: 500 }
    );
  }
}

// POST - Create a new customer
export async function POST(request: NextRequest) {
  const SHOPIFY_STORE_URL = getShopifyStoreUrl();
  const SHOPIFY_ACCESS_TOKEN = await getShopifyAccessToken();

  if (!SHOPIFY_STORE_URL) {
    return NextResponse.json(
      { error: "Shopify store URL not configured" },
      { status: 500 }
    );
  }

  if (!SHOPIFY_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "Shopify not connected. Please connect your Shopify store first.", needsAuth: true },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { email, first_name, last_name, phone, address, address2, city, province, zip, country_code } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedPhone = phone ? normalizePhone(phone) : undefined;

    const customerData: {
      customer: {
        email: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        addresses?: { address1?: string; address2?: string; city?: string; province?: string; zip?: string; country_code?: string }[];
      };
    } = {
      customer: {
        email,
        first_name: first_name || undefined,
        last_name: last_name || undefined,
        phone: normalizedPhone,
      },
    };

    // Attach a structured address when we have a street line and/or a country.
    // Recording country_code is what lets the shipping-name mapping route
    // orders without parsing free text later.
    if (address || country_code) {
      customerData.customer.addresses = [
        {
          ...(address ? { address1: address } : {}),
          ...(address2 ? { address2 } : {}),
          ...(city ? { city } : {}),
          ...(province ? { province } : {}),
          ...(zip ? { zip } : {}),
          ...(country_code ? { country_code } : {}),
        },
      ];
    }

    const response = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customerData),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Shopify API error:", errorData);

      // Check for duplicate customer error — Shopify enforces uniqueness on
      // both email and phone, and the two need different guidance in the UI.
      if (errorData.errors?.email?.[0]?.includes("taken")) {
        return NextResponse.json(
          { error: "A customer with this email already exists" },
          { status: 409 }
        );
      }
      if (errorData.errors?.phone?.[0]?.includes("taken")) {
        return NextResponse.json(
          { error: "A customer with this phone number already exists" },
          { status: 409 }
        );
      }

      const errorMsg = typeof errorData.errors === "string"
        ? errorData.errors
        : errorData.errors
          ? Object.entries(errorData.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("; ")
          : "Failed to create customer in Shopify";
      return NextResponse.json(
        { error: errorMsg },
        { status: response.status }
      );
    }

    const data: ShopifyCustomerResponse = await response.json();

    return NextResponse.json({
      customer: {
        id: data.customer.id,
        email: data.customer.email,
        name: `${data.customer.first_name || ""} ${data.customer.last_name || ""}`.trim(),
        first_name: data.customer.first_name,
        last_name: data.customer.last_name,
        phone: data.customer.phone,
        address: data.customer.addresses[0] || null,
      },
    });
  } catch (error) {
    console.error("Shopify customer create error:", error);
    return NextResponse.json(
      { error: "Failed to create customer" },
      { status: 500 }
    );
  }
}
