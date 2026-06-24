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

// ── Fulfillment — marquer la commande comme expédiée (envoie l'email Shopify) ──
async function fulfillOrder(orderId, trackingUrl) {
  const shop = SHOP();
  const token = TOKEN();
  const gqlUrl = `https://${shop}/admin/api/${API_VER}/graphql.json`;
  const headers = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token };

  // Étape 1 : Récupérer les FulfillmentOrders de la commande
  const orderGid = `gid://shopify/Order/${orderId}`;
  const foQuery = `query { order(id: "${orderGid}") { fulfillmentOrders(first: 10) { nodes { id status } } } }`;

  const foRes = await fetch(gqlUrl, { method: 'POST', headers, body: JSON.stringify({ query: foQuery }) });
  const foData = await foRes.json();
  const fulfillmentOrders = foData.data?.order?.fulfillmentOrders?.nodes || [];

  // Filtrer les fulfillment orders ouvertes (pas déjà fulfilled)
  const openFOs = fulfillmentOrders.filter(fo => fo.status === 'OPEN' || fo.status === 'IN_PROGRESS');
  if (openFOs.length === 0) {
    console.warn('[Dorémi] Aucune fulfillment order ouverte pour la commande', orderId);
    return { fulfilled: false, reason: 'Commande déjà expédiée ou pas de fulfillment order' };
  }

  // Étape 2 : Créer le fulfillment
  const fulfillMutation = `
    mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
      fulfillmentCreateV2(fulfillment: $fulfillment) {
        fulfillment { id status }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    fulfillment: {
      lineItemsByFulfillmentOrder: openFOs.map(fo => ({ fulfillmentOrderId: fo.id })),
      trackingInfo: {
        company: 'DoRéMi Souvenir',
        url: trackingUrl,
        number: `DOREMI-${orderId}`,
      },
      notifyCustomer: true,
    },
  };

  const fulfillRes = await fetch(gqlUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: fulfillMutation, variables }),
  });

  const fulfillData = await fulfillRes.json();
  const userErrors = fulfillData.data?.fulfillmentCreateV2?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error('Shopify fulfillment: ' + userErrors.map(e => e.message).join(', '));
  }

  console.log(`[Dorémi] Commande ${orderId} marquée comme expédiée — email envoyé au client`);
  return { fulfilled: true };
}

// ── Actions combinées pour chaque étape du workflow ──

async function notifyParolesPretes(orderId, validationUrl) {
  await addOrderTag(orderId, 'doremi-paroles-pretes');
  await setOrderMetafield(orderId, 'doremi', 'validation_url', validationUrl);
}

async function notifyChansonsLivrees(orderId, pageUrl) {
  await addOrderTag(orderId, 'doremi-chansons-livrees');
  await setOrderMetafield(orderId, 'doremi', 'page_url', pageUrl);
  // Fulfillment Shopify → envoie l'email de livraison au client
  try {
    await fulfillOrder(orderId, pageUrl);
  } catch (err) {
    console.warn('[Dorémi] Erreur fulfillment (non bloquant):', err.message);
  }
}

module.exports = {
  addOrderTag,
  setOrderMetafield,
  notifyParolesPretes,
  notifyChansonsLivrees,
  fulfillOrder,
};
