// ============================================================
// Dorémi — Routes Client
// Page de validation des paroles ligne par ligne
// ============================================================

const express = require('express');
const db      = require('../db');
const shopify = require('../utils/shopify-tags');

const router = express.Router();

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
    // modifications = [{ line: 0, original: "...", modified: "..." }, ...]
    // action = "validate" | "request_changes"

    if (action === 'validate') {
      // Client valide les paroles (avec ou sans modifications)
      const hasModifications = modifications && modifications.length > 0;

      // Construire les paroles finales
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

      // Ajouter tag Shopify pour notifier l'admin
      try {
        await shopify.addOrderTag(order.shopify_order_id, 'doremi-client-valide');
      } catch (e) {
        console.warn('[Client] Erreur tag Shopify:', e.message);
      }

      // Sauvegarder les modifs en metafield Shopify
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
// PAGES HTML — Client
// ============================================================

const STYLES = `
<style>
  :root { --charbon:#2C2C2A; --or:#EF9F27; --or-pale:#FAEEDA; --gris:#888780; --gris-light:#D3D1C7; --blanc:#fff; --radius:12px; --serif:'Cormorant Garamond',Georgia,serif; --sans:'DM Sans',system-ui,sans-serif; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html { scroll-behavior:smooth; }
  body { font-family:var(--sans); background:#fafaf8; color:var(--charbon); line-height:1.6; font-weight:300; }

  .header { background:var(--blanc); border-bottom:1px solid var(--gris-light); padding:16px 24px; display:flex; align-items:center; justify-content:center; gap:10px; }
  .header-logo { font-family:var(--serif); font-size:22px; color:var(--charbon); }
  .logo-dots { display:flex; gap:4px; align-items:flex-end; }
  .dot { border-radius:50%; background:var(--or); }
  .d1 { width:6px; height:6px; }
  .d2 { width:9px; height:9px; }
  .d3 { width:6px; height:6px; }

  .container { max-width:800px; margin:0 auto; padding:32px 20px 80px; }

  .intro-card { background:var(--blanc); border-radius:var(--radius); padding:32px; text-align:center; margin-bottom:24px; box-shadow:0 1px 3px rgba(0,0,0,.04); }
  .intro-title { font-family:var(--serif); font-size:26px; font-weight:400; margin-bottom:8px; }
  .intro-sub { font-size:14px; color:var(--gris); line-height:1.7; }

  .instructions { background:var(--or-pale); border-left:3px solid var(--or); border-radius:0 8px 8px 0; padding:14px 18px; margin-bottom:24px; font-size:13px; line-height:1.7; }
  .instructions strong { font-weight:500; }

  .lyrics-card { background:var(--blanc); border-radius:var(--radius); overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.04); margin-bottom:24px; }
  .lyrics-header { background:var(--charbon); color:var(--blanc); padding:14px 20px; font-size:12px; font-weight:500; text-transform:uppercase; letter-spacing:1px; }

  .line-row { display:flex; align-items:flex-start; border-bottom:1px solid #f5f5f3; transition:background .15s; }
  .line-row:hover { background:#fdfcfa; }
  .line-row:last-child { border:none; }
  .line-row.empty-line { min-height:24px; }
  .line-row.modified { background:#fef8ee; }

  .line-num { width:40px; flex-shrink:0; padding:12px 0; text-align:center; font-size:10px; color:var(--gris-light); font-weight:500; }
  .line-content { flex:1; padding:12px 16px; font-family:var(--serif); font-size:17px; line-height:1.8; min-height:48px; display:flex; align-items:center; }
  .line-content.original-struck { text-decoration:line-through; color:var(--gris); font-size:15px; }

  .line-actions { width:120px; flex-shrink:0; padding:8px 12px; display:flex; align-items:center; justify-content:center; gap:6px; }

  .btn-edit { padding:6px 14px; border-radius:6px; border:1px solid var(--gris-light); background:var(--blanc); font-size:11px; cursor:pointer; font-family:var(--sans); color:var(--gris); transition:all .15s; }
  .btn-edit:hover { border-color:var(--or); color:var(--charbon); }
  .btn-edit.active { background:var(--or-pale); border-color:var(--or); color:var(--charbon); }

  .btn-undo { padding:6px 10px; border-radius:6px; border:1px solid var(--gris-light); background:var(--blanc); font-size:11px; cursor:pointer; color:var(--gris); display:none; transition:all .15s; }
  .btn-undo:hover { border-color:#e24b4a; color:#e24b4a; }

  .edit-zone { display:none; padding:0 16px 12px 56px; }
  .edit-zone.open { display:block; }
  .edit-input { width:100%; border:1px solid var(--or); border-radius:8px; padding:10px 14px; font-family:var(--serif); font-size:16px; line-height:1.6; outline:none; resize:none; }
  .edit-input:focus { box-shadow:0 0 0 3px rgba(239,159,39,.15); }
  .edit-actions { display:flex; gap:8px; margin-top:8px; }
  .btn-save-line { padding:6px 16px; border-radius:6px; background:var(--or); color:var(--charbon); border:none; font-size:12px; font-weight:500; cursor:pointer; font-family:var(--sans); }
  .btn-save-line:hover { background:#d4890f; }
  .btn-cancel-line { padding:6px 16px; border-radius:6px; background:none; color:var(--gris); border:1px solid var(--gris-light); font-size:12px; cursor:pointer; font-family:var(--sans); }

  .modified-text { font-family:var(--serif); font-size:17px; line-height:1.8; color:var(--or); font-weight:500; }

  .submit-card { background:var(--blanc); border-radius:var(--radius); padding:32px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.04); }
  .submit-card p { font-size:13px; color:var(--gris); margin-bottom:20px; line-height:1.7; }
  .btn-validate { padding:16px 48px; border-radius:8px; background:var(--charbon); color:var(--blanc); border:none; font-size:16px; font-weight:500; cursor:pointer; font-family:var(--sans); transition:all .15s; }
  .btn-validate:hover { background:#444; transform:translateY(-1px); }
  .btn-validate:disabled { opacity:.5; cursor:not-allowed; transform:none; }

  .mods-counter { display:inline-block; background:var(--or-pale); color:var(--charbon); padding:4px 12px; border-radius:12px; font-size:12px; font-weight:500; margin-bottom:16px; }

  .success-card { background:var(--blanc); border-radius:var(--radius); padding:48px 32px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.04); }
  .success-icon { font-size:48px; margin-bottom:12px; }
  .success-title { font-family:var(--serif); font-size:24px; margin-bottom:8px; }
  .success-text { font-size:14px; color:var(--gris); line-height:1.7; max-width:480px; margin:0 auto; }

  @media (max-width:640px) {
    .line-row { flex-wrap:wrap; }
    .line-actions { width:100%; justify-content:flex-end; padding:0 12px 8px; }
    .line-num { width:32px; }
    .edit-zone { padding:0 12px 12px 12px; }
    .container { padding:20px 16px 60px; }
  }
</style>
`;

function headerHtml() {
  return `<div class="header">
    <div class="logo-dots"><div class="dot d1"></div><div class="dot d2"></div><div class="dot d3"></div></div>
    <span class="header-logo">DoReMi Souvenir</span>
  </div>`;
}

// ── Page 404 ──
function notFoundPage() {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doremi — Page non trouvee</title>${STYLES}</head>
<body>${headerHtml()}
<div class="container">
  <div class="success-card">
    <div class="success-icon">&#128269;</div>
    <div class="success-title">Page non trouvee</div>
    <div class="success-text">Ce lien n'est pas valide ou a expire. Verifiez le lien recu par email.</div>
  </div>
</div></body></html>`;
}

// ── Page pas encore prête ──
function notReadyPage(order) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doremi — En cours</title>${STYLES}</head>
<body>${headerHtml()}
<div class="container">
  <div class="success-card">
    <div class="success-icon">&#9997;&#65039;</div>
    <div class="success-title">Votre chanson est en cours de creation</div>
    <div class="success-text">Notre parolier travaille sur votre chanson${order.recipient_name ? ' pour ' + order.recipient_name : ''}. Vous recevrez un email des que les paroles seront pretes a valider.</div>
  </div>
</div></body></html>`;
}

// ── Page de validation des paroles ──
function validationPage(order, lyrics, alreadyValidated) {
  const lines = lyrics.split('\n');
  const recipientName = order.recipient_name || 'votre proche';

  if (alreadyValidated) {
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doremi — Paroles validees</title>${STYLES}</head>
<body>${headerHtml()}
<div class="container">
  <div class="success-card">
    <div class="success-icon">&#10003;</div>
    <div class="success-title">Paroles deja validees</div>
    <div class="success-text">Vous avez deja valide les paroles de la chanson pour ${recipientName}. Notre equipe travaille maintenant sur la mise en musique. Vous recevrez un email des que les chansons seront pretes.</div>
  </div>
</div></body></html>`;
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

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doremi — Validez les paroles</title>${STYLES}</head>
<body>${headerHtml()}
<div class="container">

  <div class="intro-card">
    <div class="intro-title">Les paroles de la chanson pour ${recipientName}</div>
    <div class="intro-sub">Commande ${order.shopify_order_number || ''}</div>
  </div>

  <div class="instructions">
    <strong>Comment ca marche :</strong> Lisez les paroles ci-dessous. Pour chaque ligne, vous pouvez cliquer sur <strong>Modifier</strong> pour proposer un changement. Une fois satisfait(e), cliquez sur <strong>Valider les paroles</strong> en bas de page.
  </div>

  <div class="lyrics-card">
    <div class="lyrics-header">Paroles</div>
    ${linesHtml}
  </div>

  <div class="submit-card" id="submit-card">
    <div class="mods-counter" id="mods-counter" style="display:none">0 modification(s)</div>
    <p>En cliquant sur "Valider", vous confirmez que les paroles vous conviennent. Notre equipe passera ensuite a la mise en musique.</p>
    <button class="btn-validate" onclick="validateAll()" id="btn-validate">Valider les paroles</button>
  </div>

  <!-- Ecran de succès (caché) -->
  <div class="success-card" id="success-card" style="display:none">
    <div class="success-icon">&#127926;</div>
    <div class="success-title">Paroles validees, merci !</div>
    <div class="success-text">
      Notre equipe va maintenant creer les 2 versions musicales de votre chanson.
      Vous recevrez un email des qu'elles seront pretes.
    </div>
  </div>

</div>

<script>
const TOKEN = '${order.client_token}';
const originalLines = ${JSON.stringify(lines)};
const modifications = {}; // { lineIndex: { original, modified } }

function toggleEdit(i) {
  const zone = document.getElementById('edit-zone-' + i);
  const isOpen = zone.classList.contains('open');
  // Fermer toutes les autres
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
  // Restaurer la valeur originale ou modifiée
  const input = document.getElementById('edit-input-' + i);
  input.value = modifications[i] ? modifications[i].modified : originalLines[i];
}

function saveLine(i) {
  const input = document.getElementById('edit-input-' + i);
  const newValue = input.value.trim();
  const original = originalLines[i];

  if (newValue === original) {
    // Pas de changement, annuler la modification
    undoLine(i);
    return;
  }

  modifications[i] = { line: i, original: original, modified: newValue };

  // Mettre à jour l'affichage
  const row = document.getElementById('row-' + i);
  const content = document.getElementById('content-' + i);
  row.classList.add('modified');
  content.innerHTML = '<span class="original-struck" style="text-decoration:line-through;color:var(--gris);font-size:14px;display:block">' + original + '</span><span class="modified-text">' + newValue + '</span>';

  // Afficher le bouton annuler
  document.getElementById('btn-undo-' + i).style.display = 'inline-block';
  document.getElementById('btn-edit-' + i).textContent = 'Re-modifier';

  // Fermer l'éditeur
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

  // Fermer l'éditeur
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
