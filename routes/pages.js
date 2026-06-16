// ============================================================
// Dorémi — Routes Pages
// Page personnelle client + PDF + Page publique QR
// ============================================================

const express = require('express');
const db      = require('../db');
const { generateLyricsPDF }  = require('../utils/pdf');
const { generateQRDataUrl }  = require('../utils/qrcode');
const { SECTION_PATTERN }    = require('../utils/lyrics-sections');

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

  /* Header — logo gros à gauche, QR à droite */
  .header { background: var(--blanc); padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #EEEEE9; }
  .header a { text-decoration: none; display: inline-flex; align-items: center; }
  .header-logo { height: 96px; width: auto; }
  .header-qr { display: flex; align-items: center; gap: 16px; }
  .header-qr-img { width: 80px; height: 80px; border-radius: 8px; border: 1px solid #EEEEE9; }
  .header-qr-text { font-size: 12px; font-weight: 600; color: var(--charbon); max-width: 160px; line-height: 1.4; }

  /* Container */
  .container { max-width: 720px; margin: 0 auto; padding: 32px 20px 40px; }

  /* Pochette */
  .cover-section { text-align: center; padding: 32px 20px 0; }
  .cover-img { max-width: 360px; width: 100%; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,.12); }

  /* Hero */
  .hero { text-align: center; padding: 24px 20px 20px; }
  .hero-for { font-family: var(--sans); font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: var(--gris); margin-bottom: 8px; font-weight: 500; }
  .hero-name { font-family: var(--serif); font-size: 42px; font-weight: 400; color: var(--charbon); margin-bottom: 6px; line-height: 1.2; }
  .hero-occasion { font-size: 14px; color: var(--or); font-weight: 500; letter-spacing: 0.5px; }
  .hero-divider { width: 60px; height: 2px; background: var(--or); margin: 16px auto 0; border-radius: 1px; }

  /* Lecteur MP3 intégré */
  .player-section { background: var(--blanc); border-radius: var(--radius); padding: 20px 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
  .player-song-name { font-size: 14px; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
  .player-song-name::before { content: ''; display: inline-block; width: 10px; height: 10px; background: var(--or); border-radius: 50%; }
  .player-audio { width: 100%; border-radius: 8px; height: 44px; }
  .player-download { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--or); text-decoration: none; font-weight: 600; margin-top: 8px; transition: color .15s; }
  .player-download:hover { color: #E09A20; }
  .player-multi { display: flex; flex-direction: column; gap: 16px; }

  /* Paroles */
  .lyrics-card { background: var(--blanc); border-radius: var(--radius); padding: 36px 40px; box-shadow: 0 2px 8px rgba(0,0,0,.04); margin-bottom: 24px; position: relative; }
  .lyrics-card::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 60px; height: 3px; background: var(--or); border-radius: 0 0 3px 3px; }
  .lyrics-text { font-family: var(--serif); font-size: 19px; line-height: 2; color: var(--charbon); text-align: center; white-space: pre-line; }
  .lyrics-spacer { height: 8px; }
  .lyrics-section-label { font-family: var(--sans); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 3px; color: var(--or); margin: 14px 0 4px; display: block; text-align: left; }

  /* Boutons */
  .actions-row { display: flex; gap: 12px; justify-content: center; margin-bottom: 24px; flex-wrap: wrap; }
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 13px 28px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--sans); transition: all .2s; text-decoration: none; letter-spacing: 0.3px; }
  .btn-primary { background: var(--or); color: var(--charbon); }
  .btn-primary:hover { background: var(--or-hover); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(252,176,46,.3); }
  .btn-outline { background: var(--blanc); border: 1.5px solid var(--gris-light); color: var(--charbon); }
  .btn-outline:hover { border-color: var(--charbon); }

  /* QR Card (dans le contenu, pour la section partage) */
  .qr-card { background: var(--blanc); border-radius: var(--radius); padding: 36px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.04); margin-bottom: 24px; }
  .qr-title { font-family: var(--serif); font-size: 22px; font-weight: 400; margin-bottom: 6px; color: var(--charbon); }
  .qr-sub { font-size: 13px; color: var(--gris); margin-bottom: 20px; line-height: 1.7; }
  .qr-img { border: 1px solid #EEEEE9; border-radius: 12px; padding: 16px; display: inline-block; background: var(--blanc); }
  .qr-url { font-size: 11px; color: var(--gris-light); margin-top: 16px; word-break: break-all; }

  /* Footer bandeau */
  .footer-bar { background: var(--blanc); border-top: 1px solid #EEEEE9; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
  .footer-bar-left { display: flex; align-items: center; gap: 12px; }
  .footer-bar-logo { height: 40px; width: auto; opacity: 0.8; }
  .footer-bar-text { font-size: 12px; color: var(--gris); line-height: 1.5; }
  .footer-bar-text a { color: var(--or); text-decoration: none; font-weight: 600; }
  .footer-bar-text a:hover { text-decoration: underline; }
  .footer-bar-links { display: flex; gap: 16px; }
  .footer-bar-links a { font-size: 11px; color: var(--gris-light); text-decoration: none; }
  .footer-bar-links a:hover { color: var(--charbon); }

  @media (max-width: 640px) {
    .header { padding: 12px 16px; }
    .header-logo { height: 64px; }
    .header-qr-img { width: 56px; height: 56px; }
    .header-qr-text { font-size: 10px; max-width: 100px; }
    .hero-name { font-size: 32px; }
    .lyrics-card { padding: 24px 20px; }
    .lyrics-text { font-size: 17px; line-height: 1.9; }
    .container { padding: 20px 16px 40px; }
    .hero { padding: 20px 16px 16px; }
    .cover-img { max-width: 280px; }
    .btn { padding: 12px 20px; font-size: 12px; }
    .footer-bar { flex-direction: column; gap: 12px; text-align: center; padding: 16px; }
    .footer-bar-left { flex-direction: column; }
  }
</style>
`;

function headerHtml(qrDataUrl) {
  return `<div class="header">
    <a href="https://doremisouvenir.fr">
      <img src="${LOGO_URL}" alt="DoRémi Souvenir" class="header-logo">
    </a>
    ${qrDataUrl ? `
    <div class="header-qr">
      <div class="header-qr-text">Partagez ce QR code<br>à tout le monde !</div>
      <img src="${qrDataUrl}" alt="QR Code" class="header-qr-img">
    </div>` : ''}
  </div>`;
}

function notFoundPage() {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoRémi Souvenir — Page non trouvée</title>${STYLES}</head>
<body>${headerHtml(null)}
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
  const coverUrl = order.cover_image_url || '';
  const pageTitle = isOwner
    ? `DoRémi Souvenir — Chanson pour ${recipientName}`
    : `Chanson pour ${recipientName} — DoRémi Souvenir`;

  // Paroles formatées — labels à gauche, moins d'espaces
  const lyricsHtml = lyrics.split('\n').map(line => {
    const trimmed = line.trim();
    if (trimmed === '') return '<div class="lyrics-spacer"></div>';
    if (SECTION_PATTERN.test(trimmed)) return `<div class="lyrics-section-label">${trimmed}</div>`;
    return line;
  }).join('\n');

  // Lecteur MP3 intégré (sous la pochette/hero)
  let playerHtml = '';
  if (hasSongs) {
    const songs = [];
    if (order.song_file_1_url) songs.push({ name: order.song_file_1_name || 'Version 1', url: order.song_file_1_url });
    if (order.song_file_2_url) songs.push({ name: order.song_file_2_name || 'Version 2', url: order.song_file_2_url });

    playerHtml = `<div class="player-section">
      <div class="player-multi">
        ${songs.map(s => `
          <div>
            <div class="player-song-name">${s.name}</div>
            <audio controls class="player-audio" preload="metadata">
              <source src="${s.url}" type="audio/mpeg">
            </audio>
            ${isOwner ? `<a href="${s.url}" download class="player-download">&#11015; Télécharger le MP3</a>` : ''}
          </div>
        `).join('')}
      </div>
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

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pageTitle}</title>
<link rel="icon" type="image/png" href="${LOGO_URL}">
${STYLES}
<style>@media print { .header,.player-section,.actions-row,.footer-bar,.no-print { display:none!important; } .lyrics-card { box-shadow:none; border:none; } .lyrics-card::before { display:none; } body { background:#fff; } }</style>
</head>
<body>
${headerHtml(isOwner ? qrDataUrl : null)}

<div class="container">
  ${coverUrl ? `
  <div class="cover-section">
    <img src="${coverUrl}" alt="Pochette" class="cover-img">
  </div>` : ''}

  <div class="hero">
    <div class="hero-for">${isOwner ? 'Votre chanson pour' : 'Une chanson pour'}</div>
    <div class="hero-name">${recipientName || 'vous'}</div>
    ${occasion ? `<div class="hero-occasion">${occasion}</div>` : ''}
    <div class="hero-divider"></div>
  </div>

  ${playerHtml}

  <div class="lyrics-card">
    <div class="lyrics-text">${lyricsHtml}</div>
  </div>

  ${actionsHtml}
</div>

<div class="footer-bar no-print">
  <div class="footer-bar-left">
    <img src="${LOGO_URL}" alt="DoRémi Souvenir" class="footer-bar-logo">
    <div class="footer-bar-text">
      Cette cr\u00e9ation musicale a \u00e9t\u00e9 cr\u00e9\u00e9e par <a href="https://doremisouvenir.fr">doremisouvenir.fr</a>
    </div>
  </div>
  <div class="footer-bar-links">
    <a href="https://doremisouvenir.fr/pages/notre-histoire">Notre histoire</a>
    <a href="https://doremisouvenir.fr/pages/nos-chansons">Nos chansons</a>
  </div>
</div>

</body></html>`;
}

module.exports = router;
