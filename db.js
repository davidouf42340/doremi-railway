// ============================================================
// Dorémi — Client Supabase
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── Génération de tokens uniques ──
function generateToken() {
  return require('crypto').randomBytes(24).toString('hex');
}

// ── Créer une entrée commande après réception du brief ──
async function createOrder({ shopifyOrderId, shopifyOrderNumber, customerEmail, customerName, type, briefData, recipientName, occasion }) {
  const { data, error } = await supabase
    .from('orders')
    .upsert({
      shopify_order_id: shopifyOrderId,
      shopify_order_number: shopifyOrderNumber,
      customer_email: customerEmail,
      customer_name: customerName,
      type: type || 'festivites',
      status: 'brief_received',
      brief_data: briefData,
      recipient_name: recipientName,
      occasion: occasion,
      admin_token: generateToken(),
      client_token: generateToken(),
      public_token: generateToken(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'shopify_order_id' })
    .select()
    .single();

  if (error) throw new Error(`Supabase createOrder: ${error.message}`);
  return data;
}

// ── Mettre à jour les paroles générées ──
async function saveLyrics(shopifyOrderId, lyricsOriginal) {
  const { data, error } = await supabase
    .from('orders')
    .update({
      lyrics_original: lyricsOriginal,
      status: 'lyrics_generated',
      updated_at: new Date().toISOString(),
    })
    .eq('shopify_order_id', shopifyOrderId)
    .select()
    .single();

  if (error) throw new Error(`Supabase saveLyrics: ${error.message}`);
  return data;
}

// ── Récupérer une commande par ID Supabase ──
async function getOrderById(id) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Supabase getOrderById: ${error.message}`);
  return data;
}

// ── Récupérer une commande par Shopify order ID ──
async function getOrderByShopifyId(shopifyOrderId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('shopify_order_id', shopifyOrderId)
    .single();

  if (error) return null;
  return data;
}

// ── Récupérer une commande par token ──
async function getOrderByToken(tokenType, tokenValue) {
  const column = `${tokenType}_token`;
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq(column, tokenValue)
    .single();

  if (error) return null;
  return data;
}

// ── Lister les commandes (pour l'admin) ──
async function listOrders({ status, limit = 50, offset = 0 } = {}) {
  let query = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw new Error(`Supabase listOrders: ${error.message}`);
  return { orders: data, total: count };
}

// ── Mettre à jour une commande (générique) ──
async function updateOrder(id, updates) {
  const { data, error } = await supabase
    .from('orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Supabase updateOrder: ${error.message}`);
  return data;
}

module.exports = {
  supabase,
  generateToken,
  createOrder,
  saveLyrics,
  getOrderById,
  getOrderByShopifyId,
  getOrderByToken,
  listOrders,
  updateOrder,
};
