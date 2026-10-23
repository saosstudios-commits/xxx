-- Fix agent signup trigger under an empty search_path. This migration is already applied on the connected Supabase project.
create or replace function private.handle_new_seepay_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_code text;
  new_vendor_id uuid;
  referred_agent_id uuid;
  entered_referral text;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'vendor' then
    entered_referral := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code','')));
    insert into public.vendors (owner_user_id, business_name, slug, owner_full_name, whatsapp_number, owner_momo_number, owner_momo_network, referral_code)
    values (new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'business_name',''), 'My shop'),
      coalesce(nullif(new.raw_user_meta_data ->> 'slug',''), 'shop-' || left(replace(new.id::text,'-',''), 12)),
      coalesce(new.raw_user_meta_data ->> 'full_name',''),
      coalesce(new.raw_user_meta_data ->> 'whatsapp_number',''),
      coalesce(new.raw_user_meta_data ->> 'owner_momo_number',''),
      nullif(new.raw_user_meta_data ->> 'owner_momo_network',''),
      nullif(entered_referral,''))
    returning id into new_vendor_id;
    if entered_referral <> '' then
      select a.id into referred_agent_id from public.agents as a where upper(a.referral_code)=entered_referral limit 1;
      if referred_agent_id is not null then
        insert into public.referrals(agent_id,vendor_id,commission_ghs,status)
        values(referred_agent_id,new_vendor_id,50.00,'pending') on conflict(vendor_id) do nothing;
      end if;
    end if;
  elsif coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'agent' then
    generated_code := upper(substr(pg_catalog.encode(extensions.gen_random_bytes(6),'hex'),1,10));
    insert into public.agents(owner_user_id,full_name,momo_number,momo_network,referral_code)
    values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''), ''),
      coalesce(nullif(new.raw_user_meta_data ->> 'momo_number',''), ''),
      coalesce(nullif(new.raw_user_meta_data ->> 'momo_network',''),'MTN'), generated_code);
  end if;
  return new;
end;
$$;
revoke all on function private.handle_new_seepay_user() from public, anon, authenticated;
