// ============================================================
// Dorémi — Serveur Railway
// Webhook Shopify orders/paid → OpenAI GPT-4 → Note commande
// ============================================================

require('dotenv').config();
const express = require('express');
const crypto  = require('crypto');
const OpenAI  = require('openai');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── OpenAI client ──
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Body raw pour vérification signature Shopify ──
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── Health check Railway ──
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Dorémi Railway' }));

// ── OAuth Callback — capture le token Shopify ──
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Pas de code OAuth reçu');
  console.log('[Dorémi OAuth] Code reçu:', code);
  try {
    const shopDomain   = (process.env.SHOPIFY_SHOP_DOMAIN || '').replace(/^https?:\/\//, '').trim();
    const clientId     = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenRes.json();
    console.log('[Dorémi OAuth] Token reçu:', JSON.stringify(tokenData));
    if (tokenData.access_token) {
      res.send(`<html><body style="font-family:sans-serif;padding:40px;max-width:600px">
        <h2>✅ Token Shopify obtenu !</h2>
        <p>Copie ce token dans Railway > Variables > <strong>SHOPIFY_ACCESS_TOKEN</strong></p>
        <textarea style="width:100%;padding:12px;font-size:14px;border:2px solid #444;border-radius:8px" rows="3">${tokenData.access_token}</textarea>
        <p style="color:#888;font-size:13px">Scope : ${tokenData.scope}</p>
      </body></html>`);
    } else {
      res.send('<h2>❌ Erreur</h2><pre>' + JSON.stringify(tokenData, null, 2) + '</pre>');
    }
  } catch (e) {
    console.error('[Dorémi OAuth] Erreur:', e);
    res.status(500).send('Erreur: ' + e.message);
  }
});

// ============================================================
// WEBHOOK SHOPIFY — orders/paid
// ============================================================
app.post('/webhook/orders-paid', async (req, res) => {

  // ── 1. Vérification signature HMAC Shopify ──────────────
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const secret     = process.env.SHOPIFY_WEBHOOK_SECRET;

  const digest = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('base64');

  if (digest !== hmacHeader) {
    console.warn('[Dorémi] Signature webhook invalide — requête ignorée');
    return res.status(401).send('Unauthorized');
  }

  // Répondre immédiatement à Shopify (délai max 5s)
  res.status(200).send('OK');

  // ── 2. Parser la commande ───────────────────────────────
  let order;
  try {
    order = JSON.parse(req.body.toString());
  } catch (e) {
    console.error('[Dorémi] Erreur parsing commande:', e);
    return;
  }

  console.log(`[Dorémi] Commande reçue : #${order.order_number} — ${order.email}`);

  // ── 3. Trouver le line item avec les properties du brief ─
  const briefItem = order.line_items?.find(item =>
    item.properties && item.properties.length > 0 &&
    item.properties.some(p =>
      p.name === '_type_formulaire' || p.name === '_version_formulaire'
    )
  );

  if (!briefItem) {
    console.log(`[Dorémi] Commande #${order.order_number} : pas de brief trouvé — ignoré`);
    return;
  }

  // Convertir les properties en objet clé/valeur
  const brief = {};
  briefItem.properties.forEach(p => { brief[p.name] = p.value; });

  // Compatibilité festivités (_version_formulaire) et deuil (_type_formulaire)
  const typeFormulaire = brief['_type_formulaire'] || brief['_version_formulaire'] || 'doremi-festivites-v2';
  const isDeuil        = typeFormulaire.includes('deuil');

  console.log(`[Dorémi] Type : ${typeFormulaire} | Deuil : ${isDeuil}`);

  // ── 4. Construire le brief formaté ─────────────────────
  const briefTexte = isDeuil
    ? formatBriefDeuil(brief, order)
    : formatBriefFestivites(brief, order);

  // ── 5. Appel OpenAI ─────────────────────────────────────
  let paroles;
  try {
    paroles = await genererParoles(briefTexte, isDeuil);
    console.log(`[Dorémi] Paroles générées pour commande #${order.order_number}`);
  } catch (e) {
    console.error('[Dorémi] Erreur OpenAI:', e);
    await ajouterNoteCommande(order.id, `Erreur génération paroles : ${e.message}`);
    return;
  }

  // ── 6. Écrire les paroles dans la note de commande ─────
  const noteFinale = buildNote(order, brief, paroles, isDeuil);
  await ajouterNoteCommande(order.id, noteFinale);

  console.log(`[Dorémi] ✅ Note ajoutée sur commande #${order.order_number}`);
});

// ============================================================
// FORMAT BRIEF — FESTIVITÉS
// ============================================================
function formatBriefFestivites(b, order) {
  const lignes = [];
  lignes.push('=== BRIEF CHANSON DORÉMI — FESTIVITÉS ===\n');
  lignes.push("── L'OCCASION & LE DESTINATAIRE ──");
  if (b['Occasion'])             lignes.push(`Occasion : ${b['Occasion']}`);
  if (b['Prénom destinataire'])  lignes.push(`Prénom du destinataire : ${b['Prénom destinataire']}`);
  if (b['Âge destinataire'])     lignes.push(`Âge : ${b['Âge destinataire']}`);
  if (b['Offert par'])           lignes.push(`Qui offre cette chanson : ${b['Offert par']}`);
  if (b['Date événement'])       lignes.push(`Date de l'événement : ${b['Date événement']}`);
  lignes.push('\n── QUI EST CETTE PERSONNE ──');
  if (b['Description personne'])         lignes.push(`Description : ${b['Description personne']}`);
  if (b['Anecdote / souvenir'])          lignes.push(`Anecdote / souvenir : ${b['Anecdote / souvenir']}`);
  if (b['Expression favorite / surnom']) lignes.push(`Expression favorite / surnom : ${b['Expression favorite / surnom']}`);
  if (b['Passions et hobbies'])          lignes.push(`Passions et hobbies : ${b['Passions et hobbies']}`);
  lignes.push('\n── LE MESSAGE ──');
  if (b['Relation'])             lignes.push(`Relation avec le destinataire : ${b['Relation']}`);
  if (b['Message du coeur'])     lignes.push(`Message du coeur : ${b['Message du coeur']}`);
  if (b['Souvenir partagé'])     lignes.push(`Souvenir partagé : ${b['Souvenir partagé']}`);
  if (b['Mots à intégrer absolument']) lignes.push(`Mots à intégrer absolument : ${b['Mots à intégrer absolument']}`);
  lignes.push('\n── STYLE MUSICAL ──');
  if (b['Style musical'])        lignes.push(`Style musical : ${b['Style musical']}`);
  if (b['Ambiance'])             lignes.push(`Ambiance : ${b['Ambiance']}`);
  if (b['Notes complémentaires']) lignes.push(`\n── NOTES COMPLÉMENTAIRES ──\n${b['Notes complémentaires']}`);
  if (b['Délai choisi'])         lignes.push(`\nDélai choisi : ${b['Délai choisi']}`);
  return lignes.filter(Boolean).join('\n');
}

// ============================================================
// FORMAT BRIEF — DEUIL
// ============================================================
function formatBriefDeuil(b, order) {
  const lignes = [];
  lignes.push('=== BRIEF CHANSON DORÉMI — SOUVENIR & MÉMOIRE ===\n');
  lignes.push('── VOTRE PROCHE ──');
  if (b['Prénom du proche'])  lignes.push(`Prénom du proche : ${b['Prénom du proche']}`);
  if (b['Votre prénom'])      lignes.push(`Prénom de la personne qui commande : ${b['Votre prénom']}`);
  if (b['Votre relation'])    lignes.push(`Relation : ${b['Votre relation']}`);
  if (b['Âge au décès'])      lignes.push(`Âge au moment du décès : ${b['Âge au décès']}`);
  if (b['Date du décès'])     lignes.push(`Date du décès : ${b['Date du décès']}`);
  if (b['Occasion'])          lignes.push(`Occasion : ${b['Occasion']}`);
  if (b['Offert par'])        lignes.push(`Offert par : ${b['Offert par']}`);
  lignes.push('\n── QUI ÉTAIT CETTE PERSONNE ──');
  if (b['Description du proche'])        lignes.push(`Description : ${b['Description du proche']}`);
  if (b['Passions et habitudes'])        lignes.push(`Passions et habitudes : ${b['Passions et habitudes']}`);
  if (b['Expression préférée / surnom']) lignes.push(`Expression préférée / surnom : ${b['Expression préférée / surnom']}`);
  if (b['Endroit préféré'])              lignes.push(`Endroit préféré : ${b['Endroit préféré']}`);
  lignes.push('\n── LES SOUVENIRS ──');
  if (b['Souvenir principal'])        lignes.push(`Souvenir principal : ${b['Souvenir principal']}`);
  if (b['Message non dit'])           lignes.push(`Ce qui n'a jamais été dit : ${b['Message non dit']}`);
  if (b['Ce qui manque chaque jour']) lignes.push(`Ce qui manque chaque jour : ${b['Ce qui manque chaque jour']}`);
  if (b['Mots à intégrer absolument']) lignes.push(`Mots à intégrer absolument : ${b['Mots à intégrer absolument']}`);
  lignes.push('\n── STYLE MUSICAL ──');
  if (b['Style musical'])           lignes.push(`Style musical : ${b['Style musical']}`);
  if (b['Ambiance'])                lignes.push(`Ambiance : ${b['Ambiance']}`);
  if (b['Artiste / chanson favori']) lignes.push(`Artiste favori du proche : ${b['Artiste / chanson favori']}`);
  if (b['Notes complémentaires'])   lignes.push(`\n── NOTES COMPLÉMENTAIRES ──\n${b['Notes complémentaires']}`);
  if (b['Délai choisi'])            lignes.push(`\nDélai choisi : ${b['Délai choisi']}`);
  return lignes.filter(Boolean).join('\n');
}

// ============================================================
// GÉNÉRATION PAROLES — OpenAI GPT-4o
// ============================================================
async function genererParoles(briefTexte, isDeuil) {
  const systemPrompt = isDeuil
    ? `Tu es un parolier expert français spécialisé dans les chansons hommage et mémorielles.
Tu travailles pour Dorémi, un service de chansons personnalisées pour accompagner les familles en deuil.
Tes chansons sont écrites avec une sensibilité extrême, de la délicatesse, et un vrai talent poétique.
Tu écris des paroles qui seront mises en musique — elles doivent avoir un rythme naturel, des rimes, des couplets et un refrain mémorisable.
La chanson doit honorer la mémoire du proche avec authenticité, sans être écrasante de tristesse.
Tu ne mentionnes jamais que tu es une IA. Tu écris uniquement les paroles, sans commentaire.
Supprime tous les mots de structure comme "Couplet", "Refrain", "Pont", "Outro" dans le texte final.`
    : `Tu es un parolier expert français spécialisé dans les chansons personnalisées pour les grandes occasions.
Tu travailles pour Dorémi, un service de chansons sur-mesure.
Tu écris des paroles qui seront mises en musique — elles doivent avoir un rythme naturel, des rimes, des couplets et un refrain mémorisable.
La chanson doit être authentique, émotionnelle, et refléter fidèlement les détails du brief fourni.
Tu ne mentionnes jamais que tu es une IA. Tu écris uniquement les paroles, sans commentaire.
Supprime tous les mots de structure comme "Couplet", "Refrain", "Pont", "Outro" dans le texte final.`;

  const sujet = isDeuil ? 'la personne dont je te mets le contenu' : 'les personnes dont je te mets le contenu';
  const userPrompt = `Je souhaite que tu écrives une chanson pour ${sujet}. La chanson doit être écrite comme un parolier expert car elle sera mise en musique ensuite. La chanson doit être construite avec des rimes, des couplets, un refrain.\n\n${briefTexte}`;

  const response = await openai.chat.completions.create({
    model:       'gpt-4o',
    max_tokens:  2000,
    temperature: 0.85,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
  });

  return response.choices[0].message.content.trim();
}

// ============================================================
// NOTE DE COMMANDE SHOPIFY
// Écrit les paroles dans la note de la commande
// Visible dans Admin > Commandes > [commande] > Notes
// ============================================================
async function ajouterNoteCommande(orderId, note) {
  const shop        = (process.env.SHOPIFY_SHOP_DOMAIN || '').replace(/^https?:\/\//, '').trim();
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const url         = `https://${shop}/admin/api/2024-01/orders/${orderId}.json`;

  try {
    const res = await fetch(url, {
      method:  'PUT',
      headers: {
        'Content-Type':            'application/json',
        'X-Shopify-Access-Token':  accessToken,
      },
      body: JSON.stringify({ order: { id: orderId, note } }),
    });

    const responseText = await res.text();
    if (!res.ok) {
      console.error(`[Dorémi] Erreur Shopify API ${res.status}:`, responseText);
    } else {
      console.log(`[Dorémi] Note écrite sur commande ${orderId} — statut ${res.status}`);
    }
  } catch (e) {
    console.error('[Dorémi] Erreur fetch Shopify:', e);
  }
}

// ============================================================
// BUILD NOTE FINALE
// ============================================================
function buildNote(order, brief, paroles, isDeuil) {
  const separator = '='.repeat(50);
  const prenomKey = isDeuil ? 'Prénom du proche' : 'Prénom destinataire';
  const prenom    = brief[prenomKey] || 'Destinataire';
  const occasion  = brief['Occasion'] || (isDeuil ? 'Souvenir & Mémoire' : 'Festivité');
  const style     = brief['Style musical'] || '—';
  const ambiance  = brief['Ambiance'] || '—';
  const delai     = brief['Délai choisi'] || 'Standard';
  const timestamp = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  return `${separator}
DOREMI — PAROLES GENEREES
${separator}
Commande   : #${order.order_number}
Client     : ${order.billing_address?.first_name || ''} ${order.billing_address?.last_name || ''} <${order.email}>
Pour       : ${prenom}
Occasion   : ${occasion}
Style      : ${style}
Ambiance   : ${ambiance}
Delai      : ${delai}
Genere le  : ${timestamp}
${separator}

${paroles}

${separator}
Type formulaire : ${brief['_type_formulaire'] || brief['_version_formulaire'] || '—'}
Brief soumis le : ${brief['_timestamp_brief'] ? new Date(brief['_timestamp_brief']).toLocaleString('fr-FR') : '—'}
${separator}`;
}

// ============================================================
// ROUTE POST /formulaire — Soumission post-achat
// Reçoit les données du brief APRÈS le paiement Shopify
// Corps attendu : { order_id, type_formulaire, ...champs }
// ============================================================
app.post('/formulaire', async (req, res) => {
  const { order_id, type_formulaire, ...champs } = req.body;

  if (!order_id) {
    return res.status(400).json({ error: 'order_id manquant' });
  }

  console.log(`[Dorémi /formulaire] Reçu pour commande ${order_id} — type: ${type_formulaire}`);

  const isDeuil = (type_formulaire || '').includes('deuil');

  // Construire un objet brief compatible avec les fonctions existantes
  const brief = { ...champs, '_type_formulaire': type_formulaire, '_timestamp_brief': new Date().toISOString() };

  // Construire le texte du brief
  const briefTexte = isDeuil
    ? formatBriefDeuil(brief, { order_number: order_id, email: '' })
    : formatBriefFestivites(brief, { order_number: order_id, email: '' });

  // Générer les paroles via OpenAI
  let paroles;
  try {
    paroles = await genererParoles(briefTexte, isDeuil);
    console.log(`[Dorémi /formulaire] Paroles générées pour commande ${order_id}`);
  } catch (e) {
    console.error('[Dorémi /formulaire] Erreur OpenAI:', e);
    await ajouterNoteCommande(order_id, `Erreur génération paroles : ${e.message}`);
    return res.status(500).json({ error: 'Erreur génération paroles' });
  }

  // Récupérer les infos de commande Shopify pour construire la note
  let order = { id: order_id, order_number: order_id, email: '', billing_address: {} };
  try {
    const shop = (process.env.SHOPIFY_SHOP_DOMAIN || '').replace(/^https?:\/\//, '').trim();
    const shopRes = await fetch(`https://${shop}/admin/api/2024-01/orders/${order_id}.json`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
    });
    if (shopRes.ok) {
      const data = await shopRes.json();
      order = data.order;
    }
  } catch (e) {
    console.warn('[Dorémi /formulaire] Impossible de récupérer la commande Shopify:', e.message);
  }

  // Écrire la note dans la commande Shopify
  const noteFinale = buildNote(order, brief, paroles, isDeuil);
  await ajouterNoteCommande(order_id, noteFinale);

  console.log(`[Dorémi /formulaire] ✅ Note ajoutée sur commande ${order_id}`);
  res.json({ success: true, order_id });
});

// ── Démarrage ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Doremi Railway demarre sur le port ${PORT}`);
});
