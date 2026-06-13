// ============================================================
// Dorémi — Routes Pages
// Page personnelle client + PDF + Page publique QR
// ============================================================

const express = require('express');
const db      = require('../db');
const { generateLyricsPDF }  = require('../utils/pdf');
const { generateQRDataUrl }  = require('../utils/qrcode');

const router = express.Router();

// ── CDN Assets ──
const LOGO_URL = 'https://doremisouvenir.fr/cdn/shop/files/logo-doremi-chanson-personnalisee.png';
const PICTO_MICRO = 'https://doremisouvenir.fr/cdn/shop/files/icone-micro-doremi-souvenirs-fond-transparent_80x80_crop_center.png';
const PICTO_COEUR = 'https://doremisouvenir.fr/cdn/shop/files/icone-coeur-doremi-souvenirs-fond-transparent_80x80_crop_center.png';
const PICTO_CADEAU = 'https://doremisouvenir.fr/cdn/shop/files/icone-cadeau-doremi-souvenirs-fond-transparent_80x80_crop_center.png';

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
  body { font-family: var(--sans); background: var(--gris-bg); color: var(--charbon); line-height: 1.6; font-weight: 400; -webkit-font-smoothing: antialiased; }

  /* Header */
  .header { background: var(--blanc); padding: 16px 24px; text-align: center; border-bottom: 1px solid #EEEEE9; }
  .header a { text-decoration: none; display: inline-flex; align-items: center; }
  .header-logo { height: 48px; width: auto; }

  /* Container */
  .container { max-width: 720px; margin: 0 auto; padding: 32px 20px 80px; }

  /* Hero */
  .hero { text-align: center; padding: 48px 20px 36px; }
  .hero-picto { width: 48px; height: 48px; margin-bottom: 16px; }
  .hero-for { font-family: var(--sans); font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: var(--gris); margin-bottom: 8px; font-weight: 500; }
  .hero-name { font-family: var(--serif); font-size: 42px; font-weight: 400; color: var(--charbon); margin-bottom: 6px; line-height: 1.2; }
  .hero-occasion { font-size: 14px; color: var(--or); font-weight: 500; letter-spacing: 0.5px; }
  .hero-divider { width: 60px; height: 2px; background: var(--or); margin: 20px auto 0; border-radius: 1px; }

  /* Tabs */
  .tabs { display: flex; background: var(--blanc); border-radius: var(--radius); box-shadow: 0 1px 3px rgba(0,0,0,.04); margin-bottom: 24px; overflow: hidden; }
  .tab { flex: 1; text-align: center; padding: 14px 12px; font-size: 13px; font-weight: 500; color: var(--gris); cursor: pointer; transition: all .2s; border-bottom: 2px solid transparent; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .tab:hover { color: var(--charbon); background: var(--or-pale); }
  .tab.active { color: var(--charbon); border-bottom-color: var(--or); background: var(--or-pale); }
  .tab-icon { width: 20px; height: 20px; }

  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* Paroles */
  .lyrics-card { background: var(--blanc); border-radius: var(--radius); padding: 48px 40px; box-shadow: 0 2px 8px rgba(0,0,0,.04); margin-bottom: 24px; position: relative; }
  .lyrics-card::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 60px; height: 3px; background: var(--or); border-radius: 0 0 3px 3px; }
  .lyrics-text { font-family: var(--serif); font-size: 19px; line-height: 2.2; color: var(--charbon); text-align: center; white-space: pre-line; }
  .lyrics-divider { width: 40px; height: 1px; background: var(--or); margin: 28px auto; opacity: 0.5; }

  /* Boutons */
  .actions-row { display: flex; gap: 12px; justify-content: center; margin-bottom: 32px; flex-wrap: wrap; }
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 13px 28px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--sans); transition: all .2s; text-decoration: none; letter-spacing: 0.3px; }
  .btn-primary { background: var(--or); color: var(--charbon); }
  .btn-primary:hover { background: var(--or-hover); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(252,176,46,.3); }
  .btn-outline { background: var(--blanc); border: 1.5px solid var(--gris-light); color: var(--charbon); }
  .btn-outline:hover { border-color: var(--charbon); }

  /* QR Code */
  .qr-card { background: var(--blanc); border-radius: var(--radius); padding: 36px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.04); margin-bottom: 24px; }
  .qr-title { font-family: var(--serif); font-size: 22px; font-weight: 400; margin-bottom: 6px; color: var(--charbon); }
  .qr-sub { font-size: 13px; color: var(--gris); margin-bottom: 20px; line-height: 1.7; }
  .qr-img { border: 1px solid #EEEEE9; border-radius: 12px; padding: 16px; display: inline-block; background: var(--blanc); }
  .qr-url { font-size: 11px; color: var(--gris-light); margin-top: 16px; word-break: break-all; }

  /* Chansons */
  .songs-card { background: var(--blanc); border-radius: var(--radius); overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.04); margin-bottom: 24px; }
  .song-item { padding: 24px; border-bottom: 1px solid #F5F5F3; }
  .song-item:last-child { border: none; }
  .song-name { font-size: 14px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .song-name::before { content: ''; display: inline-block; width: 8px; height: 8px; background: var(--or); border-radius: 50%; }
  .song-player { width: 100%; margin-bottom: 12px; border-radius: 8px; }
  .song-download { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--or); text-decoration: none; font-weight: 600; transition: color .15s; }
  .song-download:hover { color: #E09A20; }

  .no-songs { padding: 48px 24px; text-align: center; }
  .no-songs-icon { width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4; }
  .no-songs-text { color: var(--gris); font-size: 13px; line-height: 1.7; }

  /* Footer */
  .footer { text-align: center; padding: 40px 20px; font-size: 12px; color: var(--gris); }
  .footer a { color: var(--or); text-decoration: none; font-weight: 500; }
  .footer a:hover { text-decoration: underline; }
  .footer-logo { height: 32px; margin-bottom: 12px; opacity: 0.6; }
  .footer-links { margin-top: 8px; }
  .footer-links a { margin: 0 12px; color: var(--gris-light); font-size: 11px; }

  @media (max-width: 640px) {
    .hero-name { font-size: 32px; }
    .lyrics-card { padding: 32px 20px; }
    .lyrics-text { font-size: 17px; line-height: 2; }
    .container { padding: 20px 16px 60px; }
    .header-logo { height: 40px; }
    .hero { padding: 32px 16px 28px; }
    .tabs { border-radius: 8px; }
    .btn { padding: 12px 20px; font-size: 12px; }
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

function notFoundPage() {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoRémi Souvenir — Page non trouvée</title>${STYLES}</head>
<body>${headerHtml()}
<div class="container" style="text-align:center;padding-top:80px">
  <img src="${PICTO_CADEAU}" alt="" style="width:64px;height:64px;margin-bottom:16px;opacity:0.4">
  <h2 style="font-family:var(--serif);font-size:24px;margin-bottom:8px;font-weight:400">Page non trouvée</h2>
  <p style="color:var(--gris);font-size:14px">Ce lien n'est pas valide ou a expiré.</p>
  <a href="https://doremisouvenir.fr" class="btn btn-outline" style="margin-top:24px">Retour au site</a>
</div></body></html>`;
}

// ── Page personnelle / publique ──
function personalPage(order, qrDataUrl, shareUrl, isOwner) {
  const lyrics = order.lyrics_final || order.lyrics_admin_edited || order.lyrics_original || '';
  const recipientName = order.recipient_name || '';
  const occasion = order.occasion || '';
  const hasSongs = order.song_file_1_url || order.song_file_2_url;
  const pageTitle = isOwner
    ? `DoRémi Souvenir — Chanson pour ${recipientName}`
    : `Chanson pour ${recipientName} — DoRémi Souvenir`;

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
          ${isOwner ? `<a href="${s.url}" download class="song-download">&#11015; Télécharger</a>` : ''}
        </div>
      `).join('')}
    </div>`;
  } else {
    songsHtml = `<div class="songs-card">
      <div class="no-songs">
        <img src="${PICTO_MICRO}" alt="" class="no-songs-icon">
        <div class="no-songs-text">Les chansons seront disponibles ici<br>une fois la mise en musique terminée.</div>
      </div>
    </div>`;
  }

  // Section QR
  let qrHtml = '';
  if (isOwner && qrDataUrl && shareUrl) {
    qrHtml = `
    <div class="qr-card">
      <div class="qr-title">Partagez cette chanson</div>
      <div class="qr-sub">Scannez ce QR code pour accéder aux paroles et écouter la chanson.<br>Parfait pour partager avec la famille ou les proches.</div>
      <div class="qr-img"><img src="${qrDataUrl}" alt="QR Code" width="200" height="200"></div>
      <div class="qr-url">${shareUrl}</div>
    </div>`;
  }

  // Boutons d'action
  let actionsHtml = '';
  if (isOwner) {
    actionsHtml = `
    <div class="actions-row">
      <a href="/page/${order.public_token}/pdf" class="btn btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Télécharger le PDF
      </a>
      <button class="btn btn-outline" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimer
      </button>
    </div>`;
  }

  // Onglets
  const showTabs = isOwner || hasSongs;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pageTitle}</title>
<link rel="icon" type="image/png" href="${LOGO_URL}">
${STYLES}
<style>@media print { .header,.tabs,.actions-row,.qr-card,.songs-card,.footer,.no-print { display:none!important; } .lyrics-card { box-shadow:none; border:none; } .lyrics-card::before { display:none; } body { background:#fff; } }</style>
</head>
<body>
${headerHtml()}

<div class="container">
  <div class="hero">
    <img src="${PICTO_COEUR}" alt="" class="hero-picto">
    <div class="hero-for">${isOwner ? 'Votre chanson pour' : 'Une chanson pour'}</div>
    <div class="hero-name">${recipientName || 'vous'}</div>
    ${occasion ? `<div class="hero-occasion">${occasion}</div>` : ''}
    <div class="hero-divider"></div>
  </div>

  ${showTabs ? `
  <div class="tabs no-print">
    <div class="tab active" onclick="switchTab('paroles')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      Paroles
    </div>
    <div class="tab" onclick="switchTab('chansons')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Mes chansons
    </div>
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
  <img src="${LOGO_URL}" alt="DoRémi Souvenir" class="footer-logo"><br>
  Créé avec amour par <a href="https://doremisouvenir.fr">DoRémi Souvenir</a>
  <div class="footer-links">
    <a href="https://doremisouvenir.fr/pages/notre-histoire">Notre histoire</a>
    <a href="https://doremisouvenir.fr/pages/nos-chansons">Nos chansons</a>
  </div>
</div>

<script>
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  const tabs = document.querySelectorAll('.tab');
  if (tab === 'paroles') tabs[0].classList.add('active');
  else tabs[1].classList.add('active');
}
</script>
</body></html>`;
}

module.exports = router;
