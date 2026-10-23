import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function corsHeaders(req: Request) {
  const siteUrl = Deno.env.get('SITE_URL') || 'https://seepay.shop';
  const origin = req.headers.get('Origin');
  let allowedOrigin = siteUrl || '*';
  if (origin && siteUrl) {
    try {
      const base = new URL(siteUrl);
      const requestOrigin = new URL(origin);
      if (requestOrigin.protocol === base.protocol && (requestOrigin.hostname === base.hostname || requestOrigin.hostname.endsWith(`.${base.hostname}`))) allowedOrigin = origin;
    } catch { /* Keep only the configured site as the allowed fallback. */ }
  }
  return { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
}
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json(req, { error: 'Order lookup is not configured.' }, 503);

  try {
    const body = await req.json();
    const reference = String(body.reference || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    if (reference.length < 10 || reference.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(req, { error: 'Enter the order reference and the email used at checkout.' }, 400);
    }
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.from('orders')
      .select('paystack_reference,payment_status,total_ghs,created_at,customer_email')
      .eq('paystack_reference', reference).maybeSingle();
    if (error) throw error;
    // Use the same response if either field is wrong to avoid disclosing whether a reference exists.
    if (!data || String(data.customer_email || '').toLowerCase() !== email) {
      return json(req, { error: 'No order matched that reference and email. Check both details and try again.' }, 404);
    }
    return json(req, {
      reference: data.paystack_reference,
      payment_status: data.payment_status,
      total_ghs: Number(data.total_ghs),
      created_at: data.created_at
    });
  } catch (error) {
    console.error('lookup-order-status failed', error);
    return json(req, { error: 'Could not check that order right now.' }, 500);
  }
});
