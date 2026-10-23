create or replace function private.handle_new_seepay_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare generated_code text;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type','')='vendor' then
    insert into public.vendors(owner_user_id,business_name,slug,owner_full_name,whatsapp_number,owner_momo_number,owner_momo_network,referral_code)
    values(new.id,coalesce(nullif(new.raw_user_meta_data ->> 'business_name',''),'My shop'),
      coalesce(nullif(new.raw_user_meta_data ->> 'slug',''),'shop-'||left(replace(new.id::text,'-',''),12)),
      coalesce(new.raw_user_meta_data ->> 'full_name',''),coalesce(new.raw_user_meta_data ->> 'whatsapp_number',''),
      coalesce(new.raw_user_meta_data ->> 'owner_momo_number',''),nullif(new.raw_user_meta_data ->> 'owner_momo_network',''),
      nullif(new.raw_user_meta_data ->> 'referral_code',''));
  elsif coalesce(new.raw_user_meta_data ->> 'account_type','')='agent' then
    generated_code := upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
    insert into public.agents(owner_user_id,full_name,momo_number,momo_network,referral_code)
    values(new.id,coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''),''),
      coalesce(nullif(new.raw_user_meta_data ->> 'momo_number',''),''),
      coalesce(nullif(new.raw_user_meta_data ->> 'momo_network',''),'MTN'),generated_code);
  end if;
  return new;
end; $$;
revoke all on function private.handle_new_seepay_user() from public,anon,authenticated;
