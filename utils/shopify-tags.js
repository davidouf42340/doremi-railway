// ============================================================
// Dorémi — Utilitaires Shopify (tags + metafields)
// Utilisés pour déclencher les emails via Shopify Flow
// ============================================================

const SHOP    = () => (process.env.SHOPIFY_SHOP_DOMAIN || '').replace(/^https?:\/\//, '').trim();
const TOKEN   = () => process.env.SHOPIFY_ACCESS_TOKEN;
const API_VER = '2024-01';

// ── Ajouter un tag à une commande ──
async function addOrderTag(orderId, tag) {
  // D'abord récupérer les tags existants
  const getRes = await fetch(`https://${SHOP()}/admin/api/${API_VER}/orders/${orderId}.json`, {
    headers: { 'X-Shopify-Access-Token': TOKEN() }
  });
  if (!getRes.ok) throw new Error(`Shopify GET order ${orderId}: ${getRes.status}`);

  const { order } = await getRes.json();
  const existingTags = order.tags ? order.tags.split(',').map(t => t.trim()) : [];

  if (existingTags.includes(tag)) return; // déjà présent

  existingTags.push(tag);

  const putRes = await fetch(`https://${SHOP()}/admin/api/${API_VER}/orders/${orderId}.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN(),
    },
    body: JSON.stringify({ order: { id: orderId, tags: existingTags.join(', ') } }),
  });

  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`Shopify PUT tag: ${putRes.status} — ${text}`);
  }

  console.log(`[Dorémi] Tag "${tag}" ajouté sur commande ${orderId}`);
}

// ── Ajouter un metafield à une commande ──
async function setOrderMetafield(orderId, namespace, key, value) {
  const res = await fetch(`https://${SHOP()}/admin/api/${API_VER}/orders/${orderId}/metafields.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN(),
    },
    body: JSON.stringify({
      metafield: {
        namespace,
        key,
        value,
        type: 'single_line_text_field',
      }
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify metafield: ${res.status} — ${text}`);
  }

  console.log(`[Dorémi] Metafield ${namespace}.${key} ajouté sur commande ${orderId}`);
}

// ── Actions combinées pour chaque étape du workflow ──

async function notifyParolesPretes(orderId, validationUrl) {
  await addOrderTag(orderId, 'doremi-paroles-pretes');
  await setOrderMetafield(orderId, 'doremi', 'validation_url', validationUrl);
}

async function notifyChansonsLivrees(orderId, pageUrl) {
  await addOrderTag(orderId, 'doremi-chansons-livrees');
  await setOrderMetafield(orderId, 'doremi', 'page_url', pageUrl);
}

module.exports = {
  addOrderTag,
  setOrderMetafield,
  notifyParolesPretes,
  notifyChansonsLivrees,
};
