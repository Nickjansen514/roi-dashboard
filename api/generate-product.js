const KIE_API_KEY = process.env.KIE_API_KEY;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

const MODEL_WOMEN = 'a confident professional female fashion model, early 30s, light medium skin tone, long dark brown wavy hair, slim build, UK size 10, standing upright, British fashion aesthetic';
const MODEL_MEN = 'a confident professional male fashion model, early 30s, light medium skin tone, short dark brown hair, athletic build, standing upright, British fashion aesthetic';
const CROP = 'mid-thigh up';
const STYLING_WOMEN = 'minimal delicate jewellery, nude heels';
const STYLING_MEN = 'a simple watch, clean white trainers';

// ── Anthropic-call met auto-retry bij tijdelijke fouten (429/500/502/503/529 overloaded) ──
function backoffMs(attempt) {
  const base = Math.min(1000 * Math.pow(2, attempt), 16000);
  return base + Math.floor(Math.random() * 500);
}
async function callAnthropic(requestBody, maxRetries = 5) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      });
    } catch (e) {
      if (attempt === maxRetries) throw e;
      await new Promise(function (r) { setTimeout(r, backoffMs(attempt)); });
      continue;
    }
    if (response.ok) return response;
    if ([429, 500, 502, 503, 529].includes(response.status) && attempt < maxRetries) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt);
      console.log('[callAnthropic] ' + response.status + ' - retry ' + (attempt + 1) + '/' + maxRetries + ' over ' + waitMs + 'ms');
      await new Promise(function (r) { setTimeout(r, waitMs); });
      continue;
    }
    const errText = await response.text();
    throw new Error('Claude API error: ' + response.status + ' ' + errText);
  }
}

// ============================================================================
//  PRIJSBEPALING
// ============================================================================
const MARKET_CURRENCY = { uk: 'GBP', usa: 'USD', polen: 'PLN', italie: 'EUR', nederland: 'EUR' };
const PRICE_TO_GBP = { GBP: 1, EUR: 0.86, USD: 0.79, PLN: 0.20, CNY: 0.11 };
const PRICE_GBP_TO = { GBP: 1, EUR: 1 / 0.86, USD: 1 / 0.79, PLN: 1 / 0.20 };
const PRICE_MARKUP = { uk: 3.0, usa: 3.0, polen: 3.0, italie: 3.0, nederland: 3.0 };
const EU_MARKETS = ['polen', 'italie', 'nederland'];
const EU_IMPORT_TAX = 0.03;
const CHARM_ENDINGS = [4.99, 9.99];

function priceSourceIsEU(productInfo) {
  if (typeof productInfo.sourceIsEU === 'boolean') return productInfo.sourceIsEU;
  const url = String(productInfo.sourceUrl || productInfo.competitorUrl || '').toLowerCase();
  if (url) {
    const euTlds = ['.eu', '.de', '.nl', '.be', '.fr', '.it', '.es', '.pl', '.at',
      '.ie', '.pt', '.fi', '.se', '.dk', '.cz', '.sk', '.ro', '.hu', '.gr', '.lt',
      '.lv', '.ee', '.si', '.hr', '.bg', '.lu', '.mt', '.cy'];
    for (const tld of euTlds) {
      if (new RegExp('\\' + tld + '(?:[/:?#]|$)').test(url)) return true;
    }
    if (/aliexpress|alibaba|amazon\.com|\.cn|\.co\.uk|\.us(?:[/:?#]|$)/.test(url)) return false;
  }
  const cur = String(productInfo.currency || '').toUpperCase();
  if (cur === 'EUR' || cur === 'PLN') return true;
  return false;
}

function charmRound(amount) {
  if (!(amount > 0)) return 0;
  const candidates = [];
  const base = Math.floor(amount / 10) * 10;
  for (let tens = base - 20; tens <= base + 30; tens += 10) {
    for (const end of CHARM_ENDINGS) {
      const c = parseFloat((tens + end).toFixed(2));
      if (c > 0) candidates.push(c);
    }
  }
  candidates.sort(function (a, b) { return a - b; });
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] >= amount - 0.001) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function computePrice(productInfo) {
  const market = String(productInfo.market || 'uk').toLowerCase();
  const targetCurrency = MARKET_CURRENCY[market] || 'GBP';
  if (productInfo.priceOverride != null && parseFloat(productInfo.priceOverride) > 0) {
    return charmRound(parseFloat(productInfo.priceOverride));
  }
  const cog = parseFloat(productInfo.originalPrice) || 0;
  if (cog <= 0) return 0;
  const sourceCurrency = String(productInfo.currency || 'EUR').toUpperCase();
  const markup = PRICE_MARKUP[market] || 3.0;
  let base = cog * markup;
  if (EU_MARKETS.indexOf(market) !== -1 && !priceSourceIsEU(productInfo)) {
    base += cog * EU_IMPORT_TAX;
  }
  const inGbp = base * (PRICE_TO_GBP[sourceCurrency] || PRICE_TO_GBP.EUR);
  const amount = inGbp * (PRICE_GBP_TO[targetCurrency] || 1);
  return charmRound(amount);
}

// ============================================================================
//  NIEUW: VOORRAAD- EN TRACKINGCONFIG PER MARKT
//  Hierdoor komen producten niet meer binnen met tracked:false en voorraad 0.
// ============================================================================
const INVENTORY_CONFIG = {
  polen:     { tracked: true,  policy: 'continue', min: 234, max: 460 },
  italie:    { tracked: true,  policy: 'deny',     min: 150, max: 400 },
  nederland: { tracked: true,  policy: 'deny',     min: 150, max: 400 },
  usa:       { tracked: true,  policy: 'continue', min: 9,   max: 9   },
  uk:        { tracked: false, policy: 'deny',     min: 0,   max: 0   }
};
function inventoryFor(market) {
  return INVENTORY_CONFIG[String(market || 'uk').toLowerCase()] || INVENTORY_CONFIG.uk;
}

// ============================================================================
//  NIEUW: SHOPIFY-TAXONOMIECATEGORIE
//  De REST products-endpoint kent 'category' niet, daarom apart via GraphQL.
// ============================================================================
const TAXONOMY_CATEGORY = {
  'polo shirt': 'aa-1-13-6', 'polo': 'aa-1-13-6',
  't-shirt': 'aa-1-13-8', 'shirt': 'aa-1-13-8', 'oxford shirt': 'aa-1-13-8', 'linen shirt': 'aa-1-13-8',
  'top': 'aa-1-13-14', 'blouse': 'aa-1-13-14', 'sweatshirt': 'aa-1-13-14', 'hoodie': 'aa-1-13-14',
  'linen top': 'aa-1-13-14', 'satin blouse': 'aa-1-13-14', 'corset top': 'aa-1-13-14', 'halter top': 'aa-1-13-14',
  'cardigan': 'aa-1-10-6', 'sweater': 'aa-1-10-6', 'jumper': 'aa-1-10-6',
  'jacket': 'aa-1-10-2', 'coat': 'aa-1-10-2', 'trench coat': 'aa-1-10-2', 'blazer': 'aa-1-10-2',
  'denim jacket': 'aa-1-10-2', 'quilted jacket': 'aa-1-10-2', 'bomber jacket': 'aa-1-10-2',
  'overshirt': 'aa-1-10-2', 'gilet': 'aa-1-10-2', 'overcoat': 'aa-1-10-2',
  'trousers': 'aa-1-12', 'pants': 'aa-1-12', 'jeans': 'aa-1-12', 'chinos': 'aa-1-12',
  'wide leg trousers': 'aa-1-12', 'linen trousers': 'aa-1-12', 'cargo trousers': 'aa-1-12',
  'palazzo trousers': 'aa-1-12', 'flared trousers': 'aa-1-12', 'wide leg jeans': 'aa-1-12',
  'shorts': 'aa-1-14-4', 'swim shorts': 'aa-1-14-4',
  'skirt': 'aa-1-11', 'midi skirt': 'aa-1-11', 'maxi skirt': 'aa-1-11', 'mini skirt': 'aa-1-11', 'denim skirt': 'aa-1-11',
  'dress': 'aa-1-4', 'maxi dress': 'aa-1-4', 'midi dress': 'aa-1-4', 'mini dress': 'aa-1-4',
  'shirt dress': 'aa-1-4', 'wrap dress': 'aa-1-4', 'bodycon dress': 'aa-1-4', 'denim dress': 'aa-1-4',
  'jumpsuit': 'aa-1-9', 'playsuit': 'aa-1-9',
  'co-ord set': 'aa-1-9', 'two piece set': 'aa-1-9',
  'sneakers': 'aa-8-8', 'trainers': 'aa-8-8',
  'ankle boots': 'aa-8-3', 'knee high boots': 'aa-8-3', 'cowboy boots': 'aa-8-3',
  'boots': 'aa-8-3', 'chelsea boots': 'aa-8-3',
  'loafers': 'aa-8-9', 'moccasins': 'aa-8-9', 'derby shoes': 'aa-8-9',
  'ballet flats': 'aa-8-4', 'mary jane shoes': 'aa-8-4', 'slingback flats': 'aa-8-4',
  'heels': 'aa-8-5', 'court shoes': 'aa-8-5', 'mules': 'aa-8-5',
  'sandals': 'aa-8-7', 'slides': 'aa-8-7', 'flip flops': 'aa-8-7', 'cork sandals': 'aa-8-7', 'clogs': 'aa-8-7',
  'tote bag': 'aa-6-3', 'shoulder bag': 'aa-6-3', 'crossbody bag': 'aa-6-3',
  'handbag': 'aa-6-3', 'woven bag': 'aa-6-3', 'bag': 'aa-6-3'
};
function taxonomyCategoryFor(productType) {
  return TAXONOMY_CATEGORY[String(productType || '').toLowerCase().trim()] || null;
}

// ============================================================================
//  NIEUW: VALIDATIE-VERZAMELAAR
//  Alles wat niet te bepalen is komt hier terecht; het product wordt dan
//  NIET aangemaakt maar teruggegeven als flag, in plaats van vervuild
//  in Shopify te belanden.
// ============================================================================
function makeValidator() {
  return {
    blocks: [],
    warns: [],
    block: function (code, value, reason) {
      this.blocks.push({ code: code, value: String(value), reason: reason });
      console.error('[validate] BLOK ' + code + ': "' + value + '" - ' + reason);
    },
    warn: function (code, value, reason) {
      this.warns.push({ code: code, value: String(value), reason: reason });
      console.warn('[validate] LET OP ' + code + ': "' + value + '" - ' + reason);
    }
  };
}

const sizeMap = {
  'XS': 'XS (UK6)', 'S': 'S (UK8)', 'M': 'M (UK10)',
  'L': 'L (UK12)', 'XL': 'XL (UK14)', 'XXL': 'XXL (UK16)',
  '2XL': 'XXL (UK16)', '3XL': 'XXXL (UK18)',
  '34': 'XS (UK6)', '36': 'S (UK8)', '38': 'M (UK10)',
  '40': 'L (UK12)', '42': 'XL (UK14)', '44': 'XXL (UK16)'
};
const caSizeMap = {
  'XS': 'XS (US 2)', 'S': 'S (US 4)', 'M': 'M (US 6)',
  'L': 'L (US 8)', 'XL': 'XL (US 10)', 'XXL': 'XXL (US 12)',
  '2XL': 'XXL (US 12)', '3XL': 'XXXL (US 14)', 'XXXL': 'XXXL (US 14)',
  '34': 'XS (US 2)', '36': 'S (US 4)', '38': 'M (US 6)',
  '40': 'L (US 8)', '42': 'XL (US 10)', '44': 'XXL (US 12)'
};
const itSizeMap = {
  'XS': 'XS (IT 38)', 'S': 'S (IT 40)', 'M': 'M (IT 42)',
  'L': 'L (IT 44)', 'XL': 'XL (IT 46)', 'XXL': 'XXL (IT 48)',
  '2XL': 'XXL (IT 48)', '3XL': 'XXXL (IT 50)', 'XXXL': 'XXXL (IT 50)',
  '34': 'XS (IT 38)', '36': 'S (IT 40)', '38': 'M (IT 42)',
  '40': 'L (IT 44)', '42': 'XL (IT 46)', '44': 'XXL (IT 48)'
};
const nlSizeMap = {
  'XS': 'XS (EU 34)', 'S': 'S (EU 36)', 'M': 'M (EU 38)',
  'L': 'L (EU 40)', 'XL': 'XL (EU 42)', 'XXL': 'XXL (EU 44)',
  '2XL': 'XXL (EU 44)', '3XL': 'XXXL (EU 46)', 'XXXL': 'XXXL (EU 46)',
  '34': 'XS (EU 34)', '36': 'S (EU 36)', '38': 'M (EU 38)',
  '40': 'L (EU 40)', '42': 'XL (EU 42)', '44': 'XXL (EU 44)'
};
const shoeSizeMap = {
  '2': '35', '2.5': '35', '3': '36', '3.5': '36',
  '4': '37', '4.5': '37', '5': '38', '5.5': '38',
  '6': '39', '6.5': '39', '7': '40', '7.5': '40',
  '8': '41', '8.5': '41', '9': '42'
};

function isFootwearType(type) {
  var t = String(type || '').toLowerCase();
  return /espadrille|slingback|kitten|heel|stiletto|pump|sandal|ballet|ballerina|loafer|moccasin|sneaker|trainer|boot|mule|wedge|brogue|oxford shoe|derby|slipper|flat|clog|flip|shoe|footwear|schoen|laars|sandaal|hak|pantoffel|instapper|sleehak/.test(t);
}
function isOneSizeType(type) {
  var t = String(type || '').toLowerCase();
  return /\bbag\b|\btas\b|tote|clutch|backpack|rugzak|handbag|handtas|schoudertas|crossbody|torebka|torba|jewell|jewel|necklace|earring|bracelet|sieraad|ketting|scarf|sjaal|\bhat\b|\bcap\b|\bpet\b|muts|\bbelt\b|\briem\b|sunglass|zonnebril/.test(t);
}

// ── FIX: 5XL/6XL werden niet als maat herkend en belandden in de kleur-as ──
function looksLikeSize(token) {
  var t = String(token || '').toLowerCase().trim();
  if (!t) return false;
  if (/^(xxs|xs|s|m|l|xl|xxl|xxxl|xxxxl|[2-9]xl)$/.test(t)) return true;
  if (/^(one ?size|taglia unica|uniwersalny|jeden rozmiar|einheitsgr)/.test(t)) return true;
  if (/^(eu|uk|us|it)\s*\d{1,2}([.,]5)?$/.test(t)) return true;
  if (/^\d{2}([.,]5)?$/.test(t)) { var n = parseFloat(t.replace(',', '.')); if (n >= 30 && n <= 50) return true; }
  return false;
}
function looksLikeShoeSize(token) {
  var t = String(token || '').toLowerCase().trim();
  if (/^(eu|uk|us)\s*\d{1,2}([.,]5)?$/.test(t)) return true;
  if (/^\d{2}([.,]5)?$/.test(t)) { var n = parseFloat(t.replace(',', '.')); return n >= 33 && n <= 48; }
  return false;
}

function veganLeather(s) {
  return String(s == null ? '' : s).replace(/faux[\s-]*leather/gi, 'Vegan Leather');
}
function italianLeather(s) {
  return String(s == null ? '' : s).replace(/vegan[\s-]*leather|faux[\s-]*leather|ecopelle/gi, 'Ecopelle');
}

function inferTypeFromText(text) {
  var t = String(text || '').toLowerCase();
  if (/tote|shopper/.test(t)) return 'Tote Bag';
  if (/crossbody|cross-body/.test(t)) return 'Crossbody Bag';
  if (/handbag|handtas/.test(t)) return 'Handbag';
  if (/shoulder bag|schoudertas/.test(t)) return 'Shoulder Bag';
  if (/\bbag\b|\btas\b|torebka|torba/.test(t)) return 'Bag';
  if (/loafer|mocassin|moccasin|mokasyn/.test(t)) return 'Loafers';
  if (/ballet|ballerina|baleriny/.test(t)) return 'Ballet Flats';
  if (/slingback/.test(t)) return 'Slingback Flats';
  if (/clog|klomp/.test(t)) return 'Clogs';
  if (/flip.?flop|teenslipper/.test(t)) return 'Flip Flops';
  if (/slide|slipper|klapki/.test(t)) return 'Slides';
  if (/sandal|sandaal|sandały/.test(t)) return 'Sandals';
  if (/pump|court shoe|czółenka/.test(t)) return 'Heels';
  if (/mule|muiltje/.test(t)) return 'Mules';
  if (/heel|\bhak\b|stiletto|sleehak/.test(t)) return 'Heels';
  if (/ankle boot|enkellaars|botki/.test(t)) return 'Ankle Boots';
  if (/knee.?high|kniehoog|kozaki/.test(t)) return 'Knee High Boots';
  if (/cowboy|western/.test(t)) return 'Cowboy Boots';
  if (/boot|laars/.test(t)) return 'Ankle Boots';
  if (/sneaker|trainer/.test(t)) return 'Sneakers';
  if (/polo/.test(t)) return 'Polo Shirt';
  if (/short|szort|pantaloncini/.test(t)) return 'Shorts';
  if (/cargo/.test(t)) return 'Cargo Trousers';
  if (/wide.?leg|palazzo|wijde broek|luchtige broek|szerokie nogawki/.test(t)) return 'Wide Leg Trousers';
  if (/linen (trouser|pant)|linnen broek/.test(t)) return 'Linen Trousers';
  if (/jeans|denim broek/.test(t)) return 'Jeans';
  if (/trouser|broek|pants|spodnie/.test(t)) return 'Trousers';
  if (/denim skirt|jeans ?rok|spódnica jeansowa/.test(t)) return 'Denim Skirt';
  if (/midi skirt|midi ?rok/.test(t)) return 'Midi Skirt';
  if (/maxi skirt|maxi ?rok/.test(t)) return 'Maxi Skirt';
  if (/skirt|\brok\b|spódnica/.test(t)) return 'Skirt';
  if (/cardigan|kardigan|vest\b|sweter/.test(t)) return 'Cardigan';
  if (/blouse|bluzka/.test(t)) return 'Blouse';
  if (/\btop\b/.test(t)) return 'Top';
  if (/jumpsuit|kombinezon/.test(t)) return 'Jumpsuit';
  if (/playsuit|romper/.test(t)) return 'Playsuit';
  if (/blazer|marynarka/.test(t)) return 'Blazer';
  if (/trench/.test(t)) return 'Trench Coat';
  if (/bomber|bomberka/.test(t)) return 'Bomber Jacket';
  if (/jacket|\bjas\b|kurtka/.test(t)) return 'Jacket';
  if (/coat|płaszcz/.test(t)) return 'Coat';
  if (/co-?ord|two.?piece|komplet|\bset\b/.test(t)) return 'Co-ord Set';
  if (/maxi dress|maxi jurk/.test(t)) return 'Maxi Dress';
  if (/midi dress|midi jurk/.test(t)) return 'Midi Dress';
  if (/mini dress|mini jurk/.test(t)) return 'Mini Dress';
  if (/dress|jurk|sukienka/.test(t)) return 'Dress';
  return 'Dress';
}

// ── FIX: mainCategoryFor kreeg geen gender mee. Daardoor kreeg een HERENpolo
//    de tag "Camicette" (dames-blousjes). Nu gender-bewust. ──
function mainCategoryFor(productType, lang, gender) {
  var t = String(productType || '').toLowerCase();
  var pl = lang === 'polish';
  var it = lang === 'italian';
  var nl = lang === 'dutch';
  var men = gender === 'men';
  function pick(en, plv, itv, nlv) { return nl ? nlv : (it ? itv : (pl ? plv : en)); }
  if (/dress|jurk|sukienka/.test(t)) return pick('Dresses', 'Sukienki', 'Vestiti', 'Jurken');
  if (/skirt|\brok\b|spódnica/.test(t)) return pick('Bottoms', 'Spódnice', 'Gonne', 'Rokken');
  if (/short|szort|pantaloncini/.test(t)) return pick('Shorts', 'Szorty', 'Pantaloncini', 'Shorts');
  if (/trouser|jeans|pants|broek|spodnie|cargo|palazzo|legging|chino/.test(t)) return pick('Bottoms', 'Spodnie', 'Pantaloni', 'Broeken');
  if (/cardigan|kardigan|sweater|jumper|sweter/.test(t)) return pick('Knitwear', 'Swetry', 'Maglieria', 'Truien');
  if (/jacket|coat|blazer|trench|\bjas\b|kurtka|płaszcz|okrycie|bomber|gilet|overshirt/.test(t)) return pick('Outerwear', 'Okrycia', 'Giacche', 'Jassen');
  if (/polo/.test(t)) return pick('Polos', 'Koszulki Polo', 'Polo', 'Polos');
  if (/top|blouse|shirt|bluzka|sweatshirt|hoodie/.test(t)) {
    return men ? pick('Tops', 'Koszulki', 'Camicie', 'Tops')
               : pick('Tops', 'Bluzki', 'Camicette', 'Tops');
  }
  if (/bag|\btas\b|tote|clutch|backpack|handbag|handtas|schoudertas|crossbody|torebka|torba/.test(t)) return pick('Bags', 'Torebki', 'Borse', 'Tassen');
  if (/loafer|flat|ballet|slingback|sandal|slide|heel|pump|mule|clog|boot|sneaker|shoe|laars|schoen|\bhak\b|botki|kozaki|mokasyn|baleriny|derby/.test(t)) return pick('Shoes', 'Buty', 'Scarpe', 'Schoenen');
  if (/jumpsuit|playsuit|romper|kombinezon/.test(t)) return pick('Jumpsuits', 'Kombinezony', 'Tute', 'Jumpsuits');
  if (/co-?ord|two.?piece|komplet|\bset\b/.test(t)) return pick('Co-ords', 'Komplety', 'Coordinati', 'Setjes');
  return null;
}

function mapSizeLabel(s, lang, isFootwear, market, gender) {
  market = (market || 'uk').toLowerCase();
  var key = String(s).toUpperCase().trim();
  var base = key.replace(/\s*\([^)]*\)\s*$/, '').trim();
  var euInLabel = key.match(/EU\s*([\d.]+)/);
  var shoeKey = base.replace(/^UK\s*/, '').replace(/^US\s*/, '').replace(/^EU\s*/, '').replace(/^IT\s*/, '').replace(',', '.').replace(/\.0$/, '').trim();
  var num = parseFloat(shoeKey);
  if (isFootwear) {
    var eu = null, uk = null;
    if (euInLabel) eu = Math.round(parseFloat(euInLabel[1]));
    if (/^UK/.test(base) && !isNaN(num)) uk = num;
    else if (/^US/.test(base) && !isNaN(num)) uk = num - 2;
    else if (!isNaN(num) && num < 30) uk = num;
    else if (!isNaN(num) && num >= 30 && eu === null) eu = Math.round(num);
    if (uk !== null && eu === null) eu = shoeSizeMap[String(uk)] ? parseInt(shoeSizeMap[String(uk)], 10) : (Math.round(uk) + 33);
    if (eu !== null && uk === null) uk = eu - 33;
    if (eu === null && uk === null) return s;
    if (lang === 'polish' || market === 'polen') return 'EU ' + eu;
    if (lang === 'italian' || market === 'italie') return 'EU ' + eu;
    if (lang === 'dutch' || market === 'nederland') return 'EU ' + eu;
    if (market === 'canada' || market === 'usa') return 'US ' + (eu - 31) + ' (EU ' + eu + ')';
    return 'UK ' + uk + ' (EU ' + eu + ')';
  }
  if (gender === 'men') return String(s).replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (lang === 'polish' || market === 'polen') return String(s).replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (lang === 'italian' || market === 'italie') return itSizeMap[base] || s;
  if (lang === 'dutch' || market === 'nederland') return nlSizeMap[base] || s;
  var cmap = (market === 'canada' || market === 'usa') ? caSizeMap : sizeMap;
  return cmap[base] || s;
}

const colorMap = {
  'noir': 'Black', 'blanc': 'White', 'rouge': 'Red', 'bleu': 'Blue',
  'vert': 'Green', 'rose': 'Pink', 'beige': 'Beige', 'creme': 'Cream',
  'gris': 'Grey', 'marron': 'Brown', 'orange': 'Orange', 'violet': 'Purple',
  'jaune': 'Yellow', 'marine': 'Navy', 'bordeaux': 'Burgundy',
  'rouge fonce': 'Dark Red', 'khaki': 'Khaki', 'lila': 'Lilac',
  'zwart': 'Black', 'wit': 'White', 'blauw': 'Blue', 'groen': 'Green',
  'roze': 'Pink', 'grijs': 'Grey', 'bruin': 'Brown', 'geel': 'Yellow',
  'rood': 'Red', 'paars': 'Purple', 'negro': 'Black', 'blanco': 'White',
  'rojo': 'Red', 'azul': 'Blue', 'verde': 'Green', 'rosa': 'Pink',
  'amarillo': 'Yellow', 'black': 'Black', 'white': 'White', 'red': 'Red',
  'blue': 'Blue', 'green': 'Green', 'pink': 'Pink', 'grey': 'Grey',
  'brown': 'Brown', 'purple': 'Purple', 'yellow': 'Yellow', 'navy': 'Navy',
  'burgundy': 'Burgundy', 'lilac': 'Lilac', 'cream': 'Cream',
  'dark red': 'Dark Red', 'camel': 'Camel', 'tan': 'Tan', 'coral': 'Coral',
  'mint': 'Mint', 'olive': 'Olive', 'gold': 'Gold', 'silver': 'Silver',
  'teal': 'Teal', 'mustard': 'Mustard', 'rust': 'Rust',
  'aqua': 'Aqua', 'aqua green': 'Aqua Green', 'mint green': 'Mint Green',
  'royal blue': 'Royal Blue', 'sky blue': 'Sky Blue', 'light blue': 'Light Blue',
  'dark blue': 'Dark Blue', 'dark green': 'Dark Green', 'light green': 'Light Green',
  'bronze': 'Bronze', 'turquoise': 'Turquoise', 'ivory': 'Ivory', 'nude': 'Nude',
  'lavender': 'Lavender', 'peach': 'Peach', 'wine': 'Wine', 'emerald': 'Emerald',
  'cobalt': 'Cobalt', 'fuchsia': 'Fuchsia', 'magenta': 'Magenta', 'apricot': 'Apricot',
  'charcoal': 'Charcoal', 'sand': 'Sand', 'maroon': 'Maroon', 'off white': 'Off White',
  'forest green': 'Forest Green', 'caramel': 'Caramel', 'salmon': 'Salmon',
  'stone': 'Stone', 'taupe': 'Taupe', 'mauve': 'Mauve', 'blush': 'Blush',
  'plum': 'Plum', 'sage': 'Sage', 'denim': 'Denim', 'army green': 'Army Green',
  'schwarz': 'Black', 'weiss': 'White', 'weiß': 'White', 'rot': 'Red',
  'blau': 'Blue', 'grün': 'Green', 'gruen': 'Green', 'gelb': 'Yellow',
  'grau': 'Grey', 'braun': 'Brown', 'türkis': 'Turquoise', 'tuerkis': 'Turquoise',
  'silber': 'Silver', 'hellblau': 'Light Blue', 'dunkelblau': 'Navy',
  'hellbraun': 'Light Brown', 'dunkelbraun': 'Dark Brown', 'hellgrün': 'Light Green',
  'dunkelgrün': 'Dark Green', 'hellgrau': 'Light Grey', 'dunkelgrau': 'Dark Grey',
  'karamell': 'Caramel', 'karamellbraun': 'Caramel', 'marineblau': 'Navy',
  'weinrot': 'Burgundy', 'bordeauxrot': 'Burgundy', 'oliv': 'Olive', 'olivgrün': 'Olive',
  'navy blauw': 'Navy', 'bordeaux rood': 'Burgundy', 'bordeauxrood': 'Burgundy',
  'wijnrood': 'Burgundy', 'olijf groen': 'Olive', 'olijfgroen': 'Olive',
  'licht bruin': 'Light Brown', 'lichtbruin': 'Light Brown', 'donker bruin': 'Dark Brown',
  'donkerbruin': 'Dark Brown', 'licht blauw': 'Light Blue', 'lichtblauw': 'Light Blue',
  'donker blauw': 'Navy', 'donkerblauw': 'Navy', 'hemelsblauw': 'Sky Blue',
  'legergroen': 'Army Green', 'limoengroen': 'Lime Green', 'bourgondië': 'Burgundy',
  'bourgondie': 'Burgundy', 'oranje': 'Orange', 'lichtgroen': 'Light Green',
  'donkergroen': 'Dark Green', 'lichtgrijs': 'Light Grey', 'donkergrijs': 'Dark Grey',
  'antraciet': 'Charcoal', 'zalm': 'Salmon', 'mosterd': 'Mustard', 'koraal': 'Coral',
  'lavendel': 'Lavender', 'turkoois': 'Turquoise', 'goud': 'Gold', 'zilver': 'Silver',
  'kaki': 'Khaki',
  // ── Pools als BRONtaal (klaramody e.d. leveren Poolse kleurnamen aan) ──
  'czarny': 'Black', 'biały': 'White', 'bialy': 'White', 'biel': 'White',
  'szary': 'Grey', 'beżowy': 'Beige', 'bezowy': 'Beige', 'brązowy': 'Brown',
  'brazowy': 'Brown', 'czerwony': 'Red', 'różowy': 'Pink', 'rozowy': 'Pink',
  'róż': 'Pink', 'roz': 'Pink', 'róża': 'Pink', 'roza': 'Pink',
  'fioletowy': 'Purple', 'pomarańczowy': 'Orange', 'pomaranczowy': 'Orange',
  'żółty': 'Yellow', 'zolty': 'Yellow', 'niebieski': 'Blue', 'błękitny': 'Sky Blue',
  'blekitny': 'Sky Blue', 'granatowy': 'Navy', 'morski': 'Teal', 'zielony': 'Green',
  'jasnozielony': 'Light Green', 'ciemnozielony': 'Dark Green', 'oliwkowy': 'Olive',
  'bordowy': 'Burgundy', 'liliowy': 'Lilac', 'kremowy': 'Cream', 'złoty': 'Gold',
  'zloty': 'Gold', 'srebrny': 'Silver', 'miętowy': 'Mint', 'mietowy': 'Mint',
  'morelowy': 'Apricot', 'morela': 'Apricot', 'jasnoróżowy': 'Light Pink',
  'jasnorozowy': 'Light Pink', 'ciemnoróżowy': 'Dark Pink', 'ciemnorozowy': 'Dark Pink',
  'ciemnoniebieski': 'Navy', 'jasnoniebieski': 'Light Blue', 'zielony wojskowy': 'Army Green',
  'khaki wojskowy': 'Army Green', 'grafitowy': 'Charcoal', 'jasnoszary': 'Light Grey',
  // ── Italiaans als BRONtaal ──
  'nero': 'Black', 'bianco': 'White', 'grigio': 'Grey', 'marrone': 'Brown',
  'rosso': 'Red', 'blu': 'Blue', 'azzurro': 'Light Blue', 'celeste': 'Sky Blue',
  'giallo': 'Yellow', 'arancione': 'Orange', 'viola': 'Purple', 'cachi': 'Khaki',
  'oliva': 'Olive', 'senape': 'Mustard', 'panna': 'Cream', 'avorio': 'Ivory',
  'tortora': 'Taupe', 'blu navy': 'Navy', 'verde militare': 'Army Green'
};

const polishColorMap = {
  'black': 'Czarny', 'white': 'Biały', 'red': 'Czerwony', 'blue': 'Niebieski',
  'green': 'Zielony', 'pink': 'Różowy', 'beige': 'Beżowy', 'cream': 'Kremowy',
  'grey': 'Szary', 'gray': 'Szary', 'brown': 'Brązowy', 'orange': 'Pomarańczowy',
  'purple': 'Fioletowy', 'yellow': 'Żółty', 'navy': 'Granatowy', 'burgundy': 'Bordowy',
  'dark red': 'Ciemnoczerwony', 'khaki': 'Khaki', 'lilac': 'Liliowy', 'camel': 'Camelowy',
  'tan': 'Jasnobrązowy', 'coral': 'Koralowy', 'mint': 'Miętowy', 'olive': 'Oliwkowy',
  'gold': 'Złoty', 'silver': 'Srebrny', 'teal': 'Morski', 'mustard': 'Musztardowy',
  'rust': 'Rdzawy', 'ivory': 'Kość słoniowa', 'nude': 'Cielisty', 'turquoise': 'Turkusowy',
  'aqua': 'Morski', 'aqua green': 'Morski', 'mint green': 'Miętowy', 'maroon': 'Bordowy',
  'charcoal': 'Grafitowy', 'sand': 'Piaskowy', 'lavender': 'Lawendowy', 'peach': 'Brzoskwiniowy',
  'wine': 'Bordowy', 'emerald': 'Szmaragdowy', 'cobalt': 'Kobaltowy', 'royal blue': 'Kobaltowy',
  'sky blue': 'Błękitny', 'light blue': 'Błękitny', 'dark blue': 'Granatowy',
  'dark green': 'Ciemnozielony', 'forest green': 'Ciemnozielony', 'light green': 'Jasnozielony',
  'bronze': 'Brązowy', 'fuchsia': 'Fuksja', 'magenta': 'Magenta', 'apricot': 'Morelowy',
  'off white': 'Złamana Biel', 'dark grey': 'Grafitowy', 'light grey': 'Jasnoszary',
  'caramel': 'Karmelowy', 'salmon': 'Łososiowy', 'light brown': 'Jasnobrązowy',
  'dark brown': 'Ciemnobrązowy', 'lime green': 'Limonkowy', 'army green': 'Khaki',
  'light pink': 'Jasnoróżowy', 'dark pink': 'Ciemnoróżowy', 'taupe': 'Taupe',
  'stone': 'Kamienny', 'mauve': 'Wrzosowy', 'blush': 'Pudrowy', 'plum': 'Śliwkowy',
  'sage': 'Szałwiowy', 'denim': 'Jeansowy', 'dark pink': 'Ciemnoróżowy'
};

const italianColorMap = {
  'black': 'Nero', 'white': 'Bianco', 'red': 'Rosso', 'blue': 'Blu',
  'green': 'Verde', 'pink': 'Rosa', 'beige': 'Beige', 'cream': 'Crema',
  'grey': 'Grigio', 'gray': 'Grigio', 'brown': 'Marrone', 'orange': 'Arancione',
  'purple': 'Viola', 'yellow': 'Giallo', 'navy': 'Blu navy', 'burgundy': 'Bordeaux',
  'dark red': 'Rosso scuro', 'khaki': 'Cachi', 'lilac': 'Lilla', 'camel': 'Cammello',
  'tan': 'Cuoio', 'coral': 'Corallo', 'mint': 'Menta', 'olive': 'Oliva',
  'gold': 'Oro', 'silver': 'Argento', 'teal': 'Petrolio', 'mustard': 'Senape',
  'rust': 'Ruggine', 'ivory': 'Avorio', 'nude': 'Nudo', 'turquoise': 'Turchese',
  'aqua': 'Acqua', 'aqua green': 'Acqua', 'mint green': 'Menta', 'maroon': 'Bordeaux',
  'charcoal': 'Antracite', 'sand': 'Sabbia', 'lavender': 'Lavanda', 'peach': 'Pesca',
  'wine': 'Bordeaux', 'emerald': 'Smeraldo', 'cobalt': 'Cobalto', 'royal blue': 'Blu royal',
  'sky blue': 'Celeste', 'light blue': 'Azzurro', 'dark blue': 'Blu navy',
  'dark green': 'Verde scuro', 'forest green': 'Verde scuro', 'light green': 'Verde chiaro',
  'bronze': 'Bronzo', 'fuchsia': 'Fucsia', 'magenta': 'Magenta', 'apricot': 'Albicocca',
  'off white': 'Bianco panna', 'dark grey': 'Grigio scuro', 'light grey': 'Grigio chiaro',
  'caramel': 'Caramello', 'salmon': 'Salmone', 'light brown': 'Marrone chiaro',
  'dark brown': 'Marrone scuro', 'lime green': 'Verde lime', 'army green': 'Verde militare',
  'stone': 'Pietra', 'taupe': 'Tortora', 'mauve': 'Malva', 'blush': 'Cipria',
  'plum': 'Prugna', 'sage': 'Salvia', 'denim': 'Denim',
  'light pink': 'Rosa chiaro', 'dark pink': 'Rosa scuro'
};

const dutchColorMap = {
  'black': 'Zwart', 'white': 'Wit', 'red': 'Rood', 'blue': 'Blauw',
  'green': 'Groen', 'pink': 'Roze', 'beige': 'Beige', 'cream': 'Crème',
  'grey': 'Grijs', 'gray': 'Grijs', 'brown': 'Bruin', 'orange': 'Oranje',
  'purple': 'Paars', 'yellow': 'Geel', 'navy': 'Marineblauw', 'burgundy': 'Bordeaux',
  'dark red': 'Donkerrood', 'khaki': 'Kaki', 'lilac': 'Lila', 'camel': 'Camel',
  'tan': 'Zandbruin', 'coral': 'Koraal', 'mint': 'Mint', 'olive': 'Olijfgroen',
  'gold': 'Goud', 'silver': 'Zilver', 'teal': 'Petrol', 'mustard': 'Mosterd',
  'rust': 'Roest', 'ivory': 'Ivoor', 'nude': 'Nude', 'turquoise': 'Turquoise',
  'aqua': 'Aqua', 'aqua green': 'Aqua', 'mint green': 'Mint', 'maroon': 'Bordeaux',
  'charcoal': 'Antraciet', 'sand': 'Zandkleurig', 'lavender': 'Lavendel', 'peach': 'Perzik',
  'wine': 'Wijnrood', 'emerald': 'Smaragdgroen', 'cobalt': 'Kobaltblauw', 'royal blue': 'Koningsblauw',
  'sky blue': 'Hemelsblauw', 'light blue': 'Lichtblauw', 'dark blue': 'Donkerblauw',
  'dark green': 'Donkergroen', 'forest green': 'Donkergroen', 'light green': 'Lichtgroen',
  'bronze': 'Brons', 'fuchsia': 'Fuchsia', 'magenta': 'Magenta', 'apricot': 'Abrikoos',
  'off white': 'Gebroken wit', 'dark grey': 'Donkergrijs', 'light grey': 'Lichtgrijs',
  'caramel': 'Karamel', 'salmon': 'Zalmroze', 'light brown': 'Lichtbruin',
  'dark brown': 'Donkerbruin', 'lime green': 'Limoengroen', 'army green': 'Legergroen',
  'stone': 'Steengrijs', 'taupe': 'Taupe', 'mauve': 'Mauve', 'blush': 'Blush',
  'plum': 'Pruim', 'sage': 'Saliegroen', 'denim': 'Denim',
  'light pink': 'Lichtroze', 'dark pink': 'Donkerroze'
};

const polishTypeMap = {
  'Dress': 'Sukienka', 'Maxi Dress': 'Sukienka Maxi', 'Mini Dress': 'Sukienka Mini',
  'Midi Dress': 'Sukienka Midi', 'Bodycon Dress': 'Sukienka Dopasowana',
  'Wrap Dress': 'Sukienka Kopertowa', 'Shirt Dress': 'Sukienka Koszulowa',
  'Denim Dress': 'Sukienka Jeansowa', 'Skirt': 'Spódnica', 'Midi Skirt': 'Spódnica Midi',
  'Maxi Skirt': 'Spódnica Maxi', 'Mini Skirt': 'Spódnica Mini', 'Denim Skirt': 'Spódnica Jeansowa',
  'Blouse': 'Bluzka', 'Top': 'Top', 'Jacket': 'Kurtka', 'Blazer': 'Marynarka',
  'Coat': 'Płaszcz', 'Trench Coat': 'Trencz', 'Denim Jacket': 'Kurtka Jeansowa',
  'Bomber Jacket': 'Bomberka', 'Quilted Jacket': 'Kurtka Pikowana',
  'Jumpsuit': 'Kombinezon', 'Playsuit': 'Kombinezon', 'Trousers': 'Spodnie', 'Pants': 'Spodnie',
  'Wide Leg Trousers': 'Spodnie Szerokie', 'Linen Trousers': 'Spodnie Lniane',
  'Cargo Trousers': 'Spodnie Cargo', 'Palazzo Trousers': 'Spodnie Palazzo',
  'Flared Trousers': 'Spodnie Dzwony', 'Jeans': 'Jeansy', 'Wide Leg Jeans': 'Szerokie Jeansy',
  'Shorts': 'Szorty', 'Polo Shirt': 'Koszulka Polo', 'T-Shirt': 'Koszulka', 'Shirt': 'Koszula',
  'Cardigan': 'Kardigan', 'Sweater': 'Sweter', 'Co-ord Set': 'Komplet',
  'Two Piece Set': 'Komplet', 'Tote Bag': 'Torba Shopper', 'Shoulder Bag': 'Torba na Ramię',
  'Crossbody Bag': 'Torebka Crossbody', 'Handbag': 'Torebka', 'Woven Bag': 'Torebka Pleciona',
  'Bag': 'Torebka', 'Loafers': 'Mokasyny', 'Ballet Flats': 'Baleriny',
  'Mary Jane Shoes': 'Buty Mary Jane', 'Slingback Flats': 'Baleriny Slingback',
  'Sandals': 'Sandały', 'Slides': 'Klapki', 'Flip Flops': 'Japonki', 'Cork Sandals': 'Sandały Korkowe',
  'Heels': 'Czółenka', 'Court Shoes': 'Czółenka', 'Mules': 'Klapki na Obcasie',
  'Clogs': 'Chodaki', 'Ankle Boots': 'Botki', 'Knee High Boots': 'Kozaki',
  'Cowboy Boots': 'Kowbojki', 'Boots': 'Kozaki', 'Sneakers': 'Sneakersy'
};

const italianTypeMap = {
  'Dress': 'Vestito', 'Maxi Dress': 'Vestito Lungo', 'Mini Dress': 'Vestito Corto',
  'Midi Dress': 'Vestito Midi', 'Bodycon Dress': 'Vestito Aderente',
  'Wrap Dress': 'Vestito a Portafoglio', 'Shirt Dress': 'Vestito Chemisier',
  'Denim Dress': 'Vestito di Jeans', 'Skirt': 'Gonna', 'Midi Skirt': 'Gonna Midi',
  'Maxi Skirt': 'Gonna Lunga', 'Mini Skirt': 'Minigonna', 'Denim Skirt': 'Gonna di Jeans',
  'Blouse': 'Camicetta', 'Top': 'Top', 'Jacket': 'Giacca', 'Blazer': 'Blazer',
  'Coat': 'Cappotto', 'Trench Coat': 'Trench', 'Denim Jacket': 'Giacca di Jeans',
  'Bomber Jacket': 'Bomber', 'Quilted Jacket': 'Giacca Trapuntata',
  'Jumpsuit': 'Tuta', 'Playsuit': 'Tuta Corta', 'Trousers': 'Pantaloni', 'Pants': 'Pantaloni',
  'Wide Leg Trousers': 'Pantaloni a Gamba Larga', 'Linen Trousers': 'Pantaloni di Lino',
  'Cargo Trousers': 'Pantaloni Cargo', 'Palazzo Trousers': 'Pantaloni Palazzo',
  'Flared Trousers': 'Pantaloni a Zampa', 'Jeans': 'Jeans', 'Wide Leg Jeans': 'Jeans a Gamba Larga',
  'Shorts': 'Pantaloncini', 'Swim Shorts': 'Costume da Bagno',
  'Polo Shirt': 'Polo', 'T-Shirt': 'T-Shirt', 'Shirt': 'Camicia', 'Oxford Shirt': 'Camicia Oxford',
  'Linen Shirt': 'Camicia di Lino', 'Overshirt': 'Overshirt', 'Chinos': 'Chino',
  'Cardigan': 'Cardigan', 'Sweater': 'Maglione', 'Co-ord Set': 'Coordinato',
  'Two Piece Set': 'Completo Due Pezzi', 'Tote Bag': 'Borsa Shopper', 'Shoulder Bag': 'Borsa a Spalla',
  'Crossbody Bag': 'Borsa a Tracolla', 'Handbag': 'Borsa', 'Woven Bag': 'Borsa Intrecciata',
  'Bag': 'Borsa', 'Loafers': 'Mocassini', 'Ballet Flats': 'Ballerine',
  'Mary Jane Shoes': 'Scarpe Mary Jane', 'Slingback Flats': 'Ballerine Slingback',
  'Sandals': 'Sandali', 'Slides': 'Ciabatte', 'Flip Flops': 'Infradito', 'Cork Sandals': 'Sandali in Sughero',
  'Heels': 'Décolleté', 'Court Shoes': 'Décolleté', 'Mules': 'Mules',
  'Clogs': 'Zoccoli', 'Ankle Boots': 'Stivaletti', 'Knee High Boots': 'Stivali Alti',
  'Cowboy Boots': 'Stivali Texani', 'Boots': 'Stivali', 'Sneakers': 'Sneakers',
  'Chelsea Boots': 'Stivaletti Chelsea', 'Derby Shoes': 'Scarpe Derby'
};

const dutchTypeMap = {
  'Dress': 'Jurk', 'Maxi Dress': 'Maxi-jurk', 'Mini Dress': 'Mini-jurk',
  'Midi Dress': 'Midi-jurk', 'Bodycon Dress': 'Bodycon-jurk',
  'Wrap Dress': 'Overslagjurk', 'Shirt Dress': 'Blousejurk',
  'Denim Dress': 'Spijkerjurk', 'Skirt': 'Rok', 'Midi Skirt': 'Midi-rok',
  'Maxi Skirt': 'Maxi-rok', 'Mini Skirt': 'Mini-rok', 'Denim Skirt': 'Spijkerrok',
  'Blouse': 'Blouse', 'Top': 'Top', 'Jacket': 'Jas', 'Blazer': 'Blazer',
  'Coat': 'Mantel', 'Trench Coat': 'Trenchcoat', 'Denim Jacket': 'Spijkerjas',
  'Bomber Jacket': 'Bomberjack', 'Quilted Jacket': 'Gewatteerde Jas',
  'Jumpsuit': 'Jumpsuit', 'Playsuit': 'Playsuit', 'Trousers': 'Broek', 'Pants': 'Broek',
  'Wide Leg Trousers': 'Wijde Broek', 'Linen Trousers': 'Linnen Broek',
  'Cargo Trousers': 'Cargobroek', 'Palazzo Trousers': 'Palazzobroek',
  'Flared Trousers': 'Flared Broek', 'Jeans': 'Jeans', 'Wide Leg Jeans': 'Wijde Jeans',
  'Shorts': 'Short', 'Polo Shirt': 'Polo', 'T-Shirt': 'T-shirt', 'Shirt': 'Overhemd',
  'Cardigan': 'Vest', 'Sweater': 'Trui', 'Co-ord Set': 'Setje',
  'Two Piece Set': 'Tweedelig Setje', 'Tote Bag': 'Shopper', 'Shoulder Bag': 'Schoudertas',
  'Crossbody Bag': 'Crossbodytas', 'Handbag': 'Handtas', 'Woven Bag': 'Gevlochten Tas',
  'Bag': 'Tas', 'Loafers': 'Loafers', 'Ballet Flats': 'Ballerina\'s',
  'Mary Jane Shoes': 'Mary Janes', 'Slingback Flats': 'Slingback Ballerina\'s',
  'Sandals': 'Sandalen', 'Slides': 'Slippers', 'Flip Flops': 'Teenslippers', 'Cork Sandals': 'Kurken Sandalen',
  'Heels': 'Hakken', 'Court Shoes': 'Pumps', 'Mules': 'Muiltjes',
  'Clogs': 'Klompen', 'Ankle Boots': 'Enkellaarsjes', 'Knee High Boots': 'Kniehoge Laarzen',
  'Cowboy Boots': 'Cowboylaarzen', 'Boots': 'Laarzen', 'Sneakers': 'Sneakers'
};

// ── FIX: de kleurfuncties gaven vroeger onbekende waarden gewoon terug met een
//    hoofdletter. Daardoor belandden "Stopy" (= voeten) en "Róża" als kleur in
//    Shopify. Nu geven ze null terug en wordt het product geblokkeerd. ──
function toEnglishColor(color) {
  var raw = String(color || '').toLowerCase().trim();
  if (!raw) return null;
  if (colorMap[raw]) return colorMap[raw];
  var m = raw.match(/^(licht|donker|dark|light|hell|dunkel|jasno|ciemno|chiaro|scuro)[\s-]*(.+)$/);
  if (m && colorMap[m[2]]) {
    var base = colorMap[m[2]];
    if (/^(licht|light|hell|jasno|chiaro)$/.test(m[1])) return 'Light ' + base;
    return 'Dark ' + base;
  }
  var tokens = raw.split(/[\s/\-]+/).filter(Boolean);
  for (var i = tokens.length - 1; i >= 0; i--) {
    if (colorMap[tokens[i]]) return colorMap[tokens[i]];
  }
  return null;
}

function translateColor(color, validator) {
  var en = toEnglishColor(color);
  if (en) return en;
  if (validator) validator.block('KLEUR_ONBEKEND', color, 'staat niet in colorMap');
  return null;
}
function translateColorPolish(color, validator) {
  var raw = String(color || '').toLowerCase().trim();
  if (polishColorMap[raw]) return polishColorMap[raw];
  var en = toEnglishColor(color);
  if (en && polishColorMap[en.toLowerCase()]) return polishColorMap[en.toLowerCase()];
  if (validator) validator.block('KLEUR_ONBEKEND', color, 'geen Poolse vertaling gevonden');
  return null;
}
function translateColorItalian(color, validator) {
  var raw = String(color || '').toLowerCase().trim();
  if (italianColorMap[raw]) return italianColorMap[raw];
  var en = toEnglishColor(color);
  if (en && italianColorMap[en.toLowerCase()]) return italianColorMap[en.toLowerCase()];
  if (validator) validator.block('KLEUR_ONBEKEND', color, 'geen Italiaanse vertaling gevonden');
  return null;
}
function translateColorDutch(color, validator) {
  var raw = String(color || '').toLowerCase().trim();
  if (dutchColorMap[raw]) return dutchColorMap[raw];
  var en = toEnglishColor(color);
  if (en && dutchColorMap[en.toLowerCase()]) return dutchColorMap[en.toLowerCase()];
  if (validator) validator.block('KLEUR_ONBEKEND', color, 'geen Nederlandse vertaling gevonden');
  return null;
}

// ── FIX: dubbele geslachtsaanduiding ("Polo da uomo ... da uomo") ──
function dedupeGenderSuffix(title, lang, gender) {
  var t = String(title || '').trim();
  var patterns = {
    polish:  gender === 'men' ? /\s*,?\s*dla mężczyzn\s*/gi : /\s*,?\s*dla kobiet\s*/gi,
    italian: gender === 'men' ? /\s*,?\s*da uomo\s*/gi      : /\s*,?\s*da donna\s*/gi,
    dutch:   gender === 'men' ? /\s*,?\s*voor heren\s*/gi   : /\s*,?\s*voor dames\s*/gi,
    english: gender === 'men' ? /\s*,?\s*for men\s*/gi      : /\s*,?\s*for women\s*/gi
  };
  var re = patterns[lang] || patterns.english;
  var hits = t.match(re);
  if (!hits || hits.length < 2) return t;
  var suffix = hits[hits.length - 1].trim().replace(/^,\s*/, '');
  t = t.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
  return (t + ' ' + suffix).replace(/\s{2,}/g, ' ').trim();
}

// ── NIEUW: haalt merknamen van de concurrent uit de titel ──
function stripCompetitorBrand(title, sourceUrl) {
  var t = String(title || '');
  t = t.replace(/\s*[\u2122\u00ae]\s*/g, ' ');
  var host = '';
  try { host = new URL(String(sourceUrl || '')).hostname.replace(/^www\./, '').split('.')[0]; } catch (e) {}
  if (host && host.length > 3) {
    t = t.replace(new RegExp('\\b' + host + '\\b', 'gi'), '').replace(/\s{2,}/g, ' ').trim();
  }
  return t.replace(/\s{2,}/g, ' ').trim();
}

function colorPromptDescription(color) {
  const descriptions = {
    'Black': 'deep black, NOT dark navy or charcoal',
    'White': 'clean white, NOT off-white or cream',
    'Red': 'bright red, NOT burgundy or dark red',
    'Pink': 'soft pink, NOT hot pink or magenta',
    'Blue': 'medium blue, NOT navy or light blue',
    'Navy': 'deep navy blue, NOT black or medium blue',
    'Green': 'green, NOT olive or khaki',
    'Khaki': 'warm khaki olive, NOT bright green or brown',
    'Orange': 'warm orange, NOT red-orange or yellow',
    'Yellow': 'warm yellow, NOT lime or gold',
    'Lilac': 'soft lilac purple, NOT pink or dark purple',
    'Purple': 'purple, NOT lilac or dark navy',
    'Grey': 'medium grey, NOT silver or charcoal',
    'Beige': 'warm beige, NOT white or cream',
    'Cream': 'soft cream, NOT white or beige',
    'Brown': 'warm brown, NOT dark or orange',
    'Burgundy': 'deep burgundy wine red, NOT bright red or dark brown',
    'Army Green': 'muted military olive green, NOT bright green',
    'Taupe': 'grey-brown taupe, NOT beige or grey'
  };
  return descriptions[color] || color;
}

function titleToUrlHandle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
function cleanTitle(title) {
  return title.replace(/^[^|–\-]+[|–\-]\s*/, '').trim() || title.trim();
}
function cleanTitleSafe(title) {
  try { return cleanTitle(title || ''); } catch (e) { return String(title || ''); }
}

async function generateDescription(productInfo) {
  const cleanedTitle = cleanTitle(productInfo.title);
  const storeName = productInfo.storeId === 'store2' ? 'Lorenzari' : (productInfo.storeName || 'Yamira London');
  console.log('[generateDescription] Starting for:', cleanedTitle, 'store:', storeName);

  const gender = (String(productInfo.gender || 'women').toLowerCase() === 'men') ? 'men' : 'women';
  const genderWord = gender === 'men' ? "men's" : "women's";

  // ── FIX: het achtervoegsel is nu OPTIONEEL. Vroeger MOEST elke titel eindigen
  //    op "dla kobiet" / "da uomo", waardoor het er dubbel in kwam te staan en
  //    Poolse titels onnodig lang werden. Zet SUFFIX_MARKETS om te sturen. ──
  const SUFFIX_MARKETS = { english: true, italian: true, dutch: true, polish: false };
  const lang0 = String(productInfo.language || 'english').toLowerCase();
  const useSuffix = SUFFIX_MARKETS[lang0] !== false;

  const endEnglish = gender === 'men' ? 'for men' : 'for women';
  const endPolish = gender === 'men' ? 'dla mężczyzn' : 'dla kobiet';
  const endItalian = gender === 'men' ? 'da uomo' : 'da donna';
  const endDutch = gender === 'men' ? 'voor heren' : 'voor dames';

  function suffixRule(phrase) {
    return useSuffix
      ? 'Title SHOULD end with "' + phrase + '" — but ONLY ONCE. If the phrase already appears earlier in the title, do NOT repeat it at the end.'
      : 'Do NOT append "' + phrase + '" or any gender phrase to the title. The audience is already clear from the product type.';
  }

  const genderGuidance = gender === 'men' ? '\n\nMENSWEAR STORE — CRITICAL: This is a MEN\'S fashion store; every listing targets MEN. NEVER classify items as womenswear (no dress, skirt, blouse). Use canonical ENGLISH men\'s productType values such as: T-Shirt, Polo Shirt, Shirt, Oxford Shirt, Linen Shirt, Overshirt, Hoodie, Sweatshirt, Jumper, Cardigan, Chinos, Cargo Trousers, Linen Trousers, Trousers, Jeans, Shorts, Swim Shorts, Blazer, Suit, Overcoat, Trench Coat, Bomber Jacket, Denim Jacket, Gilet, Loafers, Derby Shoes, Chelsea Boots, Trainers, Sneakers, Belt, Cap, Bag. Use MEN\'S fashion SEO keywords in the listing language. IGNORE the womenswear keyword banks listed further below.' : '';

  const response = await callAnthropic({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: `You are the dedicated product listing assistant for ${storeName}, a ${genderWord} fashion webshop. Create fully compliant Shopify-ready product listings. Follow every rule exactly.

LANGUAGE: The "Language" field decides the language of the title, description and meta description.
- english: Natural UK English. ${suffixRule(endEnglish)}
- polish: Natural Polish. ${suffixRule(endPolish)} Use Polish fashion SEO keywords (sukienka, sukienki damskie, sukienka maxi, spódnica, bluzka, komplet, kombinezon, kurtka, bomberka).
- italian: Natural Italian. ${suffixRule(endItalian)} Use Italian fashion SEO keywords (vestito, gonna, camicetta, pantaloni a gamba larga, pantaloncini, polo, mocassini, borsa a tracolla). For synthetic leather use "Ecopelle" — NEVER "Vegan Leather" or "Faux Leather".
- dutch: Natural Dutch. ${suffixRule(endDutch)} Use Dutch fashion SEO keywords (jurk, maxi-jurk, blouse, wijde broek, rok, schoudertas, sandalen, laarzen, sneakers).
Never mix languages within a single listing.
NOTE: "productType", "material", "occasion" and "style" are ALWAYS returned in English.${genderGuidance}

TITLE — HARD RULES (these caused real errors before, follow them exactly):
- NEVER repeat a gender phrase. "Polo da uomo casual a maniche corte da uomo" is WRONG.
- NEVER include a competitor brand name, a trademark symbol, or an invented brand name.
- NEVER leave words from another language in the title. A Polish listing titled "Warm Sunset Design" is WRONG.
- The garment noun MUST match the actual product. Shorts are never "Pantaloni"/"Spodnie" (long trousers). A V-neck polo is never "Camicia"/"Koszula" (shirt).
- 4 to 8 words. Capitalise only the first letter. No colours, no sizes, no prices, no promotional words, no ALL CAPS.

BRAND CONTEXT:
Store: ${storeName}. Tone: clean, neutral, refined, factual. Never write hype.

PRODUCT CLASSIFICATION (do this yourself — never rely on the hint):
- Determine the exact productType from the product name and description. NEVER default to "Dress".
- Return productType in ENGLISH, specific and canonical. Choose the closest of: Maxi Dress, Midi Dress, Mini Dress, Shirt Dress, Denim Dress, Wrap Dress, Bodycon Dress, Linen Top, Satin Blouse, Corset Top, Halter Top, Top, Blouse, Polo Shirt, T-Shirt, Shirt, Oxford Shirt, Linen Shirt, Overshirt, Hoodie, Sweatshirt, Jumper, Cardigan, Wide Leg Trousers, Linen Trousers, Palazzo Trousers, Cargo Trousers, Chinos, Flared Trousers, Wide Leg Jeans, Jeans, Trousers, Shorts, Swim Shorts, Denim Skirt, Midi Skirt, Maxi Skirt, Mini Skirt, Skirt, Tote Bag, Shoulder Bag, Crossbody Bag, Handbag, Woven Bag, Bag, Loafers, Ballet Flats, Mary Jane Shoes, Slingback Flats, Sandals, Slides, Flip Flops, Cork Sandals, Heels, Court Shoes, Mules, Clogs, Ankle Boots, Knee High Boots, Cowboy Boots, Chelsea Boots, Boots, Sneakers, Trainers, Derby Shoes, Trench Coat, Blazer, Denim Jacket, Quilted Jacket, Bomber Jacket, Gilet, Coat, Jacket, Co-ord Set, Two Piece Set, Jumpsuit, Playsuit.
- Also extract ONLY when clearly evident (NEVER invent a fabric):
  • material: e.g. Linen, Cotton, Denim, Satin, Knit, Corduroy, Leather, Vegan Leather, Suede, Crochet. ALWAYS "Vegan Leather" — NEVER "Faux Leather". Empty if not indicated.
  • occasion: e.g. Summer, Holiday, Wedding Guest, Evening, Workwear, Casual. Empty if unclear.
  • style: one or two words (e.g. "Boho", "Minimalist", "Western"). Empty if unclear.

SEO TITLE RULES:
- Pushed straight into Google Shopping. Keyword-led, specific, accurate.
- MUST be clearly DIFFERENT from the product title — if they are identical Shopify ignores the field.
- NO colours and NO sizes. Never invent material or features. Never promotional words.
- Lead with the category keyword, then the highest-search modifier that fits.
- Keep under ~70 characters.

PRODUCT DESCRIPTION RULES:
- Structure EXACTLY: intro paragraph (2 sentences) + 5 bullet points + closing sentence (1 sentence).
- Bullets in this order: 1 fit/silhouette, 2 neckline or collar, 3 closure or sleeve, 4 finishing (hem, ribbing, pockets), 5 available colours.
- Use only visible product features — never invent fabric percentages, care instructions or origin.
- NEVER mention: comfort, support, posture, pain relief, healing, anti-slip, breathable, slimming, shaping, luxury, elegant, perfect, flattering.
- FORBIDDEN in ITALIAN: ortopedico, plantare ortopedico, anatomico, antiscivolo, traspirante, dimagrante, snellente.
- FORBIDDEN in POLISH: luksusowy, elegancki, wyszczuplający, idealny.
- Every sentence must be grammatically correct in the target language. Re-read before returning.
- UNIQUENESS: never reuse sentences or bullet wording across products.

META DESCRIPTION RULES:
- [Product type] + [key design feature] + [occasion/style] + ending with "– ${storeName}".
- Max 160 characters STRICTLY.

OUTPUT FORMAT — output ONLY this JSON, no other text, no markdown, no code blocks:
{"productType":"...","material":"...","occasion":"...","style":"...","seoTitle":"...","description":"...","metaDescription":"..."}`,
    messages: [{
      role: 'user',
      content: 'Classify and create a listing for:\nName: ' + cleanedTitle + '\nType hint (may be empty or wrong — classify yourself): ' + (productInfo.type || 'unknown') + '\nColors: ' + (productInfo.colors || []).join(', ') + '\nMaterial hint: ' + (productInfo.material || 'unknown') + '\nSeason: ' + (productInfo.season || 'not specified') + '\nOriginal description: ' + (productInfo.originalDescription || 'none') + '\nLanguage: ' + (productInfo.language || 'english') + '\n\nIMPORTANT: Determine productType yourself — NEVER default to Dress. Write title, description and meta description in the listing language only. Do not repeat any gender phrase. Do not use a competitor brand name. Make sure the garment noun matches the actual product.' + (String(productInfo.market || '').toLowerCase() === 'usa' ? '\n\nMARKET = USA: Write in natural AMERICAN English. US spelling (color, gray) and US retail vocabulary (pants not trousers, sneakers not trainers, fall not autumn).' : '')
    }]
  });

  const data = await response.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '{}';
  console.log('[generateDescription] Response:', text.substring(0, 300));
  try {
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('[generateDescription] Parse failed:', e.message);
    return { productType: '', material: '', occasion: '', style: '', seoTitle: cleanedTitle, description: text, metaDescription: '' };
  }
}

function buildPhotoPrompts(seoTitle, color, gender) {
  const MODEL = (gender === 'men') ? MODEL_MEN : MODEL_WOMEN;
  const STYLING = (gender === 'men') ? STYLING_MEN : STYLING_WOMEN;
  const colorDesc = colorPromptDescription(color);
  const GARMENT = seoTitle + ' in ' + colorDesc;
  const detailKeywords = ['neckline', 'sleeve', 'collar', 'hem', 'waist', 'button', 'zip', 'ruffle', 'bow', 'tie', 'slit', 'pleat', 'gather', 'ruche', 'butterfly'];
  let detail = 'neckline and sleeve detail';
  for (const kw of detailKeywords) {
    if (seoTitle.toLowerCase().includes(kw)) { detail = kw + ' detail'; break; }
  }
  return [
    'Professional e-commerce fashion photo. The model is ' + MODEL + ', neutral confident expression. Wearing ' + GARMENT + ', styled with ' + STYLING + '. The photo is cropped from ' + CROP + ' — the garment fills the frame and is the clear focus, NOT a full-body shot. Clean light gray studio background, soft even studio lighting, no harsh shadows. High-end fashion e-commerce photography style. Photorealistic. No text, no watermark.',
    'Professional e-commerce fashion photo. The model is ' + MODEL + ', turned with the back fully to the camera, looking slightly over the left shoulder with a relaxed expression. Wearing ' + GARMENT + ' — back details, seams, and construction clearly visible. Styled with ' + STYLING + '. Photo cropped from ' + CROP + ' — tight on the garment, NOT a full-body shot. Clean light gray studio background, soft even studio lighting. Photorealistic. No text, no watermark.',
    'Professional e-commerce fashion photo. The model is ' + MODEL + ', posed at a 45-degree angle to the camera, looking toward the camera with a relaxed expression. Wearing ' + GARMENT + ', styled with ' + STYLING + '. Photo cropped from ' + CROP + ' — tight on the garment, NOT a full-body shot. Clean light gray studio background, soft even studio lighting. Photorealistic. No text, no watermark.',
    'Extreme macro close-up photo of the fabric of a ' + GARMENT + '. The fabric color is ' + colorDesc + '. Shows the weave, texture, and material quality in sharp detail, slight natural fold in the fabric for depth. Soft diffused natural lighting, neutral background. Fabric texture fills the entire frame. 3:4 aspect ratio. Photorealistic product photography. No model, no text, no watermark.',
    'Close-up product photo of the ' + detail + ' on a ' + GARMENT + '. The fabric color is ' + colorDesc + '. Sharp focus on the detail with slight background blur. Soft studio lighting. 3:4 aspect ratio. Photorealistic fashion detail photography. No model, no text, no watermark.',
    'Lifestyle fashion photography. The model is ' + MODEL + ', in a natural candid pose outdoors in an urban setting — city sidewalk, warm golden hour sunlight, blurred background with soft bokeh. Wearing ' + GARMENT + ' styled with ' + STYLING + '. Natural expression, slight smile. Full body visible from head to toe. Editorial fashion photography style. Photorealistic. No text, no watermark.',
    'Full-body studio fashion photo. The model is ' + MODEL + ', standing in a relaxed pose, full body visible from head to toe. Wearing ' + GARMENT + ' styled as a complete outfit with ' + STYLING + ' and complementary footwear. Clean light gray studio background, soft even studio lighting. Fashion lookbook photography style. Photorealistic. No text, no watermark.',
    'Flat lay product photo of ' + GARMENT + ' laid neatly and symmetrically on a clean white marble surface. Fully spread out, wrinkle-free, all design details visible. Shot from directly above. Soft natural window light from the left. Clean editorial e-commerce style. 3:4 aspect ratio. Photorealistic. No model, no text, no watermark.'
  ];
}

async function submitKieTask(prompt) {
  const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KIE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'ideogram/v3-text-to-image', input: { prompt: prompt, rendering_speed: 'BALANCED', style: 'REALISTIC' } })
  });
  const responseText = await r.text();
  if (!r.ok) throw new Error('Kie.ai submit fout: ' + r.status + ' ' + responseText);
  let data;
  try { data = JSON.parse(responseText); } catch (e) { throw new Error('Kie.ai invalid JSON'); }
  const taskId = data && data.data && (data.data.taskId || data.data.task_id) || data && data.taskId;
  if (!taskId) throw new Error('Geen taskId: ' + JSON.stringify(data));
  return taskId;
}

async function pollKieTask(taskId) {
  for (let i = 0; i < 40; i++) {
    await new Promise(function (r) { setTimeout(r, 5000); });
    const poll = await fetch('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + taskId, { headers: { 'Authorization': 'Bearer ' + KIE_API_KEY } });
    const pollText = await poll.text();
    let result;
    try { result = JSON.parse(pollText); } catch (e) { continue; }
    const state = result && result.data && result.data.state;
    if (state === 'success') {
      let imgUrl = null;
      try { const rj = JSON.parse(result.data.resultJson); imgUrl = rj.resultUrls && rj.resultUrls[0]; } catch (e) {}
      return imgUrl || null;
    }
    if (state === 'fail') throw new Error('Kie.ai task mislukt: ' + taskId);
  }
  throw new Error('Kie.ai timeout: ' + taskId);
}

async function createShopifyProduct(productData, token, storeDomain) {
  const t = token || SHOPIFY_TOKEN;
  const store = (storeDomain || SHOPIFY_STORE).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const r = await fetch('https://' + store + '/admin/api/2024-01/products.json', {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': t, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: productData })
  });
  if (!r.ok) { const errText = await r.text(); throw new Error('Shopify fout: ' + r.status + ' ' + errText); }
  return r.json();
}

// ── NIEUW: Shopify-taxonomiecategorie zetten. Kan NIET via de REST
//    products-endpoint, daarom een aparte GraphQL-call. Dit is de reden dat
//    'category' vroeger op elk product leeg bleef. ──
async function setTaxonomyCategory(productId, categoryId, token, storeDomain) {
  if (!productId || !categoryId) return false;
  const t = token || SHOPIFY_TOKEN;
  const store = (storeDomain || SHOPIFY_STORE).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const query = 'mutation { productUpdate(product:{id:"gid://shopify/Product/' + productId +
    '", category:"gid://shopify/TaxonomyCategory/' + categoryId +
    '"}){ product{ id category{ id } } userErrors{ field message } } }';
  try {
    const r = await fetch('https://' + store + '/admin/api/2024-10/graphql.json', {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query })
    });
    const j = await r.json();
    const errs = j && j.data && j.data.productUpdate && j.data.productUpdate.userErrors;
    if (errs && errs.length) { console.error('[setTaxonomyCategory] userErrors:', JSON.stringify(errs)); return false; }
    console.log('[setTaxonomyCategory] categorie', categoryId, 'gezet op', productId);
    return true;
  } catch (e) {
    console.error('[setTaxonomyCategory] exception:', e.message);
    return false;
  }
}

// ── NIEUW: voorraad expliciet zetten per variant, zodat er geen 0 blijft staan
//    als Shopify het inventory_quantity-veld bij creatie negeert. ──
async function ensureInventory(productResult, qty, token, storeDomain) {
  if (!qty || qty <= 0) return;
  const t = token || SHOPIFY_TOKEN;
  const store = (storeDomain || SHOPIFY_STORE).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const variants = (productResult && productResult.product && productResult.product.variants) || [];
  let locationId = null;
  try {
    const lr = await fetch('https://' + store + '/admin/api/2024-01/locations.json', { headers: { 'X-Shopify-Access-Token': t } });
    const lj = await lr.json();
    const loc = (lj.locations || []).filter(function (l) { return l.active !== false; })[0];
    locationId = loc && loc.id;
  } catch (e) { console.error('[ensureInventory] locatie ophalen mislukt:', e.message); }
  if (!locationId) { console.error('[ensureInventory] geen locatie gevonden, voorraad niet gezet'); return; }

  let ok = 0;
  for (const v of variants) {
    if (!v.inventory_item_id) continue;
    try {
      const r = await fetch('https://' + store + '/admin/api/2024-01/inventory_levels/set.json', {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: locationId, inventory_item_id: v.inventory_item_id, available: qty })
      });
      if (r.ok) ok++;
      else if (r.status === 429) { await new Promise(function (res) { setTimeout(res, 1500); }); }
      else console.error('[ensureInventory] variant', v.id, 'fout:', r.status);
    } catch (e) {
      console.error('[ensureInventory] variant', v.id, 'exception:', e.message);
    }
    await new Promise(function (res) { setTimeout(res, 250); });
  }
  console.log('[ensureInventory] voorraad ' + qty + ' gezet op ' + ok + '/' + variants.length + ' varianten');
}

async function setProductMetafields(productId, token, storeDomain, meta) {
  const t = token || SHOPIFY_TOKEN;
  const store = (storeDomain || SHOPIFY_STORE).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const fields = [];
  if (meta.seoTitle)        fields.push({ namespace: 'global', key: 'title_tag',       type: 'single_line_text_field', value: String(meta.seoTitle) });
  if (meta.metaDescription) fields.push({ namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: String(meta.metaDescription) });
  if (meta.material)        fields.push({ namespace: 'custom', key: 'material',        type: 'single_line_text_field', value: String(meta.material) });
  if (meta.occasion)        fields.push({ namespace: 'custom', key: 'occasion',        type: 'single_line_text_field', value: String(meta.occasion) });
  if (meta.style)           fields.push({ namespace: 'custom', key: 'style',           type: 'single_line_text_field', value: String(meta.style) });
  if (meta.gender)          fields.push({ namespace: 'custom', key: 'gender',          type: 'single_line_text_field', value: String(meta.gender) });
  if (meta.ageGroup)        fields.push({ namespace: 'custom', key: 'age_group',       type: 'single_line_text_field', value: String(meta.ageGroup) });
  if (meta.googleCategory)  fields.push({ namespace: 'mm-google-shopping', key: 'google_product_category', type: 'string', value: String(meta.googleCategory) });
  for (const mf of fields) {
    try {
      const r = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/metafields.json', {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ metafield: mf })
      });
      if (!r.ok) { const e = await r.text(); console.error('[setProductMetafields] ' + mf.namespace + '.' + mf.key + ' fout:', r.status, e); }
      else console.log('[setProductMetafields] ' + mf.namespace + '.' + mf.key + ' gezet voor product', productId);
    } catch (e) {
      console.error('[setProductMetafields] ' + mf.namespace + '.' + mf.key + ' exception:', e.message);
    }
  }
}

async function addImagesWithVariants(productId, items, token, storeDomain) {
  const t = token || SHOPIFY_TOKEN;
  const store = (storeDomain || SHOPIFY_STORE).replace(/^https?:\/\//, '').replace(/\/$/, '');
  console.log('[addImagesWithVariants] Uploading', items.length, 'images to product', productId);
  let success = 0;
  for (let i = 0; i < items.length; i++) {
    const image = { src: items[i].src };
    if (items[i].variant_ids && items[i].variant_ids.length) image.variant_ids = items[i].variant_ids;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/images.json', {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': t, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: image })
        });
        if (r.status === 429) { await new Promise(function (res) { setTimeout(res, 2000); }); continue; }
        if (r.ok) {
          success++;
          console.log('[addImagesWithVariants] Image ' + (i + 1) + '/' + items.length + ' uploaded');
          break;
        } else {
          const err = await r.text();
          console.error('[addImagesWithVariants] Image ' + (i + 1) + ' failed:', r.status, err.substring(0, 100));
          break;
        }
      } catch (e) {
        console.error('[addImagesWithVariants] Image ' + (i + 1) + ' error:', e.message);
        break;
      }
    }
    await new Promise(function (res) { setTimeout(res, 500); });
  }
  console.log('[addImagesWithVariants] Done:', success, '/', items.length, 'uploaded');
}

const TITLE_NAMES = [
  'Mila','Lena','Maja','Nina','Lara','Nora','Zoe','Luna','Iris','Alma',
  'Vera','Emma','Olivia','Sofia','Hania','Zofia','Liwia','Pola','Gaja','Kaja',
  'Ada','Tola','Ola','Ewa','Nela','Mia','Lia','Aria','Stella','Bella',
  'Cara','Elena','Flora','Greta','Ida','Julia','Kira','Lila','Nadia','Petra',
  'Rita','Sara','Tessa','Uma','Yara','Amelia','Klara','Marta','Roza','Ines',
  'Alba','Talia','Vita','Selin','Dalia','Mira','Noa','Elsa','Cora','Frida',
  'Hela','Inga','Juno','Lotta','Maya','Otylia','Sela','Tara','Wiktoria','Diana',
  'Ania','Basia','Celia','Daria','Eliza','Fela','Gosia','Helena','Ilona','Jagoda',
  'Kalina','Lidia','Magda','Natalia','Oliwia','Patrycja','Renata','Sandra','Tamara','Urszula',
  'Wanda','Zaria','Adela','Blanka','Cyntia','Dominika','Estera','Felicja','Gabi','Hortensja'
];

function styledPhrase(seoTitle) {
  var p = String(seoTitle || '').trim();
  p = p.replace(/\s*,?\s*(dla kobiet|dla mężczyzn|for women|for men|da donna|da uomo|voor dames|voor heren)\s*$/i, '').trim();
  p = p.replace(/^[^–\-|]{1,20}\s*[–\-|]\s*/, '').trim();
  p = p.replace(/\s{2,}/g, ' ').trim();
  if (p) p = p.charAt(0).toLowerCase() + p.slice(1);
  return p;
}

async function pickUniqueName(token, storeDomain) {
  var t = token || SHOPIFY_TOKEN;
  var store = (storeDomain || SHOPIFY_STORE).replace(/^https?:\/\//, '').replace(/\/$/, '');
  var used = {};
  try {
    var url = 'https://' + store + '/admin/api/2024-01/products.json?fields=title&limit=250';
    for (var page = 0; page < 4 && url; page++) {
      var r = await fetch(url, { headers: { 'X-Shopify-Access-Token': t } });
      if (!r.ok) break;
      var data = await r.json();
      (data.products || []).forEach(function (p) {
        var parts = String(p.title || '').split(/\s[–\-|]\s/);
        if (parts.length > 1) {
          var nm = parts[0].trim().toLowerCase();
          if (nm) used[nm] = true;
        }
      });
      var link = r.headers.get('link') || r.headers.get('Link') || '';
      var next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }
  } catch (e) {
    console.error('[pickUniqueName] kon bestaande titels niet ophalen:', e.message);
  }
  var pool = TITLE_NAMES.slice();
  for (var i = pool.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  for (var k = 0; k < pool.length; k++) {
    if (!used[pool[k].toLowerCase()]) return pool[k];
  }
  return pool[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { productInfo, generatePhotos } = req.body || {};
  let reqToken = productInfo && productInfo.shopifyToken;
  let reqStore = productInfo && productInfo.shopifyStore;
  if (productInfo && productInfo.storeId === 'store2') {
    reqToken = process.env.SHOPIFY_TOKEN_2 || (productInfo && productInfo.shopifyToken);
    reqStore = process.env.SHOPIFY_STORE_2 || (productInfo && productInfo.shopifyStore) || 'gw5ubt-8p.myshopify.com';
  }
  if (!productInfo) return res.status(400).json({ error: 'Product info missing' });

  console.log('[handler] Product:', productInfo.title);

  // Verzamelt alles wat niet klopt. Bij blokkades wordt er NIETS aangemaakt.
  const validator = makeValidator();

  try {
    const market = (productInfo.market || 'uk').toLowerCase();
    let lang = (productInfo.language || 'english').toLowerCase();
    if (market === 'italie') lang = 'italian';
    if (market === 'polen') lang = 'polish';
    if (market === 'nederland') lang = 'dutch';
    productInfo.language = lang;
    const gender = (String(productInfo.gender || 'women').toLowerCase() === 'men') ? 'men' : 'women';
    const storeName = productInfo.storeId === 'store2' ? 'Lorenzari' : (productInfo.storeName || 'Yamira London');

    // ========================================================================
    //  VALIDATIE 1 — KLEUREN
    //  Maten uit de kleur-as filteren, daarna elke kleur vertalen. Kan een
    //  kleur niet vertaald worden, dan wordt het product NIET aangemaakt.
    // ========================================================================
    const incomingColors = (productInfo.colors || []);
    const rawColors = incomingColors.filter(function (c) { return c && !looksLikeSize(c); });
    const shoeSizesFromColors = incomingColors.filter(looksLikeShoeSize);
    incomingColors.filter(looksLikeSize).forEach(function (c) {
      validator.warn('MAAT_IN_KLEURAS', c, 'was een maat, uit de kleur-as gehaald');
    });

    const translator = lang === 'polish' ? translateColorPolish
      : lang === 'italian' ? translateColorItalian
      : lang === 'dutch' ? translateColorDutch
      : translateColor;

    let colors;
    if (rawColors.length > 0) {
      colors = rawColors.map(function (c) { return translator(c, validator); }).filter(Boolean);
    } else {
      colors = [lang === 'polish' ? 'Jeden kolor' : (lang === 'italian' ? 'Tinta unita' : (lang === 'dutch' ? 'Eén kleur' : 'One Colour'))];
      validator.warn('GEEN_KLEUREN', productInfo.title, 'bron leverde geen kleuren');
    }
    // Ontdubbelen, ook wanneer twee bronkleuren op dezelfde vertaling uitkomen
    // (dat was het "Róż" naast "Różowy"-probleem).
    const seenColors = {};
    const dupes = [];
    colors = colors.filter(function (c) {
      var k = String(c).toLowerCase().trim();
      if (!k) return false;
      if (seenColors[k]) { dupes.push(c); return false; }
      seenColors[k] = true;
      return true;
    });
    dupes.forEach(function (c) { validator.warn('DUBBELE_KLEUR', c, 'kwam twee keer voor, ontdubbeld'); });

    const generated = await generateDescription(productInfo);

    let description = veganLeather(generated.description || '');
    let seoTitle = veganLeather(generated.seoTitle || productInfo.title);
    let metaDescription = veganLeather(generated.metaDescription || '');

    if (lang === 'italian') {
      description = italianLeather(description);
      seoTitle = italianLeather(seoTitle);
      metaDescription = italianLeather(metaDescription);
    }

    // ── Titel opschonen: merknaam eruit, dubbele geslachtsaanduiding weg ──
    seoTitle = stripCompetitorBrand(seoTitle, productInfo.sourceUrl || productInfo.competitorUrl);
    seoTitle = dedupeGenderSuffix(seoTitle, lang, gender);

    const detectedType = (generated.productType && String(generated.productType).trim()) || '';
    const productType = detectedType
      || (productInfo.type && String(productInfo.type).trim())
      || inferTypeFromText(cleanTitleSafe(productInfo.title) + ' ' + (productInfo.originalDescription || ''));

    const material = veganLeather((generated.material && String(generated.material).trim()) || (productInfo.material ? String(productInfo.material).trim() : ''));
    const occasion = (generated.occasion && String(generated.occasion).trim()) || '';
    const style = (generated.style && String(generated.style).trim()) || '';

    // ========================================================================
    //  VALIDATIE 2 — CATEGORIE
    //  Geen taxonomiecategorie betekent afgekeurd in Google Shopping.
    // ========================================================================
    const taxonomyId = taxonomyCategoryFor(productType);
    if (!taxonomyId) {
      validator.block('GEEN_CATEGORIE', productType, 'productType staat niet in TAXONOMY_CATEGORY');
    }

    let displayTitle = seoTitle;
    if (productInfo.useNameTitle) {
      const uniqueName = await pickUniqueName(reqToken, reqStore);
      const phrase = styledPhrase(seoTitle);
      displayTitle = uniqueName + ' – ' + (phrase || seoTitle);
      console.log('[handler] Naam-titel optie aan ->', displayTitle);
    }

    // ── SEO-titel mag niet gelijk zijn aan de producttitel, anders negeert
    //    Shopify het veld volledig. ──
    if (String(seoTitle).trim().toLowerCase() === String(displayTitle).trim().toLowerCase()) {
      const extra = [material, occasion, style].filter(Boolean).join(' ') || (productInfo.season || 'ALL YEAR');
      seoTitle = (seoTitle + ' ' + extra).replace(/\s{2,}/g, ' ').trim();
      validator.warn('SEO_GELIJK_AAN_TITEL', displayTitle, 'SEO-titel aangevuld tot: ' + seoTitle);
    }

    const urlHandle = titleToUrlHandle(displayTitle);
    const footwear = isFootwearType(productType);
    const oneSize = isOneSizeType(productType);

    const displayProductType = lang === 'polish' ? (polishTypeMap[productType] || productType)
      : lang === 'italian' ? (italianTypeMap[productType] || productType)
      : lang === 'dutch' ? (dutchTypeMap[productType] || productType)
      : productType;
    const season = productInfo.season || 'ALL YEAR';

    // ========================================================================
    //  VALIDATIE 3 — MATEN
    //  Geen maten verzinnen die de bron niet heeft.
    // ========================================================================
    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const defaultShoeSizes = ['36', '37', '38', '39', '40', '41'];
    let sizes;
    if (oneSize) {
      sizes = [lang === 'polish' ? 'Uniwersalny' : (lang === 'italian' ? 'Taglia unica' : 'One Size')];
    } else if (footwear) {
      var passedShoe = (productInfo.sizes || []).filter(looksLikeShoeSize);
      var allShoe = passedShoe.concat(shoeSizesFromColors);
      var seenShoe = {};
      allShoe = allShoe.filter(function (s) { var k = String(s).toLowerCase().trim(); if (!k || seenShoe[k]) return false; seenShoe[k] = true; return true; });
      if (!allShoe.length) validator.warn('GEEN_SCHOENMATEN', productInfo.title, 'default 36-41 gebruikt');
      var shoeSrc = allShoe.length ? allShoe : defaultShoeSizes;
      sizes = shoeSrc.map(function (s) { return mapSizeLabel(s, lang, true, market, gender); });
    } else if (productInfo.sizes && productInfo.sizes.length) {
      var clothing = productInfo.sizes.filter(function (s) { return !looksLikeShoeSize(s); });
      if (clothing.length !== productInfo.sizes.length) {
        validator.block('SCHOENMAAT_OP_KLEDING', productType, 'bron leverde schoenmaten op een kledingstuk');
      }
      var clSrc = clothing.length ? clothing : defaultSizes;
      sizes = clSrc.map(function (s) { return mapSizeLabel(s, lang, false, market, gender); });
    } else {
      validator.warn('GEEN_MATEN', productInfo.title, 'bron leverde geen maten, default XS-XXL gebruikt');
      if (productInfo.strictSizes) {
        validator.block('GEEN_MATEN', productInfo.title, 'strictSizes staat aan');
      }
      sizes = defaultSizes.map(function (s) { return mapSizeLabel(s, lang, false, market, gender); });
    }
    var seenSize = {};
    sizes = sizes.filter(function (s) { var k = String(s).toLowerCase().trim(); if (!k || seenSize[k]) return false; seenSize[k] = true; return true; });

    // ── Variantaantal vergelijken met wat de bron aangaf ──
    if (productInfo.expectedVariantCount) {
      var expected = parseInt(productInfo.expectedVariantCount, 10);
      var actual = colors.length * sizes.length;
      if (expected && actual !== expected) {
        validator.warn('VARIANTAANTAL_WIJKT_AF', actual + ' vs bron ' + expected, 'kleuren x maten komt niet uit op het bronaantal');
      }
    }

    // ========================================================================
    //  STOP HIER als er blokkades zijn — liever geen product dan een vervuild
    //  product dat achteraf met de hand gerepareerd moet worden.
    // ========================================================================
    if (validator.blocks.length) {
      console.error('[handler] GEBLOKKEERD:', JSON.stringify(validator.blocks));
      return res.status(422).json({
        error: 'VALIDATIE_GEFAALD',
        message: 'Product niet aangemaakt. Los onderstaande punten op en probeer opnieuw.',
        product: productInfo.title,
        blocks: validator.blocks,
        warnings: validator.warns
      });
    }

    // ── Tags ──
    const mainCategory = mainCategoryFor(productType, lang, gender);
    if (!mainCategory) validator.warn('GEEN_COLLECTIETAG', productType, 'product komt in geen enkele collectie terecht');
    const genderTag = gender === 'men'
      ? (lang === 'polish' ? 'Mężczyźni' : (lang === 'italian' ? 'Uomo' : (lang === 'dutch' ? 'Heren' : 'Men')))
      : (lang === 'polish' ? 'Kobiety' : (lang === 'italian' ? 'Donna' : (lang === 'dutch' ? 'Dames' : 'Women')));
    const tagSet = [season, displayProductType, mainCategory, occasion, material, style, genderTag];
    const seen = {};
    const tags = tagSet.filter(function (x) {
      if (!x) return false;
      var k = String(x).toLowerCase().trim();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    }).join(', ');

    const targetCurrency = MARKET_CURRENCY[market]
      || ((lang === 'polish') ? 'PLN' : (lang === 'italian' || lang === 'dutch') ? 'EUR' : 'GBP');
    const price = computePrice(productInfo);
    if (!price || price <= 0) {
      return res.status(422).json({
        error: 'VALIDATIE_GEFAALD',
        message: 'Geen prijs te berekenen (originalPrice ontbreekt of is 0).',
        product: productInfo.title,
        blocks: [{ code: 'GEEN_PRIJS', value: String(productInfo.originalPrice), reason: 'kostprijs ontbreekt' }],
        warnings: validator.warns
      });
    }

    // ========================================================================
    //  VARIANTEN — nu MET tracking, voorraadbeleid en aantal.
    //  Vroeger kwam alles binnen als tracked:false met voorraad 0.
    // ========================================================================
    const inv = inventoryFor(market);
    const stockQty = inv.tracked
      ? (inv.max > inv.min ? Math.floor(Math.random() * (inv.max - inv.min + 1)) + inv.min : inv.min)
      : 0;

    function buildVariant(opts) {
      var v = Object.assign({
        price: price.toString(),
        compare_at_price: null,
        taxable: false,
        inventory_policy: inv.policy
      }, opts);
      if (inv.tracked) {
        v.inventory_management = 'shopify';
        v.inventory_quantity = stockQty;
      }
      return v;
    }

    const variants = [];
    if (colors.length > 0 && sizes.length > 0) {
      for (const color of colors) {
        for (const size of sizes) variants.push(buildVariant({ option1: color, option2: size }));
      }
    } else {
      for (const size of sizes) variants.push(buildVariant({ option1: size }));
    }

    let generatedImages = [];
    if (generatePhotos) {
      const primaryColor = rawColors.length > 0 ? (toEnglishColor(rawColors[0]) || 'the garment colour') : 'the garment colour';
      const prompts = buildPhotoPrompts(seoTitle, primaryColor, gender);
      const taskIds = [];
      for (let i = 0; i < prompts.length; i++) {
        try { const taskId = await submitKieTask(prompts[i]); taskIds.push({ taskId: taskId, index: i }); } catch (e) { console.error('Submit task ' + i + ' failed:', e.message); }
      }
      for (let j = 0; j < taskIds.length; j++) {
        const item = taskIds[j];
        try { const imgUrl = await pollKieTask(item.taskId); if (imgUrl) generatedImages.push({ src: imgUrl, position: item.index + 1 }); } catch (e) { console.error('Photo failed:', e.message); }
      }
    }

    const colourLabel = lang === 'polish' ? 'Kolor' : (lang === 'italian' ? 'Colore' : (lang === 'dutch' ? 'Kleur' : 'Colour'));
    const sizeLabel = lang === 'polish' ? 'Rozmiar' : (lang === 'italian' ? 'Taglia' : (lang === 'dutch' ? 'Maat' : 'Size'));

    const shopifyProduct = {
      title: displayTitle,
      handle: urlHandle,
      body_html: description ? (function (d) {
        var parts = d.split('\n');
        var html = '';
        var inList = false;
        for (var i = 0; i < parts.length; i++) {
          var line = parts[i].trim();
          if (!line) continue;
          if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += '<li>' + line.replace(/^[•\-\*]\s*/, '') + '</li>';
          } else {
            if (inList) { html += '</ul>'; inList = false; }
            html += '<p>' + line + '</p>';
          }
        }
        if (inList) html += '</ul>';
        return html;
      })(description) : '',
      vendor: storeName,
      product_type: displayProductType,
      tags: tags,
      status: 'draft',
      variants: variants,
      options: variants[0] && variants[0].option2 ? [{ name: colourLabel }, { name: sizeLabel }] : [{ name: sizeLabel }],
      images: []
    };

    const result = await createShopifyProduct(shopifyProduct, reqToken, reqStore);
    const productId = result.product && result.product.id;

    var gType = String(productType).toLowerCase();
    var googleCategory =
      /bag|tas|tote|clutch|handbag|crossbody|torebka|torba/.test(gType) ? '3032' :
      /loafer|flat|ballet|slingback|sandal|slide|heel|pump|mule|clog|boot|sneaker|shoe|laars|schoen|hak|derby/.test(gType) ? '187' :
      /skirt|rok|spódnica/.test(gType) ? '1581' :
      /short/.test(gType) ? '207' :
      /trouser|jeans|pant|broek|spodnie|cargo|palazzo|legging|chino/.test(gType) ? '204' :
      /dress|jurk|sukienka/.test(gType) ? '2271' :
      /jumpsuit|playsuit|kombinezon/.test(gType) ? '5344' :
      /cardigan|sweater|jumper|kardigan/.test(gType) ? '213' :
      /jacket|coat|blazer|bomber|kurtka/.test(gType) ? '203' :
      /polo|top|blouse|shirt|bluzka/.test(gType) ? '212' : '';

    if (productId) {
      await setProductMetafields(productId, reqToken, reqStore, {
        seoTitle: seoTitle,
        metaDescription: metaDescription,
        material: material,
        occasion: occasion,
        style: style,
        gender: gender === 'men' ? 'Male' : 'Female',
        ageGroup: 'Adult',
        googleCategory: googleCategory
      });
      // Shopify-taxonomiecategorie (kan niet via REST).
      await setTaxonomyCategory(productId, taxonomyId, reqToken, reqStore);
      // Voorraad hard zetten, zodat er geen 0 blijft staan.
      if (inv.tracked) await ensureInventory(result, stockQty, reqToken, reqStore);
    }

    // ── Foto's koppelen ──
    const createdVariants = (result.product && result.product.variants) || [];
    const hasColorOption = !!(variants[0] && variants[0].option2);

    const colorToVariantIds = {};
    if (hasColorOption) {
      createdVariants.forEach(function (v) {
        const key = String(v.option1 || '').toLowerCase().trim();
        if (!colorToVariantIds[key]) colorToVariantIds[key] = [];
        colorToVariantIds[key].push(v.id);
      });
    }

    const keptSet = new Set((productInfo.originalImages || []).map(function (s) { return String(s).split('?')[0]; }));
    function isKept(src) { return keptSet.size === 0 ? true : keptSet.has(String(src).split('?')[0]); }

    const imageItems = [];
    const usedSrc = new Set();
    const ibc = (!generatePhotos && productInfo.imagesByColor) ? productInfo.imagesByColor : null;

    if (ibc && hasColorOption) {
      Object.keys(ibc).forEach(function (color) {
        const mappedColor = translator(color, null);
        const vids = colorToVariantIds[String(mappedColor || '').toLowerCase().trim()]
          || colorToVariantIds[String(color).toLowerCase().trim()]
          || [];
        (ibc[color] || []).forEach(function (src) {
          const norm = String(src).split('?')[0];
          if (!isKept(src) || usedSrc.has(norm)) return;
          usedSrc.add(norm);
          imageItems.push({ src: src, variant_ids: vids });
        });
      });
    }

    const restSrc = generatedImages.length > 0
      ? generatedImages.map(function (i) { return i.src; })
      : (productInfo.originalImages || []);
    restSrc.forEach(function (src) {
      const norm = String(src).split('?')[0];
      if (usedSrc.has(norm)) return;
      usedSrc.add(norm);
      imageItems.push({ src: src, variant_ids: [] });
    });

    if (productId && imageItems.length > 0) {
      console.log('[handler] Uploading', imageItems.length, 'images to product', productId);
      await addImagesWithVariants(productId, imageItems, reqToken, reqStore);
    }

    return res.status(200).json({
      success: true,
      product: result.product,
      productTitle: displayTitle,
      seoTitle: seoTitle,
      productType: productType,
      taxonomyCategory: taxonomyId,
      urlHandle: urlHandle,
      description: description,
      metaDescription: metaDescription,
      price: price,
      currency: targetCurrency,
      tags: tags,
      material: material,
      occasion: occasion,
      style: style,
      colorsUsed: colors,
      sizesUsed: sizes,
      variantCount: variants.length,
      inventoryTracked: inv.tracked,
      inventoryPolicy: inv.policy,
      stockQty: stockQty,
      googleCategory: googleCategory,
      imagesGenerated: generatedImages.length,
      warnings: validator.warns
    });

  } catch (err) {
    console.error('[handler] Fatal error:', err.message);
    return res.status(500).json({ error: err.message, warnings: validator.warns });
  }
}
