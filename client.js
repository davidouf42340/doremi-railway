// ============================================================
// Dorémi — Routes Client
// Page de validation des paroles par sections
// ============================================================

const express = require('express');
const db      = require('../db');
const shopify = require('../utils/shopify-tags');
const { parseLyricsIntoSections } = require('../utils/lyrics-sections');

const router = express.Router();

// ── CDN Assets ──
const LOGO_URL = 'https://doremisouvenir.fr/cdn/shop/files/logo-doremi-chanson-personnalisee.png';
const PICTO_MICRO = 'https://doremisouvenir.fr/cdn/shop/files/icone-micro-doremi-souvenirs-fond-transparent_80x80_crop_center.png';
const PICTO_COEUR = 'https://doremisouvenir.fr/cdn/shop/files/icone-coeur-doremi-souvenirs-fond-transparent_80x80_crop_center.png';
const PICTO_CADEAU = 'https://doremisouvenir.fr/cdn/shop/files/icone-cadeau-doremi-souvenirs-fond-transparent_80x80_crop_center.png';

// ── GET /client/:token — Page de validation des paroles ──
router.get('/:token', async (req, res) => {
  try {
    const order = await db.getOrderByToken('client', req.params.token);
    if (!order) return res.status(404).send(notFoundPage());

    // Si déjà livré, rediriger vers la page personnelle
    if (order.status === 'delivered') {
      return res.redirect(`/page/${order.public_token}`);
    }

    // Si pas encore en attente de validation client
    if (order.status !== 'pending_client_validation' && order.status !== 'client_validated') {
      return res.send(notReadyPage(order));
    }

    const lyrics = order.lyrics_admin_edited || order.lyrics_original || '';
    const alreadyValidated = order.status === 'client_validated';

    res.send(validationPage(order, lyrics, alreadyValidated));
  } catch (e) {
    console.error('[Client] Erreur:', e);
    res.status(500).send('Erreur serveur');
  }
});

// ── POST /client/:token/validate — Soumettre validation ou modifications ──
router.post('/:token/validate', express.json(), async (req, res) => {
  try {
    const order = await db.getOrderByToken('client', req.params.token);
    if (!order) return res.status(404).json({ error: 'Commande non trouvée' });

    const { modifications, action } = req.body;

    if (action === 'validate') {
      // Toutes les sections confirmées — valider les paroles
      const lyricsSource = order.lyrics_admin_edited || order.lyrics_original || '';

      await db.updateOrder(order.id, {
        status: 'client_validated',
        lyrics_client_modifications: null,
        lyrics_final: lyricsSource,
      });

      try {
        await shopify.addOrderTag(order.shopify_order_id, 'doremi-client-valide');
      } catch (e) {
        console.warn('[Client] Erreur tag Shopify:', e.message);
      }

      res.json({ success: true, action: 'validated' });

    } else if (action === 'request_modifications') {
      // Au moins une section modifiée — stocker les modifications
      await db.updateOrder(order.id, {
        status: 'pending_client_validation',
        lyrics_client_modifications: modifications || [],
      });

      res.json({ success: true, action: 'modifications_requested' });

    } else {
      res.status(400).json({ error: 'Action inconnue' });
    }
  } catch (e) {
    console.error('[Client] Erreur validate:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// STYLES — Branding DoRémi Souvenir
// ============================================================

const STYLES = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --charbon: #2C2C2A;
    --or: #FCB02E;
    --or-hover: #FCC02E;
    --or-pale: #FDF6E8;
    --gris: #888780;
    --gris-light: #D3D1C7;
    --gris-bg: #F9F8F6;
    --blanc: #FFFFFF;
    --vert: #4CAF50;
    --vert-pale: #E8F5E9;
    --rouge-pale: #FFF3E0;
    --radius: 12px;
    --serif: 'Cormorant Garamond', Georgia, serif;
    --sans: 'Montserrat', system-ui, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { font-family: var(--sans); background: var(--gris-bg); color: var(--charbon); line-height: 1.6; font-weight: 400; -webkit-font-smoothing: antialiased; }

  /* Header */
  .header { background: var(--blanc); border-bottom: 1px solid #EEEEE9; padding: 16px 24px; text-align: center; }
  .header a { text-decoration: none; display: inline-flex; align-items: center; }
  .header-logo { height: 48px; width: auto; }

  /* Container */
  .container { max-width: 800px; margin: 0 auto; padding: 32px 20px 80px; }

  /* Intro */
  .intro-card { background: var(--blanc); border-radius: var(--radius); padding: 36px 32px; text-align: center; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,.04); position: relative; }
  .intro-card::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 60px; height: 3px; background: var(--or); border-radius: 0 0 3px 3px; }
  .intro-picto { width: 48px; height: 48px; margin-bottom: 16px; }
  .intro-title { font-family: var(--serif); font-size: 28px; font-weight: 400; margin-bottom: 8px; color: var(--charbon); }
  .intro-sub { font-size: 14px; color: var(--gris); line-height: 1.7; }

  /* Instructions */
  .instructions { background: var(--or-pale); border-left: 3px solid var(--or); border-radius: 0 var(--radius) var(--radius) 0; padding: 16px 20px; margin-bottom: 24px; font-size: 13px; line-height: 1.8; color: var(--charbon); }
  .instructions strong { font-weight: 600; }

  /* Section card */
  .section-card { background: var(--blanc); border-radius: var(--radius); overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.04); margin-bottom: 16px; border: 2px solid transparent; transition: border-color .2s; }
  .section-card.status-confirmed { border-color: var(--vert); }
  .section-card.status-modified { border-color: var(--or); }

  .section-header { background: var(--charbon); color: var(--blanc); padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; display: flex; align-items: center; gap: 10px; }
  .section-label svg { opacity: 0.5; }
  .section-badge { font-size: 10px; font-weight: 600; padding: 3px 10px; border-radius: 10px; text-transform: uppercase; letter-spacing: 1px; }
  .badge-pending { background: rgba(255,255,255,.15); color: rgba(255,255,255,.7); }
  .badge-confirmed { background: var(--vert); color: var(--blanc); }
  .badge-modified { background: var(--or); color: var(--charbon); }

  /* Lines in section */
  .section-body { padding: 0; }
  .line-row { display: flex; align-items: flex-start; border-bottom: 1px solid #F5F5F3; transition: background .15s; }
  .line-row:hover { background: #FDFCFA; }
  .line-row:last-child { border: none; }
  .line-row.empty-line { min-height: 24px; }
  .line-row.modified { background: var(--or-pale); }

  .line-num { width: 40px; flex-shrink: 0; padding: 12px 0; text-align: center; font-size: 10px; color: var(--gris-light); font-weight: 600; font-family: var(--sans); }
  .line-content { flex: 1; padding: 12px 16px; font-family: var(--serif); font-size: 17px; line-height: 1.8; min-height: 48px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }

  .line-actions { width: 120px; flex-shrink: 0; padding: 8px 12px; display: flex; align-items: center; justify-content: center; gap: 6px; }

  .btn-edit { padding: 6px 14px; border-radius: 6px; border: 1.5px solid var(--gris-light); background: var(--blanc); font-size: 11px; cursor: pointer; font-family: var(--sans); color: var(--gris); transition: all .15s; font-weight: 500; }
  .btn-edit:hover { border-color: var(--or); color: var(--charbon); }
  .btn-edit.active { background: var(--or-pale); border-color: var(--or); color: var(--charbon); }

  .btn-undo { padding: 6px 10px; border-radius: 6px; border: 1.5px solid var(--gris-light); background: var(--blanc); font-size: 11px; cursor: pointer; color: var(--gris); display: none; transition: all .15s; font-weight: 500; }
  .btn-undo:hover { border-color: #e24b4a; color: #e24b4a; }

  .edit-zone { display: none; padding: 0 16px 12px 56px; }
  .edit-zone.open { display: block; }
  .edit-input { width: 100%; border: 1.5px solid var(--or); border-radius: 8px; padding: 10px 14px; font-family: var(--serif); font-size: 16px; line-height: 1.6; outline: none; resize: none; }
  .edit-input:focus { box-shadow: 0 0 0 3px rgba(252,176,46,.2); }
  .remark-input { width: 100%; border: 1.5px solid var(--gris-light); border-radius: 8px; padding: 8px 14px; font-family: var(--sans); font-size: 12px; line-height: 1.5; outline: none; resize: none; margin-top: 6px; color: var(--gris); }
  .remark-input:focus { border-color: var(--or); box-shadow: 0 0 0 3px rgba(252,176,46,.1); }
  .remark-input::placeholder { color: var(--gris-light); }
  .edit-actions { display: flex; gap: 8px; margin-top: 8px; }
  .btn-save-line { padding: 7px 18px; border-radius: 6px; background: var(--or); color: var(--charbon); border: none; font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--sans); transition: all .15s; }
  .btn-save-line:hover { background: var(--or-hover); }
  .btn-cancel-line { padding: 7px 18px; border-radius: 6px; background: none; color: var(--gris); border: 1.5px solid var(--gris-light); font-size: 12px; cursor: pointer; font-family: var(--sans); }

  .modified-text { font-family: var(--serif); font-size: 17px; line-height: 1.8; color: var(--or); font-weight: 600; }
  .remark-display { font-family: var(--sans); font-size: 11px; color: var(--gris); font-style: italic; margin-top: 2px; display: block; }

  /* Section actions */
  .section-actions { padding: 12px 20px; border-top: 1px solid #F5F5F3; display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
  .btn-confirm-section { padding: 8px 20px; border-radius: 6px; background: var(--vert); color: var(--blanc); border: none; font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--sans); transition: all .15s; }
  .btn-confirm-section:hover { opacity: 0.9; }
  .btn-confirm-section:disabled { opacity: 0.5; cursor: not-allowed; }
  .section-status-text { font-size: 12px; color: var(--vert); font-weight: 600; display: flex; align-items: center; gap: 4px; }

  /* Submit */
  .submit-card { background: var(--blanc); border-radius: var(--radius); padding: 36px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
  .submit-card p { font-size: 13px; color: var(--gris); margin-bottom: 20px; line-height: 1.7; }
  .btn-validate { padding: 16px 48px; border-radius: 8px; background: var(--vert); color: var(--blanc); border: none; font-size: 15px; font-weight: 600; cursor: pointer; font-family: var(--sans); transition: all .2s; letter-spacing: 0.3px; }
  .btn-validate:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(76,175,80,.3); }
  .btn-validate:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: none; }
  .btn-request-mods { padding: 16px 48px; border-radius: 8px; background: var(--or); color: var(--charbon); border: none; font-size: 15px; font-weight: 600; cursor: pointer; font-family: var(--sans); transition: all .2s; letter-spacing: 0.3px; }
  .btn-request-mods:hover { background: var(--or-hover); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(252,176,46,.3); }
  .btn-request-mods:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: none; }

  .mods-counter { display: inline-block; background: var(--or-pale); color: var(--charbon); padding: 5px 14px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
  .progress-bar { display: flex; gap: 4px; margin-bottom: 20px; justify-content: center; }
  .progress-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--gris-light); transition: background .2s; }
  .progress-dot.confirmed { background: var(--vert); }
  .progress-dot.modified { background: var(--or); }

  /* Success */
  .success-card { background: var(--blanc); border-radius: var(--radius); padding: 56px 36px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
  .success-picto { width: 56px; height: 56px; margin-bottom: 16px; }
  .success-title { font-family: var(--serif); font-size: 26px; margin-bottom: 10px; font-weight: 400; color: var(--charbon); }
  .success-text { font-size: 14px; color: var(--gris); line-height: 1.8; max-width: 480px; margin: 0 auto; }

  /* Footer */
  .footer { text-align: center; padding: 40px 20px; font-size: 12px; color: var(--gris); }
  .footer a { color: var(--or); text-decoration: none; font-weight: 500; }
  .footer-logo { height: 32px; margin-bottom: 12px; opacity: 0.6; }

  @media (max-width: 640px) {
    .line-row { flex-wrap: wrap; }
    .line-actions { width: 100%; justify-content: flex-end; padding: 0 12px 8px; }
    .line-num { width: 32px; }
    .edit-zone { padding: 0 12px 12px 12px; }
    .container { padding: 20px 16px 60px; }
    .header-logo { height: 40px; }
    .intro-title { font-size: 24px; }
    .section-actions { flex-wrap: wrap; }
  }
</style>
`;

function headerHtml() {
  return `<div class="header">
    <a href="https://doremisouvenir.fr">
      <img src="${LOGO_URL}" alt="DoRémi Souvenir" class="header-logo">
    </a>
  </div>`;
}

function footerHtml() {
  return `<div class="footer">
    <img src="${LOGO_URL}" alt="DoRémi Souvenir" class="footer-logo"><br>
    <a href="https://doremisouvenir.fr">doremisouvenir.fr</a>
  </div>`;
}

// ── Page 404 ──
function notFoundPage() {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoRémi Souvenir — Page non trouvée</title>
<link rel="icon" type="image/png" href="${LOGO_URL}">
${STYLES}</head>
<body>${headerHtml()}
<div class="container">
  <div class="success-card">
    <img src="${PICTO_CADEAU}" alt="" class="success-picto" style="opacity:0.4">
    <div class="success-title">Page non trouvée</div>
    <div class="success-text">Ce lien n'est pas valide ou a expiré. Vérifiez le lien reçu par email.</div>
  </div>
</div>
${footerHtml()}</body></html>`;
}

// ── Page pas encore prête ──
function notReadyPage(order) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoRémi Souvenir — En cours</title>
<link rel="icon" type="image/png" href="${LOGO_URL}">
${STYLES}</head>
<body>${headerHtml()}
<div class="container">
  <div class="success-card">
    <img src="${PICTO_MICRO}" alt="" class="success-picto">
    <div class="success-title">Votre chanson est en cours de création</div>
    <div class="success-text">Notre parolier travaille sur votre chanson${order.recipient_name ? ' pour ' + order.recipient_name : ''}. Vous recevrez un email dès que les paroles seront prêtes à valider.</div>
  </div>
</div>
${footerHtml()}</body></html>`;
}

// ── Page de validation des paroles par sections ──
function validationPage(order, lyrics, alreadyValidated) {
  const sections = parseLyricsIntoSections(lyrics);
  const recipientName = order.recipient_name || 'votre proche';

  if (alreadyValidated) {
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoRémi Souvenir — Paroles validées</title>
<link rel="icon" type="image/png" href="${LOGO_URL}">
${STYLES}</head>
<body>${headerHtml()}
<div class="container">
  <div class="success-card">
    <img src="${PICTO_COEUR}" alt="" class="success-picto">
    <div class="success-title">Paroles déjà validées</div>
    <div class="success-text">Vous avez déjà validé les paroles de la chanson pour ${recipientName}. Notre équipe travaille maintenant sur la mise en musique. Vous recevrez un email dès que les chansons seront prêtes.</div>
  </div>
</div>
${footerHtml()}</body></html>`;
  }

  // Build sections HTML
  const sectionsHtml = sections.map((section, sIdx) => {
    const sectionLabel = section.label || 'Introduction';
    const linesHtml = section.lines.map((line, lIdx) => {
      const isEmpty = line.trim() === '';
      return `
      <div class="line-row ${isEmpty ? 'empty-line' : ''}" id="row-${sIdx}-${lIdx}" data-section="${sIdx}" data-line="${lIdx}">
        <div class="line-num">${lIdx + 1}</div>
        <div class="line-content" id="content-${sIdx}-${lIdx}">${escapeHtml(line) || '&nbsp;'}</div>
        ${!isEmpty ? `
        <div class="line-actions">
          <button class="btn-edit" onclick="toggleEdit(${sIdx},${lIdx})" id="btn-edit-${sIdx}-${lIdx}">Modifier</button>
          <button class="btn-undo" onclick="undoLine(${sIdx},${lIdx})" id="btn-undo-${sIdx}-${lIdx}">Annuler</button>
        </div>` : '<div class="line-actions"></div>'}
      </div>
      <div class="edit-zone" id="edit-zone-${sIdx}-${lIdx}">
        <textarea class="edit-input" id="edit-input-${sIdx}-${lIdx}" rows="2">${escapeHtml(line)}</textarea>
        <input type="text" class="remark-input" id="remark-input-${sIdx}-${lIdx}" placeholder="Remarque optionnelle (ex: changer le ton, ajuster la rime...)">
        <div class="edit-actions">
          <button class="btn-save-line" onclick="saveLine(${sIdx},${lIdx})">Valider cette modification</button>
          <button class="btn-cancel-line" onclick="cancelEdit(${sIdx},${lIdx})">Annuler</button>
        </div>
      </div>`;
    }).join('');

    return `
    <div class="section-card" id="section-card-${sIdx}" data-section="${sIdx}">
      <div class="section-header">
        <div class="section-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          ${escapeHtml(sectionLabel)}
        </div>
        <span class="section-badge badge-pending" id="badge-${sIdx}">En attente</span>
      </div>
      <div class="section-body">
        ${linesHtml}
      </div>
      <div class="section-actions" id="section-actions-${sIdx}">
        <button class="btn-confirm-section" onclick="confirmSection(${sIdx})" id="btn-confirm-${sIdx}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>
          Confirmer cette section
        </button>
      </div>
    </div>`;
  }).join('');

  // Progress dots
  const progressDots = sections.map((_, sIdx) =>
    `<div class="progress-dot" id="dot-${sIdx}"></div>`
  ).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoRémi Souvenir — Validez les paroles</title>
<link rel="icon" type="image/png" href="${LOGO_URL}">
${STYLES}</head>
<body>${headerHtml()}
<div class="container">

  <div class="intro-card">
    <img src="${PICTO_COEUR}" alt="" class="intro-picto">
    <div class="intro-title">Les paroles de la chanson pour ${escapeHtml(recipientName)}</div>
    <div class="intro-sub">Commande ${order.shopify_order_number || ''}</div>
  </div>

  <div class="instructions">
    <strong>Comment ça marche :</strong><br>
    Relisez chaque section ci-dessous. Pour chaque ligne, vous pouvez cliquer sur <strong>Modifier</strong> pour proposer un changement et ajouter une remarque.<br>
    Une fois une section relue, cliquez sur <strong>Confirmer cette section</strong>.<br>
    Quand toutes les sections sont confirmées, vous pourrez <strong>valider les paroles</strong>. Si vous avez demandé des modifications, notre parolier les intégrera et vous renverra une nouvelle version.
  </div>

  ${sectionsHtml}

  <div class="submit-card" id="submit-card">
    <div class="progress-bar" id="progress-bar">${progressDots}</div>
    <div class="mods-counter" id="mods-counter" style="display:none">0 modification(s)</div>
    <p id="submit-text">Confirmez chaque section ci-dessus avant de valider.</p>
    <button class="btn-validate" onclick="validateAll()" id="btn-validate" style="display:none" disabled>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:6px"><polyline points="20 6 9 17 4 12"/></svg>
      Valider les paroles
    </button>
    <button class="btn-request-mods" onclick="requestModifications()" id="btn-request-mods" style="display:none">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      Enregistrer ma demande de modification
    </button>
  </div>

  <!-- Écran de succès validation (caché) -->
  <div class="success-card" id="success-validated" style="display:none">
    <img src="${PICTO_COEUR}" alt="" class="success-picto">
    <div class="success-title">Paroles validées, merci !</div>
    <div class="success-text">
      Notre équipe va maintenant créer les 2 versions musicales de votre chanson.
      Vous recevrez un email dès qu'elles seront prêtes.
    </div>
  </div>

  <!-- Écran de succès modifications demandées (caché) -->
  <div class="success-card" id="success-modifications" style="display:none">
    <img src="${PICTO_MICRO}" alt="" class="success-picto">
    <div class="success-title">Demande envoyée !</div>
    <div class="success-text">
      Notre parolier va prendre en compte vos modifications et vous proposer une nouvelle version.
      Vous recevrez un email dès que les paroles mises à jour seront prêtes.
    </div>
  </div>

</div>

${footerHtml()}

<script>
const TOKEN = '${order.client_token}';
const SECTIONS_DATA = ${JSON.stringify(sections.map(s => ({ label: s.label, lines: s.lines })))};
const TOTAL_SECTIONS = SECTIONS_DATA.length;

// State per section: 'pending', 'confirmed', 'modified'
const sectionStates = new Array(TOTAL_SECTIONS).fill('pending');
// Modifications: { "sIdx-lIdx": { section, lineIndex, original, modified, remark } }
const modifications = {};

function toggleEdit(sIdx, lIdx) {
  const zone = document.getElementById('edit-zone-' + sIdx + '-' + lIdx);
  const isOpen = zone.classList.contains('open');
  // Close all open edit zones
  document.querySelectorAll('.edit-zone.open').forEach(function(z) { z.classList.remove('open'); });
  document.querySelectorAll('.btn-edit.active').forEach(function(b) { b.classList.remove('active'); });
  if (!isOpen) {
    zone.classList.add('open');
    document.getElementById('btn-edit-' + sIdx + '-' + lIdx).classList.add('active');
    var input = document.getElementById('edit-input-' + sIdx + '-' + lIdx);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function cancelEdit(sIdx, lIdx) {
  document.getElementById('edit-zone-' + sIdx + '-' + lIdx).classList.remove('open');
  document.getElementById('btn-edit-' + sIdx + '-' + lIdx).classList.remove('active');
  var key = sIdx + '-' + lIdx;
  var input = document.getElementById('edit-input-' + sIdx + '-' + lIdx);
  input.value = modifications[key] ? modifications[key].modified : SECTIONS_DATA[sIdx].lines[lIdx];
}

function saveLine(sIdx, lIdx) {
  var input = document.getElementById('edit-input-' + sIdx + '-' + lIdx);
  var remarkInput = document.getElementById('remark-input-' + sIdx + '-' + lIdx);
  var newValue = input.value.trim();
  var remark = remarkInput.value.trim();
  var original = SECTIONS_DATA[sIdx].lines[lIdx];
  var sectionLabel = SECTIONS_DATA[sIdx].label || 'Introduction';
  var key = sIdx + '-' + lIdx;

  if (newValue === original && !remark) {
    undoLine(sIdx, lIdx);
    return;
  }

  modifications[key] = {
    section: sectionLabel,
    lineIndex: lIdx,
    original: original,
    modified: newValue,
    remark: remark || null
  };

  var row = document.getElementById('row-' + sIdx + '-' + lIdx);
  var content = document.getElementById('content-' + sIdx + '-' + lIdx);
  row.classList.add('modified');

  var html = '';
  if (newValue !== original) {
    html += '<span style="text-decoration:line-through;color:var(--gris);font-size:14px;display:block">' + escapeHtmlJS(original) + '</span>';
    html += '<span class="modified-text">' + escapeHtmlJS(newValue) + '</span>';
  } else {
    html += escapeHtmlJS(original);
  }
  if (remark) {
    html += '<span class="remark-display">' + escapeHtmlJS(remark) + '</span>';
  }
  content.innerHTML = html;

  document.getElementById('btn-undo-' + sIdx + '-' + lIdx).style.display = 'inline-block';
  document.getElementById('btn-edit-' + sIdx + '-' + lIdx).textContent = 'Re-modifier';

  document.getElementById('edit-zone-' + sIdx + '-' + lIdx).classList.remove('open');
  document.getElementById('btn-edit-' + sIdx + '-' + lIdx).classList.remove('active');

  // Mark section as modified
  setSectionState(sIdx, 'modified');
  updateUI();
}

function undoLine(sIdx, lIdx) {
  var key = sIdx + '-' + lIdx;
  delete modifications[key];

  var row = document.getElementById('row-' + sIdx + '-' + lIdx);
  var content = document.getElementById('content-' + sIdx + '-' + lIdx);
  row.classList.remove('modified');
  content.textContent = SECTIONS_DATA[sIdx].lines[lIdx] || '\\u00a0';

  document.getElementById('btn-undo-' + sIdx + '-' + lIdx).style.display = 'none';
  document.getElementById('btn-edit-' + sIdx + '-' + lIdx).textContent = 'Modifier';
  document.getElementById('edit-input-' + sIdx + '-' + lIdx).value = SECTIONS_DATA[sIdx].lines[lIdx];
  document.getElementById('remark-input-' + sIdx + '-' + lIdx).value = '';

  document.getElementById('edit-zone-' + sIdx + '-' + lIdx).classList.remove('open');
  document.getElementById('btn-edit-' + sIdx + '-' + lIdx).classList.remove('active');

  // Check if section still has modifications
  var hasModsInSection = Object.keys(modifications).some(function(k) { return k.startsWith(sIdx + '-'); });
  if (!hasModsInSection && sectionStates[sIdx] === 'modified') {
    setSectionState(sIdx, 'pending');
  }
  updateUI();
}

function confirmSection(sIdx) {
  // Check if there are modifications in this section
  var hasModsInSection = Object.keys(modifications).some(function(k) { return k.startsWith(sIdx + '-'); });
  if (hasModsInSection) {
    setSectionState(sIdx, 'modified');
  } else {
    setSectionState(sIdx, 'confirmed');
  }
  updateUI();
}

function setSectionState(sIdx, state) {
  sectionStates[sIdx] = state;

  var card = document.getElementById('section-card-' + sIdx);
  var badge = document.getElementById('badge-' + sIdx);
  var dot = document.getElementById('dot-' + sIdx);
  var actions = document.getElementById('section-actions-' + sIdx);

  card.classList.remove('status-confirmed', 'status-modified');
  dot.classList.remove('confirmed', 'modified');

  if (state === 'confirmed') {
    card.classList.add('status-confirmed');
    badge.className = 'section-badge badge-confirmed';
    badge.textContent = 'Confirmé';
    dot.classList.add('confirmed');
    actions.innerHTML = '<span class="section-status-text"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Section confirmée</span> <button class="btn-edit" onclick="resetSection(' + sIdx + ')" style="margin-left:auto">Revenir</button>';
  } else if (state === 'modified') {
    card.classList.add('status-modified');
    badge.className = 'section-badge badge-modified';
    badge.textContent = 'Modifié';
    dot.classList.add('modified');
    actions.innerHTML = '<span class="section-status-text" style="color:var(--or)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--or)" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Modification demandée</span> <button class="btn-edit" onclick="resetSection(' + sIdx + ')" style="margin-left:auto">Revenir</button>';
  } else {
    badge.className = 'section-badge badge-pending';
    badge.textContent = 'En attente';
    actions.innerHTML = '<button class="btn-confirm-section" onclick="confirmSection(' + sIdx + ')" id="btn-confirm-' + sIdx + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg> Confirmer cette section</button>';
  }
}

function resetSection(sIdx) {
  setSectionState(sIdx, 'pending');
  updateUI();
}

function updateUI() {
  var allConfirmed = sectionStates.every(function(s) { return s === 'confirmed'; });
  var allDecided = sectionStates.every(function(s) { return s === 'confirmed' || s === 'modified'; });
  var hasModified = sectionStates.some(function(s) { return s === 'modified'; });
  var modCount = Object.keys(modifications).length;

  // Counter
  var counter = document.getElementById('mods-counter');
  if (modCount > 0) {
    counter.style.display = 'inline-block';
    counter.textContent = modCount + ' modification' + (modCount > 1 ? 's' : '');
  } else {
    counter.style.display = 'none';
  }

  var btnValidate = document.getElementById('btn-validate');
  var btnRequestMods = document.getElementById('btn-request-mods');
  var submitText = document.getElementById('submit-text');

  if (allConfirmed && !hasModified) {
    // All confirmed, no modifications → show validate button
    btnValidate.style.display = 'inline-block';
    btnValidate.disabled = false;
    btnRequestMods.style.display = 'none';
    submitText.textContent = 'Toutes les sections sont confirmées. Vous pouvez valider les paroles.';
  } else if (allDecided && hasModified) {
    // All decided but some modified → show request modifications button
    btnValidate.style.display = 'none';
    btnRequestMods.style.display = 'inline-block';
    submitText.textContent = 'Vous avez demandé des modifications. Envoyez votre demande à notre parolier.';
  } else {
    // Not all sections decided
    btnValidate.style.display = 'none';
    btnRequestMods.style.display = 'none';
    var remaining = sectionStates.filter(function(s) { return s === 'pending'; }).length;
    submitText.textContent = remaining + ' section' + (remaining > 1 ? 's' : '') + ' en attente de relecture.';
  }
}

function escapeHtmlJS(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function validateAll() {
  if (!confirm('Confirmer la validation de toutes les paroles ?')) return;

  var btn = document.getElementById('btn-validate');
  btn.disabled = true;
  btn.textContent = 'Validation en cours...';

  try {
    var res = await fetch('/client/' + TOKEN + '/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate', modifications: [] })
    });
    var data = await res.json();
    if (data.success) {
      document.getElementById('submit-card').style.display = 'none';
      document.querySelectorAll('.section-card').forEach(function(c) { c.style.display = 'none'; });
      document.querySelector('.instructions').style.display = 'none';
      document.getElementById('success-validated').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      alert('Erreur : ' + (data.error || 'inconnue'));
      btn.disabled = false;
      btn.textContent = 'Valider les paroles';
    }
  } catch (e) {
    alert('Erreur de connexion : ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Valider les paroles';
  }
}

async function requestModifications() {
  var modsArray = Object.values(modifications);
  if (modsArray.length === 0) {
    alert('Aucune modification à envoyer.');
    return;
  }

  if (!confirm('Envoyer ' + modsArray.length + ' modification(s) à notre parolier ?')) return;

  var btn = document.getElementById('btn-request-mods');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours...';

  try {
    var res = await fetch('/client/' + TOKEN + '/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'request_modifications', modifications: modsArray })
    });
    var data = await res.json();
    if (data.success) {
      document.getElementById('submit-card').style.display = 'none';
      document.querySelectorAll('.section-card').forEach(function(c) { c.style.display = 'none'; });
      document.querySelector('.instructions').style.display = 'none';
      document.getElementById('success-modifications').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      alert('Erreur : ' + (data.error || 'inconnue'));
      btn.disabled = false;
      btn.textContent = 'Enregistrer ma demande de modification';
    }
  } catch (e) {
    alert('Erreur de connexion : ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Enregistrer ma demande de modification';
  }
}

// Init
updateUI();
</script>
</body></html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = router;
