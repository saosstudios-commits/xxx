-- Payment webhooks call this function only after Paystack signature and transaction verification.
alter table public.orders add column if not exists fulfillment_status text not null default 'unfulfilled';
alter table public.orders drop constraint if exists orders_fulfillment_status_check;
alter table public.orders add constraint orders_fulfillment_status_check check (fulfillment_status in ('unfulfilled','fulfilled','inventory_issue'));
alter table public.orders add column if not exists inventory_processed_at timestamptz;
grant select (fulfillment_status, inventory_processed_at) on public.orders to authenticated;

create or replace function public.process_verified_paid_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  ord public.orders%rowtype;
  required_products integer;
  available_products integer;
  item record;
begin
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if ord.payment_status = 'success' and ord.inventory_processed_at is not null then
    return jsonb_build_object('ok', true, 'already_processed', true, 'fulfillment_status', ord.fulfillment_status);
  end if;
  if ord.payment_status in ('failed','refunded') then raise exception 'Cannot process inventory for a failed or refunded order'; end if;
  if pg_catalog.jsonb_typeof(ord.items) <> 'array' or pg_catalog.jsonb_array_length(ord.items) = 0 then raise exception 'Order has no valid item snapshot'; end if;

  perform p.id from public.products p
  join (select (entry.item ->> 'product_id')::uuid as product_id, sum((entry.item ->> 'quantity')::integer)::integer as quantity
        from pg_catalog.jsonb_array_elements(ord.items) as entry(item) group by (entry.item ->> 'product_id')::uuid) needed
    on needed.product_id = p.id and p.vendor_id = ord.vendor_id
  order by p.id for update of p;

  select count(*)::integer into required_products from
    (select (entry.item ->> 'product_id')::uuid as product_id, sum((entry.item ->> 'quantity')::integer)::integer as quantity
     from pg_catalog.jsonb_array_elements(ord.items) as entry(item) group by (entry.item ->> 'product_id')::uuid) needed;
  select count(*)::integer into available_products from
    (select (entry.item ->> 'product_id')::uuid as product_id, sum((entry.item ->> 'quantity')::integer)::integer as quantity
     from pg_catalog.jsonb_array_elements(ord.items) as entry(item) group by (entry.item ->> 'product_id')::uuid) needed
    join public.products p on p.id = needed.product_id and p.vendor_id = ord.vendor_id and p.stock >= needed.quantity
    where needed.quantity > 0;

  if required_products = 0 or available_products <> required_products then
    update public.orders set payment_status = 'success', fulfillment_status = 'inventory_issue', inventory_processed_at = now() where id = ord.id;
    return jsonb_build_object('ok', true, 'inventory_issue', true, 'fulfillment_status', 'inventory_issue');
  end if;

  for item in
    select (entry.item ->> 'product_id')::uuid as product_id, sum((entry.item ->> 'quantity')::integer)::integer as quantity
    from pg_catalog.jsonb_array_elements(ord.items) as entry(item) group by (entry.item ->> 'product_id')::uuid order by (entry.item ->> 'product_id')::uuid
  loop
    update public.products set stock = stock - item.quantity, is_available = (stock - item.quantity) > 0, updated_at = now()
    where id = item.product_id and vendor_id = ord.vendor_id;
  end loop;
  update public.orders set payment_status = 'success', fulfillment_status = 'unfulfilled', inventory_processed_at = now() where id = ord.id;
  return jsonb_build_object('ok', true, 'inventory_issue', false, 'fulfillment_status', 'unfulfilled');
end;
$$;
revoke all on function public.process_verified_paid_order(uuid) from public, anon, authenticated;
grant execute on function public.process_verified_paid_order(uuid) to service_role;
