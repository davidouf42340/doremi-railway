// ============================================================
// Dorémi — Génération PDF des paroles
// 2-3 pages A4 max, paroles lisibles
// ============================================================

const PDFDocument = require('pdfkit');
const { generateQRBuffer } = require('./qrcode');
const { SECTION_PATTERN } = require('./lyrics-sections');

const CHARBON = '#2C2C2A';
const OR = '#FCB02E';
const GRIS = '#888780';
const GRIS_LIGHT = '#D3D1C7';
const LOGO_URL = 'https://doremisouvenir.fr/cdn/shop/files/logo-doremi-chanson-personnalisee.png';

async function fetchBuffer(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e) { return null; }
}

async function generateLyricsPDF(order, shareUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      const lyrics = order.lyrics_final || order.lyrics_admin_edited || order.lyrics_original || '';
      const recipientName = order.recipient_name || '';
      const occasion = order.occasion || '';
      const coverUrl = order.cover_image_url || '';

      // Pré-charger les images en parallèle
      const [logoBuffer, coverBuffer, qrBuffer] = await Promise.all([
        fetchBuffer(LOGO_URL),
        coverUrl ? fetchBuffer(coverUrl) : null,
        shareUrl ? generateQRBuffer(shareUrl, { width: 200 }) : null,
      ]);

      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Doremi — Chanson pour ${recipientName || 'vous'}`,
          Author: 'DoReMi Souvenir',
        },
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;   // 595
      const L = 50;               // marge gauche
      const R = W - 50;           // marge droite
      const CW = R - L;           // largeur contenu

      // ─────────────────────────────────
      // Fonctions utilitaires
      // ─────────────────────────────────

      function orangeLine() {
        doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(OR).lineWidth(1.5).stroke();
        doc.y += 2;
      }

      function thinLine() {
        doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(GRIS_LIGHT).lineWidth(0.5).stroke();
        doc.y += 2;
      }

      function drawFooter() {
        // Position fixe en bas
        const fy = 775;
        doc.moveTo(L, fy).lineTo(R, fy).strokeColor(GRIS_LIGHT).lineWidth(0.5).stroke();

        // Logo à gauche
        if (logoBuffer) {
          doc.image(logoBuffer, L, fy + 5, { width: 70 });
        } else {
          doc.fontSize(7).fillColor(GRIS).font('Helvetica');
          doc.text('doremisouvenir.fr', L, fy + 8);
        }

        // Promo à droite
        const px = R - 120;
        doc.fontSize(14).fillColor(OR).font('Helvetica-Bold');
        doc.text('-10%', px, fy + 5);
        doc.fontSize(8).fillColor(CHARBON).font('Helvetica');
        doc.text('avec le code', px + 42, fy + 7);
        doc.fontSize(11).fillColor(OR).font('Helvetica-Bold');
        doc.text('QR10', px + 42, fy + 18);
      }

      function newPage() {
        drawFooter();
        doc.addPage();
        // Petit logo en haut des pages suivantes
        if (logoBuffer) {
          doc.image(logoBuffer, (W - 80) / 2, 40, { width: 80 });
          doc.y = 72;
        }
        orangeLine();
        doc.y += 10;
      }

      // ─────────────────────────────────
      // PAGE 1 — HEADER
      // ─────────────────────────────────

      // Logo centré en haut
      if (logoBuffer) {
        const lw = 150;
        doc.image(logoBuffer, (W - lw) / 2, doc.y, { width: lw });
        doc.y += 50; // hauteur du logo
      }
      doc.y += 8;

      // Ligne dorée SOUS le logo
      orangeLine();
      doc.y += 15;

      // ── Bloc pochette | titre | QR ──
      // On sauvegarde la position Y de départ du bloc
      const rowY = doc.y;
      const rowH = 100;

      // Pochette à gauche (colonne 1)
      if (coverBuffer) {
        doc.image(coverBuffer, L, rowY, { width: 95, height: 95 });
      }

      // Titre au centre (colonne 2)
      const col2x = coverBuffer ? L + 108 : L + 20;
      const col2w = qrBuffer ? CW - 210 : CW - 110;
      let ty = rowY + 12;

      doc.fontSize(10).fillColor(GRIS).font('Helvetica');
      doc.text('Une chanson pour', col2x, ty, { width: col2w, align: 'center' });
      ty += 16;
      doc.fontSize(22).fillColor(CHARBON).font('Helvetica-Bold');
      doc.text(recipientName || 'vous', col2x, ty, { width: col2w, align: 'center' });
      ty += 28;
      if (occasion) {
        doc.fontSize(11).fillColor(OR).font('Helvetica-Bold');
        doc.text(occasion, col2x, ty, { width: col2w, align: 'center' });
        ty += 18;
      }
      // Petite barre dorée
      const cx = col2x + col2w / 2;
      doc.moveTo(cx - 25, ty).lineTo(cx + 25, ty).strokeColor(OR).lineWidth(1.5).stroke();

      // QR à droite (colonne 3)
      if (qrBuffer) {
        const qs = 75;
        const qx = R - qs;
        doc.image(qrBuffer, qx, rowY + 5, { width: qs });
        doc.fontSize(6).fillColor(GRIS).font('Helvetica');
        doc.text('Partagez ce QR code', qx - 8, rowY + qs + 8, { width: qs + 16, align: 'center' });
      }

      // Sauter sous le bloc
      doc.y = rowY + rowH + 15;

      // Ligne fine séparatrice
      thinLine();
      doc.y += 8;

      // ─────────────────────────────────
      // PAROLES
      // ─────────────────────────────────

      const rawLines = lyrics.split('\n');

      // Filtrer les lignes vides autour des labels
      const displayLines = [];
      for (let i = 0; i < rawLines.length; i++) {
        const t = rawLines[i].trim();
        if (t === '') {
          const prev = i > 0 ? rawLines[i - 1].trim() : '';
          const next = i < rawLines.length - 1 ? rawLines[i + 1].trim() : '';
          if (SECTION_PATTERN.test(prev) || SECTION_PATTERN.test(next)) continue;
          displayLines.push({ type: 'space' });
        } else if (SECTION_PATTERN.test(t)) {
          displayLines.push({ type: 'label', text: t.toUpperCase() });
        } else {
          displayLines.push({ type: 'line', text: t });
        }
      }

      for (const item of displayLines) {
        // Saut de page si on dépasse
        if (doc.y > 750) {
          newPage();
        }

        if (item.type === 'space') {
          doc.y += 6;
        } else if (item.type === 'label') {
          doc.y += 10;
          doc.fontSize(8).fillColor(OR).font('Helvetica-Bold');
          doc.text(item.text, L, doc.y, { align: 'center', width: CW });
          doc.y += 4;
        } else {
          doc.fontSize(13).fillColor(CHARBON).font('Helvetica');
          doc.text(item.text, L, doc.y, { align: 'center', width: CW });
        }
      }

      // Footer dernière page
      drawFooter();

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateLyricsPDF };
