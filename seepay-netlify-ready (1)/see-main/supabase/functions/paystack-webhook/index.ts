import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySuccessfulTransaction(reference: string, expectedAmountPesewas: number, secret: string) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` }
  });
  const payload = await response.json();
  if (!response.ok || !payload?.status || !payload?.data) {
    throw new Error('Paystack transaction verification is temporarily unavailable.');
  }
  const transaction = payload.data;
  return transaction.reference === reference
    && transaction.status === 'success'
    && transaction.currency === 'GHS'
    && Number(transaction.amount) === expectedAmountPesewas;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !url || !serviceKey) return new Response('Webhook is not configured', { status: 503 });
  const raw = await req.text();
  const supplied = req.headers.get('x-paystack-signature') || '';
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const expected = toHex(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(raw)));
  if (!constantTimeEqual(expected, supplied)) return new Response('Invalid signature', { status: 401 });

  try {
    const event = JSON.parse(raw);
    if (!['charge.success', 'charge.failed'].includes(event.event)) return new Response('Ignored', { status: 200 });
    const reference = String(event.data?.reference || '');
    if (!reference) return new Response('Missing reference', { status: 400 });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Activation payments are separate from product orders.
    if (reference.startsWith('SP_ACT_')) {
      const { data: vendor, error } = await admin.from('vendors').select('id,activation_status,activation_fee_ghs').eq('activation_payment_reference', reference).maybeSingle();
      if (error) throw error;
      if (!vendor) return new Response('Activation reference not found', { status: 404 });
      if (event.event === 'charge.success') {
        const expectedPesewas = Math.round(Number(vendor.activation_fee_ghs) * 100);
        if (event.data.currency !== 'GHS' || Number(event.data.amount) !== expectedPesewas) return new Response('Amount or currency mismatch', { status: 400 });
        if (event.data.status !== 'success' || !(await verifySuccessfulTransaction(reference, expectedPesewas, secret))) return new Response('Paystack verification did not confirm this activation payment', { status: 400 });
        if (vendor.activation_status !== 'active') {
          const { error: updateError } = await admin.from('vendors').update({ activation_status: 'active', activated_at: new Date().toISOString() }).eq('id', vendor.id);
          if (updateError) throw updateError;
          const { error: referralError } = await admin.from('referrals').update({ status: 'earned' }).eq('vendor_id', vendor.id).eq('status', 'pending');
          if (referralError) throw referralError;
        }
      }
      return new Response('OK', { status: 200 });
    }

    const { data: order, error } = await admin.from('orders').select('id,total_ghs,payment_status').eq('paystack_reference', reference).maybeSingle();
    if (error) throw error;
    if (!order) return new Response('Order not found', { status: 404 });
    if (event.event === 'charge.success') {
      const expectedPesewas = Math.round(Number(order.total_ghs) * 100);
      if (event.data.currency !== 'GHS' || Number(event.data.amount) !== expectedPesewas) return new Response('Amount or currency mismatch', { status: 400 });
      if (event.data.status !== 'success' || !(await verifySuccessfulTransaction(reference, expectedPesewas, secret))) return new Response('Paystack verification did not confirm this order payment', { status: 400 });
      const { data: inventoryResult, error: inventoryError } = await admin.rpc('process_verified_paid_order', { p_order_id: order.id });
      if (inventoryError) throw inventoryError;
      if (!inventoryResult?.ok) throw new Error('Verified payment could not be recorded for this order.');
    } else if (order.payment_status === 'pending') {
      const { error: updateError } = await admin.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
      if (updateError) throw updateError;
    }
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('paystack-webhook failed', error);
    return new Response('Webhook processing failed', { status: 500 });
  }
});
