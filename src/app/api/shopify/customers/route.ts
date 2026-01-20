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
  }[];
}

interface ShopifyCustomersResponse {
  customers: ShopifyCustomer[];
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

  if (!email && !name) {
    return NextResponse.json({ error: "Email, name, or id is required" }, { status: 400 });
  }

  // Build search query - search by email or name
  let query = "";
  if (email) {
    query = `email:${email}`;
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
    const { id, email, first_name, last_name, phone, address } = body;

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

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
        phone: phone || undefined,
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
      return NextResponse.json(
        { error: errorData.errors || "Failed to update customer in Shopify" },
        { status: response.status }
      );
    }

    const data: ShopifyCustomerResponse = await response.json();

    // Update address separately if provided
    if (address && data.customer.addresses?.[0]?.id) {
      await fetch(
        `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${id}/addresses/${data.customer.addresses[0].id}.json`,
        {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: { address1: address },
          }),
        }
      );
    } else if (address) {
      // Create new address if none exists
      await fetch(
        `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${id}/addresses.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: { address1: address },
          }),
        }
      );
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
    const { email, first_name, last_name, phone, address } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const customerData: {
      customer: {
        email: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        addresses?: { address1: string; city?: string; province?: string; zip?: string; country?: string }[];
      };
    } = {
      customer: {
        email,
        first_name: first_name || undefined,
        last_name: last_name || undefined,
        phone: phone || undefined,
      },
    };

    // Parse address if provided
    if (address) {
      customerData.customer.addresses = [
        {
          address1: address,
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

      // Check for duplicate customer error
      if (errorData.errors?.email?.[0]?.includes("taken")) {
        return NextResponse.json(
          { error: "A customer with this email already exists" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: errorData.errors || "Failed to create customer in Shopify" },
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
