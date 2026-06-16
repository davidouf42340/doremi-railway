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
        margins: { top: 36, bottom: 36, left: 48, right: 48 },
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
      const pageW = doc.page.width;
      const contentW = pageW - 96; // margins

      // ── Header : logo text ──
      doc.fontSize(8).fillColor(GRIS).text('doremisouvenir.fr', { align: 'center' });
      doc.moveDown(0.3);

      // Ligne dorée
      const lineY = doc.y;
      doc.moveTo(48, lineY).lineTo(pageW - 48, lineY).strokeColor(OR).lineWidth(1.5).stroke();
      doc.moveDown(0.6);

      // ── Hero : titre ──
      doc.fontSize(10).fillColor(GRIS).font('Helvetica').text(
        recipientName ? `Une chanson pour` : '',
        { align: 'center' }
      );
      if (recipientName) {
        doc.moveDown(0.15);
        doc.fontSize(26).fillColor(CHARBON).font('Helvetica-Bold').text(recipientName, { align: 'center' });
      }
      if (occasion) {
        doc.moveDown(0.15);
        doc.fontSize(11).fillColor(OR).font('Helvetica-Bold').text(occasion, { align: 'center' });
      }

      // Petite ligne dorée décorative
      doc.moveDown(0.4);
      const divY = doc.y;
      const divX = (pageW - 50) / 2;
      doc.moveTo(divX, divY).lineTo(divX + 50, divY).strokeColor(OR).lineWidth(1.5).stroke();
      doc.moveDown(0.5);

      // ── Pochette (si elle existe) ──
      if (coverUrl) {
        try {
          // Télécharger l'image
          const response = await fetch(coverUrl);
          if (response.ok) {
            const imgBuffer = Buffer.from(await response.arrayBuffer());
            const imgW = 140;
            const imgX = (pageW - imgW) / 2;
            doc.image(imgBuffer, imgX, doc.y, { width: imgW });
            doc.y += imgW + 8;
          }
        } catch (e) {
          // Image non dispo, on continue sans
        }
      }

      // ── Paroles ──
      const lines = lyrics.split('\n');

      // Calculer la taille de police pour tout tenir sur une page
      // Espace restant : environ 780 (bas page) - position actuelle - 80 (footer/QR)
      const availableHeight = 760 - doc.y - 80;
      const totalLines = lines.filter(l => l.trim() !== '').length;
      // Ajuster la taille : base 11, réduit si beaucoup de lignes
      let fontSize = Math.min(11, Math.max(7.5, availableHeight / (totalLines * 1.6)));

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '') {
          doc.moveDown(0.15);
          continue;
        }

        if (SECTION_PATTERN.test(trimmed)) {
          // Label de section — doré, petit, uppercase
          doc.moveDown(0.25);
          doc.fontSize(7).fillColor(OR).font('Helvetica-Bold');
          doc.text(trimmed.toUpperCase(), 48, doc.y, { align: 'left', width: contentW });
          doc.moveDown(0.1);
          doc.font('Helvetica').fontSize(fontSize).fillColor(CHARBON);
          continue;
        }

        doc.font('Helvetica').fontSize(fontSize).fillColor(CHARBON);
        doc.text(trimmed, { align: 'center', lineGap: 1.5 });
      }

      // ── QR Code + footer en bas de page ──
      const bottomY = 740;

      if (shareUrl) {
        const qrBuffer = await generateQRBuffer(shareUrl, { width: 120 });
        const qrSize = 65;
        const qrX = (pageW - qrSize) / 2;
        const qrY = bottomY - qrSize - 18;
        doc.image(qrBuffer, qrX, qrY, { width: qrSize });
        doc.fontSize(6.5).fillColor(GRIS);
        doc.text('Scannez pour ecouter', 0, qrY + qrSize + 3, { align: 'center', width: pageW });
      }

      // Footer
      const footerY = bottomY;
      doc.moveTo(48, footerY).lineTo(pageW - 48, footerY).strokeColor(GRIS_LIGHT).lineWidth(0.5).stroke();
      doc.fontSize(7).fillColor(GRIS);
      doc.text('Cette creation musicale a ete creee par doremisouvenir.fr', 48, footerY + 5, { align: 'center', width: contentW });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateLyricsPDF };
