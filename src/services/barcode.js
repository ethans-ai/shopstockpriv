const bwipjs = require('bwip-js');

// Code 128 SVG for a shortcode. Any USB scanner (1D or 2D) reads this;
// the scanner "types" the code + Enter, which the wedge listener in
// public/js/app.js turns into navigation.
function svgForCode(code) {
  return bwipjs.toSVG({
    bcid: 'code128',
    text: code,
    height: 10,          // bar height in mm (scaled by CSS at print time)
    includetext: false,  // label templates render the text themselves
    paddingwidth: 0,
    paddingheight: 0
  });
}

module.exports = { svgForCode };
