alter table public.orders
  add column if not exists customer_email text not null default '',
  add column if not exists delivery_notes text not null default '';
