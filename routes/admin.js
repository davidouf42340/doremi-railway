// ============================================================
// Dorémi — Routes Admin
// Interface embarquée dans Shopify pour gérer les commandes
// ============================================================

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const db      = require('../db');
const shopify = require('../utils/shopify-tags');
const { parseLyricsIntoSections, reassembleSections } = require('../utils/lyrics-sections');

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

// ── Middleware auth admin ──
// Vérifie DOREMI_ADMIN_SECRET via query param ou header
router.use((req, res, next) => {
  // Laisser passer la route de login
  if (req.path === '/login' && req.method === 'POST') return next();

  const secret = process.env.DOREMI_ADMIN_SECRET;
  if (!secret) return next(); // pas de secret configuré = pas de protection

  const provided = req.query.secret || req.headers['x-admin-secret'];
  if (provided === secret) return next();

  // Vérifier si déjà authentifié via cookie
  if (req.cookies?.doremi_admin === secret) return next();

  // Si c'est une requête de page (pas API), afficher le formulaire de login
  if (req.accepts('html') && !req.path.startsWith('/api/')) {
    return res.send(loginPage());
  }

  return res.status(401).json({ error: 'Non autorisé' });
});

// ── POST /admin/login — Authentification par mot de passe ──
router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const secret = process.env.DOREMI_ADMIN_SECRET;
  if (req.body.password === secret) {
    res.cookie('doremi_admin', secret, { httpOnly: true, maxAge: 7 * 24 * 3600 * 1000, sameSite: 'lax' });
    return res.redirect('/admin/orders');
  }
  return res.send(loginPage('Mot de passe incorrect'));
});

// ── GET /admin/orders — Liste des commandes ──
router.get('/orders', async (req, res) => {
  try {
    const status = req.query.status || null;
    const { orders, total } = await db.listOrders({ status });
    res.send(ordersListPage(orders, total, status));
  } catch (e) {
    console.error('[Admin] Erreur listOrders:', e);
    res.status(500).send('Erreur serveur');
  }
});

// ── GET /admin/order/:id — Détail d'une commande ──
router.get('/order/:id', async (req, res) => {
  try {
    const order = await db.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).send('Commande non trouvée');
    res.send(orderDetailPage(order));
  } catch (e) {
    console.error('[Admin] Erreur getOrder:', e);
    res.status(500).send('Erreur serveur');
  }
});

// ── API: POST /admin/api/order/:id/save-lyrics — Sauvegarder les paroles éditées ──
router.post('/api/order/:id/save-lyrics', async (req, res) => {
  try {
    const { lyrics } = req.body;
    const order = await db.updateOrder(Number(req.params.id), {
      lyrics_admin_edited: lyrics,
    });
    res.json({ success: true, order });
  } catch (e) {
    console.error('[Admin] Erreur save-lyrics:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── API: POST /admin/api/order/:id/send-to-client — Envoyer les paroles au client ──
router.post('/api/order/:id/send-to-client', async (req, res) => {
  try {
    const order = await db.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Commande non trouvée' });

    // Mettre à jour le statut + les paroles finales envoyées au client
    const lyricsToSend = order.lyrics_admin_edited || order.lyrics_original;
    await db.updateOrder(order.id, {
      status: 'pending_client_validation',
      lyrics_admin_edited: lyricsToSend,
      lyrics_client_modifications: null, // Effacer les anciennes modifications (le client repart sur une version propre)
    });

    // Ajouter le tag + metafield Shopify pour déclencher l'email via Shopify Flow
    const baseUrl = process.env.RAILWAY_PUBLIC_URL || `https://${req.get('host')}`;
    const validationUrl = `${baseUrl}/client/${order.client_token}`;

    await shopify.notifyParolesPretes(order.shopify_order_id, validationUrl);

    res.json({ success: true, validationUrl });
  } catch (e) {
    console.error('[Admin] Erreur send-to-client:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── API: POST /admin/api/order/:id/upload — Upload des fichiers MP3 ──
router.post('/api/order/:id/upload', upload.fields([
  { name: 'song1', maxCount: 1 },
  { name: 'song2', maxCount: 1 },
]), async (req, res) => {
  try {
    const order = await db.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Commande non trouvée' });

    const updates = {};

    // Upload vers Shopify Files API
    for (const [fieldName, fileIndex] of [['song1', '1'], ['song2', '2']]) {
      const file = req.files?.[fieldName]?.[0];
      if (!file) continue;

      const shopifyUrl = await uploadToShopifyFiles(file);
      updates[`song_file_${fileIndex}_url`] = shopifyUrl;
      updates[`song_file_${fileIndex}_name`] = file.originalname;
    }

    if (Object.keys(updates).length > 0) {
      await db.updateOrder(order.id, updates);
    }

    res.json({ success: true, updates });
  } catch (e) {
    console.error('[Admin] Erreur upload:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── API: POST /admin/api/order/:id/deliver — Livrer les chansons ──
router.post('/api/order/:id/deliver', async (req, res) => {
  try {
    const order = await db.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Commande non trouvée' });

    if (!order.song_file_1_url && !order.song_file_2_url) {
      return res.status(400).json({ error: 'Aucun fichier audio uploadé' });
    }

    // Mettre à jour le statut
    const lyricsF = order.lyrics_final || order.lyrics_admin_edited || order.lyrics_original;
    await db.updateOrder(order.id, {
      status: 'delivered',
      lyrics_final: lyricsF,
    });

    // Ajouter le tag + metafield Shopify
    const baseUrl = process.env.RAILWAY_PUBLIC_URL || `https://${req.get('host')}`;
    const pageUrl = `${baseUrl}/page/${order.public_token}`;

    await shopify.notifyChansonsLivrees(order.shopify_order_id, pageUrl);

    res.json({ success: true, pageUrl });
  } catch (e) {
    console.error('[Admin] Erreur deliver:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// UPLOAD SHOPIFY FILES API
// ============================================================
async function uploadToShopifyFiles(file) {
  const shop  = (process.env.SHOPIFY_SHOP_DOMAIN || '').replace(/^https?:\/\//, '').trim();
  const token = process.env.SHOPIFY_ACCESS_TOKEN;

  // Étape 1 : Créer un staged upload via GraphQL
  const stagedQuery = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `;

  const stagedRes = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({
      query: stagedQuery,
      variables: {
        input: [{
          filename: file.originalname,
          mimeType: file.mimetype || 'audio/mpeg',
          resource: 'FILE',
          fileSize: String(file.size),
          httpMethod: 'POST',
        }]
      }
    }),
  });

  const stagedData = await stagedRes.json();
  const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error('Shopify staged upload failed: ' + JSON.stringify(stagedData));

  // Étape 2 : Upload le fichier vers l'URL staged
  const formData = new FormData();
  target.parameters.forEach(p => formData.append(p.name, p.value));
  formData.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);

  const uploadRes = await fetch(target.url, { method: 'POST', body: formData });
  if (!uploadRes.ok && uploadRes.status !== 201) {
    throw new Error(`Shopify upload failed: ${uploadRes.status}`);
  }

  // Étape 3 : Créer le fichier dans Shopify
  const createFileQuery = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id alt createdAt }
        userErrors { field message }
      }
    }
  `;

  const createRes = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({
      query: createFileQuery,
      variables: {
        files: [{
          originalSource: target.resourceUrl,
          contentType: 'FILE',
        }]
      }
    }),
  });

  const createData = await createRes.json();
  const fileErrors = createData.data?.fileCreate?.userErrors;
  if (fileErrors?.length) throw new Error('Shopify fileCreate error: ' + JSON.stringify(fileErrors));

  // Retourner le resourceUrl (URL CDN Shopify)
  return target.resourceUrl;
}

// ============================================================
// PAGES HTML — Admin
// ============================================================

const LOGO_URL = 'https://doremisouvenir.fr/cdn/shop/files/logo-doremi-chanson-personnalisee.png';

const STYLES = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --charbon:#2C2C2A; --or:#FCB02E; --or-hover:#FCC02E; --or-pale:#FDF6E8; --gris:#888780; --gris-light:#D3D1C7; --gris-bg:#F9F8F6; --blanc:#FFFFFF; --radius:10px; --serif:'Cormorant Garamond',Georgia,serif; --sans:'Montserrat',system-ui,sans-serif; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:var(--sans); background:var(--gris-bg); color:var(--charbon); line-height:1.6; -webkit-font-smoothing:antialiased; }
  .topbar { background:var(--blanc); border-bottom:1px solid #EEEEE9; padding:12px 32px; display:flex; align-items:center; justify-content:space-between; }
  .topbar-logo { display:flex; align-items:center; gap:12px; text-decoration:none; }
  .topbar-logo img { height:40px; width:auto; }
  .topbar-badge { font-size:10px; font-weight:700; background:var(--or); color:var(--charbon); padding:2px 8px; border-radius:4px; letter-spacing:0.5px; text-transform:uppercase; }
  .topbar-nav a { color:var(--gris); font-size:13px; text-decoration:none; margin-left:20px; font-weight:500; }
  .topbar-nav a:hover { color:var(--charbon); }
  .container { max-width:1100px; margin:0 auto; padding:24px 32px; }
  h1 { font-size:22px; font-weight:600; margin-bottom:20px; }
  .filters { display:flex; gap:8px; margin-bottom:20px; flex-wrap:wrap; }
  .filter-btn { padding:6px 16px; border-radius:20px; border:1.5px solid var(--gris-light); background:var(--blanc); font-size:12px; cursor:pointer; text-decoration:none; color:var(--charbon); transition:all .15s; font-weight:500; }
  .filter-btn:hover, .filter-btn.active { background:var(--or); color:var(--charbon); border-color:var(--or); }
  table { width:100%; border-collapse:collapse; background:var(--blanc); border-radius:var(--radius); overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.04); }
  th { background:#FAFAF9; text-align:left; padding:10px 16px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; color:var(--gris); border-bottom:1px solid #EEEEE9; }
  td { padding:12px 16px; font-size:13px; border-bottom:1px solid #F5F5F3; }
  tr:hover td { background:#FDFCFA; }
  .badge { display:inline-block; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; }
  .badge-received { background:#e8f0fe; color:#1a73e8; }
  .badge-generated { background:var(--or-pale); color:#b8860b; }
  .badge-pending { background:#fef3e0; color:#e65100; }
  .badge-validated { background:#e6f4ea; color:#1e8e3e; }
  .badge-delivered { background:#e8eaed; color:#5f6368; }
  .badge-deuil { background:#f3e8f4; color:#7b1fa2; }
  .badge-festivites { background:#e8f5e9; color:#2e7d32; }
  .btn { display:inline-flex; align-items:center; gap:6px; padding:10px 20px; border-radius:8px; border:none; font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; font-family:var(--sans); letter-spacing:0.2px; }
  .btn-primary { background:var(--charbon); color:var(--blanc); }
  .btn-primary:hover { background:#444; }
  .btn-gold { background:var(--or); color:var(--charbon); }
  .btn-gold:hover { background:var(--or-hover); transform:translateY(-1px); box-shadow:0 4px 12px rgba(252,176,46,.3); }
  .btn-outline { background:none; border:1.5px solid var(--gris-light); color:var(--charbon); }
  .btn-outline:hover { border-color:var(--charbon); }
  .btn-danger { background:#e24b4a; color:var(--blanc); }
  .btn:disabled { opacity:.5; cursor:not-allowed; transform:none; box-shadow:none; }
  .link { color:var(--or); text-decoration:none; font-weight:600; }
  .link:hover { text-decoration:underline; }
  .card { background:var(--blanc); border-radius:var(--radius); padding:24px; box-shadow:0 2px 8px rgba(0,0,0,.04); margin-bottom:16px; }
  .card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
  .card-title { font-size:15px; font-weight:600; }
  .meta-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; margin-bottom:20px; }
  .meta-item { font-size:12px; }
  .meta-label { color:var(--gris); font-weight:400; }
  .meta-value { font-weight:600; margin-top:2px; }
  textarea.lyrics-editor { width:100%; min-height:300px; border:1.5px solid var(--gris-light); border-radius:8px; padding:16px; font-family:var(--serif); font-size:16px; line-height:2; resize:vertical; outline:none; }
  textarea.lyrics-editor:focus { border-color:var(--or); box-shadow:0 0 0 3px rgba(252,176,46,.15); }
  .actions-bar { display:flex; gap:10px; margin-top:16px; flex-wrap:wrap; }
  .upload-zone { border:2px dashed var(--gris-light); border-radius:8px; padding:24px; text-align:center; cursor:pointer; transition:all .15s; }
  .upload-zone:hover { border-color:var(--or); background:var(--or-pale); }
  .upload-zone.has-file { border-color:var(--or); background:var(--or-pale); }
  .file-info { font-size:12px; color:var(--gris); margin-top:8px; }
  .toast { position:fixed; bottom:24px; right:24px; background:var(--charbon); color:var(--blanc); padding:12px 24px; border-radius:8px; font-size:13px; display:none; z-index:999; animation:fadeIn .3s; box-shadow:0 4px 12px rgba(0,0,0,.15); }
  @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  .back-link { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--gris); text-decoration:none; margin-bottom:16px; font-weight:500; }
  .back-link:hover { color:var(--charbon); }
  .brief-section { background:#FAFAF9; border-radius:8px; padding:16px; margin-top:12px; }
  .brief-item { font-size:12px; padding:4px 0; border-bottom:1px solid #F0F0EE; }
  .brief-item:last-child { border:none; }
  .brief-key { color:var(--gris); }
  .status-flow { display:flex; gap:4px; align-items:center; margin-bottom:20px; flex-wrap:wrap; }
  .status-step { padding:4px 12px; border-radius:16px; font-size:11px; background:#F0F0EE; color:var(--gris); font-weight:500; }
  .status-step.active { background:var(--or); color:var(--charbon); font-weight:700; }
  .status-step.done { background:var(--charbon); color:var(--blanc); }
  .status-arrow { color:var(--gris-light); font-size:11px; }
</style>
`;

function statusBadge(status) {
  const map = {
    brief_received: ['Brief recu', 'badge-received'],
    lyrics_generated: ['Paroles generees', 'badge-generated'],
    pending_client_validation: ['Attente client', 'badge-pending'],
    client_validated: ['Client OK', 'badge-validated'],
    delivered: ['Livre', 'badge-delivered'],
  };
  const [label, cls] = map[status] || [status, ''];
  return `<span class="badge ${cls}">${label}</span>`;
}

function typeBadge(type) {
  return type === 'deuil'
    ? '<span class="badge badge-deuil">Deuil</span>'
    : '<span class="badge badge-festivites">Festivites</span>';
}

function statusFlow(currentStatus) {
  const steps = [
    { key: 'brief_received', label: 'Brief' },
    { key: 'lyrics_generated', label: 'Paroles' },
    { key: 'pending_client_validation', label: 'Validation client' },
    { key: 'client_validated', label: 'Client OK' },
    { key: 'delivered', label: 'Livre' },
  ];
  const currentIdx = steps.findIndex(s => s.key === currentStatus);
  return steps.map((s, i) => {
    const cls = i < currentIdx ? 'done' : i === currentIdx ? 'active' : '';
    const arrow = i < steps.length - 1 ? '<span class="status-arrow">&rarr;</span>' : '';
    return `<span class="status-step ${cls}">${s.label}</span>${arrow}`;
  }).join('');
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ── Page de login ──
function loginPage(error = '') {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoRémi Admin</title>
<link rel="icon" type="image/png" href="${LOGO_URL}">
${STYLES}</head>
<body>
<div class="topbar"><a href="/admin/orders" class="topbar-logo"><img src="${LOGO_URL}" alt="DoRémi Souvenir"><span class="topbar-badge">Admin</span></a></div>
<div class="container" style="max-width:400px;margin-top:80px">
  <div class="card" style="text-align:center">
    <img src="${LOGO_URL}" alt="DoRémi" style="height:48px;margin-bottom:16px">
    <h1 style="margin-bottom:8px">Connexion</h1>
    <p style="color:var(--gris);font-size:13px;margin-bottom:20px">Entrez le mot de passe admin DoRémi</p>
    ${error ? `<p style="color:#e24b4a;font-size:13px;margin-bottom:12px">${error}</p>` : ''}
    <form method="POST" action="/admin/login">
      <input type="password" name="password" placeholder="Mot de passe" style="width:100%;padding:10px 14px;border:1px solid var(--gris-light);border-radius:8px;font-size:14px;margin-bottom:12px;outline:none" autofocus>
      <button type="submit" class="btn btn-primary" style="width:100%">Se connecter</button>
    </form>
  </div>
</div>
</body></html>`;
}

// ── Page liste des commandes ──
function ordersListPage(orders, total, currentStatus) {
  const statuses = [
    { key: '', label: 'Toutes' },
    { key: 'brief_received', label: 'Brief recu' },
    { key: 'lyrics_generated', label: 'Paroles generees' },
    { key: 'pending_client_validation', label: 'Attente client' },
    { key: 'client_validated', label: 'Client OK' },
    { key: 'delivered', label: 'Livrees' },
  ];

  const rows = orders.map(o => `
    <tr>
      <td><a href="/admin/order/${o.id}" class="link">${o.shopify_order_number || '#' + o.shopify_order_id}</a></td>
      <td>${typeBadge(o.type)}</td>
      <td>${o.recipient_name || '—'}</td>
      <td>${o.customer_name || '—'}</td>
      <td>${o.occasion || '—'}</td>
      <td>${statusBadge(o.status)}</td>
      <td>${formatDate(o.created_at)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doremi Admin — Commandes</title>${STYLES}</head>
<body>
<div class="topbar">
  <a href="/admin/orders" class="topbar-logo"><img src="${LOGO_URL}" alt="DoRémi Souvenir"><span class="topbar-badge">Admin</span></a>
  <div class="topbar-nav">
    <a href="/admin/orders">Commandes</a>
  </div>
</div>
<div class="container">
  <h1>Commandes (${total || 0})</h1>
  <div class="filters">
    ${statuses.map(s => `<a href="/admin/orders${s.key ? '?status=' + s.key : ''}" class="filter-btn ${(currentStatus || '') === s.key ? 'active' : ''}">${s.label}</a>`).join('')}
  </div>
  <table>
    <thead>
      <tr><th>Commande</th><th>Type</th><th>Pour</th><th>Client</th><th>Occasion</th><th>Statut</th><th>Date</th></tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--gris)">Aucune commande</td></tr>'}
    </tbody>
  </table>
</div>
</body></html>`;
}

// ── Page détail commande ──
function orderDetailPage(order) {
  const lyrics = order.lyrics_admin_edited || order.lyrics_original || '';
  const sections = parseLyricsIntoSections(lyrics);
  const briefData = order.brief_data || {};
  const briefItems = Object.entries(briefData)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `<div class="brief-item"><span class="brief-key">${k} :</span> ${v}</div>`)
    .join('');

  // Modifications client — groupées par section
  const clientMods = order.lyrics_client_modifications || [];
  let clientModsHtml = '';
  if (clientMods.length > 0) {
    // Détection ancien format (sans champ section) vs nouveau
    const hasNewFormat = clientMods.some(m => m.section);
    if (hasNewFormat) {
      // Grouper par section
      const grouped = {};
      clientMods.forEach(m => {
        const key = m.section || 'Autres';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(m);
      });
      const groupedHtml = Object.entries(grouped).map(([section, mods]) => `
        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--or);margin-bottom:8px">${section}</div>
          ${mods.map(m => `
            <div style="padding:8px 0;border-bottom:1px solid #f0f0ee;font-size:13px">
              <div style="color:var(--gris);text-decoration:line-through">${m.original}</div>
              <div style="color:var(--or);font-weight:600;margin-top:2px">${m.modified || ''}</div>
              ${m.remark ? `<div style="font-size:12px;color:var(--gris);font-style:italic;margin-top:4px">Remarque : ${m.remark}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `).join('');
      clientModsHtml = `<div class="card"><div class="card-header"><span class="card-title">Modifications demandées par le client</span></div>${groupedHtml}</div>`;
    } else {
      // Ancien format — liste plate
      clientModsHtml = `<div class="card">
        <div class="card-header"><span class="card-title">Modifications du client</span></div>
        ${clientMods.map(m => `
          <div style="padding:8px 0;border-bottom:1px solid #f0f0ee;font-size:13px">
            <div style="color:var(--gris);text-decoration:line-through">${m.original}</div>
            <div style="color:var(--or);font-weight:600;margin-top:2px">${m.modified}</div>
          </div>
        `).join('')}
       </div>`;
    }
  }

  // Éditeur par sections
  const sectionsEditorHtml = sections.map((section, i) => {
    const lineCount = section.lines.length || 3;
    const rows = Math.max(lineCount + 1, 3);
    return `
    <div class="section-editor" data-section-index="${i}">
      <div class="section-label-admin">${section.label || 'Introduction'}</div>
      <textarea class="lyrics-editor section-textarea" id="section-editor-${i}" rows="${rows}">${section.lines.join('\n')}</textarea>
    </div>`;
  }).join('');

  // Fichiers audio
  const song1 = order.song_file_1_url
    ? `<div class="file-info" style="color:var(--charbon)">&#10003; ${order.song_file_1_name || 'Version 1'}</div>`
    : '';
  const song2 = order.song_file_2_url
    ? `<div class="file-info" style="color:var(--charbon)">&#10003; ${order.song_file_2_name || 'Version 2'}</div>`
    : '';

  const canSendToClient = ['lyrics_generated', 'client_validated', 'pending_client_validation'].includes(order.status);
  const canUpload = ['lyrics_generated', 'pending_client_validation', 'client_validated'].includes(order.status);
  const canDeliver = order.status === 'client_validated' && (order.song_file_1_url || order.song_file_2_url);

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoRémi Admin — ${order.shopify_order_number}</title>
<link rel="icon" type="image/png" href="${LOGO_URL}">
${STYLES}
<style>
  .section-editor { margin-bottom:20px; }
  .section-label-admin { display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:var(--or); background:var(--or-pale); padding:5px 14px; border-radius:6px; margin-bottom:8px; }
  .section-textarea { min-height:auto!important; }
</style>
</head>
<body>
<div class="topbar">
  <a href="/admin/orders" class="topbar-logo"><img src="${LOGO_URL}" alt="DoRémi Souvenir"><span class="topbar-badge">Admin</span></a>
  <div class="topbar-nav"><a href="/admin/orders">Commandes</a></div>
</div>
<div class="container">
  <a href="/admin/orders" class="back-link">&larr; Retour aux commandes</a>

  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
    <h1 style="margin:0">${order.shopify_order_number || '#' + order.shopify_order_id}</h1>
    ${typeBadge(order.type)}
    ${statusBadge(order.status)}
  </div>

  <div class="status-flow">${statusFlow(order.status)}</div>

  <!-- Infos commande -->
  <div class="card">
    <div class="card-header"><span class="card-title">Informations</span></div>
    <div class="meta-grid">
      <div class="meta-item"><div class="meta-label">Pour</div><div class="meta-value">${order.recipient_name || '—'}</div></div>
      <div class="meta-item"><div class="meta-label">Client</div><div class="meta-value">${order.customer_name || '—'}</div></div>
      <div class="meta-item"><div class="meta-label">Email</div><div class="meta-value">${order.customer_email || '—'}</div></div>
      <div class="meta-item"><div class="meta-label">Occasion</div><div class="meta-value">${order.occasion || '—'}</div></div>
      <div class="meta-item"><div class="meta-label">Type</div><div class="meta-value">${order.type === 'deuil' ? 'Hommage / Deuil' : 'Festivités'}</div></div>
      <div class="meta-item"><div class="meta-label">Date</div><div class="meta-value">${formatDate(order.created_at)}</div></div>
    </div>
    ${briefItems ? `<details><summary style="cursor:pointer;font-size:12px;color:var(--gris);margin-top:8px">Voir le brief complet</summary><div class="brief-section">${briefItems}</div></details>` : ''}
  </div>

  ${clientModsHtml}

  <!-- Éditeur de paroles par sections -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">Paroles</span>
      <button class="btn btn-outline" onclick="saveLyrics()" id="btn-save">Sauvegarder</button>
    </div>
    ${sectionsEditorHtml}
    <div class="actions-bar">
      ${canSendToClient ? '<button class="btn btn-gold" onclick="sendToClient()" id="btn-send">Envoyer au client pour validation</button>' : ''}
    </div>
  </div>

  <!-- Upload MP3 -->
  <div class="card">
    <div class="card-header"><span class="card-title">Fichiers audio</span></div>
    ${song1}${song2}
    ${canUpload ? `
    <form id="upload-form" style="margin-top:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:12px;color:var(--gris)">Version 1</label>
          <div class="upload-zone" onclick="this.querySelector('input').click()" id="zone1">
            <div style="font-size:20px">&#127925;</div>
            <div style="font-size:12px;color:var(--gris)">Cliquez pour ajouter le MP3</div>
            <input type="file" name="song1" accept="audio/*" style="display:none" onchange="fileSelected(this,'zone1')">
          </div>
        </div>
        <div>
          <label style="font-size:12px;color:var(--gris)">Version 2</label>
          <div class="upload-zone" onclick="this.querySelector('input').click()" id="zone2">
            <div style="font-size:20px">&#127928;</div>
            <div style="font-size:12px;color:var(--gris)">Cliquez pour ajouter le MP3</div>
            <input type="file" name="song2" accept="audio/*" style="display:none" onchange="fileSelected(this,'zone2')">
          </div>
        </div>
      </div>
      <div class="actions-bar">
        <button type="button" class="btn btn-primary" onclick="uploadFiles()" id="btn-upload">Uploader les fichiers</button>
      </div>
    </form>
    ` : ''}
  </div>

  <!-- Livraison -->
  ${canDeliver ? `
  <div class="card" style="border:2px solid var(--or)">
    <div class="card-header"><span class="card-title">Livrer les chansons</span></div>
    <p style="font-size:13px;color:var(--gris);margin-bottom:12px">Le client recevra un email avec le lien vers sa page personnelle contenant les paroles et les chansons.</p>
    <button class="btn btn-gold" onclick="deliverSongs()" id="btn-deliver">Livrer les chansons au client</button>
  </div>
  ` : ''}

  <!-- Liens utiles -->
  <div class="card">
    <div class="card-header"><span class="card-title">Liens</span></div>
    <div style="font-size:12px;display:flex;flex-direction:column;gap:6px">
      <div><span class="meta-label">Page validation client :</span> <a href="/client/${order.client_token}" class="link" target="_blank">/client/${order.client_token}</a></div>
      <div><span class="meta-label">Page personnelle :</span> <a href="/page/${order.public_token}" class="link" target="_blank">/page/${order.public_token}</a></div>
      <div><span class="meta-label">Page publique (QR) :</span> <a href="/share/${order.public_token}" class="link" target="_blank">/share/${order.public_token}</a></div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const ORDER_ID = ${order.id};
const SECTION_LABELS = ${JSON.stringify(sections.map(s => s.label))};

function toast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', duration);
}

// Auto-height textareas
document.querySelectorAll('.section-textarea').forEach(ta => {
  ta.style.height = ta.scrollHeight + 'px';
  ta.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'; });
});

async function saveLyrics() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Sauvegarde...';
  try {
    // Réassembler les sections en texte brut
    const parts = [];
    document.querySelectorAll('.section-editor').forEach((el, i) => {
      const label = SECTION_LABELS[i];
      const content = el.querySelector('.section-textarea').value;
      if (label) {
        parts.push(label + '\\n\\n' + content);
      } else {
        parts.push(content);
      }
    });
    const fullLyrics = parts.join('\\n\\n');

    const res = await fetch('/admin/api/order/' + ORDER_ID + '/save-lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lyrics: fullLyrics })
    });
    const data = await res.json();
    if (data.success) toast('Paroles sauvegardées');
    else toast('Erreur: ' + (data.error || 'inconnue'));
  } catch (e) { toast('Erreur: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Sauvegarder';
}

async function sendToClient() {
  if (!confirm('Envoyer les paroles au client pour validation ?')) return;
  await saveLyrics();
  const btn = document.getElementById('btn-send');
  btn.disabled = true; btn.textContent = 'Envoi...';
  try {
    const res = await fetch('/admin/api/order/' + ORDER_ID + '/send-to-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      toast('Paroles envoyées au client !');
      setTimeout(() => location.reload(), 1500);
    } else toast('Erreur: ' + (data.error || 'inconnue'));
  } catch (e) { toast('Erreur: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Envoyer au client pour validation';
}

function fileSelected(input, zoneId) {
  const zone = document.getElementById(zoneId);
  if (input.files[0]) {
    zone.classList.add('has-file');
    zone.querySelector('div:last-of-type').textContent = input.files[0].name;
  }
}

async function uploadFiles() {
  const form = document.getElementById('upload-form');
  const formData = new FormData(form);
  const btn = document.getElementById('btn-upload');
  btn.disabled = true; btn.textContent = 'Upload en cours...';
  try {
    const res = await fetch('/admin/api/order/' + ORDER_ID + '/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      toast('Fichiers uploadés !');
      setTimeout(() => location.reload(), 1500);
    } else toast('Erreur: ' + (data.error || 'inconnue'));
  } catch (e) { toast('Erreur: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Uploader les fichiers';
}

async function deliverSongs() {
  if (!confirm('Livrer les chansons au client ? Il recevra un email avec sa page personnelle.')) return;
  const btn = document.getElementById('btn-deliver');
  btn.disabled = true; btn.textContent = 'Livraison...';
  try {
    const res = await fetch('/admin/api/order/' + ORDER_ID + '/deliver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      toast('Chansons livrées !');
      setTimeout(() => location.reload(), 1500);
    } else toast('Erreur: ' + (data.error || 'inconnue'));
  } catch (e) { toast('Erreur: ' + e.message); }
  btn.disabled = false; btn.textContent = 'Livrer les chansons au client';
}
</script>
</body></html>`;
}

module.exports = router;
