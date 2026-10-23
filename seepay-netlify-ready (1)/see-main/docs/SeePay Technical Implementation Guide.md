# SeePay (`seepay.shop`) — Technical Blueprint & Implementation Guide

SeePay is a multi-tenant micro-SaaS platform tailored for Ghanaian local businesses (food spots, boutiques, salons, and repair services). It provisions instant, branded web storefronts (`vendor.seepay.shop`) with zero fixed monthly fees, automating order intake and Mobile Money checkout via Paystack split payments.

---

## 1. System Architecture

```
                               ┌───────────────────────────┐
                               │   Customer / Browser      │
                               └─────────────┬─────────────┘
                                             │
                                  HTTP Request (vendor.seepay.shop)
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │   Netlify Edge Function  │
                               │   (*.seepay.shop rewrite) │
                               └─────────────┬─────────────┘
                                             │
                      ┌──────────────────────┴──────────────────────┐
                      │                                             │
                      ▼                                             ▼
      ┌───────────────────────────────┐             ┌───────────────────────────────┐
      │   Landing & Agent Onboarding  │             │   Dynamic Vendor Storefront   │
      │   (seepay.shop)               │             │   (store.seepay.shop)         │
      └──────────────┬────────────────┘             └──────────────┬────────────────┘
                     │                                             │
                     │                                             │
                     ▼                                             ▼
      ┌───────────────────────────────┐             ┌───────────────────────────────┐
      │  Supabase PostgreSQL Database │             │ Paystack Ghana API Engine     │
      │  (Row-Level Security, Auth)   │             │ (Split Payments & Webhooks)   │
      └───────────────────────────────┘             └───────────────────────────────┘
```

### Architecture Highlights:
* **Frontend/Backend:** Static HTML/CSS/JavaScript deployed on Netlify.
* **Database & Auth:** Supabase (PostgreSQL with Row-Level Security).
* **Payment Engine:** Paystack Ghana API with automated split settlement (`POST /subaccount` and `POST /transaction/initialize`).
* **DNS & Routing:** Netlify Edge Function routing (`*.seepay.shop`).
* **Cost Structure:** $0 fixed hosting and database cost on starter tiers.

---

## 2. Database Schema (Supabase SQL)

Run the following SQL script in your Supabase SQL Editor to provision tables, indexes, and triggers.

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. AGENTS TABLE
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    momo_number TEXT NOT NULL,
    momo_network TEXT NOT NULL, -- 'MTN', 'VODAFONE', 'AIRTELTIGO'
    referral_code TEXT UNIQUE NOT NULL,
    balance_earned NUMERIC(10,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. VENDORS TABLE
CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name TEXT NOT NULL,
    subdomain TEXT UNIQUE NOT NULL,
    whatsapp_number TEXT NOT NULL,
    owner_momo_number TEXT NOT NULL,
    owner_momo_network TEXT NOT NULL,
    paystack_subaccount_code TEXT UNIQUE,
    is_active BOOLEAN DEFAULT FALSE,
    activation_fee_paid BOOLEAN DEFAULT FALSE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. PRODUCTS TABLE
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. ORDERS TABLE
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    platform_fee NUMERIC(10,2) DEFAULT 0.20,
    vendor_amount NUMERIC(10,2) NOT NULL,
    payment_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'SUCCESS', 'FAILED'
    paystack_reference TEXT UNIQUE NOT NULL,
    items JSONB NOT NULL, -- Array of ordered items
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. PAYOUTS TABLE (For Agent & Platform tracking)
CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'PAID', 'FAILED'
    momo_reference TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INDEXES FOR FAST SUBDOMAIN REWRITES & LOOKUPS
CREATE INDEX idx_vendors_subdomain ON vendors(subdomain);
CREATE INDEX idx_products_vendor ON products(vendor_id);
CREATE INDEX idx_orders_vendor ON orders(vendor_id);
CREATE INDEX idx_agents_ref_code ON agents(referral_code);
```

---

## 3. Next.js Middleware (`middleware.ts`)

Create `middleware.ts` in your root project directory to handle subdomains dynamically.

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get('host') || '';

  // Define root domains (including local dev environment)
  const allowedDomains = ['seepay.shop', 'localhost:3000'];
  
  let currentHost = hostname;
  allowedDomains.forEach((domain) => {
    currentHost = currentHost.replace(`.${domain}`, '');
  });

  // Root domain access (seepay.shop) -> standard routing
  if (currentHost === hostname || currentHost === 'www' || currentHost === 'seepay.shop') {
    return NextResponse.next();
  }

  // Dynamic subdomain detected (e.g., mamajollof.seepay.shop)
  // Rewrite request internally to /store/[subdomain]
  url.pathname = `/store/${currentHost}${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 4. Paystack Integration API Routes

### A. Subaccount Creation API Route (`/api/paystack/create-subaccount/route.ts`)
Creates a Paystack Subaccount for a newly registered vendor so split payments can route automatically.

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { vendorId, businessName, momoNumber, momoNetwork } = await req.json();

    // 1. Request Paystack Subaccount Creation
    const response = await fetch('https://api.paystack.co/subaccount', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        business_name: businessName,
        settlement_bank: momoNetwork, // e.g., 'MTN', 'VODAFONE', 'AIRTELTIGO'
        account_number: momoNumber,
        percentage_charge: 0, // We charge flat fees via split, not percentage
      }),
    });

    const data = await response.json();

    if (!data.status) {
      return NextResponse.json({ error: data.message }, { status: 400 });
    }

    const subaccountCode = data.data.subaccount_code;

    // 2. Save Subaccount Code to Supabase
    const { error: dbError } = await supabase
      .from('vendors')
      .update({ paystack_subaccount_code: subaccountCode })
      .eq('id', vendorId);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, subaccountCode });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

### B. Order Split Payment Route (`/api/paystack/initialize-order/route.ts`)
Executes customer payment with a dynamic flat fee split (GHS 0.20 platform cut).

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { vendorSubdomain, items, customerName, customerPhone, totalAmount } = await req.json();

    // Fetch vendor subaccount details
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('id, paystack_subaccount_code')
      .eq('subdomain', vendorSubdomain)
      .single();

    if (error || !vendor || !vendor.paystack_subaccount_code) {
      return NextResponse.json({ error: 'Vendor account not properly configured' }, { status: 400 });
    }

    // Convert GHS amount to Pesewas for Paystack (e.g., GHS 10.00 = 1000 pesewas)
    const amountInPesewas = Math.round(totalAmount * 100);
    const platformFeeInPesewas = 20; // GHS 0.20 platform fee

    // Generate unique reference
    const reference = `ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Initialize Transaction with Subaccount Split
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: `customer_${Date.now()}@seepay.shop`, // Dummy email if phone-only
        amount: amountInPesewas,
        currency: 'GHS',
        reference,
        subaccount: vendor.paystack_subaccount_code,
        transaction_charge: platformFeeInPesewas, // Flat GHS 0.20 fee to main platform account
        callback_url: `https://${vendorSubdomain}.seepay.shop/order-status?ref=${reference}`,
        metadata: {
          customer_name: customerName,
          customer_phone: customerPhone,
          vendor_id: vendor.id,
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      return NextResponse.json({ error: paystackData.message }, { status: 400 });
    }

    // Save pending order record in Supabase
    await supabase.from('orders').insert({
      vendor_id: vendor.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      total_amount: totalAmount,
      platform_fee: 0.20,
      vendor_amount: totalAmount - 0.20,
      payment_status: 'PENDING',
      paystack_reference: reference,
      items,
    });

    return NextResponse.json({ authorization_url: paystackData.data.authorization_url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

---

## 5. Agent Referral Tracking Logic

### Registration API Route with Referral Handling (`/api/vendors/register/route.ts`)

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { businessName, subdomain, whatsappNumber, ownerMomoNumber, ownerMomoNetwork, referralCode } = await req.json();

    let agentId = null;

    // Check if referral code is provided
    if (referralCode) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id')
        .eq('referral_code', referralCode.toUpperCase())
        .single();

      if (agent) {
        agentId = agent.id;
      }
    }

    // Create Vendor Record
    const { data: vendor, error } = await supabase
      .from('vendors')
      .insert({
        business_name: businessName,
        subdomain: subdomain.toLowerCase(),
        whatsapp_number: whatsappNumber,
        owner_momo_number: ownerMomoNumber,
        owner_momo_network: ownerMomoNetwork,
        agent_id: agentId,
        is_active: false,
        activation_fee_paid: false,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, vendorId: vendor.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

### Paystack Activation Webhook (`/api/paystack/webhook/route.ts`)
Triggers agent commission logging when a vendor completes their GHS 150 setup fee.

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.json();

  // Verify Paystack event
  if (body.event === 'charge.success') {
    const { reference, metadata } = body.data;

    // Vendor Activation Processing
    if (metadata?.type === 'VENDOR_ACTIVATION') {
      const { vendorId } = metadata;

      // 1. Fetch vendor and associated agent
      const { data: vendor } = await supabase
        .from('vendors')
        .select('id, agent_id')
        .eq('id', vendorId)
        .single();

      if (vendor) {
        // Activate Vendor
        await supabase
          .from('vendors')
          .update({ is_active: true, activation_fee_paid: true })
          .eq('id', vendorId);

        // Credit Agent GHS 50 if recruited via referral code
        if (vendor.agent_id) {
          const { data: agent } = await supabase
            .from('agents')
            .select('balance_earned')
            .eq('id', vendor.agent_id)
            .single();

          if (agent) {
            const newBalance = Number(agent.balance_earned) + 50.00;
            await supabase
              .from('agents')
              .update({ balance_earned: newBalance })
              .eq('id', vendor.agent_id);
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
```

---

## 6. Step-by-Step Setup & Deployment Instructions

### Step 1: Clone & Initialize Next.js Project
```bash
npx create-next-app@latest seepay --typescript --tailwind --app
cd seepay
npm install @supabase/supabase-js lucide-react
```

### Step 2: Configure Environment Variables
Create a `.env.local` file in your root folder:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

PAYSTACK_SECRET_KEY=REPLACE_WITH_SERVER_SIDE_SECRET
PAYSTACK_PUBLIC_KEY=pk_test_REPLACE_ME  # server environment only if you later add inline checkout
```

### Step 3: Link Custom Domain & Wildcard DNS
1. Log into **Namecheap** $\rightarrow$ **Advanced DNS** for `seepay.shop`.
2. Add records:
   * **A Record:** `@` $\rightarrow$ `76.76.21.21`
   * **CNAME Record:** `*` $\rightarrow$ Netlify DNS nameservers / records shown in the Netlify dashboard
3. Deploy to **Vercel** and go to **Settings $\rightarrow$ Domains**.
4. Add `seepay.shop` and enable **`*.seepay.shop`** wildcard support.

### Step 4: Run Initial DB Migration
Copy the SQL snippet from **Section 2** and execute it inside the Supabase SQL Editor.

### Step 5: Test Verification
1. Register a test vendor at `seepay.shop/register?ref=AGENT01`.
2. Verify subaccount creation in your Paystack Dashboard under **Subaccounts**.
3. Access `teststore.seepay.shop` and complete a test transaction.