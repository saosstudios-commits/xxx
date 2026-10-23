(function () {
  'use strict';
  const cfg = window.SEE_PAY_SUPABASE_CONFIG || {};
  const ready = !!(window.supabase && cfg.url && cfg.publishableKey && cfg.publishableKey.startsWith('sb_publishable_'));
  const client = ready ? window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  // An isolated anonymous client reads public storefront fields without sending a logged-in user's JWT.
  const publicClient = ready ? window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  }) : null;
  const fail = (error) => { if (error) throw error; };

  window.SEE_PAY_DB = {
    ready,
    client,
    async requireClient() {
      if (!client) throw new Error('Supabase client did not load. Check your connection and reload the page.');
      return client;
    },
    async currentUser() {
      const c = await this.requireClient();
      const { data, error } = await c.auth.getUser(); fail(error);
      return data.user || null;
    },
    async requireUser() {
      const user = await this.currentUser();
      if (!user) throw new Error('Please log in to continue.');
      return user;
    },
    async signIn(email, password) {
      const c = await this.requireClient();
      const { data, error } = await c.auth.signInWithPassword({ email, password }); fail(error); return data;
    },
    async signUp(email, password, metadata = {}) {
      const c = await this.requireClient();
      const { data, error } = await c.auth.signUp({ email, password, options: { data: metadata } }); fail(error); return data;
    },
    async resetPassword(email, redirectTo) {
      const c = await this.requireClient();
      const { error } = await c.auth.resetPasswordForEmail(String(email || '').trim(), { redirectTo }); fail(error);
    },
    async updatePassword(password) {
      const c = await this.requireClient();
      const { data, error } = await c.auth.updateUser({ password }); fail(error); return data;
    },
    async signOut() {
      const c = await this.requireClient(); const { error } = await c.auth.signOut(); fail(error);
    },
    async getVendor() {
      const c = await this.requireClient(); const user = await this.requireUser();
      const { data, error } = await c.from('vendors').select('*').eq('owner_user_id', user.id).maybeSingle(); fail(error);
      return data;
    },
    async updateVendor(vendorId, patch) {
      const c = await this.requireClient();
      const { data, error } = await c.from('vendors').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', vendorId).select('*').single(); fail(error);
      return data;
    },
    async listProducts(vendorId, options = {}) {
      const c = await this.requireClient();
      let q = c.from('products').select('id,vendor_id,name,description,category,price,compare_at_price,stock,image_url,is_available,created_at,updated_at').eq('vendor_id', vendorId);
      if (options.availableOnly) q = q.eq('is_available', true);
      const { data, error } = await q.order('created_at', { ascending: false }); fail(error); return data || [];
    },
    async getProduct(productId) {
      const c = await this.requireClient(); const { data, error } = await c.from('products').select('*').eq('id', productId).maybeSingle(); fail(error); return data;
    },
    async saveProduct(vendorId, productId, payload, imageFile) {
      const c = await this.requireClient(); const user = await this.requireUser();
      let image_url = payload.image_url || null;
      if (imageFile) {
        if (!['image/jpeg','image/png','image/webp'].includes(imageFile.type)) throw new Error('Use a JPG, PNG or WebP image.');
        if (imageFile.size > 3 * 1024 * 1024) throw new Error('Each image must be 3 MB or smaller.');
        const ext = imageFile.type === 'image/png' ? 'png' : imageFile.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${user.id}/${vendorId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await c.storage.from('shop-media').upload(path, imageFile, { upsert: false, contentType: imageFile.type }); fail(uploadError);
        const { data: urlData } = c.storage.from('shop-media').getPublicUrl(path);
        image_url = urlData.publicUrl;
      }
      const row = {
        vendor_id: vendorId,
        name: String(payload.name || '').trim(),
        description: String(payload.description || '').trim(),
        category: String(payload.category || '').trim(),
        price: Number(payload.price),
        compare_at_price: payload.compare_at_price === '' || payload.compare_at_price == null ? null : Number(payload.compare_at_price),
        stock: Math.max(0, Number.parseInt(payload.stock || 0, 10)),
        image_url,
        is_available: !!payload.is_available,
        updated_at: new Date().toISOString()
      };
      let result;
      if (productId) result = await c.from('products').update(row).eq('id', productId).eq('vendor_id', vendorId).select('*').single();
      else result = await c.from('products').insert(row).select('*').single();
      fail(result.error); return result.data;
    },
    async listOrders(vendorId) {
      const c = await this.requireClient();
      const { data, error } = await c.from('orders').select('*').eq('vendor_id', vendorId).order('created_at', { ascending: false }); fail(error); return data || [];
    },
    async getPublicShop(slug) {
      if (!publicClient) throw new Error('Supabase client did not load.');
      const { data, error } = await publicClient.from('vendors').select('id,business_name,slug,description,whatsapp_number,logo_url,banner_url,activation_status').eq('slug', slug).eq('activation_status','active').maybeSingle(); fail(error); return data;
    },
    async getPublicProducts(vendorId) {
      if (!publicClient) throw new Error('Supabase client did not load.');
      const { data, error } = await publicClient.from('products').select('id,vendor_id,name,description,category,price,compare_at_price,stock,image_url,is_available,created_at').eq('vendor_id',vendorId).eq('is_available',true).order('created_at',{ascending:false}); fail(error); return data || [];
    },
    async uploadVendorImage(vendorId, file, field) {
      const c = await this.requireClient(); const user = await this.requireUser();
      if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
      if (file.size > 3 * 1024 * 1024) throw new Error('Each image must be 3 MB or smaller.');
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${user.id}/${vendorId}/${field}-${crypto.randomUUID()}.${ext}`;
      const { error } = await c.storage.from('shop-media').upload(path,file,{contentType:file.type,upsert:false}); fail(error);
      return c.storage.from('shop-media').getPublicUrl(path).data.publicUrl;
    }
  };
  document.documentElement.dataset.supabase = ready ? 'configured' : 'needs-config';
})();
