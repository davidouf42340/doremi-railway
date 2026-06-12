// ============================================================
// Dorémi — Génération PDF des paroles
// ============================================================

const PDFDocument = require('pdfkit');
const { generateQRBuffer } = require('./qrcode');

async function generateLyricsPDF(order, shareUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
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

      // ── Header ──
      doc.fontSize(10).fillColor('#888780').text('DoReMi Souvenir', { align: 'center' });
      doc.moveDown(0.3);

      // Ligne décorative
      const lineY = doc.y;
      doc.moveTo(60, lineY).lineTo(535, lineY).strokeColor('#EF9F27').lineWidth(1.5).stroke();
      doc.moveDown(1);

      // ── Titre ──
      doc.fontSize(28).fillColor('#2C2C2A').font('Helvetica-Bold');
      if (recipientName) {
        doc.text(`Pour ${recipientName}`, { align: 'center' });
      }
      if (occasion) {
        doc.moveDown(0.3);
        doc.fontSize(14).fillColor('#888780').font('Helvetica').text(occasion, { align: 'center' });
      }

      doc.moveDown(1);

      // Ligne décorative
      const lineY2 = doc.y;
      doc.moveTo(200, lineY2).lineTo(395, lineY2).strokeColor('#D3D1C7').lineWidth(0.5).stroke();
      doc.moveDown(1);

      // ── Paroles ──
      const lines = lyrics.split('\n');
      doc.font('Helvetica').fontSize(13).fillColor('#2C2C2A');

      for (const line of lines) {
        if (line.trim() === '') {
          doc.moveDown(0.6);
        } else {
          doc.text(line, { align: 'center', lineGap: 6 });
        }

        // Saut de page si nécessaire
        if (doc.y > 700) {
          doc.addPage();
          doc.fontSize(10).fillColor('#888780').text('DoReMi Souvenir', { align: 'center' });
          doc.moveDown(1);
          doc.fontSize(13).fillColor('#2C2C2A');
        }
      }

      // ── QR Code en bas ──
      if (shareUrl) {
        doc.moveDown(2);

        // Ligne décorative
        const lineY3 = doc.y;
        doc.moveTo(200, lineY3).lineTo(395, lineY3).strokeColor('#D3D1C7').lineWidth(0.5).stroke();
        doc.moveDown(1);

        // Vérifier s'il reste assez de place
        if (doc.y > 600) doc.addPage();

        const qrBuffer = await generateQRBuffer(shareUrl, { width: 150 });
        const qrX = (doc.page.width - 100) / 2;
        doc.image(qrBuffer, qrX, doc.y, { width: 100 });
        doc.moveDown(0.5);
        doc.y += 105;
        doc.fontSize(9).fillColor('#888780').text('Scannez pour ecouter la chanson', { align: 'center' });
      }

      // ── Footer ──
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#D3D1C7').text('doremisouvenir.fr', { align: 'center' });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateLyricsPDF };
