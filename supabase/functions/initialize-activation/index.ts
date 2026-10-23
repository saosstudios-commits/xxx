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

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const paystackKey = Deno.env.get('PAYSTACK_SECRET_KEY');
  const siteUrl = Deno.env.get('SITE_URL') || 'https://seepay.shop';
  const authHeader = req.headers.get('Authorization') || '';
  if (!url || !anonKey || !serviceKey || !paystackKey || !siteUrl || !authHeader.startsWith('Bearer ')) {
    return json(req, { error: 'Activation payment service is not configured.' }, 503);
  }

  try {
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json(req, { error: 'Sign in before paying the activation fee.' }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: vendor, error: vendorError } = await admin.from('vendors')
      .select('id,business_name,activation_status,activation_fee_ghs')
      .eq('owner_user_id', userData.user.id).maybeSingle();
    if (vendorError) throw vendorError;
    if (!vendor) return json(req, { error: 'No merchant profile is linked to this account.' }, 404);
    if (vendor.activation_status === 'active') return json(req, { message: 'This shop is already active.' });

    const amountPesewas = Math.round(Number(vendor.activation_fee_ghs) * 100);
    if (amountPesewas !== 15000) return json(req, { error: 'The configured activation amount is not the expected GH₵150. Please contact SeePay support.' }, 409);
    const reference = `SP_ACT_${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`;
    const { error: saveError } = await admin.from('vendors').update({ activation_payment_reference: reference }).eq('id', vendor.id);
    if (saveError) throw saveError;

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userData.user.email,
        amount: amountPesewas,
        currency: 'GHS',
        reference,
        callback_url: `${siteUrl.replace(/\/$/, '')}/activation-return.html`,
        metadata: { kind: 'vendor_activation', vendor_id: vendor.id, owner_user_id: userData.user.id }
      })
    });
    const result = await response.json();
    if (!response.ok || !result.status || !result.data?.authorization_url) {
      await admin.from('vendors').update({ activation_payment_reference: null }).eq('id', vendor.id);
      return json(req, { error: 'Paystack could not initialize the activation payment. Try again.' }, 502);
    }
    return json(req, { authorization_url: result.data.authorization_url, reference });
  } catch (error) {
    console.error('initialize-activation failed', error);
    return json(req, { error: 'Could not start activation payment.' }, 500);
  }
});
