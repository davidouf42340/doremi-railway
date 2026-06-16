// ============================================================
// Dorémi — Génération PDF des paroles
// 2 pages A4, style identique à la page client
// ============================================================

const PDFDocument = require('pdfkit');
const { generateQRBuffer } = require('./qrcode');
const { SECTION_PATTERN } = require('./lyrics-sections');

// Couleurs Dorémi
const CHARBON = '#2C2C2A';
const OR = '#FCB02E';
const GRIS = '#888780';
const GRIS_LIGHT = '#D3D1C7';

const LOGO_URL = 'https://doremisouvenir.fr/cdn/shop/files/logo-doremi-chanson-personnalisee.png';

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function generateLyricsPDF(order, shareUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 36, bottom: 36, left: 48, right: 48 },
        info: {
          Title: `Doremi — Chanson pour ${order.recipient_name || 'vous'}`,
          Author: 'DoReMi Souvenir',
        },
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const lyrics = order.lyrics_final || order.lyrics_admin_edited || order.lyrics_original || '';
      const recipientName = order.recipient_name || '';
      const occasion = order.occasion || '';
      const coverUrl = order.cover_image_url || '';
      const pageW = doc.page.width;  // 595.28
      const contentW = pageW - 96;
      const leftM = 48;
      const rightM = pageW - 48;

      // Pré-charger les images
      const [logoBuffer, coverBuffer, qrBuffer] = await Promise.all([
        fetchBuffer(LOGO_URL),
        coverUrl ? fetchBuffer(coverUrl) : null,
        shareUrl ? generateQRBuffer(shareUrl, { width: 200 }) : null,
      ]);

      // ══════════════════════════════════════════════
      // PAGE 1 — Header
      // ══════════════════════════════════════════════

      // ── Logo DoRémi centré en gros ──
      if (logoBuffer) {
        const logoW = 180;
        const logoX = (pageW - logoW) / 2;
        doc.image(logoBuffer, logoX, doc.y, { width: logoW });
        doc.y += 55;
      } else {
        doc.fontSize(24).fillColor(OR).font('Helvetica-Bold');
        doc.text('DoReMi Souvenir', { align: 'center' });
        doc.moveDown(0.5);
      }

      doc.moveDown(0.3);

      // Ligne dorée séparatrice
      doc.moveTo(leftM, doc.y).lineTo(rightM, doc.y).strokeColor(OR).lineWidth(1.5).stroke();
      doc.moveDown(0.6);

      // ── Bloc : Pochette | Titre | QR — centrés en hauteur ──
      const blockY = doc.y;
      const blockH = 110;  // hauteur du bloc

      // Pochette à gauche
      if (coverBuffer) {
        const imgSize = 100;
        const imgY = blockY + (blockH - imgSize) / 2;
        doc.image(coverBuffer, leftM, imgY, { width: imgSize, height: imgSize });
      }

      // QR à droite
      if (qrBuffer) {
        const qrSize = 80;
        const qrX = rightM - qrSize;
        const qrY = blockY + (blockH - qrSize - 12) / 2;
        doc.image(qrBuffer, qrX, qrY, { width: qrSize });
        doc.fontSize(6).fillColor(GRIS).font('Helvetica');
        doc.text('Partagez ce QR code', qrX - 5, qrY + qrSize + 2, { width: qrSize + 10, align: 'center' });
      }

      // Titre au centre
      const titleLeft = coverBuffer ? leftM + 112 : leftM;
      const titleRight = qrBuffer ? rightM - 95 : rightM;
      const titleW = titleRight - titleLeft;

      // Calculer la hauteur totale du titre pour le centrer
      let titleTotalH = 14 + 30 + (occasion ? 16 : 0); // approx
      let titleStartY = blockY + (blockH - titleTotalH) / 2;

      doc.fontSize(10).fillColor(GRIS).font('Helvetica');
      doc.text('Une chanson pour', titleLeft, titleStartY, { align: 'center', width: titleW });
      titleStartY += 15;

      doc.fontSize(24).fillColor(CHARBON).font('Helvetica-Bold');
      doc.text(recipientName || 'vous', titleLeft, titleStartY, { align: 'center', width: titleW });
      titleStartY += 30;

      if (occasion) {
        doc.fontSize(11).fillColor(OR).font('Helvetica-Bold');
        doc.text(occasion, titleLeft, titleStartY, { align: 'center', width: titleW });
        titleStartY += 16;
      }

      // Petite ligne dorée sous le titre
      const divCX = titleLeft + titleW / 2;
      doc.moveTo(divCX - 25, titleStartY + 2).lineTo(divCX + 25, titleStartY + 2).strokeColor(OR).lineWidth(1.5).stroke();

      // Avancer après le bloc header
      doc.y = blockY + blockH + 10;

      // Ligne séparatrice
      doc.moveTo(leftM, doc.y).lineTo(rightM, doc.y).strokeColor(GRIS_LIGHT).lineWidth(0.5).stroke();
      doc.moveDown(0.5);

      // ══════════════════════════════════════════════
      // PAROLES — sur 2 pages
      // ══════════════════════════════════════════════

      const lines = lyrics.split('\n');
      const fontSize = 11;
      const labelSize = 7.5;

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (trimmed === '') {
          // Ignorer lignes vides autour des labels
          const prev = i > 0 ? lines[i - 1].trim() : '';
          const next = i < lines.length - 1 ? lines[i + 1].trim() : '';
          if (SECTION_PATTERN.test(prev) || SECTION_PATTERN.test(next)) continue;
          doc.moveDown(0.25);
          continue;
        }

        if (SECTION_PATTERN.test(trimmed)) {
          doc.moveDown(0.35);
          doc.fontSize(labelSize).fillColor(OR).font('Helvetica-Bold');
          doc.text(trimmed.toUpperCase(), leftM, doc.y, { align: 'center', width: contentW });
          doc.moveDown(0.15);
          continue;
        }

        doc.font('Helvetica').fontSize(fontSize).fillColor(CHARBON);
        doc.text(trimmed, { align: 'center', lineGap: 2 });

        // Saut de page si nécessaire
        if (doc.y > 740) {
          doc.addPage();
          // En-tête page 2 — logo petit + ligne
          if (logoBuffer) {
            const logoW2 = 100;
            doc.image(logoBuffer, (pageW - logoW2) / 2, 36, { width: logoW2 });
            doc.y = 36 + 32;
          }
          doc.moveDown(0.3);
          doc.moveTo(leftM, doc.y).lineTo(rightM, doc.y).strokeColor(OR).lineWidth(0.5).stroke();
          doc.moveDown(0.5);
        }
      }

      // ══════════════════════════════════════════════
      // FOOTER — bas de la dernière page
      // ══════════════════════════════════════════════

      const footerY = 780;
      doc.moveTo(leftM, footerY).lineTo(rightM, footerY).strokeColor(GRIS_LIGHT).lineWidth(0.5).stroke();
      doc.fontSize(7).fillColor(GRIS).font('Helvetica');
      doc.text('Cette creation musicale a ete creee par doremisouvenir.fr', leftM, footerY + 5, { align: 'center', width: contentW });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateLyricsPDF };
