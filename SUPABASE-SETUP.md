# Supabase setup for SeePay

This package is configured for the actual Supabase project:

- Project ref: `bttdrxencafnfzlkcnjl`
- API URL: `https://bttdrxencafnfzlkcnjl.supabase.co`
- Browser Supabase publishable key: `supabase-config.js` (safe to publish; RLS remains enabled)
- Paystack public key: recorded in `supabase-config.js` as `window.SEE_PAY_PAYMENT_CONFIG.publicKey` (safe to publish)
- Root domain intended by the current site copy: `seepay.shop`

## Live database

These empty tables exist in the live project: `vendors`, `products`, `orders`, `agents`, `referrals`, and `agent_payouts`. Row-level security is enabled on each. Signup triggers create merchant/agent profiles; a valid agent referral code is attributed to the vendor. The `shop-media` Storage bucket accepts JPEG, PNG and WebP uploads up to 3 MB. It is configured as public because storefront images use public URLs; authenticated upload paths are restricted to the owning user's folder.

The SQL files mirror database migrations already applied to this project. Do not manually rerun those migrations against this same remote database.

## 1) Turn off email confirmation

In Supabase Dashboard, open **Authentication → Providers → Email** for this project and turn off **Confirm email** (the provider setting may also be labelled **Email confirmations**), then save. Supabase returns a sign-in session immediately after registration only when this setting is disabled. The front-end now explains the exact setting if signup still returns no session.

Direct project link: https://supabase.com/dashboard/project/bttdrxencafnfzlkcnjl/auth/providers

## 2) Configure Paystack credentials as server secrets

Never put a Paystack secret key in `supabase-config.js`, HTML, frontend JavaScript or Git. The PDF's **test public key** (starts with `pk_test_`) is set in `window.SEE_PAY_PAYMENT_CONFIG.publicKey` and is safe to expose. This version uses redirect checkout initialized server-side, so that public key is available as configuration but the actual checkout initialization uses the test secret on the backend. The secret must be saved only as the `PAYSTACK_SECRET_KEY` Edge Function secret.

Open **Edge Functions → Secrets**: https://supabase.com/dashboard/project/bttdrxencafnfzlkcnjl/functions/secrets

Add/update these server environment variables:

- `PAYSTACK_SECRET_KEY` = the secret key that matches the public key in `supabase-config.js`. Use the LIVE secret only after your Paystack business account is approved and you are ready to accept real payments; never place it in Git or browser code.
- `SITE_URL` = the exact HTTPS origin of your currently deployed Vercel site. Later, after the apex domain and wildcard subdomains are connected, change it to `https://seepay.shop`.

Do not commit any secret values. Changing the browser public key alone does not switch the backend to live payments; the Supabase secret must match.

A CLI helper is provided at `scripts/set-paystack-test-secret.sh` if you prefer interactive setup. It asks for the test secret without echoing it and sets it remotely using the Supabase CLI. Run it only after `supabase login` and `supabase link --project-ref bttdrxencafnfzlkcnjl`.

## 3) Edge Functions currently deployed

The four Edge Functions are already deployed to this SeePay Supabase project. Their source is included under `supabase/functions/`. If you change their source and want to redeploy from your own terminal, use the following commands. All functions set gateway JWT verification off because this project uses a modern `sb_publishable_` key; `initialize-activation` validates the user session itself before it creates a payment.

## Redeploy the Edge Functions

From the repository root after installing the Supabase CLI and logging in:

```sh
supabase link --project-ref bttdrxencafnfzlkcnjl
supabase functions deploy initialize-activation --no-verify-jwt
supabase functions deploy initialize-checkout --no-verify-jwt
supabase functions deploy paystack-webhook --no-verify-jwt
supabase functions deploy lookup-order-status --no-verify-jwt
```

Activation and checkout remain unavailable until `PAYSTACK_SECRET_KEY` and `SITE_URL` are set. The webhook only activates a merchant after the signature, reference, GHS currency, exact GH₵150 amount, `charge.success`, and Paystack’s own transaction verification all pass. Product orders are marked paid only after server verification, and stock updates run atomically once per order. If a customer pays after stock becomes unavailable, the order is flagged `inventory_issue` for review rather than silently overselling. The customer return page never treats a redirect alone as payment success.

Paystack webhook URL (configure in the matching Paystack dashboard mode):

`https://bttdrxencafnfzlkcnjl.supabase.co/functions/v1/paystack-webhook`

Test successful activation, failed payment, duplicate webhook deliveries, incorrect amount/currency and customer order payment before launch. Ensure the webhook is configured in the same Paystack mode as the backend secret.

## 4) Wildcard storefront domains on Netlify

The included Netlify Edge Function at `netlify/edge-functions/storefront-subdomain.ts` rewrites the root of `*.seepay.shop` to `store.html?shop=<subdomain>`, and `assets/js/live-app.js` also recognizes the subdomain. Add `seepay.shop` and `*.seepay.shop` to the same Netlify site, configure Netlify DNS, and confirm wildcard HTTPS is enabled. The wildcard is not active merely because the config file is present.

In Supabase Auth URL Configuration, set the Site URL to `https://seepay.shop` and allow redirects such as:

- `https://seepay.shop/**`
- `https://*.seepay.shop/**`
- Your Netlify deploy URL while testing, if needed

Update the `SITE_URL` Edge Function secret to `https://seepay.shop` after DNS/TLS are working. Keep the public marketing site on the apex and storefronts on individual subdomains.
