// ============================================================
// Dorémi — Génération PDF des paroles
// Style identique à la page client, sur une seule feuille A4
// ============================================================

const PDFDocument = require('pdfkit');
const { generateQRBuffer } = require('./qrcode');
const { SECTION_PATTERN } = require('./lyrics-sections');

// Couleurs Dorémi
const CHARBON = '#2C2C2A';
const OR = '#FCB02E';
const GRIS = '#888780';
const GRIS_LIGHT = '#D3D1C7';

async function generateLyricsPDF(order, shareUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 30, bottom: 30, left: 48, right: 48 },
        info: {
          Title: `Doremi — Chanson pour ${order.recipient_name || 'vous'}`,
          Author: 'DoReMi Souvenir',
        },
        autoFirstPage: true,
        bufferPages: true,
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const lyrics = order.lyrics_final || order.lyrics_admin_edited || order.lyrics_original || '';
      const recipientName = order.recipient_name || '';
      const occasion = order.occasion || '';
      const coverUrl = order.cover_image_url || '';
      const pageW = doc.page.width; // 595.28
      const contentW = pageW - 96;  // margins 48+48
      const leftM = 48;

      // ══════════════════════════════════════════════
      // HEADER : Pochette à gauche | Titre au centre | QR à droite
      // ══════════════════════════════════════════════

      const headerY = doc.y;
      const headerH = 100; // hauteur du bloc header

      // -- Pochette à gauche --
      let coverLoaded = false;
      if (coverUrl) {
        try {
          const response = await fetch(coverUrl);
          if (response.ok) {
            const imgBuffer = Buffer.from(await response.arrayBuffer());
            doc.image(imgBuffer, leftM, headerY, { width: 90, height: 90 });
            coverLoaded = true;
          }
        } catch (e) { /* image non dispo, on continue */ }
      }

      // -- Titre au centre --
      const titleX = coverLoaded ? leftM + 100 : leftM;
      const titleW = coverLoaded ? contentW - 200 : (shareUrl ? contentW - 100 : contentW);
      let titleY = headerY + 10;

      doc.fontSize(9).fillColor(GRIS).font('Helvetica');
      doc.text('Une chanson pour', titleX, titleY, { align: 'center', width: titleW });
      titleY += 14;

      doc.fontSize(22).fillColor(CHARBON).font('Helvetica-Bold');
      doc.text(recipientName || 'vous', titleX, titleY, { align: 'center', width: titleW });
      titleY += 28;

      if (occasion) {
        doc.fontSize(10).fillColor(OR).font('Helvetica-Bold');
        doc.text(occasion, titleX, titleY, { align: 'center', width: titleW });
        titleY += 16;
      }

      // Petite ligne dorée sous le titre
      const divCenterX = titleX + titleW / 2;
      doc.moveTo(divCenterX - 25, titleY).lineTo(divCenterX + 25, titleY).strokeColor(OR).lineWidth(1.5).stroke();

      // -- QR code à droite --
      if (shareUrl) {
        try {
          const qrBuffer = await generateQRBuffer(shareUrl, { width: 120 });
          const qrSize = 70;
          const qrX = pageW - leftM - qrSize;
          doc.image(qrBuffer, qrX, headerY, { width: qrSize });
          doc.fontSize(5.5).fillColor(GRIS).font('Helvetica');
          doc.text('Partagez ce QR code', qrX - 5, headerY + qrSize + 2, { width: qrSize + 10, align: 'center' });
        } catch (e) { /* QR non dispo */ }
      }

      // Avancer après le header
      doc.y = headerY + headerH + 5;

      // Ligne séparatrice dorée
      doc.moveTo(leftM, doc.y).lineTo(pageW - leftM, doc.y).strokeColor(OR).lineWidth(1).stroke();
      doc.moveDown(0.4);

      // ══════════════════════════════════════════════
      // PAROLES
      // ══════════════════════════════════════════════

      const lines = lyrics.split('\n');

      // Calculer la taille de police pour tenir sur une page
      const availableHeight = 770 - doc.y - 30; // 30 pour footer
      const totalLines = lines.filter(l => l.trim() !== '').length;
      const labelCount = lines.filter(l => SECTION_PATTERN.test(l.trim())).length;
      const textLines = totalLines - labelCount;
      let fontSize = Math.min(11, Math.max(7, availableHeight / (textLines * 1.5 + labelCount * 2)));

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '') {
          doc.moveDown(0.1);
          continue;
        }

        if (SECTION_PATTERN.test(trimmed)) {
          // Label de section — doré, centré, uppercase
          doc.moveDown(0.2);
          doc.fontSize(7).fillColor(OR).font('Helvetica-Bold');
          doc.text(trimmed.toUpperCase(), leftM, doc.y, { align: 'center', width: contentW });
          doc.moveDown(0.1);
          doc.font('Helvetica').fontSize(fontSize).fillColor(CHARBON);
          continue;
        }

        doc.font('Helvetica').fontSize(fontSize).fillColor(CHARBON);
        doc.text(trimmed, { align: 'center', lineGap: 1 });
      }

      // ══════════════════════════════════════════════
      // FOOTER — simple ligne + texte
      // ══════════════════════════════════════════════

      const footerY = 780;
      doc.moveTo(leftM, footerY).lineTo(pageW - leftM, footerY).strokeColor(GRIS_LIGHT).lineWidth(0.5).stroke();
      doc.fontSize(7).fillColor(GRIS).font('Helvetica');
      doc.text('Cette creation musicale a ete creee par doremisouvenir.fr', leftM, footerY + 4, { align: 'center', width: contentW });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateLyricsPDF };
