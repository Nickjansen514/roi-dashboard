const KIE_API_KEY = process.env.KIE_API_KEY;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

const MODEL = 'a confident professional fashion model, early 30s, light medium skin tone, long dark brown wavy hair, slim build, UK size 10, standing upright, British fashion aesthetic';
const CROP = 'mid-thigh up';
const STYLING = 'minimal delicate jewellery, nude heels';

function convertPrice(originalPrice, currency = 'EUR', target = 'GBP') {
  const toGbp = { EUR: 0.86, USD: 0.79, GBP: 1, PLN: 0.20 };          // bron -> GBP
  const gbpPerTarget = { GBP: 1, PLN: 0.20, EUR: 0.86, USD: 0.79 };   // 1 doel-eenheid in GBP
  const gbp = originalPrice * (toGbp[currency] || 0.86);
  const amount = gbp / (gbpPerTarget[target] || 1);                   // GBP -> doelvaluta (PLN ~ x5)
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

// Canadese (US) kledingmaten. US = UK - 4.
const caSizeMap = {
  'XS': 'XS (US 2)', 'S': 'S (US 4)', 'M': 'M (US 6)',
  'L': 'L (US 8)', 'XL': 'XL (US 10)', 'XXL': 'XXL (US 12)',
  '2XL': 'XXL (US 12)', '3XL': 'XXXL (US 14)', 'XXXL': 'XXXL (US 14)',
  '34': 'XS (US 2)', '36': 'S (US 4)', '38': 'M (US 6)',
  '40': 'L (US 8)', '42': 'XL (US 10)', '44': 'XXL (US 12)'
};

// Schoenmaten: UK -> EU (damesmaten, anker UK 3 = EU 36).
// Halve UK-maten ronden af naar de EU-maat van de hele UK-maat eronder (EU kent minder maten).
const shoeSizeMap = {
  '2': '35', '2.5': '35', '3': '36', '3.5': '36',
  '4': '37', '4.5': '37', '5': '38', '5.5': '38',
  '6': '39', '6.5': '39', '7': '40', '7.5': '40',
  '8': '41', '8.5': '41', '9': '42'
};

// Herkent of een producttype schoeisel is.
function isFootwearType(type) {
  var t = String(type || '').toLowerCase();
  return /espadrille|slingback|kitten|heel|stiletto|pump|sandal|ballet|ballerina|loafer|moccasin|sneaker|trainer|boot|mule|wedge|brogue|oxford|derby|slipper|flat|clog|flip|shoe|footwear|schoen|laars|sandaal|hak|pantoffel|instapper|sleehak/.test(t);
}

// Herkent of een producttype een one-size accessoire is (tas, sieraad, sjaal, riem, pet, zonnebril).
// Wordt toegepast op het GECLASSIFICEERDE type, dus 'riem' triggert alleen bij echte riemen, niet bij een jurk "met riem".
function isOneSizeType(type) {
  var t = String(type || '').toLowerCase();
  return /\bbag\b|\btas\b|tote|clutch|backpack|rugzak|handbag|handtas|schoudertas|crossbody|torebka|torba|jewell|jewel|necklace|earring|bracelet|sieraad|ketting|scarf|sjaal|\bhat\b|\bcap\b|\bpet\b|muts|\bbelt\b|\briem\b|sunglass|zonnebril/.test(t);
}

// Vangnet-classificatie op basis van tekst, als de AI om wat voor reden dan ook geen type teruggeeft.
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

// Hoofdcategorie (voor tags) op basis van het geclassificeerde type.
function mainCategoryFor(productType, lang) {
  var t = String(productType || '').toLowerCase();
  var pl = lang === 'polish';
  if (/dress|jurk|sukienka/.test(t)) return pl ? 'Sukienki' : 'Dresses';
  if (/skirt|\brok\b|spódnica/.test(t)) return pl ? 'Spódnice' : 'Bottoms';
  if (/trouser|jeans|pants|broek|spodnie|cargo|palazzo|legging/.test(t)) return pl ? 'Spodnie' : 'Bottoms';
  if (/jacket|coat|blazer|trench|\bjas\b|kurtka|płaszcz|okrycie/.test(t)) return pl ? 'Okrycia' : 'Outerwear';
  if (/top|blouse|shirt|bluzka/.test(t)) return pl ? 'Bluzki' : 'Tops';
  if (/bag|\btas\b|tote|clutch|backpack|handbag|handtas|schoudertas|crossbody|torebka|torba/.test(t)) return pl ? 'Torebki' : 'Bags';
  if (/loafer|flat|ballet|slingback|sandal|slide|heel|pump|mule|clog|boot|sneaker|shoe|laars|schoen|\bhak\b|botki|kozaki|mokasyn|baleriny/.test(t)) return pl ? 'Buty' : 'Shoes';
  if (/jumpsuit|playsuit|romper|kombinezon/.test(t)) return pl ? 'Kombinezony' : 'Jumpsuits';
  if (/co-?ord|two.?piece|komplet|\bset\b/.test(t)) return pl ? 'Komplety' : 'Co-ords';
  return null;
}

// Zet een ruwe maat om naar het juiste label.
function mapSizeLabel(s, lang, isFootwear, market) {
  market = (market || 'uk').toLowerCase();
  var key = String(s).toUpperCase().trim();
  var base = key.replace(/\s*\([^)]*\)\s*$/, '').trim(); // "XS (UK6)" -> "XS"
  var euInLabel = key.match(/EU\s*([\d.]+)/);
  var shoeKey = base.replace(/^UK\s*/, '').replace(/^US\s*/, '').replace(/^EU\s*/, '').replace(',', '.').replace(/\.0$/, '').trim();
  var num = parseFloat(shoeKey);

  // SCHOEISEL.
  if (isFootwear) {
    var eu = null, uk = null;
    if (euInLabel) eu = Math.round(parseFloat(euInLabel[1]));
    if (/^UK/.test(base) && !isNaN(num)) uk = num;
    else if (/^US/.test(base) && !isNaN(num)) uk = num - 2;     // US -> UK
    else if (!isNaN(num) && num < 30) uk = num;                  // kaal klein getal = UK
    else if (!isNaN(num) && num >= 30 && eu === null) eu = Math.round(num); // kaal getal = EU
    if (uk !== null && eu === null) eu = shoeSizeMap[String(uk)] ? parseInt(shoeSizeMap[String(uk)], 10) : (Math.round(uk) + 33);
    if (eu !== null && uk === null) uk = eu - 33;
    if (eu === null && uk === null) return s; // bv. "One Size"
    if (lang === 'polish' || market === 'polen') return 'EU ' + eu;
    if (market === 'canada') return 'US ' + (eu - 31) + ' (EU ' + eu + ')';
    return 'UK ' + uk + ' (EU ' + eu + ')';
  }

  // KLEDING.
  if (lang === 'polish' || market === 'polen') return String(s).replace(/\s*\([^)]*\)\s*$/, '').trim(); // Polen/Pools: kale maat (XS, S, M...) zonder UK/US-label
  var cmap = market === 'canada' ? caSizeMap : sizeMap;
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
  // extra ankerwoorden zodat samengestelde/genuanceerde kleuren herkend blijven
  'aqua': 'Aqua', 'aqua green': 'Aqua Green', 'mint green': 'Mint Green',
  'royal blue': 'Royal Blue', 'sky blue': 'Sky Blue', 'light blue': 'Light Blue',
  'dark blue': 'Dark Blue', 'dark green': 'Dark Green', 'light green': 'Light Green',
  'bronze': 'Bronze', 'turquoise': 'Turquoise', 'ivory': 'Ivory', 'nude': 'Nude',
  'lavender': 'Lavender', 'peach': 'Peach', 'wine': 'Wine', 'emerald': 'Emerald',
  'cobalt': 'Cobalt', 'fuchsia': 'Fuchsia', 'magenta': 'Magenta', 'apricot': 'Apricot',
  'charcoal': 'Charcoal', 'sand': 'Sand', 'maroon': 'Maroon', 'off white': 'Off White',
  'forest green': 'Forest Green'
};

// Pools kleurenwoordenboek. Sleutels = Engelse (genormaliseerde) kleurnaam, lowercase.
// translateColorPolish() normaliseert eerst naar Engels (vangt NL/FR/ES af) en mapt dan hierheen.
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
  'off white': 'Złamana Biel', 'dark grey': 'Grafitowy', 'light grey': 'Jasnoszary'
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

function translateColor(color) {
  const lower = color.toLowerCase().trim();
  return colorMap[lower] || (color.charAt(0).toUpperCase() + color.slice(1).toLowerCase());
}

// Vertaalt een (NL/FR/ES/EN) kleurnaam naar het Pools.
// Stap 1: directe match op de ruwe invoer (vangt Engelse + samengestelde namen).
// Stap 2: normaliseer eerst naar Engels via translateColor, dan Engels -> Pools.
// Stap 3: samengesteld -> pak het laatste kleurwoord dat we kennen ("aqua green" -> "green").
// Stap 4: niets gevonden -> nette kapitalisatie van het origineel (blijft dan onvertaald staan).
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

async function generateDescription(productInfo) {
  const cleanedTitle = cleanTitle(productInfo.title);
  const storeName = productInfo.storeId === 'store2' ? 'Lorenzari' : (productInfo.storeName || 'Yamira London');
  console.log('[generateDescription] Starting for:', cleanedTitle, 'store:', storeName);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You are the dedicated product listing assistant for ${storeName}, a women's fashion webshop. Create fully compliant Shopify-ready product listings. Follow every rule exactly.

LANGUAGE: The "Language" field decides the language of the title, description and meta description.
- english: Write the title, description and meta description in natural UK English. Title MUST end with "for women". Translate any non-English product name to English.
- polish: Write the title, description and meta description in natural Polish. Title MUST end with "dla kobiet". Translate any non-Polish product name to Polish. Use Polish fashion SEO keywords (sukienka, sukienki damskie, sukienka maxi, sukienka midi, sukienka na wesele, spódnica, spódnica midi, bluzka, komplet, żakiet).
Never mix languages. No Dutch or French words in either case.
NOTE: the "productType", "material", "occasion" and "style" fields are ALWAYS returned in English, regardless of the listing language.

BRAND CONTEXT:
Store: ${storeName}. Tone: clean, neutral, refined, factual. Never write hype, never exaggerate.

PRODUCT CLASSIFICATION (do this yourself — never rely on the hint):
- Determine the exact productType from the product name and description. NEVER default to "Dress" — classify what the item actually is.
- Return productType in ENGLISH, specific and canonical. Choose the closest of: Maxi Dress, Midi Dress, Mini Dress, Shirt Dress, Denim Dress, Wrap Dress, Bodycon Dress, Linen Top, Satin Blouse, Corset Top, Halter Top, Top, Blouse, Wide Leg Trousers, Linen Trousers, Palazzo Trousers, Cargo Trousers, Flared Trousers, Wide Leg Jeans, Jeans, Trousers, Denim Skirt, Midi Skirt, Maxi Skirt, Mini Skirt, Skirt, Tote Bag, Shoulder Bag, Crossbody Bag, Handbag, Woven Bag, Bag, Loafers, Ballet Flats, Mary Jane Shoes, Slingback Flats, Sandals, Slides, Flip Flops, Cork Sandals, Heels, Court Shoes, Mules, Clogs, Ankle Boots, Knee High Boots, Cowboy Boots, Boots, Sneakers, Trench Coat, Blazer, Denim Jacket, Quilted Jacket, Coat, Jacket, Co-ord Set, Two Piece Set, Jumpsuit, Playsuit.
- Also extract these attributes ONLY when clearly evident or reasonably inferable (NEVER invent a fabric that isn't indicated):
  • material: e.g. Linen, Cotton, Denim, Satin, Knit, Leather, Faux Leather, Suede, Crochet. Leave empty if not indicated.
  • occasion: e.g. Summer, Holiday, Wedding Guest, Evening, Workwear, Casual, Festival. May be inferred from the style. Leave empty if unclear.
  • style: one or two descriptive words (e.g. "Boho", "Minimalist", "Western", "Y2K"). Leave empty if unclear.

SEO TITLE RULES:
- The SEO title is the single most important field: it is pushed straight into Google Shopping. It MUST be keyword-led, specific and accurate.
- NO colours and NO sizes in the title. The product has multiple colour/size variants, so the title targets the CATEGORY search term, never one variant.
- ACCURACY: only use attributes that are genuinely true for this product. NEVER invent material, occasion, fabric or features.
- First identify the product's category (see classification above), then lead with the matching high-volume keyword and add ONE distinctive detail of this item. Keyword banks:

  ENGLISH (title MUST end with "for women"):
  • Dresses: summer dress, maxi dress, midi dress, mini dress, floral dress, linen dress, wedding guest dress, graduation dress, cocktail dress, bodycon dress, wrap dress, shirt dress, denim dress
  • Tops & blouses: linen top, satin blouse, going out top, corset top, halter top
  • Trousers: wide leg trousers, linen trousers, palazzo trousers, cargo trousers, wide leg jeans, high waisted trousers, flared trousers
  • Skirts: denim skirt, midi skirt, maxi skirt, mini skirt
  • Bags: tote bag, shoulder bag, crossbody bag, handbag, woven bag, straw bag, beach bag, raffia bag
  • Loafers & flats: loafers, ballet flats, mary jane shoes, slingback flats, woven flats, flat shoes
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
- NEVER use (any language): luxury, elegant, perfect, flattering, shaping, slimming, premium quality, comfort fit.
- Structure: Primary category keyword + secondary keyword + one distinctive detail + ending phrase. Keep under ~70 characters where possible.
- UNIQUENESS (critical): The title MUST be unique and specific to THIS exact product. NEVER produce a generic title that could fit other products, and NEVER reuse a product name. Always weave in at least one distinctive detail of THIS item (e.g. print, neckline, sleeve, hem, length, heel type, fabric, closure) so that no two products ever end up with the same title.

PRODUCT DESCRIPTION RULES:
- Structure EXACTLY: Intro paragraph (2 sentences) + 5 bullet points + Closing sentence (1 sentence).
- Intro: Hook the reader with the key design feature + styling versatility. Be specific and vivid.
- Bullets: Each bullet describes ONE specific, visible feature — cut, silhouette, hem detail, length, material finish, closure (for bags/shoes: strap, sole, fastening, compartments, heel height).
- Closing: One punchy styling suggestion sentence.
- Use only visible product features — never invent.
- NEVER mention: comfort, support, posture, pain relief, healing, anti-slip, breathable, slimming, shaping, luxury, elegant, perfect, flattering.
- Refer to the product by its type in the chosen language (English type if english, Polish type if polish).
- Write like ASOS product copy: confident, specific, direct — not generic.
- UNIQUENESS (critical): The description MUST be unique to THIS product. NEVER reuse sentences, phrasing, or bullet wording that could apply to another product — build every sentence on this item's own specific visible features so no two listings read the same.

META DESCRIPTION RULES:
- Format: [Product type] + [key design feature] + [occasion/style context] + [call to action] ending with "– ${storeName}".
- Max 160 characters STRICTLY.
- Direct, punchy, benefit-driven, in the chosen language.

OUTPUT FORMAT — output ONLY this JSON, no other text, no markdown, no code blocks. material/occasion/style are empty strings if unknown:
{"productType":"...","material":"...","occasion":"...","style":"...","seoTitle":"...","description":"...","metaDescription":"..."}`,
      messages: [{
        role: 'user',
        content: 'Classify and create a listing for:\nName: ' + cleanedTitle + '\nType hint (may be empty or wrong — classify yourself): ' + (productInfo.type || 'unknown') + '\nColors: ' + (productInfo.colors || []).join(', ') + '\nMaterial hint: ' + (productInfo.material || 'unknown') + '\nSeason: ' + (productInfo.season || 'not specified') + '\nOriginal description: ' + (productInfo.originalDescription || 'none') + '\nLanguage: ' + (productInfo.language || 'english') + '\n\nIMPORTANT: Determine productType yourself from the name and description — NEVER default to Dress. If language is "polish" — write the title/description/meta in Polish, translate the product name to Polish, use Polish fashion SEO keywords, title must end with "dla kobiet". If language is "english" — write them in natural UK English, title must end with "for women". The productType/material/occasion/style fields stay in English. No Dutch or French words in the customer-facing text.'
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Claude API error: ' + response.status + ' ' + errText);
  }

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

// Zet SEO page title + meta description EN extra metafields (materiaal, gelegenheid, stijl, gender, leeftijd)
// via het aparte metafields-endpoint. Inline meesturen laat de page title op "pending" staan;
// een losse POST naar /products/{id}/metafields.json vult 'm zwart in.
// meta = { seoTitle, metaDescription, material, occasion, style, gender, ageGroup }
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

async function addExtraImages(productId, imageUrls, token, storeDomain) {
  const t = token || SHOPIFY_TOKEN;
  const store = (storeDomain || SHOPIFY_STORE).replace(/^https?:\/\//, '').replace(/\/$/, '');
  console.log('[addExtraImages] Uploading', imageUrls.length, 'images to product', productId);
  let success = 0;
  for (let i = 0; i < imageUrls.length; i++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/images.json', {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': t, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: { src: imageUrls[i] } })
        });
        if (r.status === 429) {
          await new Promise(function(r) { setTimeout(r, 2000); });
          continue;
        }
        if (r.ok) {
          success++;
          console.log('[addExtraImages] Image ' + (i+1) + '/' + imageUrls.length + ' uploaded');
          break;
        } else {
          const err = await r.text();
          console.error('[addExtraImages] Image ' + (i+1) + ' failed:', r.status, err.substring(0, 100));
          break;
        }
      } catch(e) {
        console.error('[addExtraImages] Image ' + (i+1) + ' error:', e.message);
        break;
      }
    }
    await new Promise(function(r) { setTimeout(r, 500); });
  }
  console.log('[addExtraImages] Done:', success, '/', imageUrls.length, 'uploaded');
}

// Upload foto's, en koppel ze aan variant-id's als die meegegeven zijn.
// items = [{ src, variant_ids: [..] }]  (variant_ids leeg = algemene productfoto)
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

// --- Optie: unieke voornaam vooraan de titel (stijl: "Mila – mini sukienka z warstwowymi falbanami") ---
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
  p = p.replace(/\s*,?\s*(dla kobiet|for women)\s*$/i, '').trim();      // taal-suffix weg
  p = p.replace(/^[^–\-|]{1,20}\s*[–\-|]\s*/, '').trim();               // eventuele bestaande "Naam – " weg
  p = p.replace(/\s{2,}/g, ' ').trim();
  if (p) p = p.charAt(0).toLowerCase() + p.slice(1);                    // beginhoofdletter klein (stijl)
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
  return pool[0]; // namenlijst uitgeput (zeldzaam)
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
    const lang = (productInfo.language || 'english').toLowerCase();
    const storeName = productInfo.storeId === 'store2' ? 'Lorenzari' : (productInfo.storeName || 'Yamira London');
    const generated = await generateDescription(productInfo);
    const description = generated.description || '';
    const seoTitle = generated.seoTitle || productInfo.title;
    const metaDescription = generated.metaDescription || '';

    // ── Auto-classificatie: AI bepaalt zelf het type, anders vangnet op tekst. Nooit blind "Dress". ──
    const detectedType = (generated.productType && String(generated.productType).trim()) || '';
    const productType = detectedType
      || (productInfo.type && String(productInfo.type).trim())
      || inferTypeFromText(cleanTitleSafe(productInfo.title) + ' ' + (productInfo.originalDescription || ''));

    const material = (generated.material && String(generated.material).trim()) || (productInfo.material ? String(productInfo.material).trim() : '');
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

    const sizeKeywords = ['xs','s','m','l','xl','xxl','xxxl','xs (uk6)','s (uk8)','m (uk10)','l (uk12)','xl (uk14)','xxl (uk16)'];
    const rawColors = (productInfo.colors || []).filter(function(c) {
      return !sizeKeywords.includes(c.toLowerCase().trim());
    });
    // Kleuren omzetten: Pools -> Poolse kleurnaam, anders Engelse kleurnaam.
    // ONTDUBBELEN (case-insensitief): meerdere bronkleuren kunnen op dezelfde
    // (Poolse) naam vallen, bv. "Red" + "Rood" -> "Czerwony". Zonder dedupe
    // ontstaan dubbele kleur+maat-varianten en weigert Shopify met 422
    // ("The variant 'X / S' already exists.").
    const mappedColors = rawColors.length > 0
      ? (lang === 'polish' ? rawColors.map(translateColorPolish) : rawColors.map(translateColor))
      : [lang === 'polish' ? 'Jeden kolor' : 'One Colour'];
    const seenColors = {};
    const colors = mappedColors.filter(function(c) {
      var k = String(c).toLowerCase().trim();
      if (!k || seenColors[k]) return false;
      seenColors[k] = true;
      return true;
    });

    const displayProductType = lang === 'polish' ? (polishTypeMap[productType] || productType) : productType;
    const season = productInfo.season || 'ALL YEAR';
    const footwear = isFootwearType(productType);
    const oneSize = isOneSizeType(productType);
    const market = (productInfo.market || 'uk').toLowerCase();

    // ── Maten: kleding = XS–XXL, schoenen = EU-maten, tassen/accessoires = One Size. ──
    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const defaultShoeSizes = ['36', '37', '38', '39', '40', '41'];
    let sizes;
    if (productInfo.sizes && productInfo.sizes.length) {
      sizes = productInfo.sizes.map(function(s) { return mapSizeLabel(s, lang, footwear, market); });
    } else if (oneSize) {
      sizes = [lang === 'polish' ? 'Uniwersalny' : 'One Size'];
    } else if (footwear) {
      sizes = defaultShoeSizes.map(function(s) { return mapSizeLabel(s, lang, true, market); });
    } else {
      sizes = defaultSizes.map(function(s) { return mapSizeLabel(s, lang, false, market); });
    }

    // ── Tags: seizoen, type, hoofdcategorie, gelegenheid, materiaal, stijl, doelgroep. ──
    const mainCategory = mainCategoryFor(productType, lang);
    const genderTag = lang === 'polish' ? 'Kobiety' : 'Women';
    const tagSet = [season, displayProductType, mainCategory, occasion, material, style, genderTag];
    const seen = {};
    const tags = tagSet.filter(function(x) {
      if (!x) return false;
      var k = String(x).toLowerCase().trim();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    }).join(', ');

    const targetCurrency = (market === 'polen' || lang === 'polish') ? 'PLN' : 'GBP';
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
      // Fotoprompts blijven in het Engels: gebruik de Engels-genormaliseerde primaire kleur,
      // ook bij een Poolse listing (anders lekt "Różowy" in een Engelse image-prompt).
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

    const colourLabel = lang === 'polish' ? 'Kolor' : 'Colour';
    const sizeLabel = lang === 'polish' ? 'Rozmiar' : 'Size';

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

    // SEO page title + meta description + extra metafields (materiaal, gelegenheid, stijl, gender, leeftijd).
    if (productId) {
      await setProductMetafields(productId, reqToken, reqStore, {
        seoTitle: seoTitle,
        metaDescription: metaDescription,
        material: material,
        occasion: occasion,
        style: style,
        gender: 'Female',
        ageGroup: 'Adult'
      });
    }

    // ── Foto's koppelen ───────────────────────────────────────────────
    // Bij AI-foto's: gewoon uploaden (geen kleurkoppeling).
    // Bij concurrent-foto's: koppel elke foto aan de juiste kleur-variant
    // op basis van imagesByColor uit de scraper.
    const createdVariants = (result.product && result.product.variants) || [];
    const hasColorOption = !!(variants[0] && variants[0].option2); // option1 = kleur, option2 = maat

    // kleur (lowercase) -> [variantId] in ONS net aangemaakte product
    const colorToVariantIds = {};
    if (hasColorOption) {
      createdVariants.forEach(function(v) {
        const key = String(v.option1 || '').toLowerCase().trim();
        if (!colorToVariantIds[key]) colorToVariantIds[key] = [];
        colorToVariantIds[key].push(v.id);
      });
    }

    // Welke foto's heeft de gebruiker behouden (preview)? Alleen die uploaden.
    const keptSet = new Set((productInfo.originalImages || []).map(function(s) { return String(s).split('?')[0]; }));
    function isKept(src) { return keptSet.size === 0 ? true : keptSet.has(String(src).split('?')[0]); }

    const imageItems = [];
    const usedSrc = new Set();
    const ibc = (!generatePhotos && productInfo.imagesByColor) ? productInfo.imagesByColor : null;

    // 1) Foto's met een kleurkoppeling -> aan de juiste kleur-variant.
    //    De scraper levert imagesByColor met de BRONkleur; map die naar dezelfde
    //    Poolse/Engelse kleurnaam als de varianten, zodat de koppeling klopt.
    if (ibc && hasColorOption) {
      Object.keys(ibc).forEach(function(color) {
        const mappedColor = lang === 'polish' ? translateColorPolish(color) : translateColor(color);
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

    // 2) Overige foto's (AI-foto's, of foto's zonder kleurkoppeling) -> algemeen.
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
      tags: tags,
      material: material,
      occasion: occasion,
      style: style,
      colorsUsed: colors,
      imagesGenerated: generatedImages.length
    });

  } catch(err) {
    console.error('[handler] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// Veilige titel-helper voor het vangnet (zelfde logica als cleanTitle, maar nooit een throw).
function cleanTitleSafe(title) {
  try { return cleanTitle(title || ''); } catch (e) { return String(title || ''); }
}
