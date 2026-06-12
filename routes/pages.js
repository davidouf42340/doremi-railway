// ============================================================
// Dorémi — Routes Pages
// Page personnelle client + PDF + Page publique QR
// ============================================================

const express = require('express');
const db      = require('../db');
const { generateLyricsPDF }  = require('../utils/pdf');
const { generateQRDataUrl }  = require('../utils/qrcode');

const router = express.Router();

// ── GET /page/:token — Page personnelle client ──
router.get('/page/:token', async (req, res) => {
  try {
    const order = await db.getOrderByToken('public', req.params.token);
    if (!order) return res.status(404).send(notFoundPage());

    // Page accessible dès que les paroles existent
    if (!order.lyrics_original && !order.lyrics_final) {
      return res.status(404).send(notFoundPage());
    }

    const baseUrl = process.env.RAILWAY_PUBLIC_URL || `https://${req.get('host')}`;
    const shareUrl = `${baseUrl}/share/${order.public_token}`;
    const qrDataUrl = await generateQRDataUrl(shareUrl);

    res.send(personalPage(order, qrDataUrl, shareUrl, true));
  } catch (e) {
    console.error('[Pages] Erreur page perso:', e);
    res.status(500).send('Erreur serveur');
  }
});

// ── GET /page/:token/pdf — Télécharger PDF des paroles ──
router.get('/page/:token/pdf', async (req, res) => {
  try {
    const order = await db.getOrderByToken('public', req.params.token);
    if (!order) return res.status(404).send('Non trouvé');

    const baseUrl = process.env.RAILWAY_PUBLIC_URL || `https://${req.get('host')}`;
    const shareUrl = `${baseUrl}/share/${order.public_token}`;

    const pdfBuffer = await generateLyricsPDF(order, shareUrl);

    const filename = `doremi-${(order.recipient_name || 'chanson').toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error('[Pages] Erreur PDF:', e);
    res.status(500).send('Erreur génération PDF');
  }
});

// ── GET /share/:token — Page publique (via QR code) ──
router.get('/share/:token', async (req, res) => {
  try {
    const order = await db.getOrderByToken('public', req.params.token);
    if (!order) return res.status(404).send(notFoundPage());

    if (!order.lyrics_original && !order.lyrics_final) {
      return res.status(404).send(notFoundPage());
    }

    res.send(personalPage(order, null, null, false));
  } catch (e) {
    console.error('[Pages] Erreur page publique:', e);
    res.status(500).send('Erreur serveur');
  }
});

// ============================================================
// PAGES HTML
// ============================================================

const STYLES = `
<style>
  :root { --charbon:#2C2C2A; --or:#EF9F27; --or-pale:#FAEEDA; --gris:#888780; --gris-light:#D3D1C7; --blanc:#fff; --radius:12px; --serif:'Cormorant Garamond',Georgia,serif; --sans:'DM Sans',system-ui,sans-serif; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:var(--sans); background:#fafaf8; color:var(--charbon); line-height:1.6; font-weight:300; }

  .header { background:var(--charbon); padding:20px 24px; text-align:center; }
  .header-logo { font-family:var(--serif); font-size:24px; color:var(--blanc); }
  .logo-dots { display:inline-flex; gap:4px; align-items:flex-end; margin-right:8px; }
  .dot { border-radius:50%; background:var(--or); display:inline-block; }
  .d1 { width:6px; height:6px; }
  .d2 { width:9px; height:9px; }
  .d3 { width:6px; height:6px; }

  .container { max-width:700px; margin:0 auto; padding:32px 20px 80px; }

  .hero { text-align:center; padding:40px 20px 32px; }
  .hero-for { font-size:12px; text-transform:uppercase; letter-spacing:2px; color:var(--gris); margin-bottom:8px; }
  .hero-name { font-family:var(--serif); font-size:36px; font-weight:400; color:var(--charbon); margin-bottom:4px; }
  .hero-occasion { font-size:14px; color:var(--gris); }

  .tabs { display:flex; border-bottom:2px solid var(--gris-light); margin-bottom:24px; }
  .tab { flex:1; text-align:center; padding:12px; font-size:13px; font-weight:500; color:var(--gris); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; transition:all .15s; }
  .tab:hover { color:var(--charbon); }
  .tab.active { color:var(--charbon); border-bottom-color:var(--or); }

  .tab-content { display:none; }
  .tab-content.active { display:block; }

  /* Paroles */
  .lyrics-card { background:var(--blanc); border-radius:var(--radius); padding:40px 32px; box-shadow:0 1px 3px rgba(0,0,0,.04); margin-bottom:20px; }
  .lyrics-text { font-family:var(--serif); font-size:18px; line-height:2.2; color:var(--charbon); text-align:center; white-space:pre-line; }
  .lyrics-divider { width:60px; height:2px; background:var(--or); margin:24px auto; border-radius:1px; }

  .actions-row { display:flex; gap:10px; justify-content:center; margin-bottom:32px; flex-wrap:wrap; }
  .btn { display:inline-flex; align-items:center; gap:8px; padding:12px 24px; border-radius:8px; border:none; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--sans); transition:all .15s; text-decoration:none; }
  .btn-primary { background:var(--charbon); color:var(--blanc); }
  .btn-primary:hover { background:#444; }
  .btn-outline { background:none; border:1px solid var(--gris-light); color:var(--charbon); }
  .btn-outline:hover { border-color:var(--charbon); }

  /* QR Code */
  .qr-card { background:var(--blanc); border-radius:var(--radius); padding:32px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.04); margin-bottom:20px; }
  .qr-title { font-size:14px; font-weight:500; margin-bottom:4px; }
  .qr-sub { font-size:12px; color:var(--gris); margin-bottom:16px; line-height:1.6; }
  .qr-img { border:1px solid var(--gris-light); border-radius:8px; padding:12px; display:inline-block; }
  .qr-url { font-size:11px; color:var(--gris-light); margin-top:12px; word-break:break-all; }

  /* Chansons */
  .songs-card { background:var(--blanc); border-radius:var(--radius); overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.04); margin-bottom:20px; }
  .song-item { padding:20px 24px; border-bottom:1px solid #f5f5f3; }
  .song-item:last-child { border:none; }
  .song-name { font-size:14px; font-weight:500; margin-bottom:8px; }
  .song-player { width:100%; margin-bottom:10px; }
  .song-download { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--or); text-decoration:none; font-weight:500; }
  .song-download:hover { text-decoration:underline; }

  .no-songs { padding:40px 24px; text-align:center; color:var(--gris); font-size:13px; }

  /* Lecteur public (pas de download) */
  .player-only audio { width:100%; }

  .footer { text-align:center; padding:32px 20px; font-size:11px; color:var(--gris-light); }
  .footer a { color:var(--or); text-decoration:none; }

  @media (max-width:640px) {
    .hero-name { font-size:28px; }
    .lyrics-card { padding:24px 20px; }
    .lyrics-text { font-size:16px; line-height:2; }
    .container { padding:20px 16px 60px; }
  }
</style>
`;

function headerHtml() {
  return `<div class="header">
    <span class="logo-dots"><span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span></span>
    <span class="header-logo">DoReMi Souvenir</span>
  </div>`;
}

function notFoundPage() {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doremi — Page non trouvee</title>${STYLES}</head>
<body>${headerHtml()}
<div class="container" style="text-align:center;padding-top:80px">
  <div style="font-size:48px;margin-bottom:12px">&#128269;</div>
  <h2 style="font-size:22px;margin-bottom:8px">Page non trouvee</h2>
  <p style="color:var(--gris);font-size:14px">Ce lien n'est pas valide ou a expire.</p>
</div></body></html>`;
}

// ── Page personnelle / publique ──
// isOwner = true → page perso (download + QR), false → page publique (lecteur only)
function personalPage(order, qrDataUrl, shareUrl, isOwner) {
  const lyrics = order.lyrics_final || order.lyrics_admin_edited || order.lyrics_original || '';
  const recipientName = order.recipient_name || '';
  const occasion = order.occasion || '';
  const hasSongs = order.song_file_1_url || order.song_file_2_url;
  const pageTitle = isOwner
    ? `Doremi — Chanson pour ${recipientName}`
    : `Chanson pour ${recipientName} — DoReMi`;

  // Paroles formatées
  const lyricsHtml = lyrics.split('\n').map(line =>
    line.trim() === '' ? '<div class="lyrics-divider"></div>' : line
  ).join('\n');

  // Section chansons
  let songsHtml = '';
  if (hasSongs) {
    const songs = [];
    if (order.song_file_1_url) songs.push({ name: order.song_file_1_name || 'Version 1', url: order.song_file_1_url });
    if (order.song_file_2_url) songs.push({ name: order.song_file_2_name || 'Version 2', url: order.song_file_2_url });

    songsHtml = `<div class="songs-card">
      ${songs.map(s => `
        <div class="song-item">
          <div class="song-name">${s.name}</div>
          <audio controls class="song-player" preload="metadata">
            <source src="${s.url}" type="audio/mpeg">
            Votre navigateur ne supporte pas le lecteur audio.
          </audio>
          ${isOwner ? `<a href="${s.url}" download class="song-download">&#11015; Telecharger</a>` : ''}
        </div>
      `).join('')}
    </div>`;
  } else {
    songsHtml = '<div class="songs-card"><div class="no-songs">Les chansons seront disponibles ici une fois la mise en musique terminee.</div></div>';
  }

  // Section QR (uniquement pour le propriétaire)
  let qrHtml = '';
  if (isOwner && qrDataUrl && shareUrl) {
    qrHtml = `
    <div class="qr-card">
      <div class="qr-title">Partagez cette chanson</div>
      <div class="qr-sub">Scannez ce QR code pour acceder aux paroles et ecouter la chanson.<br>Parfait pour partager avec la famille ou les proches.</div>
      <div class="qr-img"><img src="${qrDataUrl}" alt="QR Code" width="200" height="200"></div>
      <div class="qr-url">${shareUrl}</div>
    </div>`;
  }

  // Boutons d'action
  let actionsHtml = '';
  if (isOwner) {
    actionsHtml = `
    <div class="actions-row">
      <a href="/page/${order.public_token}/pdf" class="btn btn-primary">&#128196; Telecharger le PDF</a>
      <button class="btn btn-outline" onclick="window.print()">&#128424; Imprimer</button>
    </div>`;
  }

  // Onglets : uniquement si le propriétaire a accès aux chansons
  const showTabs = isOwner || hasSongs;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pageTitle}</title>${STYLES}
<style>@media print { .header,.tabs,.actions-row,.qr-card,.songs-card,.footer,.no-print { display:none!important; } .lyrics-card { box-shadow:none; border:none; } body { background:#fff; } }</style>
</head>
<body>
${headerHtml()}

<div class="container">
  <div class="hero">
    <div class="hero-for">${isOwner ? 'Votre chanson pour' : 'Une chanson pour'}</div>
    <div class="hero-name">${recipientName || 'vous'}</div>
    ${occasion ? `<div class="hero-occasion">${occasion}</div>` : ''}
  </div>

  ${showTabs ? `
  <div class="tabs no-print">
    <div class="tab active" onclick="switchTab('paroles')">&#127925; Paroles</div>
    <div class="tab" onclick="switchTab('chansons')">&#127911; Mes chansons</div>
  </div>` : ''}

  <div class="tab-content active" id="tab-paroles">
    <div class="lyrics-card">
      <div class="lyrics-text">${lyricsHtml}</div>
    </div>
    ${actionsHtml}
    ${qrHtml}
  </div>

  ${showTabs ? `
  <div class="tab-content" id="tab-chansons">
    ${songsHtml}
  </div>` : ''}
</div>

<div class="footer no-print">
  Cree avec amour par <a href="https://doremisouvenir.fr">DoReMi Souvenir</a>
</div>

<script>
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  // Activer le bon onglet
  const tabs = document.querySelectorAll('.tab');
  if (tab === 'paroles') tabs[0].classList.add('active');
  else tabs[1].classList.add('active');
}
</script>
</body></html>`;
}

module.exports = router;
