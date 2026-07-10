const KIE_API_KEY = process.env.KIE_API_KEY;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

const MODEL = 'a confident professional fashion model, early 30s, light medium skin tone, long dark brown wavy hair, slim build, UK size 10, standing upright, British fashion aesthetic';
const CROP = 'mid-thigh up';
const STYLING = 'minimal delicate jewellery, nude heels';

// ── Anthropic-call met auto-retry bij tijdelijke fouten (429/500/502/503/529 overloaded) ──
function backoffMs(attempt) {
  const base = Math.min(1000 * Math.pow(2, attempt), 16000); // 1s,2s,4s,8s,16s
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

function convertPrice(originalPrice, currency = 'EUR', target = 'GBP') {
  const toGbp = { EUR: 0.86, USD: 0.79, GBP: 1, PLN: 0.20 };
  const gbpPerTarget = { GBP: 1, PLN: 0.20, EUR: 0.86, USD: 0.79 };
  const gbp = originalPrice * (toGbp[currency] || 0.86);
  const amount = gbp / (gbpPerTarget[target] || 1);
  const candidates = [];
  const base = Math.floor(amount);
  for (let i = base - 10; i <= base + 10; i++) {
    candidates.push(parseFloat((Math.floor(i / 10) * 10 + 4.99).toFixed(2)));
    candidates.push(parseFloat((Math.floor(i / 10) * 10 + 9.99).toFixed(2)));
  }
  const valid = candidates.filter(function(c) { return c > 0; });
  let closest = valid[0];
  let minDiff = Math.abs(amount - closest);
  for (let j = 1; j < valid.length; j++) {
    const diff = Math.abs(amount - valid[j]);
    if (diff < minDiff) { minDiff = diff; closest = valid[j]; }
  }
  return parseFloat(closest.toFixed(2));
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

// ── Italiaanse confectiematen (IT-nummers, zoals Italiaanse damesmode toont) ──
const itSizeMap = {
  'XS': 'XS (IT 38)', 'S': 'S (IT 40)', 'M': 'M (IT 42)',
  'L': 'L (IT 44)', 'XL': 'XL (IT 46)', 'XXL': 'XXL (IT 48)',
  '2XL': 'XXL (IT 48)', '3XL': 'XXXL (IT 50)', 'XXXL': 'XXXL (IT 50)',
  '34': 'XS (IT 38)', '36': 'S (IT 40)', '38': 'M (IT 42)',
  '40': 'L (IT 44)', '42': 'XL (IT 46)', '44': 'XXL (IT 48)'
};

// ── Nederlandse confectiematen (EU-nummers, zoals NL damesmode toont) ──
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
  return /espadrille|slingback|kitten|heel|stiletto|pump|sandal|ballet|ballerina|loafer|moccasin|sneaker|trainer|boot|mule|wedge|brogue|oxford|derby|slipper|flat|clog|flip|shoe|footwear|schoen|laars|sandaal|hak|pantoffel|instapper|sleehak/.test(t);
}

function isOneSizeType(type) {
  var t = String(type || '').toLowerCase();
  return /\bbag\b|\btas\b|tote|clutch|backpack|rugzak|handbag|handtas|schoudertas|crossbody|torebka|torba|jewell|jewel|necklace|earring|bracelet|sieraad|ketting|scarf|sjaal|\bhat\b|\bcap\b|\bpet\b|muts|\bbelt\b|\briem\b|sunglass|zonnebril/.test(t);
}

// ── NIEUW: maat-detectie, zodat maten niet in de kleur-as belanden en schoenen geen kledingmaten krijgen ──
// Herkent een kleding- OF schoenmaat (kale getallen, XS-XXL, of met EU/UK/US/IT-prefix).
function looksLikeSize(token) {
  var t = String(token || '').toLowerCase().trim();
  if (!t) return false;
  if (/^(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl)$/.test(t)) return true;
  if (/^(eu|uk|us|it)\s*\d{1,2}([.,]5)?$/.test(t)) return true;
  if (/^\d{2}([.,]5)?$/.test(t)) { var n = parseFloat(t.replace(',', '.')); if (n >= 30 && n <= 50) return true; }
  return false;
}
// Specifiek een schoenmaat (kaal getal 33-48 of met EU/UK/US-prefix).
function looksLikeShoeSize(token) {
  var t = String(token || '').toLowerCase().trim();
  if (/^(eu|uk|us)\s*\d{1,2}([.,]5)?$/.test(t)) return true;
  if (/^\d{2}([.,]5)?$/.test(t)) { var n = parseFloat(t.replace(',', '.')); return n >= 33 && n <= 48; }
  return false;
}

// ── "Faux Leather" -> "Vegan Leather" overal (GMC-vriendelijker, store-standaard) ──
function veganLeather(s) {
  return String(s == null ? '' : s).replace(/faux[\s-]*leather/gi, 'Vegan Leather');
}

// ── Italiaans: "Vegan/Faux Leather" -> "Ecopelle" in de KLANTTEKST (titel/omschrijving/meta).
//    Het material-metaveld blijft Engels ("Vegan Leather") voor feed-consistentie. ──
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
  if (/cargo/.test(t)) return 'Cargo Trousers';
  if (/wide.?leg|palazzo|wijde broek|luchtige broek/.test(t)) return 'Wide Leg Trousers';
  if (/linen (trouser|pant)|linnen broek/.test(t)) return 'Linen Trousers';
  if (/jeans|denim broek/.test(t)) return 'Jeans';
  if (/trouser|broek|pants|spodnie/.test(t)) return 'Trousers';
  if (/denim skirt|jeans ?rok|spódnica jeansowa/.test(t)) return 'Denim Skirt';
  if (/midi skirt|midi ?rok/.test(t)) return 'Midi Skirt';
  if (/maxi skirt|maxi ?rok/.test(t)) return 'Maxi Skirt';
  if (/skirt|\brok\b|spódnica/.test(t)) return 'Skirt';
  if (/blouse|bluzka/.test(t)) return 'Blouse';
  if (/\btop\b/.test(t)) return 'Top';
  if (/jumpsuit|kombinezon/.test(t)) return 'Jumpsuit';
  if (/playsuit|romper/.test(t)) return 'Playsuit';
  if (/blazer|marynarka/.test(t)) return 'Blazer';
  if (/trench/.test(t)) return 'Trench Coat';
  if (/jacket|\bjas\b|kurtka/.test(t)) return 'Jacket';
  if (/coat|płaszcz/.test(t)) return 'Coat';
  if (/co-?ord|two.?piece|komplet|\bset\b/.test(t)) return 'Co-ord Set';
  if (/maxi dress|maxi jurk/.test(t)) return 'Maxi Dress';
  if (/midi dress|midi jurk/.test(t)) return 'Midi Dress';
  if (/mini dress|mini jurk/.test(t)) return 'Mini Dress';
  if (/dress|jurk|sukienka/.test(t)) return 'Dress';
  return 'Dress';
}

function mainCategoryFor(productType, lang) {
  var t = String(productType || '').toLowerCase();
  var pl = lang === 'polish';
  var it = lang === 'italian';
  var nl = lang === 'dutch';
  function pick(en, plv, itv, nlv) { return nl ? nlv : (it ? itv : (pl ? plv : en)); }
  if (/dress|jurk|sukienka/.test(t)) return pick('Dresses', 'Sukienki', 'Vestiti', 'Jurken');
  if (/skirt|\brok\b|spódnica/.test(t)) return pick('Bottoms', 'Spódnice', 'Gonne', 'Rokken');
  if (/trouser|jeans|pants|broek|spodnie|cargo|palazzo|legging/.test(t)) return pick('Bottoms', 'Spodnie', 'Pantaloni', 'Broeken');
  if (/jacket|coat|blazer|trench|\bjas\b|kurtka|płaszcz|okrycie/.test(t)) return pick('Outerwear', 'Okrycia', 'Giacche', 'Jassen');
  if (/top|blouse|shirt|bluzka/.test(t)) return pick('Tops', 'Bluzki', 'Camicette', 'Tops');
  if (/bag|\btas\b|tote|clutch|backpack|handbag|handtas|schoudertas|crossbody|torebka|torba/.test(t)) return pick('Bags', 'Torebki', 'Borse', 'Tassen');
  if (/loafer|flat|ballet|slingback|sandal|slide|heel|pump|mule|clog|boot|sneaker|shoe|laars|schoen|\bhak\b|botki|kozaki|mokasyn|baleriny/.test(t)) return pick('Shoes', 'Buty', 'Scarpe', 'Schoenen');
  if (/jumpsuit|playsuit|romper|kombinezon/.test(t)) return pick('Jumpsuits', 'Kombinezony', 'Tute', 'Jumpsuits');
  if (/co-?ord|two.?piece|komplet|\bset\b/.test(t)) return pick('Co-ords', 'Komplety', 'Coordinati', 'Setjes');
  return null;
}

function mapSizeLabel(s, lang, isFootwear, market) {
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
    // Polen én Italië: schoenmaten als kale EU-maat (geen UK/US).
    if (lang === 'polish' || market === 'polen') return 'EU ' + eu;
    if (lang === 'italian' || market === 'italie') return 'EU ' + eu;
    if (lang === 'dutch' || market === 'nederland') return 'EU ' + eu;
    if (market === 'canada' || market === 'usa') return 'US ' + (eu - 31) + ' (EU ' + eu + ')';
    return 'UK ' + uk + ' (EU ' + eu + ')';
  }

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
  // ── Duits ──
  'schwarz': 'Black', 'weiss': 'White', 'weiß': 'White', 'rot': 'Red',
  'blau': 'Blue', 'grün': 'Green', 'gruen': 'Green', 'gelb': 'Yellow',
  'grau': 'Grey', 'braun': 'Brown', 'türkis': 'Turquoise', 'tuerkis': 'Turquoise',
  'silber': 'Silver', 'hellblau': 'Light Blue', 'dunkelblau': 'Navy',
  'hellbraun': 'Light Brown', 'dunkelbraun': 'Dark Brown', 'hellgrün': 'Light Green',
  'dunkelgrün': 'Dark Green', 'hellgrau': 'Light Grey', 'dunkelgrau': 'Dark Grey',
  'karamell': 'Caramel', 'karamellbraun': 'Caramel', 'marineblau': 'Navy',
  'weinrot': 'Burgundy', 'bordeauxrot': 'Burgundy', 'oliv': 'Olive', 'olivgrün': 'Olive',
  // ── Nederlands (samengesteld) ──
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
  'kaki': 'Khaki'
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
  'dark brown': 'Ciemnobrązowy', 'lime green': 'Limonkowy', 'army green': 'Khaki'
};

// ── Italiaanse kleuren (Engelse basis -> Italiaans), plus enkele directe NL/DE-treffers ──
const italianColorMap = {
  'black': 'Nero', 'white': 'Bianco', 'red': 'Rosso', 'blue': 'Blu',
  'green': 'Verde', 'pink': 'Rosa', 'beige': 'Beige', 'cream': 'Crema',
  'grey': 'Grigio', 'gray': 'Grigio', 'brown': 'Marrone', 'orange': 'Arancione',
  'purple': 'Viola', 'yellow': 'Giallo', 'navy': 'Blu navy', 'burgundy': 'Bordeaux',
  'dark red': 'Rosso scuro', 'khaki': 'Kaki', 'lilac': 'Lilla', 'camel': 'Cammello',
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
  'plum': 'Prugna', 'sage': 'Salvia', 'denim': 'Denim', 'gold': 'Oro',
  // directe NL/DE die vaak voorkomen
  'zwart': 'Nero', 'wit': 'Bianco', 'rood': 'Rosso', 'blauw': 'Blu', 'groen': 'Verde',
  'roze': 'Rosa', 'grijs': 'Grigio', 'bruin': 'Marrone', 'geel': 'Giallo',
  'schwarz': 'Nero', 'weiss': 'Bianco', 'weiß': 'Bianco'
};

// ── Nederlandse kleuren (Engelse basis -> Nederlands) ──
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
  'dark brown': 'Donkerbruin', 'lime green': 'Limoengroen', 'army green': 'Legergroen'
};

const polishTypeMap = {
  'Dress': 'Sukienka', 'Maxi Dress': 'Sukienka Maxi', 'Mini Dress': 'Sukienka Mini',
  'Midi Dress': 'Sukienka Midi', 'Bodycon Dress': 'Sukienka Dopasowana',
  'Wrap Dress': 'Sukienka Kopertowa', 'Shirt Dress': 'Sukienka Koszulowa',
  'Denim Dress': 'Sukienka Jeansowa', 'Skirt': 'Spódnica', 'Midi Skirt': 'Spódnica Midi',
  'Maxi Skirt': 'Spódnica Maxi', 'Mini Skirt': 'Spódnica Mini', 'Denim Skirt': 'Spódnica Jeansowa',
  'Blouse': 'Bluzka', 'Top': 'Top', 'Jacket': 'Kurtka', 'Blazer': 'Marynarka',
  'Coat': 'Płaszcz', 'Trench Coat': 'Trencz', 'Denim Jacket': 'Kurtka Jeansowa',
  'Jumpsuit': 'Kombinezon', 'Playsuit': 'Kombinezon', 'Trousers': 'Spodnie', 'Pants': 'Spodnie',
  'Wide Leg Trousers': 'Spodnie Szerokie', 'Linen Trousers': 'Spodnie Lniane',
  'Cargo Trousers': 'Spodnie Cargo', 'Palazzo Trousers': 'Spodnie Palazzo',
  'Flared Trousers': 'Spodnie Dzwony', 'Jeans': 'Jeansy', 'Wide Leg Jeans': 'Szerokie Jeansy',
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

// ── Italiaanse producttypes (Engels -> Italiaans, voor de variant-/producttype-weergave) ──
const italianTypeMap = {
  'Dress': 'Vestito', 'Maxi Dress': 'Vestito Lungo', 'Mini Dress': 'Vestito Corto',
  'Midi Dress': 'Vestito Midi', 'Bodycon Dress': 'Vestito Aderente',
  'Wrap Dress': 'Vestito a Portafoglio', 'Shirt Dress': 'Vestito Chemisier',
  'Denim Dress': 'Vestito di Jeans', 'Skirt': 'Gonna', 'Midi Skirt': 'Gonna Midi',
  'Maxi Skirt': 'Gonna Lunga', 'Mini Skirt': 'Minigonna', 'Denim Skirt': 'Gonna di Jeans',
  'Blouse': 'Camicetta', 'Top': 'Top', 'Jacket': 'Giacca', 'Blazer': 'Blazer',
  'Coat': 'Cappotto', 'Trench Coat': 'Trench', 'Denim Jacket': 'Giacca di Jeans',
  'Jumpsuit': 'Tuta', 'Playsuit': 'Tuta Corta', 'Trousers': 'Pantaloni', 'Pants': 'Pantaloni',
  'Wide Leg Trousers': 'Pantaloni a Gamba Larga', 'Linen Trousers': 'Pantaloni di Lino',
  'Cargo Trousers': 'Pantaloni Cargo', 'Palazzo Trousers': 'Pantaloni Palazzo',
  'Flared Trousers': 'Pantaloni a Zampa', 'Jeans': 'Jeans', 'Wide Leg Jeans': 'Jeans a Gamba Larga',
  'Cardigan': 'Cardigan', 'Sweater': 'Maglione', 'Co-ord Set': 'Coordinato',
  'Two Piece Set': 'Completo Due Pezzi', 'Tote Bag': 'Borsa Shopper', 'Shoulder Bag': 'Borsa a Spalla',
  'Crossbody Bag': 'Borsa a Tracolla', 'Handbag': 'Borsa', 'Woven Bag': 'Borsa Intrecciata',
  'Bag': 'Borsa', 'Loafers': 'Mocassini', 'Ballet Flats': 'Ballerine',
  'Mary Jane Shoes': 'Scarpe Mary Jane', 'Slingback Flats': 'Ballerine Slingback',
  'Sandals': 'Sandali', 'Slides': 'Ciabatte', 'Flip Flops': 'Infradito', 'Cork Sandals': 'Sandali in Sughero',
  'Heels': 'Décolleté', 'Court Shoes': 'Décolleté', 'Mules': 'Mules',
  'Clogs': 'Zoccoli', 'Ankle Boots': 'Stivaletti', 'Knee High Boots': 'Stivali Alti',
  'Cowboy Boots': 'Stivali Texani', 'Boots': 'Stivali', 'Sneakers': 'Sneakers'
};

// ── Nederlandse producttypes (Engels -> Nederlands, voor de variant-/producttype-weergave) ──
const dutchTypeMap = {
  'Dress': 'Jurk', 'Maxi Dress': 'Maxi-jurk', 'Mini Dress': 'Mini-jurk',
  'Midi Dress': 'Midi-jurk', 'Bodycon Dress': 'Bodycon-jurk',
  'Wrap Dress': 'Overslagjurk', 'Shirt Dress': 'Blousejurk',
  'Denim Dress': 'Spijkerjurk', 'Skirt': 'Rok', 'Midi Skirt': 'Midi-rok',
  'Maxi Skirt': 'Maxi-rok', 'Mini Skirt': 'Mini-rok', 'Denim Skirt': 'Spijkerrok',
  'Blouse': 'Blouse', 'Top': 'Top', 'Jacket': 'Jas', 'Blazer': 'Blazer',
  'Coat': 'Mantel', 'Trench Coat': 'Trenchcoat', 'Denim Jacket': 'Spijkerjas',
  'Jumpsuit': 'Jumpsuit', 'Playsuit': 'Playsuit', 'Trousers': 'Broek', 'Pants': 'Broek',
  'Wide Leg Trousers': 'Wijde Broek', 'Linen Trousers': 'Linnen Broek',
  'Cargo Trousers': 'Cargobroek', 'Palazzo Trousers': 'Palazzobroek',
  'Flared Trousers': 'Flared Broek', 'Jeans': 'Jeans', 'Wide Leg Jeans': 'Wijde Jeans',
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

// Vertaalt een (NL/DE/FR/ES/EN) kleurnaam naar nette Engelse kleur.
// 1) directe match  2) strip intensiteits-prefix (licht/donker/hell/dunkel/dark/light) en map de basis
// 3) samengesteld -> laatste bekende kleurwoord  4) anders nette kapitalisatie.
function translateColor(color) {
  var raw = String(color || '').toLowerCase().trim();
  if (!raw) return 'One Colour';
  if (colorMap[raw]) return colorMap[raw];
  var m = raw.match(/^(licht|donker|dark|light|hell|dunkel)[\s-]*(.+)$/);
  if (m && colorMap[m[2]]) {
    var base = colorMap[m[2]];
    if (/^(licht|light|hell)$/.test(m[1])) return 'Light ' + base;
    return 'Dark ' + base;
  }
  var tokens = raw.split(/[\s/\-]+/).filter(Boolean);
  for (var i = tokens.length - 1; i >= 0; i--) {
    if (colorMap[tokens[i]]) return colorMap[tokens[i]];
  }
  return color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
}

function translateColorPolish(color) {
  const raw = String(color || '').toLowerCase().trim();
  if (!raw) return 'Jeden kolor';
  if (polishColorMap[raw]) return polishColorMap[raw];
  const en = translateColor(color).toLowerCase().trim();
  if (polishColorMap[en]) return polishColorMap[en];
  const tokens = en.split(/[\s/\-]+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (polishColorMap[tokens[i]]) return polishColorMap[tokens[i]];
  }
  return color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
}

function translateColorItalian(color) {
  const raw = String(color || '').toLowerCase().trim();
  if (!raw) return 'Tinta unita';
  if (italianColorMap[raw]) return italianColorMap[raw];
  const en = translateColor(color).toLowerCase().trim();
  if (italianColorMap[en]) return italianColorMap[en];
  const tokens = en.split(/[\s/\-]+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (italianColorMap[tokens[i]]) return italianColorMap[tokens[i]];
  }
  return color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
}

function translateColorDutch(color) {
  const raw = String(color || '').toLowerCase().trim();
  if (!raw) return 'Eén kleur';
  if (dutchColorMap[raw]) return dutchColorMap[raw];
  const en = translateColor(color).toLowerCase().trim();
  if (dutchColorMap[en]) return dutchColorMap[en];
  const tokens = en.split(/[\s/\-]+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (dutchColorMap[tokens[i]]) return dutchColorMap[tokens[i]];
  }
  return color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
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

  const response = await callAnthropic({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: `You are the dedicated product listing assistant for ${storeName}, a women's fashion webshop. Create fully compliant Shopify-ready product listings. Follow every rule exactly.

LANGUAGE: The "Language" field decides the language of the title, description and meta description.
- english: Write the title, description and meta description in natural UK English. Title MUST end with "for women". Translate any non-English product name to English.
- polish: Write the title, description and meta description in natural Polish. Title MUST end with "dla kobiet". Translate any non-Polish product name to Polish. Use Polish fashion SEO keywords (sukienka, sukienki damskie, sukienka maxi, sukienka midi, sukienka na wesele, spódnica, spódnica midi, bluzka, komplet, żakiet).
- italian: Write the title, description and meta description in natural Italian. Title MUST end with "da donna". Translate any non-Italian product name to Italian. Use Italian fashion SEO keywords (vestito, vestito lungo, vestito midi, abito da cerimonia, gonna, gonna midi, camicetta, pantaloni a gamba larga, sandali, mocassini, borsa a tracolla, stivali). For synthetic leather use "Ecopelle" — NEVER "Vegan Leather" or "Faux Leather".
- dutch: Write the title, description and meta description in natural Dutch (Nederlands). Title MUST end with "voor dames". Translate any non-Dutch product name to Dutch. Use Dutch fashion SEO keywords (jurk, zomerjurk, maxi-jurk, midi-jurk, galajurk, bruiloftgast jurk, blouse, wijde broek, linnen broek, rok, spijkerrok, schoudertas, sandalen, hakken, laarzen, sneakers).
Never mix languages within a single listing. Only use German or French words if they are the established fashion term (e.g. blazer, trench).
NOTE: the "productType", "material", "occasion" and "style" fields are ALWAYS returned in English, regardless of the listing language.

BRAND CONTEXT:
Store: ${storeName}. Tone: clean, neutral, refined, factual. Never write hype, never exaggerate.

PRODUCT CLASSIFICATION (do this yourself — never rely on the hint):
- Determine the exact productType from the product name and description. NEVER default to "Dress" — classify what the item actually is.
- Return productType in ENGLISH, specific and canonical. Choose the closest of: Maxi Dress, Midi Dress, Mini Dress, Shirt Dress, Denim Dress, Wrap Dress, Bodycon Dress, Linen Top, Satin Blouse, Corset Top, Halter Top, Top, Blouse, Wide Leg Trousers, Linen Trousers, Palazzo Trousers, Cargo Trousers, Flared Trousers, Wide Leg Jeans, Jeans, Trousers, Denim Skirt, Midi Skirt, Maxi Skirt, Mini Skirt, Skirt, Tote Bag, Shoulder Bag, Crossbody Bag, Handbag, Woven Bag, Bag, Loafers, Ballet Flats, Mary Jane Shoes, Slingback Flats, Sandals, Slides, Flip Flops, Cork Sandals, Heels, Court Shoes, Mules, Clogs, Ankle Boots, Knee High Boots, Cowboy Boots, Boots, Sneakers, Trench Coat, Blazer, Denim Jacket, Quilted Jacket, Coat, Jacket, Co-ord Set, Two Piece Set, Jumpsuit, Playsuit.
- Also extract these attributes ONLY when clearly evident or reasonably inferable (NEVER invent a fabric that isn't indicated):
  • material: e.g. Linen, Cotton, Denim, Satin, Knit, Leather, Vegan Leather, Suede, Crochet. ALWAYS use "Vegan Leather" — NEVER write "Faux Leather". Leave empty if not indicated.
  • occasion: e.g. Summer, Holiday, Wedding Guest, Evening, Workwear, Casual, Festival. May be inferred from the style. Leave empty if unclear.
  • style: one or two descriptive words (e.g. "Boho", "Minimalist", "Western", "Y2K"). Leave empty if unclear.

SEO TITLE RULES:
- The SEO title is the single most important field: it is pushed straight into Google Shopping. It MUST be keyword-led, specific and accurate.
- NO colours and NO sizes in the title. The product has multiple colour/size variants, so the title targets the CATEGORY search term, never one variant.
- ACCURACY: only use attributes that are genuinely true for this product. NEVER invent material, occasion, fabric or features. NEVER write "faux leather" — if the upper is synthetic leather, call it "vegan leather" (english/polish) or "Ecopelle" (italian). NEVER use promotional words (sale, % off, free shipping, best) or ALL CAPS.
- Lead with the matching high-volume category keyword, then use as the SECOND term the highest-search modifier that fits (e.g. tassel, penny, chunky, platform, woven, vegan leather, wide leg, linen, large) — NOT a niche construction detail. Add ONE distinctive detail only if it doesn't push out a more-searched term. Keyword banks:

  ENGLISH (title MUST end with "for women"):
  • Dresses: summer dress, maxi dress, midi dress, mini dress, floral dress, linen dress, wedding guest dress, cocktail dress, bodycon dress, wrap dress, shirt dress, denim dress
  • Tops & blouses: linen top, satin blouse, going out top, corset top, halter top
  • Trousers: wide leg trousers, linen trousers, palazzo trousers, cargo trousers, wide leg jeans, high waisted trousers, flared trousers
  • Skirts: denim skirt, midi skirt, maxi skirt, mini skirt
  • Bags: tote bag, shoulder bag, crossbody bag, handbag, woven bag, straw bag, beach bag, raffia bag
  • Loafers & flats: loafers, tassel loafers, penny loafers, chunky loafers, ballet flats, mary jane shoes, slingback flats, woven flats, flat shoes
  • Sandals & slides: sandals, slides, flip flops, cork sandals, footbed sandals
  • Heels: heels, block heel sandals, kitten heels, court shoes, pumps, mule heels, slingback heels
  • Boots: ankle boots, knee high boots, cowboy boots, western boots, chunky boots, heeled boots
  • Clogs: clogs, clog mules
  • Outerwear: trench coat, blazer, denim jacket, quilted jacket
  • Co-ords: co-ord set, two piece set

  POLISH (title MUST end with "dla kobiet"):
  • Sukienki: sukienka letnia, sukienka maxi, sukienka midi, sukienka na wesele, sukienka koktajlowa, sukienka lniana
  • Spodnie: spodnie szerokie, spodnie lniane, spodnie palazzo, szerokie jeansy, spodnie z wysokim stanem
  • Spódnice: spódnica jeansowa, spódnica midi, spódnica maxi
  • Torebki: torebka shopper, torba na ramię, torebka crossbody, torba plażowa, torebka pleciona
  • Buty: mokasyny, baleriny, klapki, sandały, czółenka, kozaki, botki, kowbojki
  • Okrycia: trencz, marynarka, kurtka jeansowa
  • Komplety: komplet dwuczęściowy

  ITALIAN (title MUST end with "da donna"):
  • Vestiti: vestito estivo, vestito lungo, vestito midi, vestito corto, abito da cerimonia, vestito floreale, vestito di lino
  • Pantaloni: pantaloni a gamba larga, pantaloni di lino, pantaloni palazzo, pantaloni cargo, jeans a gamba larga, pantaloni a vita alta
  • Gonne: gonna di jeans, gonna midi, gonna lunga
  • Borse: borsa shopper, borsa a spalla, borsa a tracolla, borsa di paglia, borsa intrecciata
  • Scarpe: mocassini, ballerine, ciabatte, sandali, décolleté, stivali, stivaletti
  • Capispalla: trench, blazer, giacca di jeans
  • Coordinati: completo due pezzi

  DUTCH (title MUST end with "voor dames"):
  • Jurken: zomerjurk, maxi-jurk, midi-jurk, mini-jurk, galajurk, bruiloftgast jurk, cocktailjurk, bloemenjurk, linnen jurk
  • Broeken: wijde broek, linnen broek, palazzo broek, cargobroek, wijde jeans, broek met hoge taille
  • Rokken: spijkerrok, midi-rok, maxi-rok, mini-rok
  • Tassen: shopper, schoudertas, crossbodytas, handtas, gevlochten tas, strandtas, rieten tas
  • Schoenen: loafers, ballerina's, sandalen, slippers, hakken, pumps, laarzen, enkellaarsjes, sneakers
  • Jassen: trenchcoat, blazer, spijkerjas
  • Setjes: tweedelig setje
- NEVER use (any language): luxury, elegant, perfect, flattering, shaping, slimming, premium quality, comfort fit.
- Structure: Primary category keyword + high-search secondary keyword + one distinctive detail + ending phrase. Keep under ~70 characters where possible.
- UNIQUENESS (critical): The title MUST be unique and specific to THIS exact product. NEVER produce a generic title that could fit other products, and NEVER reuse a product name. Always weave in at least one distinctive detail of THIS item (e.g. print, neckline, sleeve, hem, length, heel type, fabric, closure) so that no two products ever end up with the same title.

PRODUCT DESCRIPTION RULES:
- Structure EXACTLY: Intro paragraph (2 sentences) + 5 bullet points + Closing sentence (1 sentence).
- Intro: Hook the reader with the key design feature + styling versatility. Be specific and vivid.
- Bullets: Each bullet describes ONE specific, visible feature — cut, silhouette, hem detail, length, material finish, closure (for bags/shoes: strap, sole, fastening, compartments, heel height).
- Closing: One punchy styling suggestion sentence.
- Use only visible product features — never invent.
- NEVER mention: comfort, support, posture, pain relief, healing, anti-slip, breathable, slimming, shaping, luxury, elegant, perfect, flattering. NEVER write "faux leather" — use "vegan leather" (english/polish) or "Ecopelle" (italian).
- FORBIDDEN health/medical claims in ITALIAN (never use): ortopedico, plantare ortopedico, anatomico, antiscivolo, traspirante, dimagrante, snellente.
- Refer to the product by its type in the chosen language (English type if english, Polish type if polish, Italian type if italian, Dutch type if dutch).
- Write like ASOS product copy: confident, specific, direct — not generic.
- UNIQUENESS (critical): The description MUST be unique to THIS product. NEVER reuse sentences, phrasing, or bullet wording that could apply to another product.

META DESCRIPTION RULES:
- Format: [Product type] + [key design feature] + [occasion/style context] + [call to action] ending with "– ${storeName}".
- Max 160 characters STRICTLY.
- Direct, punchy, benefit-driven, in the chosen language.

OUTPUT FORMAT — output ONLY this JSON, no other text, no markdown, no code blocks. material/occasion/style are empty strings if unknown:
{"productType":"...","material":"...","occasion":"...","style":"...","seoTitle":"...","description":"...","metaDescription":"..."}`,
    messages: [{
      role: 'user',
      content: 'Classify and create a listing for:\nName: ' + cleanedTitle + '\nType hint (may be empty or wrong — classify yourself): ' + (productInfo.type || 'unknown') + '\nColors: ' + (productInfo.colors || []).join(', ') + '\nMaterial hint: ' + (productInfo.material || 'unknown') + '\nSeason: ' + (productInfo.season || 'not specified') + '\nOriginal description: ' + (productInfo.originalDescription || 'none') + '\nLanguage: ' + (productInfo.language || 'english') + '\n\nIMPORTANT: Determine productType yourself from the name and description — NEVER default to Dress. If language is "polish" — write the title/description/meta in Polish, translate the product name to Polish, use Polish fashion SEO keywords, title must end with "dla kobiet". If language is "italian" — write the title/description/meta in Italian, translate the product name to Italian, use Italian fashion SEO keywords, title must end with "da donna", and use "Ecopelle" instead of "Vegan Leather"/"Faux Leather". If language is "dutch" — write the title/description/meta in Dutch, translate the product name to Dutch, use Dutch fashion SEO keywords, title must end with "voor dames". If language is "english" — write them in natural UK English, title must end with "for women". The productType/material/occasion/style fields stay in English. Keep the customer-facing text in the chosen listing language only (no German or French words unless they are the standard fashion term).' + (String(productInfo.market || '').toLowerCase() === 'usa' ? '\n\nMARKET = USA: Write in natural AMERICAN English. Use US spelling (color, favorite, gray, jewelry) and US retail vocabulary (pants not trousers, sneakers not trainers, purse/handbag, fall not autumn, vacation not holiday). Title still ends with "for women". Use US-oriented fashion search keywords.' : '')
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

function buildPhotoPrompts(seoTitle, color) {
  const colorDesc = colorPromptDescription(color);
  const GARMENT = seoTitle + ' in ' + colorDesc;
  const detailKeywords = ['neckline', 'sleeve', 'collar', 'hem', 'waist', 'button', 'zip', 'ruffle', 'bow', 'tie', 'slit', 'pleat', 'gather', 'ruche', 'butterfly'];
  let detail = 'neckline and sleeve detail';
  for (const kw of detailKeywords) {
    if (seoTitle.toLowerCase().includes(kw)) { detail = kw + ' detail'; break; }
  }
  return [
    'Professional e-commerce fashion photo. The model is ' + MODEL + ', neutral confident expression. She is wearing ' + GARMENT + ', styled with ' + STYLING + '. The photo is cropped from ' + CROP + ' — the garment fills the frame and is the clear focus, NOT a full-body shot. Clean light gray studio background, soft even studio lighting, no harsh shadows. High-end fashion e-commerce photography style. Photorealistic. No text, no watermark.',
    'Professional e-commerce fashion photo. The model is ' + MODEL + ', turned with her back fully to the camera, looking slightly over her left shoulder with a relaxed expression. She is wearing ' + GARMENT + ' — back details, seams, and construction clearly visible. Styled with ' + STYLING + '. Photo cropped from ' + CROP + ' — tight on the garment, NOT a full-body shot. Clean light gray studio background, soft even studio lighting. High-end fashion e-commerce photography style. Photorealistic. No text, no watermark.',
    'Professional e-commerce fashion photo. The model is ' + MODEL + ', posed at a 45-degree angle to the camera, looking toward the camera with a relaxed expression. She is wearing ' + GARMENT + ', styled with ' + STYLING + '. Photo cropped from ' + CROP + ' — tight on the garment, NOT a full-body shot. Clean light gray studio background, soft even studio lighting. High-end fashion e-commerce photography style. Photorealistic. No text, no watermark.',
    'Extreme macro close-up photo of the fabric of a ' + GARMENT + '. The fabric color is ' + colorDesc + '. Shows the weave, texture, and material quality in sharp detail, slight natural fold in the fabric for depth. Soft diffused natural lighting, neutral background. Fabric texture fills the entire frame. 3:4 aspect ratio. Photorealistic product photography. No model, no text, no watermark.',
    'Close-up product photo of the ' + detail + ' on a ' + GARMENT + '. The fabric color is ' + colorDesc + '. Sharp focus on the detail with slight background blur showing the surrounding fabric. Soft studio lighting. Shows craftsmanship and construction quality clearly. 3:4 aspect ratio. Photorealistic fashion detail photography. No model, no text, no watermark.',
    'Lifestyle fashion photography. The model is ' + MODEL + ', in a natural candid pose outdoors in an urban setting — city sidewalk, warm golden hour sunlight, blurred background with soft bokeh. She is wearing ' + GARMENT + ' styled with ' + STYLING + ' and a small handbag. Natural expression, slight smile. Full body visible from head to toe. Editorial fashion photography style. Photorealistic. No text, no watermark.',
    'Full-body studio fashion photo. The model is ' + MODEL + ', standing in a relaxed pose, full body visible from head to toe. She is wearing ' + GARMENT + ' styled as a complete outfit with ' + STYLING + ' and complementary footwear. Clean light gray studio background, soft even studio lighting. Fashion lookbook photography style. Photorealistic. No text, no watermark.',
    'Flat lay product photo of ' + GARMENT + ' laid neatly and symmetrically on a clean white marble surface. Fully spread out, wrinkle-free, all design details visible. Shot from directly above (bird\'s eye view). Soft natural window light from the left. One or two minimal complementary accessories placed beside the garment for context. Clean editorial e-commerce style. 3:4 aspect ratio. Photorealistic. No model, no text, no watermark.'
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
  try { data = JSON.parse(responseText); } catch(e) { throw new Error('Kie.ai invalid JSON'); }
  const taskId = data && data.data && (data.data.taskId || data.data.task_id) || data && data.taskId;
  if (!taskId) throw new Error('Geen taskId: ' + JSON.stringify(data));
  return taskId;
}

async function pollKieTask(taskId) {
  for (let i = 0; i < 40; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); });
    const poll = await fetch('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + taskId, { headers: { 'Authorization': 'Bearer ' + KIE_API_KEY } });
    const pollText = await poll.text();
    let result;
    try { result = JSON.parse(pollText); } catch(e) { continue; }
    const state = result && result.data && result.data.state;
    if (state === 'success') {
      let imgUrl = null;
      try { const rj = JSON.parse(result.data.resultJson); imgUrl = rj.resultUrls && rj.resultUrls[0]; } catch(e) {}
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

// Zet SEO page title + meta description EN extra metafields via het APARTE metafields-endpoint.
// BELANGRIJK: title_tag altijd zo wegschrijven (los metafield) en NOOIT via het product-seo-veld,
// anders zet Shopify 'm op "default" en loopt het veld leeg zodra titel == SEO-titel.
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
        if (r.status === 429) { await new Promise(function(res) { setTimeout(res, 2000); }); continue; }
        if (r.ok) {
          success++;
          console.log('[addImagesWithVariants] Image ' + (i + 1) + '/' + items.length + ' uploaded (' + (image.variant_ids ? image.variant_ids.length + ' varianten' : 'algemeen') + ')');
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
    await new Promise(function(res) { setTimeout(res, 500); });
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
  p = p.replace(/\s*,?\s*(dla kobiet|for women|da donna)\s*$/i, '').trim();
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
      (data.products || []).forEach(function(p) {
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

  try {
    // ── Markt-gestuurde taal: het gekozen Land bepaalt de listing-taal. ──
    // Italië -> Italiaans, Polen -> Pools, anders de meegegeven taal (default Engels).
    const market = (productInfo.market || 'uk').toLowerCase();
    let lang = (productInfo.language || 'english').toLowerCase();
    if (market === 'italie') lang = 'italian';
    if (market === 'polen')  lang = 'polish';
    if (market === 'nederland') lang = 'dutch';
    productInfo.language = lang; // zodat de AI-prompt de juiste taal pakt

    const storeName = productInfo.storeId === 'store2' ? 'Lorenzari' : (productInfo.storeName || 'Yamira London');
    const generated = await generateDescription(productInfo);

    // Faux Leather -> Vegan Leather overal afdwingen (backstop bovenop de prompt).
    let description = veganLeather(generated.description || '');
    let seoTitle = veganLeather(generated.seoTitle || productInfo.title);
    let metaDescription = veganLeather(generated.metaDescription || '');

    // Italiaans: in de KLANTTEKST "Vegan/Faux Leather" -> "Ecopelle" (material-metaveld blijft Engels).
    if (lang === 'italian') {
      description = italianLeather(description);
      seoTitle = italianLeather(seoTitle);
      metaDescription = italianLeather(metaDescription);
    }

    const detectedType = (generated.productType && String(generated.productType).trim()) || '';
    const productType = detectedType
      || (productInfo.type && String(productInfo.type).trim())
      || inferTypeFromText(cleanTitleSafe(productInfo.title) + ' ' + (productInfo.originalDescription || ''));

    const material = veganLeather((generated.material && String(generated.material).trim()) || (productInfo.material ? String(productInfo.material).trim() : ''));
    const occasion = (generated.occasion && String(generated.occasion).trim()) || '';
    const style = (generated.style && String(generated.style).trim()) || '';

    let displayTitle = seoTitle;
    if (productInfo.useNameTitle) {
      const uniqueName = await pickUniqueName(reqToken, reqStore);
      const phrase = styledPhrase(seoTitle);
      displayTitle = uniqueName + ' – ' + (phrase || seoTitle);
      console.log('[handler] Naam-titel optie aan ->', displayTitle);
    }
    const urlHandle = titleToUrlHandle(displayTitle);

    const footwear = isFootwearType(productType);
    const oneSize = isOneSizeType(productType);

    // ── Kleuren: gooi alles eruit dat een MAAT is (maten lekken soms in de kleur-as) ──
    const rawColors = (productInfo.colors || []).filter(function(c) { return c && !looksLikeSize(c); });
    // Schoenmaten die per ongeluk in de kleur-as zaten -> bewaren als mogelijke schoenmaten.
    const shoeSizesFromColors = (productInfo.colors || []).filter(looksLikeShoeSize);

    const mappedColors = rawColors.length > 0
      ? (lang === 'polish' ? rawColors.map(translateColorPolish)
         : lang === 'italian' ? rawColors.map(translateColorItalian)
         : lang === 'dutch' ? rawColors.map(translateColorDutch)
         : rawColors.map(translateColor))
      : [lang === 'polish' ? 'Jeden kolor' : (lang === 'italian' ? 'Tinta unita' : (lang === 'dutch' ? 'Eén kleur' : 'One Colour'))];
    const seenColors = {};
    const colors = mappedColors.filter(function(c) {
      var k = String(c).toLowerCase().trim();
      if (!k || seenColors[k]) return false;
      seenColors[k] = true;
      return true;
    });

    const displayProductType = lang === 'polish' ? (polishTypeMap[productType] || productType)
      : lang === 'italian' ? (italianTypeMap[productType] || productType)
      : lang === 'dutch' ? (dutchTypeMap[productType] || productType)
      : productType;
    const season = productInfo.season || 'ALL YEAR';

    // ── Maten: tassen/accessoires = ALTIJD One Size · schoenen = ALLEEN schoenmaten · kleding = XS–XXL ──
    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const defaultShoeSizes = ['36', '37', '38', '39', '40', '41'];
    let sizes;
    if (oneSize) {
      sizes = [lang === 'polish' ? 'Uniwersalny' : (lang === 'italian' ? 'Taglia unica' : (lang === 'dutch' ? 'One Size' : 'One Size'))];
    } else if (footwear) {
      // Schoenen krijgen NOOIT kledingmaten. Pak echte schoenmaten (meegegeven + uit kleur-as gelekt), anders default.
      var passedShoe = (productInfo.sizes || []).filter(looksLikeShoeSize);
      var allShoe = passedShoe.concat(shoeSizesFromColors);
      var seenShoe = {};
      allShoe = allShoe.filter(function(s) { var k = String(s).toLowerCase().trim(); if (!k || seenShoe[k]) return false; seenShoe[k] = true; return true; });
      var shoeSrc = allShoe.length ? allShoe : defaultShoeSizes;
      sizes = shoeSrc.map(function(s) { return mapSizeLabel(s, lang, true, market); });
    } else if (productInfo.sizes && productInfo.sizes.length) {
      // Kleding: meegegeven maten, maar schoen-getallen eruit.
      var clothing = productInfo.sizes.filter(function(s) { return !looksLikeShoeSize(s); });
      var clSrc = clothing.length ? clothing : defaultSizes;
      sizes = clSrc.map(function(s) { return mapSizeLabel(s, lang, false, market); });
    } else {
      sizes = defaultSizes.map(function(s) { return mapSizeLabel(s, lang, false, market); });
    }
    // Ontdubbel maten zodat geen dubbele kleur+maat-varianten ontstaan (Shopify 422).
    var seenSize = {};
    sizes = sizes.filter(function(s) { var k = String(s).toLowerCase().trim(); if (!k || seenSize[k]) return false; seenSize[k] = true; return true; });

    // ── Tags ──
    const mainCategory = mainCategoryFor(productType, lang);
    const genderTag = lang === 'polish' ? 'Kobiety' : (lang === 'italian' ? 'Donna' : (lang === 'dutch' ? 'Dames' : 'Women'));
    const tagSet = [season, displayProductType, mainCategory, occasion, material, style, genderTag];
    const seen = {};
    const tags = tagSet.filter(function(x) {
      if (!x) return false;
      var k = String(x).toLowerCase().trim();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    }).join(', ');

    // ── Valuta per markt: Polen = PLN, Italië = EUR, anders GBP ──
    const targetCurrency = (market === 'polen' || lang === 'polish') ? 'PLN'
      : (market === 'italie' || lang === 'italian' || market === 'nederland' || lang === 'dutch') ? 'EUR'
      : (market === 'usa') ? 'USD'
      : 'GBP';
    const price = productInfo.convertedPrice
      ? parseFloat(productInfo.convertedPrice)
      : convertPrice(productInfo.originalPrice, productInfo.currency || 'EUR', targetCurrency);

    const variants = [];
    if (colors.length > 0 && sizes.length > 0) {
      for (const color of colors) {
        for (const size of sizes) {
          variants.push({ option1: color, option2: size, price: price.toString(), compare_at_price: null, taxable: false });
        }
      }
    } else {
      for (const size of sizes) {
        variants.push({ option1: size, price: price.toString(), compare_at_price: null, taxable: false });
      }
    }

    let generatedImages = [];
    if (generatePhotos) {
      const primaryColor = rawColors.length > 0 ? translateColor(rawColors[0]) : 'the garment colour';
      const prompts = buildPhotoPrompts(seoTitle, primaryColor);
      const taskIds = [];
      for (let i = 0; i < prompts.length; i++) {
        try { const taskId = await submitKieTask(prompts[i]); taskIds.push({ taskId: taskId, index: i }); } catch(e) { console.error('Submit task ' + i + ' failed:', e.message); }
      }
      for (let j = 0; j < taskIds.length; j++) {
        const item = taskIds[j];
        try { const imgUrl = await pollKieTask(item.taskId); if (imgUrl) generatedImages.push({ src: imgUrl, position: item.index + 1 }); } catch(e) { console.error('Photo failed:', e.message); }
      }
    }

    const colourLabel = lang === 'polish' ? 'Kolor' : (lang === 'italian' ? 'Colore' : 'Colour');
    const sizeLabel = lang === 'polish' ? 'Rozmiar' : (lang === 'italian' ? 'Taglia' : 'Size');

    const shopifyProduct = {
      title: displayTitle,
      handle: urlHandle,
      body_html: description ? (function(d) {
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

    // Google-categorie: schoenen 187, tassen 3032, rokken 1581, broeken 204, jurken 2271, tops 212.
    var gType = String(productType).toLowerCase();
    var googleCategory =
      /bag|tas|tote|clutch|handbag|crossbody|torebka|torba/.test(gType) ? '3032' :
      /loafer|flat|ballet|slingback|sandal|slide|heel|pump|mule|clog|boot|sneaker|shoe|laars|schoen|hak/.test(gType) ? '187' :
      /skirt|rok|spódnica/.test(gType) ? '1581' :
      /trouser|jeans|pant|broek|spodnie|cargo|palazzo|legging/.test(gType) ? '204' :
      /dress|jurk|sukienka/.test(gType) ? '2271' :
      /top|blouse|shirt|bluzka/.test(gType) ? '212' : '';

    if (productId) {
      await setProductMetafields(productId, reqToken, reqStore, {
        seoTitle: seoTitle,
        metaDescription: metaDescription,
        material: material,
        occasion: occasion,
        style: style,
        gender: 'Female',
        ageGroup: 'Adult',
        googleCategory: googleCategory
      });
    }

    // ── Foto's koppelen ──
    const createdVariants = (result.product && result.product.variants) || [];
    const hasColorOption = !!(variants[0] && variants[0].option2);

    const colorToVariantIds = {};
    if (hasColorOption) {
      createdVariants.forEach(function(v) {
        const key = String(v.option1 || '').toLowerCase().trim();
        if (!colorToVariantIds[key]) colorToVariantIds[key] = [];
        colorToVariantIds[key].push(v.id);
      });
    }

    const keptSet = new Set((productInfo.originalImages || []).map(function(s) { return String(s).split('?')[0]; }));
    function isKept(src) { return keptSet.size === 0 ? true : keptSet.has(String(src).split('?')[0]); }

    const imageItems = [];
    const usedSrc = new Set();
    const ibc = (!generatePhotos && productInfo.imagesByColor) ? productInfo.imagesByColor : null;

    if (ibc && hasColorOption) {
      Object.keys(ibc).forEach(function(color) {
        const mappedColor = lang === 'polish' ? translateColorPolish(color)
          : lang === 'italian' ? translateColorItalian(color)
          : lang === 'dutch' ? translateColorDutch(color)
          : translateColor(color);
        const vids = colorToVariantIds[String(mappedColor).toLowerCase().trim()]
          || colorToVariantIds[String(color).toLowerCase().trim()]
          || [];
        (ibc[color] || []).forEach(function(src) {
          const norm = String(src).split('?')[0];
          if (!isKept(src) || usedSrc.has(norm)) return;
          usedSrc.add(norm);
          imageItems.push({ src: src, variant_ids: vids });
        });
      });
    }

    const restSrc = generatedImages.length > 0
      ? generatedImages.map(function(i) { return i.src; })
      : (productInfo.originalImages || []);
    restSrc.forEach(function(src) {
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
      googleCategory: googleCategory,
      imagesGenerated: generatedImages.length
    });

  } catch(err) {
    console.error('[handler] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
