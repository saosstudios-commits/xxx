# SeePay

Static HTML/CSS/JavaScript frontend, connected to the Supabase project below. No sample shops, products, orders, agents, or referral records are seeded in the database.

## Live Supabase project

- Project: `seepay`
- Project ref: `bttdrxencafnfzlkcnjl`
- URL: `https://bttdrxencafnfzlkcnjl.supabase.co`
- Region: London (`eu-west-2`)
- Browser config: `supabase-config.js` (publishable key only; no service-role or Paystack secret)

The database has already been created and migrated in that Supabase project. The live agent-signup trigger was corrected to schema-qualify `extensions.gen_random_bytes()`; its migration is included here so the code matches the remote database. The active schema contains `vendors`, `products`, `orders`, `agents`, `referrals`, and `agent_payouts`; row-level security is enabled on all six. The private signup trigger provisions vendor and agent profiles, and captures a valid agent referral code when a merchant signs up. A `shop-media` Storage bucket accepts JPEG, PNG, and WebP images up to 3,000,000 bytes.

## Mobile-responsive UI

The shared stylesheet includes a touch-first mobile layout pass for the public pages, registration/login forms, storefront, cart/checkout, merchant dashboard, and agent portal. It uses responsive grids, safe-area spacing, mobile dashboard header stacking, a slide-in sidebar with scroll locking, compact product cards, horizontal table scrollers, and smaller-screen form controls. Below-the-fold editorial images use lazy loading where appropriate. The stylesheet was parsed successfully and JavaScript syntax checks passed; perform a visual device check after deployment on an actual phone and tablet before launch.

## Upload the site

The front end requires no build step. Upload the contents of this folder to GitHub and deploy the repository on Netlify. The Netlify configuration is in `netlify.toml`. `index.html` is the entry point. The Supabase URL and publishable key are already in `supabase-config.js`.

## Merchant flow available in this code

1. Merchant/agent sign-up and sign-in use Supabase Auth.
2. The database creates the matching vendor/agent profile on sign-up.
3. The merchant dashboard reads actual vendor, product, and order rows.
4. Product creation/editing and shop settings persist to Supabase.
5. Product and store images upload to Supabase Storage (JPEG/PNG/WebP, max 3 MB).
6. Public store pages load active shops and available products from Supabase using an isolated anonymous client.
7. Billing-managed vendor fields are protected from browser-side changes.

## Signup and payments setup

1. In Supabase **Authentication → Providers → Email**, turn off **Confirm email** and save. Signup immediately signs the user in only when the provider setting is disabled. Instructions: `SUPABASE-SETUP.md`.
2. In Supabase **Edge Functions → Secrets**, set `PAYSTACK_SECRET_KEY` to the TEST secret from your Paystack dashboard/file and `SITE_URL` to the exact currently deployed HTTPS origin. Do not put Paystack keys in frontend code.
3. The four Edge Functions are already deployed on this connected Supabase project. Verified successful orders now go through an atomic, idempotent stock-processing function; if stock is no longer sufficient when payment settles, the order is flagged for manual review instead of allowing inventory to go negative. Redeploy only if you change their source; commands are in `SUPABASE-SETUP.md`.
4. Set the Paystack webhook to `https://bttdrxencafnfzlkcnjl.supabase.co/functions/v1/paystack-webhook`.
5. Connect `seepay.shop` and `*.seepay.shop` to the same Vercel project; configure the Supabase Auth Site URL and allowed redirect URLs; then update the `SITE_URL` secret to `https://seepay.shop`.

Agent signup, checkout email validation, and dashboard grid layout fixes are included in this release. The GH₵150 shop activation is granted only after a signed `charge.success` webhook, matching reference, GHS currency, exact expected amount and a successful server-to-server Paystack verification. Checkout orders use the same server-side verification. A return/redirect page never grants activation by itself.

## Database migrations

The migration files under `supabase/migrations/` reproduce the current remote schema, in order. Those migrations have **already been applied** to the project above; do not manually paste and re-run them on that same database. For a different Supabase project, link that project and use `supabase db push` after reviewing the target project and migration history.

## Important launch notes

- Public storefronts remain hidden until the server-side activation payment is verified by the webhook.
- Order history only records actual orders created by `initialize-checkout`; the app does not seed sample database records.
- Use HTTPS and set Supabase Auth Site URL / redirect URLs to your deployed domain. Add localhost URLs only for local development.
- Connect your custom domain after deploying the site, then update `SITE_URL` and Supabase Auth redirect settings to match it.


### Paystack payment configuration

The browser configuration contains a public Paystack key only. Checkout transactions are initialized server-side. Store the matching Paystack secret key only as the Supabase Edge Function secret `PAYSTACK_SECRET_KEY`; never commit a secret key. Before accepting real payments, confirm that the live secret key is configured in Supabase and test a complete live-mode flow with a controlled low-value transaction.
