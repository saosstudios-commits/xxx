-- SeePay core schema. Starts with no seeded business records.
create extension if not exists pgcrypto;

create table if not exists public.vendors (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null unique references auth.users(id) on delete cascade,
 business_name text not null,
 slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
 description text not null default '',
 whatsapp_number text not null default '',
 logo_url text, banner_url text,
 activation_status text not null default 'pending' check (activation_status in ('pending','paid','active','suspended')),
 activation_fee_ghs numeric(10,2) not null default 150.00 check (activation_fee_ghs >= 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.products (
 id uuid primary key default gen_random_uuid(),
 vendor_id uuid not null references public.vendors(id) on delete cascade,
 name text not null, description text not null default '', category text not null default '',
 price numeric(10,2) not null check (price >= 0), stock integer not null default 0 check (stock >= 0),
 image_url text, is_available boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.orders (
 id uuid primary key default gen_random_uuid(),
 vendor_id uuid not null references public.vendors(id) on delete restrict,
 customer_name text not null, customer_phone text not null,
 items jsonb not null check (jsonb_typeof(items)='array'),
 subtotal_ghs numeric(10,2) not null check (subtotal_ghs >= 0),
 platform_fee_ghs numeric(10,2) not null default 0.20 check (platform_fee_ghs >= 0),
 total_ghs numeric(10,2) not null check (total_ghs >= 0),
 payment_status text not null default 'pending' check (payment_status in ('pending','success','failed','refunded')),
 paystack_reference text unique, created_at timestamptz not null default now()
);

create table if not exists public.agents (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null unique references auth.users(id) on delete cascade,
 full_name text not null, momo_number text not null,
 momo_network text not null check (momo_network in ('MTN','TELECEL','AT')),
 referral_code text not null unique, created_at timestamptz not null default now()
);

create table if not exists public.referrals (
 id uuid primary key default gen_random_uuid(),
 agent_id uuid not null references public.agents(id) on delete cascade,
 vendor_id uuid not null unique references public.vendors(id) on delete cascade,
 commission_ghs numeric(10,2) not null default 50.00 check (commission_ghs >= 0),
 status text not null default 'pending' check (status in ('pending','earned','paid','void')),
 created_at timestamptz not null default now()
);

create index if not exists products_vendor_idx on public.products(vendor_id);
create index if not exists orders_vendor_created_idx on public.orders(vendor_id,created_at desc);
create index if not exists vendors_slug_idx on public.vendors(slug);
create index if not exists referrals_agent_idx on public.referrals(agent_id);

alter table public.vendors enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.agents enable row level security;
alter table public.referrals enable row level security;

create policy vendors_select_own on public.vendors for select to authenticated using (owner_user_id=(select auth.uid()));
create policy vendors_insert_own on public.vendors for insert to authenticated with check (owner_user_id=(select auth.uid()));
create policy vendors_update_own on public.vendors for update to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
create policy vendors_public_active_shop on public.vendors for select to anon, authenticated using (activation_status='active');

create policy products_select_own on public.products for select to authenticated using (exists(select 1 from public.vendors v where v.id=vendor_id and v.owner_user_id=(select auth.uid())));
create policy products_insert_own on public.products for insert to authenticated with check (exists(select 1 from public.vendors v where v.id=vendor_id and v.owner_user_id=(select auth.uid())));
create policy products_update_own on public.products for update to authenticated using (exists(select 1 from public.vendors v where v.id=vendor_id and v.owner_user_id=(select auth.uid()))) with check (exists(select 1 from public.vendors v where v.id=vendor_id and v.owner_user_id=(select auth.uid())));
create policy products_delete_own on public.products for delete to authenticated using (exists(select 1 from public.vendors v where v.id=vendor_id and v.owner_user_id=(select auth.uid())));
create policy products_public_available on public.products for select to anon, authenticated using (is_available=true and exists(select 1 from public.vendors v where v.id=vendor_id and v.activation_status='active'));

create policy orders_select_own on public.orders for select to authenticated using (exists(select 1 from public.vendors v where v.id=vendor_id and v.owner_user_id=(select auth.uid())));
create policy agents_select_own on public.agents for select to authenticated using (owner_user_id=(select auth.uid()));
create policy agents_insert_own on public.agents for insert to authenticated with check (owner_user_id=(select auth.uid()));
create policy agents_update_own on public.agents for update to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
create policy referrals_agent_select_own on public.referrals for select to authenticated using (exists(select 1 from public.agents a where a.id=agent_id and a.owner_user_id=(select auth.uid())));

grant select on public.vendors, public.products to anon, authenticated;
grant insert, update, delete on public.vendors, public.products, public.agents to authenticated;
grant select on public.orders, public.agents, public.referrals to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('shop-media','shop-media',false,3000000,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=3000000,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy shop_media_select_own on storage.objects for select to authenticated using(bucket_id='shop-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy shop_media_insert_own on storage.objects for insert to authenticated with check(bucket_id='shop-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy shop_media_update_own on storage.objects for update to authenticated using(bucket_id='shop-media' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='shop-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy shop_media_delete_own on storage.objects for delete to authenticated using(bucket_id='shop-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
