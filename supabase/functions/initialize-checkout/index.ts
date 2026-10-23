import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function corsHeaders(req: Request) {
  const siteUrl = Deno.env.get('SITE_URL') || 'https://seepay.shop';
  const origin = req.headers.get('Origin');
  let allowedOrigin = siteUrl || '*';
  if (origin && siteUrl) {
    try {
      const base = new URL(siteUrl);
      const requestOrigin = new URL(origin);
      const sameSiteOrSubdomain = requestOrigin.protocol === base.protocol
        && (requestOrigin.hostname === base.hostname || requestOrigin.hostname.endsWith(`.${base.hostname}`));
      if (sameSiteOrSubdomain) allowedOrigin = origin;
    } catch { /* Keep the configured site URL as the only allowed origin. */ }
  }
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };
}
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const paystackKey = Deno.env.get('PAYSTACK_SECRET_KEY');
  const siteUrl = Deno.env.get('SITE_URL') || 'https://seepay.shop';
  if (!supabaseUrl || !serviceKey || !paystackKey || !siteUrl) {
    return json(req, { error: 'Payment service is not configured on the server.' }, 503);
  }

  try {
    const body = await req.json();
    const vendorSlug = String(body.shop ?? '').trim().toLowerCase();
    const productId = String(body.productId ?? '').trim();
    const customerName = String(body.name ?? '').trim();
    const customerPhone = String(body.phone ?? '').replace(/[\s-]/g, '');
    const customerEmail = String(body.email ?? '').trim().toLowerCase();
    const deliveryNotes = String(body.note ?? '').trim().slice(0, 1000);
    const quantity = Number(body.quantity ?? 1);
    if (!vendorSlug || !productId || customerName.length < 2 || !/^\+?[0-9]{9,15}$/.test(customerPhone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return json(req, { error: 'Please provide a valid shop, product, name, Ghana phone number, email and quantity.' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: vendor, error: vendorError } = await admin.from('vendors')
      .select('id,business_name,activation_status').eq('slug', vendorSlug).eq('activation_status', 'active').maybeSingle();
    if (vendorError) throw vendorError;
    if (!vendor) return json(req, { error: 'This shop is not active.' }, 404);

    const { data: product, error: productError } = await admin.from('products')
      .select('id,name,price,stock,is_available').eq('id', productId).eq('vendor_id', vendor.id).eq('is_available', true).maybeSingle();
    if (productError) throw productError;
    if (!product) return json(req, { error: 'This product is unavailable.' }, 404);
    if (quantity > product.stock) return json(req, { error: 'There is not enough stock for that quantity.' }, 409);

    // Convert each amount to pesewas first to avoid floating-point money arithmetic.
    const unitPesewas = Math.round(Number(product.price) * 100);
    const subtotalPesewas = unitPesewas * quantity;
    const platformFeePesewas = 20; // GH₵0.20 SeePay fee per successful paid order.
    const totalPesewas = subtotalPesewas + platformFeePesewas;
    const reference = `SP_${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`;
    const itemSnapshot = [{ product_id: product.id, name: product.name, unit_price_ghs: (unitPesewas / 100).toFixed(2), quantity }];

    const { data: order, error: insertError } = await admin.from('orders').insert({
      vendor_id: vendor.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      delivery_notes: deliveryNotes,
      items: itemSnapshot,
      subtotal_ghs: (subtotalPesewas / 100).toFixed(2),
      platform_fee_ghs: (platformFeePesewas / 100).toFixed(2),
      total_ghs: (totalPesewas / 100).toFixed(2),
      payment_status: 'pending',
      paystack_reference: reference
    }).select('id').single();
    if (insertError) throw insertError;

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customerEmail,
        amount: totalPesewas,
        currency: 'GHS',
        reference,
        callback_url: `${siteUrl.replace(/\/$/, '')}/payment-return.html`,
        metadata: { seepay_order_id: order.id, vendor_id: vendor.id, quantity }
      })
    });
    const paystack = await response.json();
    if (!response.ok || !paystack.status || !paystack.data?.authorization_url) {
      await admin.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
      return json(req, { error: 'Paystack could not initialize this payment. Please try again.' }, 502);
    }
    return json(req, { authorization_url: paystack.data.authorization_url, reference, order_id: order.id });
  } catch (error) {
    console.error('initialize-checkout failed', error);
    return json(req, { error: 'Could not create checkout right now.' }, 500);
  }
});
