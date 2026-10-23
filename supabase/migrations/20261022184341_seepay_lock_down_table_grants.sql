drop policy if exists vendors_insert_own on public.vendors;
drop policy if exists vendors_public_active_shop on public.vendors;
create policy vendors_public_active_shop on public.vendors for select to anon using (activation_status='active');
drop policy if exists products_public_available on public.products;
create policy products_public_available on public.products for select to anon using (
  is_available=true and exists(select 1 from public.vendors v where v.id=vendor_id and v.activation_status='active')
);
drop policy if exists agents_insert_own on public.agents;
drop policy if exists agents_update_own on public.agents;

revoke all on public.vendors, public.products, public.orders, public.agents, public.referrals from anon, authenticated;
grant select (id,business_name,slug,description,whatsapp_number,logo_url,banner_url,activation_status) on public.vendors to anon;
grant select (id,business_name,slug,description,whatsapp_number,logo_url,banner_url,activation_status,owner_user_id,owner_full_name,owner_momo_number,owner_momo_network,referral_code,activation_fee_ghs,activation_payment_reference,activated_at,created_at,updated_at) on public.vendors to authenticated;
grant update (business_name,slug,description,whatsapp_number,logo_url,banner_url,owner_full_name,owner_momo_number,owner_momo_network,referral_code,updated_at) on public.vendors to authenticated;
grant select (id,vendor_id,name,description,category,price,stock,image_url,is_available,created_at,updated_at) on public.products to anon, authenticated;
grant insert (vendor_id,name,description,category,price,stock,image_url,is_available) on public.products to authenticated;
grant update (vendor_id,name,description,category,price,stock,image_url,is_available,updated_at) on public.products to authenticated;
grant delete on public.products to authenticated;
grant select (id,vendor_id,customer_name,customer_phone,customer_email,delivery_notes,items,subtotal_ghs,platform_fee_ghs,total_ghs,payment_status,paystack_reference,created_at) on public.orders to authenticated;
grant select (id,owner_user_id,full_name,momo_number,momo_network,referral_code,created_at) on public.agents to authenticated;
grant select (id,agent_id,vendor_id,commission_ghs,status,created_at) on public.referrals to authenticated;
