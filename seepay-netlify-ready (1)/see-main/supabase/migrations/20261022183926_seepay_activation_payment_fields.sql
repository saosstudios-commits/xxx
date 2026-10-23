alter table public.vendors
  add column if not exists activation_payment_reference text unique,
  add column if not exists activated_at timestamptz;
