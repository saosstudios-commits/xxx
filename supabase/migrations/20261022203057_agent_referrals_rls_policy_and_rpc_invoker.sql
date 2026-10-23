-- Let an agent read a limited vendor profile only when that vendor was attributed to their referral.
drop policy if exists vendors_select_referred_own_agent on public.vendors;
create policy vendors_select_referred_own_agent on public.vendors for select to authenticated
using (exists (select 1 from public.referrals r join public.agents a on a.id = r.agent_id
  where r.vendor_id = vendors.id and a.owner_user_id = (select auth.uid())));

create or replace function public.get_my_agent_referrals()
returns table (id uuid, agent_id uuid, vendor_id uuid, business_name text, slug text, activation_status text, commission_ghs numeric, status text, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select r.id, r.agent_id, r.vendor_id, v.business_name, v.slug, v.activation_status, r.commission_ghs, r.status, r.created_at
  from public.referrals r join public.agents a on a.id = r.agent_id join public.vendors v on v.id = r.vendor_id
  where a.owner_user_id = (select auth.uid()) order by r.created_at desc;
$$;
revoke all on function public.get_my_agent_referrals() from public, anon;
grant execute on function public.get_my_agent_referrals() to authenticated;
