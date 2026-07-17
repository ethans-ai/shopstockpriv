const QRCode = require('qrcode');

// SVG string for a shortcode URL. Error correction M keeps density low enough
// to scan reliably at 0.5" on thermal labels.
async function svgForUrl(url) {
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#000000', light: '#ffffff' }
  });
}

function urlFor(baseUrl, kind, shortcode) {
  const base = (baseUrl || '').replace(/\/+$/, '');
  const prefix = kind === 'location' ? 'l' : 'i';
  return `${base}/${prefix}/${shortcode}`;
}

module.exports = { svgForUrl, urlFor };
