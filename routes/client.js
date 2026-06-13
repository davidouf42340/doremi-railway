// ============================================================
// Dorémi — Routes Client
// Page de validation des paroles ligne par ligne
// ============================================================

const express = require('express');
const db      = require('../db');
const shopify = require('../utils/shopify-tags');

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

// ── POST /client/:token/validate — Soumettre les modifications ──
router.post('/:token/validate', express.json(), async (req, res) => {
  try {
    const order = await db.getOrderByToken('client', req.params.token);
    if (!order) return res.status(404).json({ error: 'Commande non trouvée' });

    const { modifications, action } = req.body;

    if (action === 'validate') {
      const hasModifications = modifications && modifications.length > 0;

      const lyricsSource = order.lyrics_admin_edited || order.lyrics_original || '';
      const lines = lyricsSource.split('\n');

      if (hasModifications) {
        modifications.forEach(m => {
          if (m.line >= 0 && m.line < lines.length && m.modified) {
            lines[m.line] = m.modified;
          }
        });
      }

      await db.updateOrder(order.id, {
        status: 'client_validated',
        lyrics_client_modifications: hasModifications ? modifications : null,
        lyrics_final: lines.join('\n'),
      });

      try {
        await shopify.addOrderTag(order.shopify_order_id, 'doremi-client-valide');
      } catch (e) {
        console.warn('[Client] Erreur tag Shopify:', e.message);
      }

      if (hasModifications) {
        try {
          await shopify.setOrderMetafield(
            order.shopify_order_id,
            'doremi',
            'client_modifications',
            JSON.stringify(modifications)
          );
        } catch (e) {
          console.warn('[Client] Erreur metafield modifications:', e.message);
        }
      }

      res.json({ success: true, action: 'validated' });
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

  /* Paroles card */
  .lyrics-card { background: var(--blanc); border-radius: var(--radius); overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.04); margin-bottom: 24px; }
  .lyrics-header { background: var(--charbon); color: var(--blanc); padding: 14px 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; display: flex; align-items: center; gap: 10px; }
  .lyrics-header svg { opacity: 0.5; }

  /* Lignes */
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
  .edit-actions { display: flex; gap: 8px; margin-top: 8px; }
  .btn-save-line { padding: 7px 18px; border-radius: 6px; background: var(--or); color: var(--charbon); border: none; font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--sans); transition: all .15s; }
  .btn-save-line:hover { background: var(--or-hover); }
  .btn-cancel-line { padding: 7px 18px; border-radius: 6px; background: none; color: var(--gris); border: 1.5px solid var(--gris-light); font-size: 12px; cursor: pointer; font-family: var(--sans); }

  .modified-text { font-family: var(--serif); font-size: 17px; line-height: 1.8; color: var(--or); font-weight: 600; }

  /* Submit */
  .submit-card { background: var(--blanc); border-radius: var(--radius); padding: 36px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
  .submit-card p { font-size: 13px; color: var(--gris); margin-bottom: 20px; line-height: 1.7; }
  .btn-validate { padding: 16px 48px; border-radius: 8px; background: var(--or); color: var(--charbon); border: none; font-size: 15px; font-weight: 600; cursor: pointer; font-family: var(--sans); transition: all .2s; letter-spacing: 0.3px; }
  .btn-validate:hover { background: var(--or-hover); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(252,176,46,.3); }
  .btn-validate:disabled { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }

  .mods-counter { display: inline-block; background: var(--or-pale); color: var(--charbon); padding: 5px 14px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }

  /* Success */
  .success-card { background: var(--blanc); border-radius: var(--radius); padding: 56px 36px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
  .success-picto { width: 56px; height: 56px; margin-bottom: 16px; }
  .success-icon { font-size: 48px; margin-bottom: 16px; }
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

// ── Page de validation des paroles ──
function validationPage(order, lyrics, alreadyValidated) {
  const lines = lyrics.split('\n');
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

  const linesHtml = lines.map((line, i) => {
    const isEmpty = line.trim() === '';
    return `
    <div class="line-row ${isEmpty ? 'empty-line' : ''}" id="row-${i}" data-line="${i}">
      <div class="line-num">${i + 1}</div>
      <div class="line-content" id="content-${i}">${line || '&nbsp;'}</div>
      ${!isEmpty ? `
      <div class="line-actions">
        <button class="btn-edit" onclick="toggleEdit(${i})" id="btn-edit-${i}">Modifier</button>
        <button class="btn-undo" onclick="undoLine(${i})" id="btn-undo-${i}">Annuler</button>
      </div>` : '<div class="line-actions"></div>'}
    </div>
    <div class="edit-zone" id="edit-zone-${i}">
      <textarea class="edit-input" id="edit-input-${i}" rows="2">${line}</textarea>
      <div class="edit-actions">
        <button class="btn-save-line" onclick="saveLine(${i})">Valider cette ligne</button>
        <button class="btn-cancel-line" onclick="cancelEdit(${i})">Annuler</button>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoRémi Souvenir — Validez les paroles</title>
<link rel="icon" type="image/png" href="${LOGO_URL}">
${STYLES}</head>
<body>${headerHtml()}
<div class="container">

  <div class="intro-card">
    <img src="${PICTO_COEUR}" alt="" class="intro-picto">
    <div class="intro-title">Les paroles de la chanson pour ${recipientName}</div>
    <div class="intro-sub">Commande ${order.shopify_order_number || ''}</div>
  </div>

  <div class="instructions">
    <strong>Comment ça marche :</strong> Lisez les paroles ci-dessous. Pour chaque ligne, vous pouvez cliquer sur <strong>Modifier</strong> pour proposer un changement. Une fois satisfait(e), cliquez sur <strong>Valider les paroles</strong> en bas de page.
  </div>

  <div class="lyrics-card">
    <div class="lyrics-header">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      Paroles
    </div>
    ${linesHtml}
  </div>

  <div class="submit-card" id="submit-card">
    <div class="mods-counter" id="mods-counter" style="display:none">0 modification(s)</div>
    <p>En cliquant sur "Valider", vous confirmez que les paroles vous conviennent.<br>Notre équipe passera ensuite à la mise en musique.</p>
    <button class="btn-validate" onclick="validateAll()" id="btn-validate">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:6px"><polyline points="20 6 9 17 4 12"/></svg>
      Valider les paroles
    </button>
  </div>

  <!-- Écran de succès (caché) -->
  <div class="success-card" id="success-card" style="display:none">
    <img src="${PICTO_COEUR}" alt="" class="success-picto">
    <div class="success-title">Paroles validées, merci !</div>
    <div class="success-text">
      Notre équipe va maintenant créer les 2 versions musicales de votre chanson.
      Vous recevrez un email dès qu'elles seront prêtes.
    </div>
  </div>

</div>

${footerHtml()}

<script>
const TOKEN = '${order.client_token}';
const originalLines = ${JSON.stringify(lines)};
const modifications = {};

function toggleEdit(i) {
  const zone = document.getElementById('edit-zone-' + i);
  const isOpen = zone.classList.contains('open');
  document.querySelectorAll('.edit-zone.open').forEach(z => z.classList.remove('open'));
  document.querySelectorAll('.btn-edit.active').forEach(b => b.classList.remove('active'));
  if (!isOpen) {
    zone.classList.add('open');
    document.getElementById('btn-edit-' + i).classList.add('active');
    const input = document.getElementById('edit-input-' + i);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function cancelEdit(i) {
  document.getElementById('edit-zone-' + i).classList.remove('open');
  document.getElementById('btn-edit-' + i).classList.remove('active');
  const input = document.getElementById('edit-input-' + i);
  input.value = modifications[i] ? modifications[i].modified : originalLines[i];
}

function saveLine(i) {
  const input = document.getElementById('edit-input-' + i);
  const newValue = input.value.trim();
  const original = originalLines[i];

  if (newValue === original) {
    undoLine(i);
    return;
  }

  modifications[i] = { line: i, original: original, modified: newValue };

  const row = document.getElementById('row-' + i);
  const content = document.getElementById('content-' + i);
  row.classList.add('modified');
  content.innerHTML = '<span style="text-decoration:line-through;color:var(--gris);font-size:14px;display:block">' + original + '</span><span class="modified-text">' + newValue + '</span>';

  document.getElementById('btn-undo-' + i).style.display = 'inline-block';
  document.getElementById('btn-edit-' + i).textContent = 'Re-modifier';

  document.getElementById('edit-zone-' + i).classList.remove('open');
  document.getElementById('btn-edit-' + i).classList.remove('active');

  updateCounter();
}

function undoLine(i) {
  delete modifications[i];

  const row = document.getElementById('row-' + i);
  const content = document.getElementById('content-' + i);
  row.classList.remove('modified');
  content.textContent = originalLines[i] || '\\u00a0';

  document.getElementById('btn-undo-' + i).style.display = 'none';
  document.getElementById('btn-edit-' + i).textContent = 'Modifier';
  document.getElementById('edit-input-' + i).value = originalLines[i];

  document.getElementById('edit-zone-' + i).classList.remove('open');
  document.getElementById('btn-edit-' + i).classList.remove('active');

  updateCounter();
}

function updateCounter() {
  const count = Object.keys(modifications).length;
  const counter = document.getElementById('mods-counter');
  if (count > 0) {
    counter.style.display = 'inline-block';
    counter.textContent = count + ' modification' + (count > 1 ? 's' : '');
  } else {
    counter.style.display = 'none';
  }
}

async function validateAll() {
  const btn = document.getElementById('btn-validate');
  const modsArray = Object.values(modifications);

  const confirmMsg = modsArray.length > 0
    ? 'Vous avez ' + modsArray.length + ' modification(s). Valider les paroles avec ces changements ?'
    : 'Valider les paroles telles quelles ?';

  if (!confirm(confirmMsg)) return;

  btn.disabled = true;
  btn.textContent = 'Validation en cours...';

  try {
    const res = await fetch('/client/' + TOKEN + '/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modifications: modsArray, action: 'validate' })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('submit-card').style.display = 'none';
      document.querySelector('.lyrics-card').style.display = 'none';
      document.querySelector('.instructions').style.display = 'none';
      document.getElementById('success-card').style.display = 'block';
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
</script>
</body></html>`;
}

module.exports = router;
