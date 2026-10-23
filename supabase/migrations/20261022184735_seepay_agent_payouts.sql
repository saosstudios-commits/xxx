create table if not exists public.agent_payouts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete restrict,
  amount_ghs numeric(10,2) not null check (amount_ghs > 0),
  momo_number text not null,
  momo_network text not null check (momo_network in ('MTN','TELECEL','AT')),
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','cancelled')),
  payment_reference text unique,
  notes text not null default '',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists agent_payouts_agent_created_idx on public.agent_payouts(agent_id, created_at desc);
alter table public.agent_payouts enable row level security;
create policy agent_payouts_select_own on public.agent_payouts for select to authenticated
  using (exists (select 1 from public.agents a where a.id=agent_id and a.owner_user_id=(select auth.uid())));
revoke all on public.agent_payouts from anon, authenticated;
grant select on public.agent_payouts to authenticated;
