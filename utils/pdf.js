// ============================================================
// Dorémi — Génération PDF des paroles
// 2-3 pages A4, style identique à la page client
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
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e) { return null; }
}

async function generateLyricsPDF(order, shareUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 60, left: 50, right: 50 },
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
      const leftM = 50;
      const rightM = pageW - 50;
      const contentW = rightM - leftM;

      // Pré-charger les images
      const [logoBuffer, coverBuffer, qrBuffer] = await Promise.all([
        fetchBuffer(LOGO_URL),
        coverUrl ? fetchBuffer(coverUrl) : null,
        shareUrl ? generateQRBuffer(shareUrl, { width: 200 }) : null,
      ]);

      // ══════════════════════════════════
      // FONCTION — Dessiner le footer
      // ══════════════════════════════════
      function drawFooter() {
        const footerY = 780;

        // Ligne séparatrice
        doc.moveTo(leftM, footerY).lineTo(rightM, footerY).strokeColor(GRIS_LIGHT).lineWidth(0.5).stroke();

        // Logo DoRémi à gauche
        if (logoBuffer) {
          doc.image(logoBuffer, leftM, footerY + 6, { width: 80 });
        } else {
          doc.fontSize(8).fillColor(GRIS).font('Helvetica');
          doc.text('doremisouvenir.fr', leftM, footerY + 10);
        }

        // Promo à droite : icône cadeau + -10% + code QR10
        const promoX = rightM - 160;
        const promoY = footerY + 6;

        // Icône cadeau (emoji-style en texte)
        doc.fontSize(18).fillColor(OR);
        doc.text('\u{1F381}', promoX, promoY, { width: 24 });

        // Texte promo
        doc.fontSize(12).fillColor(OR).font('Helvetica-Bold');
        doc.text('-10%', promoX + 28, promoY + 2, { continued: false });
        doc.fontSize(8).fillColor(CHARBON).font('Helvetica');
        doc.text('avec le code', promoX + 28, promoY + 16, { continued: false });
        doc.fontSize(10).fillColor(OR).font('Helvetica-Bold');
        doc.text('QR10', promoX + 82, promoY + 14, { continued: false });
      }

      // ══════════════════════════════════
      // FONCTION — En-tête de page
      // ══════════════════════════════════
      function drawPageHeader(isFirstPage) {
        if (isFirstPage) {
          // ── Logo DoRémi centré en gros AU-DESSUS de la ligne ──
          if (logoBuffer) {
            const logoW = 160;
            const logoX = (pageW - logoW) / 2;
            doc.image(logoBuffer, logoX, 40, { width: logoW });
            doc.y = 90;
          } else {
            doc.fontSize(22).fillColor(OR).font('Helvetica-Bold');
            doc.text('DoReMi Souvenir', leftM, 40, { align: 'center', width: contentW });
            doc.y = 75;
          }

          // Ligne dorée
          doc.moveTo(leftM, doc.y).lineTo(rightM, doc.y).strokeColor(OR).lineWidth(1.5).stroke();
          doc.y += 12;

          // ── Bloc : Pochette | Titre | QR — centrés en hauteur ──
          const blockY = doc.y;
          const blockH = 105;

          // Pochette à gauche
          if (coverBuffer) {
            const imgSize = 95;
            const imgY = blockY + (blockH - imgSize) / 2;
            doc.image(coverBuffer, leftM, imgY, { width: imgSize, height: imgSize });
          }

          // QR à droite
          if (qrBuffer) {
            const qrSize = 75;
            const qrX = rightM - qrSize;
            const qrY = blockY + (blockH - qrSize - 14) / 2;
            doc.image(qrBuffer, qrX, qrY, { width: qrSize });
            doc.fontSize(6).fillColor(GRIS).font('Helvetica');
            doc.text('Partagez ce QR code', qrX - 5, qrY + qrSize + 2, { width: qrSize + 10, align: 'center' });
          }

          // Titre au centre
          const tLeft = coverBuffer ? leftM + 108 : leftM;
          const tRight = qrBuffer ? rightM - 90 : rightM;
          const tW = tRight - tLeft;
          const tTotalH = 14 + 28 + (occasion ? 16 : 0);
          let tY = blockY + (blockH - tTotalH) / 2;

          doc.fontSize(10).fillColor(GRIS).font('Helvetica');
          doc.text('Une chanson pour', tLeft, tY, { align: 'center', width: tW });
          tY += 15;

          doc.fontSize(22).fillColor(CHARBON).font('Helvetica-Bold');
          doc.text(recipientName || 'vous', tLeft, tY, { align: 'center', width: tW });
          tY += 28;

          if (occasion) {
            doc.fontSize(11).fillColor(OR).font('Helvetica-Bold');
            doc.text(occasion, tLeft, tY, { align: 'center', width: tW });
            tY += 16;
          }

          // Petite ligne dorée
          const divCX = tLeft + tW / 2;
          doc.moveTo(divCX - 25, tY).lineTo(divCX + 25, tY).strokeColor(OR).lineWidth(1.5).stroke();

          // Position après le bloc
          doc.y = blockY + blockH + 8;

          // Ligne séparatrice fine
          doc.moveTo(leftM, doc.y).lineTo(rightM, doc.y).strokeColor(GRIS_LIGHT).lineWidth(0.5).stroke();
          doc.y += 10;

        } else {
          // Pages suivantes — petit logo + ligne
          if (logoBuffer) {
            const logoW2 = 90;
            doc.image(logoBuffer, (pageW - logoW2) / 2, 36, { width: logoW2 });
            doc.y = 70;
          }
          doc.moveTo(leftM, doc.y).lineTo(rightM, doc.y).strokeColor(OR).lineWidth(0.5).stroke();
          doc.y += 10;
        }
      }

      // ══════════════════════════════════
      // PAGE 1 — Header + début paroles
      // ══════════════════════════════════

      drawPageHeader(true);

      // ── Paroles — taille lisible, sur 2-3 pages ──
      const lines = lyrics.split('\n');
      const fontSize = 13;
      const labelSize = 8;
      const maxY = 765; // avant le footer
      let isFirstPage = true;

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (trimmed === '') {
          // Ignorer lignes vides autour des labels
          const prev = i > 0 ? lines[i - 1].trim() : '';
          const next = i < lines.length - 1 ? lines[i + 1].trim() : '';
          if (SECTION_PATTERN.test(prev) || SECTION_PATTERN.test(next)) continue;
          doc.moveDown(0.3);
          continue;
        }

        if (SECTION_PATTERN.test(trimmed)) {
          // Vérifier qu'on a assez de place pour le label + au moins 2 lignes
          if (doc.y > maxY - 60) {
            drawFooter();
            doc.addPage();
            isFirstPage = false;
            drawPageHeader(false);
          }
          doc.moveDown(0.4);
          doc.fontSize(labelSize).fillColor(OR).font('Helvetica-Bold');
          doc.text(trimmed.toUpperCase(), leftM, doc.y, { align: 'center', width: contentW });
          doc.moveDown(0.15);
          continue;
        }

        // Saut de page si nécessaire
        if (doc.y > maxY) {
          drawFooter();
          doc.addPage();
          isFirstPage = false;
          drawPageHeader(false);
        }

        doc.font('Helvetica').fontSize(fontSize).fillColor(CHARBON);
        doc.text(trimmed, leftM, doc.y, { align: 'center', width: contentW, lineGap: 3 });
      }

      // Footer de la dernière page
      drawFooter();

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateLyricsPDF };
