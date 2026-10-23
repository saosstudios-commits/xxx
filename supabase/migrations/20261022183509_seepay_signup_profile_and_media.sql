alter table public.vendors
  add column if not exists owner_full_name text not null default '',
  add column if not exists owner_momo_number text not null default '',
  add column if not exists owner_momo_network text,
  add column if not exists referral_code text;

alter table public.vendors drop constraint if exists vendors_owner_momo_network_check;
alter table public.vendors add constraint vendors_owner_momo_network_check
  check (owner_momo_network is null or owner_momo_network in ('MTN','TELECEL','AT'));

update storage.buckets set public=true, file_size_limit=3000000,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='shop-media';

create schema if not exists private;
create or replace function private.handle_new_seepay_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type','')='vendor' then
    insert into public.vendors(owner_user_id,business_name,slug,owner_full_name,whatsapp_number,owner_momo_number,owner_momo_network,referral_code)
    values(new.id,coalesce(nullif(new.raw_user_meta_data ->> 'business_name',''),'My shop'),
      coalesce(nullif(new.raw_user_meta_data ->> 'slug',''),'shop-'||left(replace(new.id::text,'-',''),12)),
      coalesce(new.raw_user_meta_data ->> 'full_name',''),coalesce(new.raw_user_meta_data ->> 'whatsapp_number',''),
      coalesce(new.raw_user_meta_data ->> 'owner_momo_number',''),nullif(new.raw_user_meta_data ->> 'owner_momo_network',''),
      nullif(new.raw_user_meta_data ->> 'referral_code',''));
  end if;
  return new;
end; $$;
revoke all on function private.handle_new_seepay_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_seepay on auth.users;
create trigger on_auth_user_created_seepay after insert on auth.users for each row execute function private.handle_new_seepay_user();
