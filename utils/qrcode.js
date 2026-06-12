// ============================================================
// Dorémi — Génération QR Code
// ============================================================

const QRCode = require('qrcode');

// Génère un QR code en Data URL (base64 PNG) pour embedding dans une page HTML
async function generateQRDataUrl(url, options = {}) {
  return QRCode.toDataURL(url, {
    width: options.width || 280,
    margin: options.margin || 2,
    color: {
      dark: options.dark || '#2C2C2A',
      light: options.light || '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });
}

// Génère un QR code en buffer PNG (pour PDF ou téléchargement)
async function generateQRBuffer(url, options = {}) {
  return QRCode.toBuffer(url, {
    width: options.width || 280,
    margin: options.margin || 2,
    color: {
      dark: options.dark || '#2C2C2A',
      light: options.light || '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });
}

module.exports = { generateQRDataUrl, generateQRBuffer };
