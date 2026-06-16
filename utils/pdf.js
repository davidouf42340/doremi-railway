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

async function safeFetch(url) {
  try {
    const r = await fetch(url);
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch (_) { return null; }
}

async function generateLyricsPDF(order, shareUrl) {
  const [logoImg, coverImg, qrImg] = await Promise.all([
    safeFetch(LOGO_URL),
    order.cover_image_url ? safeFetch(order.cover_image_url) : null,
    shareUrl ? generateQRBuffer(shareUrl, { width: 200 }) : null,
  ]);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 70, left: 50, right: 50 },
        info: {
          Title: `Doremi — Chanson pour ${order.recipient_name || 'vous'}`,
          Author: 'DoReMi Souvenir',
        },
      });

      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;
      const L = 50;
      const R = W - 50;
      const CW = R - L;
      const name = order.recipient_name || 'vous';
      const occasion = order.occasion || '';
      // Nettoyer les balises HTML des paroles
      const lyrics = (order.lyrics_final || order.lyrics_admin_edited || order.lyrics_original || '')
        .replace(/<br\s*\/?>/gi, '')
        .replace(/<[^>]+>/g, '');

      // ── Footer (position fixe en bas de chaque page) ──
      function drawFooter() {
        const fy = 775;
        doc.save();
        doc.moveTo(L, fy).lineTo(R, fy).strokeColor(GRIS_LIGHT).lineWidth(0.5).stroke();
        // Logo à gauche
        const logoY = fy + 6;
        if (logoImg) {
          doc.image(logoImg, L, logoY, { width: 65 });
        } else {
          doc.font('Helvetica').fontSize(7).fillColor(GRIS);
          doc.text('doremisouvenir.fr', L, logoY + 4, { lineBreak: false });
        }
        // -10% avec le code QR10 — sur une ligne, aligné avec le logo
        doc.font('Helvetica-Bold').fontSize(10).fillColor(OR);
        doc.text('-10% ', R - 140, logoY + 5, { continued: true, lineBreak: false });
        doc.font('Helvetica').fontSize(9).fillColor(CHARBON);
        doc.text('avec le code ', { continued: true, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(10).fillColor(OR);
        doc.text('QR10', { lineBreak: false });
        doc.restore();
      }

      // ── Saut de page ──
      function pageBreak() {
        drawFooter();
        doc.addPage();
        if (logoImg) {
          doc.image(logoImg, (W - 80) / 2, 40, { width: 80 });
        }
        doc.y = 78;
        doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(OR).lineWidth(1).stroke();
        doc.y = 92;
        doc.x = L;
      }

      // ══════════════════════════════
      // PAGE 1 — HEADER
      // ══════════════════════════════

      // Logo centré
      if (logoImg) {
        doc.image(logoImg, (W - 150) / 2, doc.y, { width: 150 });
        doc.y += 55;
      } else {
        doc.font('Helvetica-Bold').fontSize(20).fillColor(OR);
        doc.text('DoReMi Souvenir', { align: 'center' });
        doc.moveDown(0.3);
      }

      // 2 sauts de ligne puis ligne dorée SOUS le logo
      doc.y += 30;
      doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(OR).lineWidth(1.5).stroke();
      doc.y += 16;

      // Bloc 3 colonnes : pochette | titre | QR
      const blockY = doc.y;
      const blockH = 100;
      const midBlockY = blockY + blockH / 2;

      // Pochette gauche
      if (coverImg) {
        doc.image(coverImg, L, midBlockY - 47, { width: 95, height: 95 });
      }

      // QR droite
      if (qrImg) {
        doc.image(qrImg, R - 78, midBlockY - 40, { width: 78 });
        doc.font('Helvetica').fontSize(6).fillColor(GRIS);
        doc.text('Partagez ce QR code', R - 86, midBlockY + 42, { width: 94, align: 'center', lineBreak: false });
      }

      // Titre centre
      const tl = coverImg ? L + 108 : L + 10;
      const tr = qrImg ? R - 92 : R - 10;
      const tw = tr - tl;

      doc.font('Helvetica').fontSize(10).fillColor(GRIS);
      doc.text('Une chanson pour', tl, midBlockY - 30, { width: tw, align: 'center', lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(22).fillColor(CHARBON);
      doc.text(name, tl, midBlockY - 14, { width: tw, align: 'center', lineBreak: false });
      if (occasion) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(OR);
        doc.text(occasion, tl, midBlockY + 14, { width: tw, align: 'center', lineBreak: false });
      }
      const barY = occasion ? midBlockY + 30 : midBlockY + 16;
      const cx = tl + tw / 2;
      doc.moveTo(cx - 25, barY).lineTo(cx + 25, barY).strokeColor(OR).lineWidth(1.5).stroke();

      // Après le bloc header — 2 sauts de ligne
      doc.y = blockY + blockH + 16;
      doc.x = L;
      doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(GRIS_LIGHT).lineWidth(0.5).stroke();
      doc.y += 30;
      doc.x = L;

      // ══════════════════════════════
      // PAROLES — flow naturel PDFKit
      // ══════════════════════════════

      const rawLines = lyrics.split('\n');

      for (let i = 0; i < rawLines.length; i++) {
        const t = rawLines[i].trim();

        if (t === '') {
          const prev = i > 0 ? rawLines[i - 1].trim() : '';
          const next = i < rawLines.length - 1 ? rawLines[i + 1].trim() : '';
          if (SECTION_PATTERN.test(prev) || SECTION_PATTERN.test(next)) continue;
          doc.moveDown(0.3);
          continue;
        }

        if (SECTION_PATTERN.test(t)) {
          if (doc.y > 720) pageBreak();
          doc.moveDown(0.5);
          doc.font('Helvetica-Bold').fontSize(8).fillColor(OR);
          doc.text(t.toUpperCase(), { align: 'center' });
          doc.moveDown(0.15);
          continue;
        }

        if (doc.y > 740) pageBreak();
        doc.font('Helvetica').fontSize(13).fillColor(CHARBON);
        doc.text(t, { align: 'center', lineGap: 2 });
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
