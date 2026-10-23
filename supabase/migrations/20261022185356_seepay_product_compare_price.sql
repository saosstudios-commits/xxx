alter table public.products add column if not exists compare_at_price numeric(10,2);
alter table public.products drop constraint if exists products_compare_at_price_nonnegative;
alter table public.products add constraint products_compare_at_price_nonnegative check (compare_at_price is null or compare_at_price >= 0);
grant select (compare_at_price) on public.products to anon, authenticated;
grant insert (compare_at_price) on public.products to authenticated;
grant update (compare_at_price) on public.products to authenticated;
