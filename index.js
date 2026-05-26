// ============================================================
// Dorémi — Serveur Railway
// Webhook Shopify orders/paid → OpenAI GPT-4 → Note commande
// ============================================================

require('dotenv').config();
const express  = require('express');
const crypto   = require('crypto');
const OpenAI   = require('openai');

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

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
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('Pas de code OAuth reçu');
  }

  console.log('[Dorémi OAuth] Code reçu:', code);

  try {
    const shopDomain = (process.env.SHOPIFY_SHOP_DOMAIN || '').replace(/^https?:\/\//, '').trim();
    const clientId     = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    console.log('[Dorémi OAuth] Token reçu:', JSON.stringify(tokenData));

    if (tokenData.access_token) {
      // Afficher le token dans la réponse pour le copier dans Railway
      res.send(`
        <html><body style="font-family:sans-serif;padding:40px;max-width:600px">
          <h2>✅ Token Shopify obtenu !</h2>
          <p>Copie ce token et colle-le dans Railway > Variables > <strong>SHOPIFY_ACCESS_TOKEN</strong></p>
          <textarea style="width:100%;padding:12px;font-size:14px;border:2px solid #444;border-radius:8px" rows="3">${tokenData.access_token}</textarea>
          <p style="color:#888;font-size:13px">Scope : ${tokenData.scope}</p>
        </body></html>
      `);
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
    await ajouterNoteCommande(order.id, `❌ Erreur génération paroles : ${e.message}`);
    return;
  }

  // ── 6. Envoyer les paroles par email ────────────────────
  const noteFinale = buildNote(order, brief, paroles, isDeuil);
  await envoyerEmailParoles(order, brief, paroles, isDeuil, noteFinale);

  console.log(`[Dorémi] ✅ Email envoyé pour commande #${order.order_number}`);
});

// ============================================================
// FORMAT BRIEF — FESTIVITÉS
// Reconstruit le brief complet à envoyer à OpenAI
// ============================================================
function formatBriefFestivites(b, order) {
  const lignes = [];

  lignes.push('=== BRIEF CHANSON DORÉMI — FESTIVITÉS ===\n');

  // Occasion & destinataire
  lignes.push('── L\'OCCASION & LE DESTINATAIRE ──');
  if (b['Occasion'])              lignes.push(`Occasion : ${b['Occasion']}`);
  if (b['Prénom destinataire'])   lignes.push(`Prénom du destinataire : ${b['Prénom destinataire']}`);
  if (b['Âge destinataire'])      lignes.push(`Âge : ${b['Âge destinataire']}`);
  if (b['Offert par'])            lignes.push(`Qui offre cette chanson : ${b['Offert par']}`);
  if (b['Date événement'])        lignes.push(`Date de l'événement : ${b['Date événement']}`);

  // Description
  lignes.push('\n── QUI EST CETTE PERSONNE ──');
  if (b['Description personne'])          lignes.push(`Description : ${b['Description personne']}`);
  if (b['Anecdote / souvenir'])           lignes.push(`Anecdote / souvenir : ${b['Anecdote / souvenir']}`);
  if (b['Expression favorite / surnom'])  lignes.push(`Expression favorite / surnom : ${b['Expression favorite / surnom']}`);
  if (b['Passions et hobbies'])           lignes.push(`Passions et hobbies : ${b['Passions et hobbies']}`);

  // Message
  lignes.push('\n── LE MESSAGE ──');
  if (b['Relation'])              lignes.push(`Relation avec le destinataire : ${b['Relation']}`);
  if (b['Message du coeur'])      lignes.push(`Message du cœur : ${b['Message du coeur']}`);
  if (b['Souvenir partagé'])      lignes.push(`Souvenir partagé : ${b['Souvenir partagé']}`);
  if (b['Mots à intégrer absolument']) lignes.push(`Mots / phrases à intégrer absolument : ${b['Mots à intégrer absolument']}`);

  // Style
  lignes.push('\n── STYLE MUSICAL ──');
  if (b['Style musical'])         lignes.push(`Style musical : ${b['Style musical']}`);
  if (b['Ambiance'])              lignes.push(`Ambiance : ${b['Ambiance']}`);

  // Notes
  if (b['Notes complémentaires']) {
    lignes.push(`\n── NOTES COMPLÉMENTAIRES ──\n${b['Notes complémentaires']}`);
  }

  // Délai info
  if (b['Délai choisi']) lignes.push(`\nDélai choisi : ${b['Délai choisi']}`);

  return lignes.filter(Boolean).join('\n');
}

// ============================================================
// FORMAT BRIEF — DEUIL
// ============================================================
function formatBriefDeuil(b, order) {
  const lignes = [];

  lignes.push('=== BRIEF CHANSON DORÉMI — SOUVENIR & MÉMOIRE ===\n');

  // Le proche
  lignes.push('── VOTRE PROCHE ──');
  if (b['Prénom du proche'])    lignes.push(`Prénom du proche : ${b['Prénom du proche']}`);
  if (b['Votre prénom'])        lignes.push(`Prénom de la personne qui commande : ${b['Votre prénom']}`);
  if (b['Votre relation'])      lignes.push(`Relation : ${b['Votre relation']}`);
  if (b['Âge au décès'])        lignes.push(`Âge au moment du décès : ${b['Âge au décès']}`);
  if (b['Date du décès'])       lignes.push(`Date du décès : ${b['Date du décès']}`);
  if (b['Occasion'])            lignes.push(`Occasion : ${b['Occasion']}`);
  if (b['Offert par'])          lignes.push(`Offert par : ${b['Offert par']}`);

  // Qui était cette personne
  lignes.push('\n── QUI ÉTAIT CETTE PERSONNE ──');
  if (b['Description du proche'])          lignes.push(`Description : ${b['Description du proche']}`);
  if (b['Passions et habitudes'])          lignes.push(`Passions et habitudes : ${b['Passions et habitudes']}`);
  if (b['Expression préférée / surnom'])   lignes.push(`Expression préférée / surnom : ${b['Expression préférée / surnom']}`);
  if (b['Endroit préféré'])                lignes.push(`Endroit préféré : ${b['Endroit préféré']}`);

  // Souvenirs
  lignes.push('\n── LES SOUVENIRS ──');
  if (b['Souvenir principal'])             lignes.push(`Souvenir principal : ${b['Souvenir principal']}`);
  if (b['Message non dit'])                lignes.push(`Ce qui n'a jamais été dit : ${b['Message non dit']}`);
  if (b['Ce qui manque chaque jour'])      lignes.push(`Ce qui manque chaque jour : ${b['Ce qui manque chaque jour']}`);
  if (b['Mots à intégrer absolument'])     lignes.push(`Mots / phrases à intégrer absolument : ${b['Mots à intégrer absolument']}`);

  // Style
  lignes.push('\n── STYLE MUSICAL ──');
  if (b['Style musical'])                  lignes.push(`Style musical : ${b['Style musical']}`);
  if (b['Ambiance'])                       lignes.push(`Ambiance : ${b['Ambiance']}`);
  if (b['Artiste / chanson favori'])       lignes.push(`Artiste / chanson favori du proche : ${b['Artiste / chanson favori']}`);

  // Notes
  if (b['Notes complémentaires']) {
    lignes.push(`\n── NOTES COMPLÉMENTAIRES ──\n${b['Notes complémentaires']}`);
  }

  if (b['Délai choisi']) lignes.push(`\nDélai choisi : ${b['Délai choisi']}`);

  return lignes.filter(Boolean).join('\n');
}

// ============================================================
// GÉNÉRATION PAROLES — OpenAI GPT-4
// ============================================================
async function genererParoles(briefTexte, isDeuil) {

  // Prompt système : posture du parolier expert
  const systemPrompt = isDeuil
    ? `Tu es un parolier expert français spécialisé dans les chansons hommage et mémorielles.
Tu travailles pour Dorémi, un service de chansons personnalisées pour accompagner les familles en deuil.
Tes chansons sont écrites avec une sensibilité extrême, de la délicatesse, et un vrai talent poétique.
Tu écris des paroles qui seront mises en musique — elles doivent donc avoir un rythme naturel, des rimes, des couplets et un refrain mémorisable.
La chanson doit honorer la mémoire du proche avec authenticité, sans être écrasante de tristesse — elle doit apporter du réconfort et de la lumière.
Tu ne mentionnes jamais que tu es une IA. Tu écris uniquement les paroles, sans commentaire ni explication.
Supprime tous les mots de structure comme "Couplet", "Refrain", "Pont", "Outro" dans le texte final.`
    : `Tu es un parolier expert français spécialisé dans les chansons personnalisées pour les grandes occasions (mariages, anniversaires, naissances).
Tu travailles pour Dorémi, un service de chansons sur-mesure.
Tu écris des paroles qui seront mises en musique — elles doivent donc avoir un rythme naturel, des rimes, des couplets et un refrain mémorisable.
La chanson doit être authentique, émotionnelle, et refléter fidèlement les détails du brief fourni.
Tu intègres les anecdotes, les expressions et les souvenirs partagés de façon naturelle et poétique.
Tu ne mentionnes jamais que tu es une IA. Tu écris uniquement les paroles, sans commentaire ni explication.
Supprime tous les mots de structure comme "Couplet", "Refrain", "Pont", "Outro" dans le texte final.`;

  // Prompt utilisateur : le brief + l'instruction
  const sujet    = isDeuil ? 'la personne dont je te mets le contenu' : 'les personnes dont je te mets le contenu';
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
// ENVOI EMAIL — Resend
// Envoie les paroles générées par email au parolier
// ============================================================
async function envoyerEmailParoles(order, brief, paroles, isDeuil, noteComplete) {
  const prenomKey    = isDeuil ? 'Prénom du proche' : 'Prénom destinataire';
  const prenom       = brief[prenomKey] || 'Destinataire';
  const occasion     = brief['Occasion'] || (isDeuil ? 'Souvenir & Mémoire' : 'Festivité');
  const style        = brief['Style musical'] || '—';
  const ambiance     = brief['Ambiance'] || '—';
  const clientEmail  = order.email;
  const clientNom    = `${order.billing_address?.first_name || ''} ${order.billing_address?.last_name || ''}`.trim();
  const parolierEmail = process.env.PAROLIER_EMAIL || process.env.FROM_EMAIL;

  // Email HTML pour le parolier
  const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: sans-serif; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { background: #444441; color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p { margin: 6px 0 0; opacity: 0.7; font-size: 14px; }
    .meta { background: #f5f5f3; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .meta-row { display: flex; justify-content: space-between; margin: 6px 0; font-size: 14px; }
    .meta-label { color: #888; }
    .meta-val { font-weight: 500; }
    .paroles { background: white; border: 1px solid #e0e0dc; border-radius: 8px; padding: 24px; margin-bottom: 24px; }
    .paroles h2 { font-size: 16px; color: #444441; margin-top: 0; }
    .paroles pre { white-space: pre-wrap; font-family: Georgia, serif; font-size: 15px; line-height: 1.8; color: #333; }
    .brief { background: #fafaf8; border: 1px solid #e0e0dc; border-radius: 8px; padding: 20px; font-size: 13px; }
    .brief h3 { margin-top: 0; color: #444441; }
    .brief-field { margin: 8px 0; }
    .brief-label { font-weight: 600; color: #666; }
    .footer { margin-top: 24px; font-size: 12px; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎵 Dorémi — Nouvelles paroles générées</h1>
    <p>Commande #${order.order_number} · ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
  </div>

  <div class="meta">
    <div class="meta-row"><span class="meta-label">Client</span><span class="meta-val">${clientNom} &lt;${clientEmail}&gt;</span></div>
    <div class="meta-row"><span class="meta-label">Pour</span><span class="meta-val">${prenom}</span></div>
    <div class="meta-row"><span class="meta-label">Occasion</span><span class="meta-val">${occasion}</span></div>
    <div class="meta-row"><span class="meta-label">Style</span><span class="meta-val">${style}</span></div>
    <div class="meta-row"><span class="meta-label">Ambiance</span><span class="meta-val">${ambiance}</span></div>
    <div class="meta-row"><span class="meta-label">Délai</span><span class="meta-val">${brief['Délai choisi'] || 'Standard'}</span></div>
  </div>

  <div class="paroles">
    <h2>🎶 Paroles générées par GPT-4</h2>
    <pre>${paroles}</pre>
  </div>

  <div class="brief">
    <h3>📋 Brief complet du client</h3>
    ${Object.entries(brief)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => `<div class="brief-field"><span class="brief-label">${k} :</span> ${v}</div>`)
      .join('')}
  </div>

  <div class="footer">Dorémi · Généré automatiquement après paiement · Commande #${order.order_number}</div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from:    process.env.FROM_EMAIL || 'Dorémi <noreply@doremi.fr>',
      to:      [parolierEmail],
      subject: `🎵 [#${order.order_number}] Nouvelles paroles — ${prenom} · ${occasion}`,
      html:    htmlEmail,
    });
    console.log(`[Dorémi] Email envoyé à ${parolierEmail} — ID: ${result.data?.id}`);
  } catch (e) {
    console.error('[Dorémi] Erreur envoi email:', e);
  }
}

// ============================================================
// BUILD NOTE FINALE
// Formate proprement tout ce qui sera écrit dans la commande
// ============================================================
function buildNote(order, brief, paroles, isDeuil) {
  const separator = '═'.repeat(50);
  const prenomKey = isDeuil ? 'Prénom du proche' : 'Prénom destinataire';
  const prenom    = brief[prenomKey] || 'Destinataire';
  const occasion  = brief['Occasion'] || (isDeuil ? 'Souvenir & Mémoire' : 'Festivité');
  const style     = brief['Style musical'] || '—';
  const ambiance  = brief['Ambiance'] || '—';
  const delai     = brief['Délai choisi'] || 'Standard';
  const timestamp = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  return `${separator}
🎵 DORÉMI — PAROLES GÉNÉRÉES
${separator}
📋 Commande   : #${order.order_number}
👤 Client     : ${order.billing_address?.first_name || ''} ${order.billing_address?.last_name || ''} <${order.email}>
🎯 Pour       : ${prenom}
🎪 Occasion   : ${occasion}
🎸 Style      : ${style}
🌊 Ambiance   : ${ambiance}
⚡ Délai      : ${delai}
🕐 Généré le  : ${timestamp}
${separator}

${paroles}

${separator}
⚙️  Type formulaire : ${brief['_type_formulaire'] || '—'}
📅 Brief soumis le  : ${brief['_timestamp_brief'] ? new Date(brief['_timestamp_brief']).toLocaleString('fr-FR') : '—'}
${separator}`;
}

// ── Démarrage ──
// 0.0.0.0 obligatoire pour Railway (sinon healthcheck échoue)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Dorémi Railway démarré sur le port ${PORT}`);
});
