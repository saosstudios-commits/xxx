/* SeePay live UI integration: direct Supabase Auth, Database and Storage. */
(function () {
  'use strict';
  const DB = () => window.SEE_PAY_DB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => `GH₵${Number(n || 0).toFixed(2)}`;
  const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48);
  const normalizeProduct = p => ({...p, cat:p.category || '', desc:p.description || '', img:p.image_url || '', oldPrice:p.compare_at_price ?? null, published:p.is_available !== false});
  function notice(host, msg, kind='info') {
    if (!host) return;
    let n = $('.form-notice', host);
    if (!n) { n = document.createElement('div'); n.className='form-notice'; host.prepend(n); }
    n.className = `form-notice is-visible form-notice--${kind}`;
    n.textContent = msg;
  }
  function toast(msg, isError=false) {
    let host = $('.live-message');
    if (!host) { host=document.createElement('div'); host.className='live-message form-notice'; host.setAttribute('role','status'); document.body.prepend(host); }
    host.textContent=msg; host.style.display='block'; host.classList.toggle('form-notice--err', isError); host.classList.toggle('form-notice--info', !isError);
  }
  function setupSharedActions() {
    $$('[data-signout]').forEach(el => el.addEventListener('click', async () => {
      try { await DB().signOut(); location.href = el.dataset.signout || '../login.html'; }
      catch (e) { toast(e.message || 'Could not sign out.', true); }
    }));
  }
  async function getVendorOrRedirect() {
    try {
      const user = await DB().currentUser();
      if (!user) { location.href = `${location.pathname.includes('/dashboard/') ? '../' : ''}login.html`; return null; }
      const vendor = await DB().getVendor();
      if (!vendor) { toast('No merchant profile is linked to this account. Contact SeePay support.', true); return null; }
      return {user, vendor};
    } catch (e) { toast(e.message || 'Could not load your account.', true); return null; }
  }
  function setBusinessChrome(vendor) {
    const name = vendor?.business_name || 'Your shop';
    $$('.topbar__titles p').forEach(el => el.textContent = name);
    const avatar = $('.avatar'); if (avatar) { avatar.textContent = name.split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase(); avatar.title = name; }
    const heading = $('.dash-head h2');
    if (heading && /good to see you/i.test(heading.textContent)) heading.textContent = `Welcome, ${vendor.owner_full_name || name}`;
    const view = $('.topbar__actions a[href*="store.html"]'); if (view) view.href = `../store.html?shop=${encodeURIComponent(vendor.slug)}`;
  }
  function emptyMarkup(title, text, action='') { return `<div class="empty"><h4>${esc(title)}</h4><p>${esc(text)}</p>${action}</div>`; }
  async function initAuth() {
    const login = $('#login-form');
    const register = $('#register-form');
    const agentLogin = $('form:has(#agent-login-email)');
    const agentRegister = $('form:has(#agent-email)');
    const resetForm = $('#reset-form');
    const updatePasswordForm = $('#update-password-form');
    if (updatePasswordForm) updatePasswordForm.addEventListener('submit', async e => {
      e.preventDefault(); const btn = $('button[type="submit"]', updatePasswordForm); if (btn) btn.disabled = true;
      try { const password = $('#new-password').value; if (password.length < 8) throw new Error('Use at least 8 characters for your new password.'); if (password !== $('#confirm-password').value) throw new Error('The passwords do not match.'); await DB().updatePassword(password); await DB().signOut(); notice(updatePasswordForm, 'Password updated. You can now sign in using your new password.', 'info'); setTimeout(() => { location.href = 'login.html'; }, 900); }
      catch (err) { notice(updatePasswordForm, err.message || 'Could not update password. Request a new reset link if this link has expired.', 'err'); } finally { if (btn) btn.disabled = false; }
    });
    const referralFromUrl = new URLSearchParams(location.search).get('ref');
    if (referralFromUrl && $('#reg-referral')) $('#reg-referral').value = referralFromUrl.trim().toUpperCase();
    if (resetForm) resetForm.addEventListener('submit', async e => {
      e.preventDefault(); const btn = $('button[type="submit"]', resetForm); if (btn) btn.disabled = true;
      try { await DB().resetPassword($('#reset-email').value.trim(), `${location.origin}/reset-password.html`); notice(resetForm, 'If an account uses that email, a password-reset link will be sent. Check your inbox and spam folder.', 'info'); }
      catch (err) { notice(resetForm, err.message || 'Could not request a password reset.', 'err'); } finally { if (btn) btn.disabled = false; }
    });
    if (login) login.addEventListener('submit', async e => {
      e.preventDefault(); const btn=$('button[type="submit"]',login); if(btn)btn.disabled=true;
      try { await DB().signIn($('#login-email').value.trim(), $('#login-password').value); location.href='dashboard/index.html'; }
      catch(err) { notice(login, err.message || 'Sign-in failed. Check your email and password.', 'err'); if(btn)btn.disabled=false; }
    });
    if (register) register.addEventListener('submit', async e => {
      e.preventDefault(); const btn=$('button[type="submit"]',register); if(btn)btn.disabled=true;
      try {
        const metadata = {
          account_type:'vendor', business_name:$('#reg-business').value.trim(), slug:slugify($('#reg-subdomain').value),
          full_name:$('#reg-name').value.trim(), whatsapp_number:$('#reg-phone').value.replace(/[\s-]/g,''),
          owner_momo_number:$('#reg-momo-number').value.replace(/[\s-]/g,''), owner_momo_network:$('#reg-momo-network').value,
          referral_code:($('#reg-referral')?.value || '').trim().toUpperCase()
        };
        if (metadata.slug.length < 3) throw new Error('Shop link must be at least 3 characters and use letters, numbers or hyphens.');
        const result = await DB().signUp($('#reg-email').value.trim(), $('#reg-password').value, metadata);
        if (result.session) location.href='dashboard/index.html';
        else notice(register, 'Account created, but Supabase did not issue a sign-in session. In Supabase Authentication → Providers → Email, turn off Confirm email, save, then sign in here. Your merchant profile is created automatically by the database trigger.', 'err');
      } catch(err) { notice(register, err.message || 'Account creation failed.', 'err'); if(btn)btn.disabled=false; }
    });
    if (agentLogin) agentLogin.addEventListener('submit', async e => {
      e.preventDefault(); const form=agentLogin; const btn=$('button[type="submit"]',form); if(btn)btn.disabled=true;
      try { await DB().signIn($('#agent-login-email').value.trim(), $('#agent-login-password').value); location.href='agent/index.html'; }
      catch(err) { notice(form, err.message || 'Sign-in failed.', 'err'); if(btn)btn.disabled=false; }
    });
    if (agentRegister) agentRegister.addEventListener('submit', async e => {
      e.preventDefault(); const form=agentRegister; const btn=$('button[type="submit"]',form); if(btn)btn.disabled=true;
      try {
        const result=await DB().signUp($('#agent-email').value.trim(),$('#agent-password').value,{account_type:'agent',full_name:$('#agent-name').value.trim(),momo_number:$('#agent-momo').value.replace(/[\s-]/g,''),momo_network:$('#agent-network').value});
        if(result.session) location.href='agent/index.html'; else notice(form,'Account created, but Supabase did not issue a sign-in session. In Supabase Authentication → Providers → Email, turn off Confirm email, save, then sign in here. Your referral code is generated by the database.','err');
      } catch(err) { notice(form,err.message || 'Agent registration failed. Check the network and try again. If this continues, contact SeePay support with the time of the attempt.','err'); if(btn)btn.disabled=false; }
    });
    if (!login && !register && !agentLogin && !agentRegister && !resetForm && !updatePasswordForm) toast('This authentication form is not wired to the live database yet.', true);
  }
  async function initDashboard() {
    const ctx=await getVendorOrRedirect(); if(!ctx)return; const {vendor}=ctx; setBusinessChrome(vendor);
    const [products, orders] = await Promise.all([DB().listProducts(vendor.id), DB().listOrders(vendor.id)]);
    const paid=orders.filter(o=>o.payment_status==='success').length;
    const k=$('#kpis'); if(k) k.innerHTML = [
      ['Products',products.length,'Products in your catalogue'],['Orders',orders.length,'Orders saved to SeePay'],['Paid orders',paid,'Verified paid orders'],['Store status',vendor.activation_status,'Activation status']
    ].map(([label,val,note])=>`<div class="kpi"><b>${esc(val)}</b><small>${esc(label)}</small><div class="kpi__empty-note">${esc(note)}</div></div>`).join('');
    const recent=$('#recent-orders'); if(recent) recent.innerHTML=orders.length?`<table class="table"><thead><tr><th>Reference</th><th>Buyer</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>${orders.slice(0,5).map(o=>`<tr><td>${esc(o.paystack_reference || o.id.slice(0,8))}</td><td>${esc(o.customer_name)}</td><td>${money(o.total_ghs)}</td><td><span class="chip ${o.payment_status==='success'?'chip--ok':o.payment_status==='pending'?'chip--warn':''}">${esc(o.payment_status==='success'?'Paid':o.payment_status==='pending'?'Pending':o.payment_status==='failed'?'Failed':o.payment_status==='refunded'?'Refunded':o.payment_status)}</span></td><td>${new Date(o.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`:emptyMarkup('No orders yet','Real orders will appear here after checkout and payment verification.');
    const checklist=$('#checklist'); if(checklist) checklist.innerHTML=`<div class="checklist-item"><div><b>Store profile</b><span>Add and review your public store details.</span></div><a class="btn btn--outline btn--sm" href="settings.html">Settings</a></div><div class="checklist-item"><div><b>Products</b><span>Add real products to your catalogue.</span></div><a class="btn btn--outline btn--sm" href="products.html">Products</a></div>`;
    const progress=$('#checklist-progress'); if(progress)progress.textContent=`${vendor.activation_status==='active'?1:0} of 2 done`;
    const strip=$('#dash-payments'); if(strip) strip.innerHTML='<span class="chip chip--gold"><span class="chip__dot"></span>Paystack</span><span class="chip chip--outline">Verified payments only</span>';
    let activation=$('#activation-action');
    if(vendor.activation_status!=='active'){
      if(!activation){activation=document.createElement('section');activation.id='activation-action';activation.className='note note--amber';const main=$('#main');const head=$('.dash-head',main);if(main)main.insertBefore(activation,head||main.firstChild);}
      activation.innerHTML=`<span><strong>Activate your shop — GH₵${Number(vendor.activation_fee_ghs||150).toFixed(2)} one-time.</strong> Your public storefront stays hidden until Paystack confirms this payment.</span> <button class="btn btn--gold btn--sm" id="pay-activation" type="button">Pay activation fee</button>`;
      $('#pay-activation')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Connecting…';try{const {data,error}=await DB().client.functions.invoke('initialize-activation',{body:{}});if(error)throw error;if(data?.authorization_url){location.href=data.authorization_url;return;}throw new Error(data?.error||data?.message||'Activation payment did not start.');}catch(err){toast(err.message||'Activation function is not deployed yet. Configure Paystack and deploy the Supabase function.',true);b.disabled=false;b.textContent='Pay activation fee';}});
    } else if(activation) activation.remove();
  }
  async function initProductsPage() {
    const ctx=await getVendorOrRedirect(); if(!ctx)return; setBusinessChrome(ctx.vendor);
    const host=$('#products-table'), search=$('#product-search'); if(!host)return;
    let products=await DB().listProducts(ctx.vendor.id);
    const paint=()=>{ const q=(search?.value||'').trim().toLowerCase(); const rows=products.filter(p=>!q||`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q));
      host.innerHTML=rows.length?`<table class="table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td><span class="product-cell">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async" style="width:42px;height:42px;object-fit:cover;border-radius:8px">`:''}<span><span class="cell-strong" style="display:block">${esc(p.name)}</span><span class="cell-muted">${esc((p.description||'').slice(0,50))}</span></span></span></td><td>${esc(p.category||'')}</td><td class="num-strong">${money(p.price)}</td><td>${p.stock}</td><td><span class="chip ${p.is_available?'chip--ok':'chip--warn'}">${p.is_available?'Available':'Hidden'}</span></td><td><a class="btn btn--outline btn--sm" href="product-edit.html?id=${encodeURIComponent(p.id)}">Edit</a></td></tr>`).join('')}</tbody></table>`:emptyMarkup(q?'No matching products':'No products yet',q?'Try another search.':'Add your first product to populate your catalogue.','<a class="btn btn--gold btn--sm" href="product-edit.html">Add product</a>');
    };
    paint(); if(search)search.addEventListener('input',paint);
  }
  async function initProductEdit() {
    const form=$('#product-form'); if(!form)return; const ctx=await getVendorOrRedirect(); if(!ctx)return; const vendor=ctx.vendor; setBusinessChrome(vendor);
    const id=new URLSearchParams(location.search).get('id'); let product=null;
    if(id){ try { product=await DB().getProduct(id); if(!product || product.vendor_id!==vendor.id) throw new Error('Product not found in this shop.'); } catch(e){toast(e.message||'Could not load product.',true); return;} }
    const fields={'#product-name':product?.name||'','#product-category':product?.category||'','#product-stock':product?.stock??0,'#product-desc':product?.description||'','#product-price':product?.price??'','#product-old-price':product?.compare_at_price??''};
    Object.entries(fields).forEach(([s,v])=>{const el=$(s);if(el)el.value=v});
    const available=$('input[name="published"]'); if(available)available.checked=product?.is_available!==false;
    const title=$('[data-product-form-title]'); if(title)title.textContent=product?'Edit product':'New product';
    const desc=$('[data-product-form-desc]'); if(desc)desc.textContent='Product details are saved to your SeePay database.';
    const saveLabel=$('[data-product-save-label]'); if(saveLabel)saveLabel.textContent=product?'Save changes':'Add product';
    const file=$('#product-image'), thumb=$('#img-thumb'), imgNote=$('#img-note'); let imageFile=null;
    if(thumb) thumb.style.backgroundImage=product?.image_url?`url("${product.image_url}")`:'none';
    file?.addEventListener('change',()=>{const f=file.files?.[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>3*1024*1024){toast('Choose a JPG, PNG or WebP image no larger than 3 MB.',true);file.value='';return;}imageFile=f;if(thumb)thumb.style.backgroundImage=`url("${URL.createObjectURL(f)}")`;if(imgNote)imgNote.textContent=`${f.name} · ready to upload to Supabase Storage`;});
    form.addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type="submit"]',form);if(btn)btn.disabled=true;
      try { const price=Number($('#product-price').value); const stock=Number($('#product-stock').value||0); if(!$('#product-name').value.trim()||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0)throw new Error('Enter a product name, valid price and whole non-negative stock quantity.');
        await DB().saveProduct(vendor.id,product?.id,{name:$('#product-name').value,category:$('#product-category').value,description:$('#product-desc').value,price,compare_at_price:$('#product-old-price')?.value||null,stock,is_available:available?available.checked:true,image_url:product?.image_url||null},imageFile);
        location.href='products.html';
      } catch(err){notice(form,err.message||'Could not save product.','err');if(btn)btn.disabled=false;}
    });
  }
  async function initOrdersPage() {
    const ctx=await getVendorOrRedirect(); if(!ctx)return; setBusinessChrome(ctx.vendor);
    const host=$('#orders-table'); if(!host)return;
    const search=$('#order-search'), statusFilter=$('#order-status-filter'), badge=$('#orders-badge');
    try {
      const orders=await DB().listOrders(ctx.vendor.id);
      const label=s=>s==='success'?'Paid':s==='pending'?'Pending':s==='failed'?'Failed':s==='refunded'?'Refunded':s;
      const paint=()=>{
        const q=(search?.value||'').trim().toLowerCase();const wanted=statusFilter?.value||'all';
        const rows=orders.filter(o=>{
          const text=`${o.paystack_reference||o.id} ${o.customer_name||''} ${o.customer_phone||''}`.toLowerCase();
          const statusMatch=wanted==='all'||(wanted==='paid'?o.payment_status==='success':o.payment_status===wanted);
          return statusMatch&&(!q||text.includes(q));
        });
        if(badge)badge.textContent=`${rows.length} ${rows.length===1?'order':'orders'}`;
        host.innerHTML=rows.length?`<table class="table"><thead><tr><th>Reference</th><th>Buyer</th><th>Phone</th><th>Total</th><th>Status</th><th>Placed</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(o.paystack_reference||o.id.slice(0,8))}</td><td>${esc(o.customer_name)}</td><td>${esc(o.customer_phone)}</td><td>${money(o.total_ghs)}</td><td><span class="chip ${o.payment_status==='success'?'chip--ok':o.payment_status==='pending'?'chip--warn':''}">${esc(label(o.payment_status))}</span></td><td>${new Date(o.created_at).toLocaleString()}</td><td><a class="btn btn--outline btn--sm" href="order.html?id=${encodeURIComponent(o.id)}">Details</a></td></tr>`).join('')}</tbody></table>`:emptyMarkup(q||wanted!=='all'?'No matching orders':'No orders yet',q||wanted!=='all'?'Try changing your search or status filter.':'Orders appear here after a customer checks out and a payment attempt is initialized.');
      };
      paint(); search?.addEventListener('input',paint); statusFilter?.addEventListener('change',paint);
    } catch(e){host.innerHTML=emptyMarkup('Orders unavailable',e.message||'Could not read orders.');}
  }
  async function initOrderDetails(){const ctx=await getVendorOrRedirect();if(!ctx)return;const p=new URLSearchParams(location.search);const id=p.get('id');const wrap=$('#order-items-detail');if(!id){if(wrap)wrap.innerHTML=emptyMarkup('Order not found','Select an order from the orders page.');return;}const {data,error}=await DB().client.from('orders').select('*').eq('id',id).eq('vendor_id',ctx.vendor.id).maybeSingle();if(error||!data){toast(error?.message||'Order not found.',true);return;}$$('[data-order-ref]').forEach(el=>el.textContent=data.paystack_reference||data.id);$$('[data-order-customer]').forEach(el=>el.textContent=data.customer_name);$$('[data-order-total]').forEach(el=>el.textContent=money(data.total_ghs));$$('[data-order-placed]').forEach(el=>el.textContent=new Date(data.created_at).toLocaleString());$$('[data-order-phone]').forEach(el=>el.textContent=data.customer_phone);const note=$('[data-order-note]');if(note)note.textContent=data.delivery_notes||'No delivery note provided.';const status=$('#order-payment-status');if(status){status.className='chip '+(data.payment_status==='success'?'chip--ok':data.payment_status==='pending'?'chip--warn':'chip--outline');status.textContent=data.payment_status==='success'?'Paid — verified':data.payment_status==='pending'?'Payment pending':data.payment_status==='failed'?'Payment failed':data.payment_status==='refunded'?'Refunded':String(data.payment_status||'Unknown');}const fulfillment=$('#order-fulfillment-status');if(fulfillment){const fs=data.fulfillment_status||'unfulfilled';fulfillment.className='chip '+(fs==='fulfilled'?'chip--ok':fs==='inventory_issue'?'chip--warn':'chip--outline');fulfillment.textContent=fs==='fulfilled'?'Fulfilled':fs==='inventory_issue'?'Stock issue — review order':'Awaiting fulfilment';}if(wrap){let items=[];try{items=Array.isArray(data.items)?data.items:JSON.parse(data.items||'[]')}catch(_){items=[]}wrap.innerHTML=items.length?items.map(item=>`<div class="order-item"><div><b>${esc(item.name||'Product')}</b><small>${Number(item.quantity||1)} × ${money(item.unit_price_ghs||item.price||0)}</small></div><strong>${money(Number(item.unit_price_ghs||item.price||0)*Number(item.quantity||1))}</strong></div>`).join(''):emptyMarkup('No item details','This order does not contain item details.');}}
  async function initSettings() {
    const form=$('#settings-form'); if(!form)return;const ctx=await getVendorOrRedirect();if(!ctx)return;const vendor=ctx.vendor;setBusinessChrome(vendor);
    const values={'#set-business':vendor.business_name,'#set-subdomain':vendor.slug,'#set-whatsapp':vendor.whatsapp_number,'#set-momo':vendor.owner_momo_number,'#set-network':vendor.owner_momo_network||''};Object.entries(values).forEach(([s,v])=>{const el=$(s);if(el)el.value=v||''});
    const preview=$('#profile-image-preview');if(preview&&vendor.logo_url)preview.src=vendor.logo_url; const file=$('#set-profile-image');let imageFile=null;
    file?.addEventListener('change',()=>{const f=file.files?.[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>3*1024*1024){toast('Choose a JPG, PNG or WebP image no larger than 3 MB.',true);file.value='';return;}imageFile=f;if(preview)preview.src=URL.createObjectURL(f);});
    form.addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type="submit"]',form);if(btn)btn.disabled=true;try{const patch={business_name:$('#set-business').value.trim(),slug:slugify($('#set-subdomain').value),whatsapp_number:$('#set-whatsapp').value.trim(),owner_momo_number:$('#set-momo').value.trim(),owner_momo_network:$('#set-network').value||null};if(patch.slug.length<3)throw new Error('Shop link must be at least 3 characters.');if(imageFile)patch.logo_url=await DB().uploadVendorImage(vendor.id,imageFile,'logo');await DB().updateVendor(vendor.id,patch);toast('Store settings saved to Supabase.');setTimeout(()=>location.reload(),500);}catch(err){notice(form,err.message||'Could not save settings.','err');if(btn)btn.disabled=false;}});
    const providers=$('#provider-list');if(providers)providers.innerHTML='<div class="provider-status"><span class="status-dot"></span><div><strong>Paystack</strong><p class="small muted">Payment initialization and verification run on SeePay’s server. Live payment availability depends on the Paystack credentials configured securely in Supabase.</p></div></div>';
  }
  async function initStore() {
    const qs=new URLSearchParams(location.search);let shopSlug=qs.get('shop')||qs.get('slug');
    if(!shopSlug){const cfg=window.SEE_PAY_SUPABASE_CONFIG||{};const domain=String(cfg.platformDomain||'').toLowerCase();const host=location.hostname.toLowerCase();if(domain&&host.endsWith('.'+domain)){const candidate=host.slice(0,-domain.length-1);if(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(candidate)&&!['www','app','dashboard','api','admin'].includes(candidate))shopSlug=candidate;}}
    if(!shopSlug){try{const v=await DB().getVendor();if(v){shopSlug=v.slug;history.replaceState({},'',`?shop=${encodeURIComponent(shopSlug)}`);}}catch(e){}}
    const grid=$('#product-grid');
    if(!shopSlug){if(grid)grid.innerHTML=emptyMarkup('Find a shop','Open a SeePay storefront link to view its products.');return;}
    try {const shop=await DB().getPublicShop(shopSlug);if(!shop)throw new Error('This shop is not active or the link is incorrect.');const items=(await DB().getPublicProducts(shop.id)).map(normalizeProduct);window.SEE_PAY_LIVE.currentShop=shop;window.SEE_PAY_LIVE.currentProducts=items;
      const title=$('#store-display-name');if(title)title.textContent=shop.business_name;document.title=`${shop.business_name} — SeePay`;const hero=$('.store-hero__meta p');if(hero)hero.textContent=shop.description||'Browse products from this shop.';const img=$('.store-hero__img');if(img&&shop.banner_url)img.src=shop.banner_url;else if(img&&shop.logo_url)img.src=shop.logo_url;
      const paint=()=>{const q=($('#store-search')?.value||'').toLowerCase();const filtered=items.filter(p=>`${p.name} ${p.cat} ${p.desc}`.toLowerCase().includes(q));grid.innerHTML=filtered.length?filtered.map(p=>`<article class="pcard reveal in"><a class="pcard__img" href="checkout.html?shop=${encodeURIComponent(shop.slug)}&item=${encodeURIComponent(p.id)}">${p.img?`<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">`:''}</a><div class="pcard__body"><span class="pcard__cat">${esc(p.cat)}</span><h3 class="pcard__name">${esc(p.name)}</h3><p>${esc(p.desc)}</p><div class="pcard__meta"><span class="pcard__price">${p.compare_at_price?`<del>${money(p.compare_at_price)}</del> `:''}${money(p.price)}</span><a class="btn btn--primary btn-add" href="checkout.html?shop=${encodeURIComponent(shop.slug)}&item=${encodeURIComponent(p.id)}">Buy</a></div></div></article>`).join(''):emptyMarkup('No products yet','This shop has not published any products.');};paint();$('#store-search')?.addEventListener('input',paint);$$('.storecat').forEach(b=>b.addEventListener('click',()=>{$$('.storecat').forEach(x=>x.classList.toggle('is-active',x===b));const val=b.dataset.cat;const filtered=items.filter(p=>(val==='all'||p.cat===val)&&(`${p.name} ${p.cat} ${p.desc}`).toLowerCase().includes(($('#store-search')?.value||'').toLowerCase()));grid.innerHTML=filtered.length?filtered.map(p=>`<article class="pcard reveal in"><a class="pcard__img" href="checkout.html?shop=${encodeURIComponent(shop.slug)}&item=${encodeURIComponent(p.id)}">${p.img?`<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" decoding="async">`:''}</a><div class="pcard__body"><span class="pcard__cat">${esc(p.cat)}</span><h3 class="pcard__name">${esc(p.name)}</h3><div class="pcard__meta"><span class="pcard__price">${p.compare_at_price?`<del>${money(p.compare_at_price)}</del> `:''}${money(p.price)}</span><a class="btn btn--primary btn-add" href="checkout.html?shop=${encodeURIComponent(shop.slug)}&item=${encodeURIComponent(p.id)}">Buy</a></div></div></article>`).join(''):emptyMarkup('No products in this category','Choose another category.');}));
    } catch(e){if(grid)grid.innerHTML=emptyMarkup('Shop unavailable',e.message||'Could not load this shop.');}
  }
  async function initCheckout() {
    const form=$('#checkout-form');if(!form)return;const params=new URLSearchParams(location.search);const itemId=params.get('item'),shopSlug=params.get('shop');const host=$('#order-items');const totals=$('#order-totals');
    if(host)host.innerHTML=emptyMarkup('Checkout unavailable','Select a product from an active SeePay shop.');
    try {if(!itemId||!shopSlug)throw new Error('Open checkout from a product on a specific shop.');const shop=await DB().getPublicShop(shopSlug);if(!shop)throw new Error('This shop is not active.');const products=await DB().getPublicProducts(shop.id);const p=products.find(x=>x.id===itemId);if(!p)throw new Error('This product is no longer available.');if(host)host.innerHTML=`<div class="order-item">${p.image_url?`<img src="${esc(p.image_url)}" alt="" decoding="async" style="width:55px;height:55px;object-fit:cover;border-radius:8px">`:''}<div><b>${esc(p.name)}</b><small>Qty 1</small></div><span>${money(p.price)}</span></div>`;if(totals)totals.innerHTML=`<div class="flex flex--between"><span>Subtotal</span><b>${money(p.price)}</b></div><div class="flex flex--between"><span>SeePay fee</span><b>${money(0.2)}</b></div><div class="flex flex--between"><span>Total before Paystack processing</span><b>${money(Number(p.price)+0.2)}</b></div>`;const ey=$('.eyebrow');if(ey)ey.textContent=shop.business_name;const submit=$('button[type="submit"]',form);if(submit)submit.textContent='Continue to payment';
      form.addEventListener('submit',async e=>{e.preventDefault();const btn=$('button[type="submit"]',form);if(btn)btn.disabled=true;try{
        const {data,error}=await DB().client.functions.invoke('initialize-checkout',{body:{shop:shop.slug,productId:p.id,quantity:1,name:$('#c-name').value.trim(),phone:$('#c-phone').value,email:$('#c-email').value.trim(),note:$('#c-note')?.value||''}});
        if(error)throw error;if(data?.authorization_url){location.href=data.authorization_url;return;}throw new Error(data?.error||'Payment initialization did not return a checkout link.');
      }catch(err){notice(form,err.message||'Checkout could not start. Make sure the Paystack Edge Function is deployed and configured. No payment should be considered complete until Paystack redirects back and its webhook is verified.','err');if(btn)btn.disabled=false;}});
    } catch(e){if(host)host.innerHTML=emptyMarkup('Checkout unavailable',e.message||'Could not load product.');const submit=$('button[type="submit"]',form);if(submit)submit.disabled=true;}
  }
  async function initAgentPortal(){
    try {
      const user=await DB().currentUser(); if(!user){location.href='../agent-login.html';return;}
      const c=await DB().requireClient();
      const {data:agent,error}=await c.from('agents').select('*').eq('owner_user_id',user.id).maybeSingle();
      if(error)throw error; if(!agent)throw new Error('No agent profile is attached to this account.');
      $$('.avatar').forEach(a=>{a.textContent=(agent.full_name||user.email||'Agent').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();a.title=agent.full_name||user.email||'Agent';});
      const welcome=$('.agent-shell .dash-head h2'); if(welcome && /welcome to the agent portal/i.test(welcome.textContent)) welcome.textContent=`Welcome, ${agent.full_name || 'Agent'}`;
      const referralDescription=$('.agent-shell .dash-head p'); if(referralDescription && /share a referral link/i.test(referralDescription.textContent)) referralDescription.textContent='Your referral link, tracked signups and commissions in one place.';
      const ref=$('#ref-link'); if(ref)ref.value=`${location.origin}/register.html?ref=${encodeURIComponent(agent.referral_code)}`;
      $$('[data-copy-ref]').forEach(btn=>btn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(ref?.value||'');toast('Referral link copied.');}catch(_){ref?.select();toast('Select and copy your referral link.');}}));
      const {data:rows,error:e}=await c.rpc('get_my_agent_referrals');
      if(e)throw e;
      const rt=$('#ref-table'); if(rt)rt.innerHTML=rows?.length?`<table class="table"><thead><tr><th>Shop</th><th>Shop status</th><th>Commission</th><th>Referral status</th><th>Date</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="cell-strong">${esc(r.business_name||'Shop referral')}</span><br><span class="cell-muted">${esc(r.slug||'')}</span></td><td><span class="chip ${r.activation_status==='active'?'chip--ok':'chip--warn'}">${esc(r.activation_status||'pending')}</span></td><td>${money(r.commission_ghs)}</td><td><span class="chip ${r.status==='earned'||r.status==='paid'?'chip--ok':r.status==='pending'?'chip--warn':'chip--outline'}">${esc(r.status)}</span></td><td>${new Date(r.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`:emptyMarkup('No referrals yet','When a merchant registers with your code, eligible referrals appear here.');
      const count=$('#agent-referral-count'); if(count)count.textContent=String(rows?.length||0);
      const earned=(rows||[]).filter(r=>['earned','paid'].includes(r.status)).reduce((sum,r)=>sum+Number(r.commission_ghs||0),0);
      const earnedNode=$('#agent-earned'); if(earnedNode)earnedNode.textContent=money(earned);
      const payoutRoot=$('#payout-summary');
      if(payoutRoot){
        const {data:payouts,error:pe}=await c.from('agent_payouts').select('id,amount_ghs,status,payment_reference,created_at,paid_at').eq('agent_id',agent.id).order('created_at',{ascending:false});
        if(pe)throw pe;
        const paid=(payouts||[]).filter(p=>p.status==='paid').reduce((sum,p)=>sum+Number(p.amount_ghs||0),0);
        payoutRoot.innerHTML=[[String((rows||[]).length),'Referrals'],[money(earned),'Eligible commission'],[money(paid),'Paid out']].map(([v,l])=>`<div class="kpi"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('');
        const history=$('#payout-history');if(history)history.innerHTML=payouts?.length?`<table class="table"><thead><tr><th>Reference</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>${payouts.map(p=>`<tr><td>${esc(p.payment_reference||p.id.slice(0,8))}</td><td>${money(p.amount_ghs)}</td><td>${esc(p.status)}</td><td>${new Date(p.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`:emptyMarkup('No payouts recorded','Payout entries will appear after a payout is recorded by SeePay.');
      }
    } catch(e){toast(e.message||'Could not load agent portal.',true);}
  }
  async function initOrderStatus(){
    const form=$('#ref-lookup');if(!form)return;
    const qs=new URLSearchParams(location.search);if(qs.get('reference'))$('#ref-input').value=qs.get('reference');
    if(qs.get('email')&&$('#ref-email'))$('#ref-email').value=qs.get('email');
    form.addEventListener('submit',async e=>{
      e.preventDefault();const button=$('#ref-lookup-btn');const root=$('#status-root');if(button){button.disabled=true;button.textContent='Checking…';}
      try{const {data,error}=await DB().client.functions.invoke('lookup-order-status',{body:{reference:$('#ref-input').value.trim(),email:$('#ref-email').value.trim()}});if(error)throw error;if(data?.error)throw new Error(data.error);
        if(root)root.innerHTML=`<div class="card"><span class="eyebrow">Order ${esc(data.reference)}</span><h2>${esc(data.payment_status==='success'?'Payment confirmed':data.payment_status==='pending'?'Payment pending':data.payment_status==='failed'?'Payment failed':'Payment updated')}</h2><p>Total: <strong>${money(data.total_ghs)}</strong></p><p>Placed: ${new Date(data.created_at).toLocaleString()}</p><p>${esc(data.payment_status==='success'?'Paystack has verified this payment.':data.payment_status==='pending'?'The payment provider has not confirmed this payment yet.':`Current payment status: ${data.payment_status}.`)}</p></div>`;
      }catch(err){if(root)root.innerHTML=`<div class="form-notice form-notice--err is-visible">${esc(err.message||'Order could not be found. Check the reference and email.')}</div>`;}finally{if(button){button.disabled=false;button.textContent='Check status';}}
    });
  }
  function initPage(page) {
    setupSharedActions();
    if(!DB()?.ready){toast('Could not load the Supabase client. Check your network and reload.',true);return;}
    const pages={auth:initAuth,dash:initDashboard,dashproducts:initProductsPage,productedit:initProductEdit,dashorders:initOrdersPage,dashorder:initOrderDetails,dashsettings:initSettings,store:initStore,checkout:initCheckout,agentportal:initAgentPortal,orderstatus:initOrderStatus};
    if(pages[page]) Promise.resolve(pages[page]()).catch(e=>toast(e.message||'Something went wrong.',true));
  }
  window.SEE_PAY_LIVE={initPage};
})();
