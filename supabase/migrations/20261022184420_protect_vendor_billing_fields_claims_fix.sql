create or replace function private.protect_vendor_billing_fields()
returns trigger language plpgsql set search_path = '' as $$
declare jwt_role text;
begin
  jwt_role := coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'role', current_setting('request.jwt.claim.role',true), '');
  if jwt_role <> 'service_role' then
    new.activation_status := old.activation_status;
    new.activation_fee_ghs := old.activation_fee_ghs;
    new.activation_payment_reference := old.activation_payment_reference;
    new.activated_at := old.activated_at;
    new.owner_user_id := old.owner_user_id;
  end if;
  return new;
end; $$;
