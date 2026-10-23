create or replace function private.protect_vendor_billing_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    new.activation_status := old.activation_status;
    new.activation_fee_ghs := old.activation_fee_ghs;
    new.activation_payment_reference := old.activation_payment_reference;
    new.activated_at := old.activated_at;
    new.owner_user_id := old.owner_user_id;
  end if;
  return new;
end; $$;
drop trigger if exists protect_vendor_billing_fields on public.vendors;
create trigger protect_vendor_billing_fields before update on public.vendors for each row execute function private.protect_vendor_billing_fields();
revoke all on function private.protect_vendor_billing_fields() from public,anon,authenticated;
