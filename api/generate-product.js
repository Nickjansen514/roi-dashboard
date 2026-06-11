const KIE_API_KEY = process.env.KIE_API_KEY;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

const MODEL = 'a confident professional fashion model, early 30s, light medium skin tone, long dark brown wavy hair, slim build, UK size 10, standing upright, British fashion aesthetic';
const CROP = 'mid-thigh up';
const STYLING = 'minimal delicate jewellery, nude heels';

function convertPrice(originalPrice, currency = 'EUR') {
  const rates = { EUR: 0.86, USD: 0.79, GBP: 1 };
  const gbp = originalPrice * (rates[currency] || 0.86);
  const candidates = [];
  const base = Math.floor(gbp);
  for (let i = base - 10; i <= base + 10; i++) {
    candidates.push(parseFloat((Math.floor(i / 10) * 10 + 4.99).toFixed(2)));
    candidates.push(parseFloat((Math.floor(i / 10) * 10 + 9.99).toFixed(2)));
  }
  const valid = candidates.filter(function(c) { return c > 0; });
  let closest = valid[0];
  let minDiff = Math.abs(gbp - closest);
  for (let j = 1; j < valid.length; j++) {
    const diff = Math.abs(gbp - valid[j]);
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

// Zet een ruwe maat om naar het juiste label.
// Schoen (UK-getal zoals 3 of 5.5) -> "UK 3 (EU 36)" (Engels) of "EU 36" (Pools).
// Kleding -> bestaande kledingmaat-omzetting.
// Herkent of een producttype schoeisel is.
function isFootwearType(type) {
  var t = String(type || '').toLowerCase();
  return /espadrille|slingback|kitten|heel|stiletto|pump|sandal|ballet|ballerina|loafer|moccasin|sneaker|trainer|boot|mule|wedge|brogue|oxford|derby|slipper|flat|shoe|footwear|schoen|laars|sandaal|hak|pantoffel|instapper|sleehak/.test(t);
}

// Zet een ruwe maat om naar het juiste label.
// - UK-schoenmaat (klein getal zoals 3 of 5.5): altijd "UK 3 (EU 36)".
// - EU-schoenmaat (34-48): alleen bij schoeisel -> "UK 3 (EU 36)" (anders is het een kledingmaat).
// - Kleding: bestaande kledingmaat-omzetting.
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
    if (lang === 'polish') return 'EU ' + eu;
    if (market === 'canada') return 'US ' + (eu - 31) + ' (EU ' + eu + ')';
    return 'UK ' + uk + ' (EU ' + eu + ')';
  }

  // KLEDING.
  if (lang === 'polish') return s;
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
  'teal': 'Teal', 'mustard': 'Mustard', 'rust': 'Rust'
};

const polishTypeMap = {
  'Dress': 'Sukienka', 'Maxi Dress': 'Sukienka Maxi', 'Mini Dress': 'Sukienka Mini',
  'Midi Dress': 'Sukienka Midi', 'Bodycon Dress': 'Sukienka Dopasowana',
  'Wrap Dress': 'Sukienka Kopertowa', 'Skirt': 'Spódnica', 'Midi Skirt': 'Spódnica Midi',
  'Maxi Skirt': 'Spódnica Maxi', 'Mini Skirt': 'Spódnica Mini', 'Blouse': 'Bluzka',
  'Top': 'Top', 'Jacket': 'Kurtka', 'Blazer': 'Marynarka', 'Coat': 'Płaszcz',
  'Jumpsuit': 'Kombinezon', 'Trousers': 'Spodnie', 'Pants': 'Spodnie',
  'Cardigan': 'Kardigan', 'Sweater': 'Sweter', 'Co-ord Set': 'Komplet',
  'Two Piece Set': 'Komplet'
};

function translateColor(color) {
  const lower = color.toLowerCase().trim();
  return colorMap[lower] || (color.charAt(0).toUpperCase() + color.slice(1).toLowerCase());
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

LANGUAGE: The "Language" field decides the language of ALL output (title, description, meta description).
- english: Write everything in natural UK English. Title MUST end with "for women". Translate any non-English product name to English.
- polish: Write everything in natural Polish. Title MUST end with "dla kobiet". Translate any non-Polish product name to Polish. Use Polish fashion SEO keywords (sukienka, sukienki damskie, sukienka maxi, sukienka midi, sukienka na wesele, spódnica, spódnica midi, bluzka, komplet, żakiet).
Never mix languages. No Dutch or French words in either case.

BRAND CONTEXT:
Store: ${storeName}. Tone: clean, neutral, refined, factual. Never write hype, never exaggerate.

SEO TITLE RULES:
- Descriptive, specific, keyword rich, using high-volume fashion search keywords for the chosen language.
  English examples: dresses for women, summer dresses, maxi dress, midi dress, black dress, party dresses, wedding guest dresses, bodycon dress, wrap dress, jumpsuits, womens coats, trench coat, blazer, co-ord set, two piece set, midi skirt, maxi skirt.
  Polish examples: sukienka, sukienki damskie, sukienka maxi, sukienka midi, sukienka na wesele, spódnica, spódnica midi, bluzka, komplet, żakiet.
- English title MUST end with "for women". Polish title MUST end with "dla kobiet".
- NEVER use (in any language): luxury, elegant, perfect, flattering, shaping, slimming, premium quality, comfort fit.
- Structure: Primary keyword + secondary keyword + descriptive detail + ending phrase.
- UNIQUENESS (critical): The title MUST be unique and specific to THIS exact product. NEVER produce a generic title that could fit other products, and NEVER reuse a product name. Always weave in at least one distinctive detail of THIS item (e.g. print, neckline, sleeve, hem, length, heel type, fabric, closure) so that no two products ever end up with the same title.

PRODUCT DESCRIPTION RULES:
- Structure EXACTLY: Intro paragraph (2 sentences) + 5 bullet points + Closing sentence (1 sentence).
- Intro: Hook the reader with the key design feature + styling versatility. Be specific and vivid.
- Bullets: Each bullet describes ONE specific, visible feature — cut, silhouette, hem detail, length, material finish, closure.
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

OUTPUT FORMAT — output ONLY this JSON, no other text, no markdown, no code blocks:
{"seoTitle":"...","description":"...","metaDescription":"..."}`,
      messages: [{
        role: 'user',
        content: 'Create a listing for:\nName: ' + cleanedTitle + '\nType: ' + productInfo.type + '\nColors: ' + (productInfo.colors || []).join(', ') + '\nMaterial: ' + (productInfo.material || 'not specified') + '\nSeason: ' + (productInfo.season || 'not specified') + '\nOriginal description: ' + (productInfo.originalDescription || 'none') + '\nLanguage: ' + (productInfo.language || 'english') + '\n\nIMPORTANT: If language is "polish" — write EVERYTHING in Polish, translate the product name to Polish, use Polish fashion SEO keywords, title must end with "dla kobiet". If language is "english" — translate everything to natural UK English, title must end with "for women". No Dutch or French words in either case.'
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
    return { seoTitle: cleanedTitle, description: text, metaDescription: '' };
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
    const urlHandle = titleToUrlHandle(seoTitle);

    const sizeKeywords = ['xs','s','m','l','xl','xxl','xxxl','xs (uk6)','s (uk8)','m (uk10)','l (uk12)','xl (uk14)','xxl (uk16)'];
    const rawColors = (productInfo.colors || []).filter(function(c) {
      return !sizeKeywords.includes(c.toLowerCase().trim());
    });
    const colors = rawColors.length > 0
      ? (lang === 'polish' ? rawColors : rawColors.map(translateColor))
      : [lang === 'polish' ? 'Jeden kolor' : 'One Colour'];

    const productType = productInfo.type || 'Dress';
    const displayProductType = lang === 'polish' ? (polishTypeMap[productType] || productType) : productType;
    const season = productInfo.season || 'ALL YEAR';

    const tagSet = [season, displayProductType];
    const mainCategory = productType.includes('Dress') ? (lang === 'polish' ? 'Sukienka' : 'Dress') :
                         productType.includes('Skirt') ? (lang === 'polish' ? 'Spódnica' : 'Bottoms') :
                         (productType.includes('Jacket') || productType.includes('Coat') || productType.includes('Blazer')) ? (lang === 'polish' ? 'Okrycia' : 'Outerwear') :
                         (productType.includes('Top') || productType.includes('Blouse')) ? (lang === 'polish' ? 'Bluzki' : 'Tops') :
                         (productType.includes('Trouser') || productType.includes('Pants')) ? (lang === 'polish' ? 'Spodnie' : 'Bottoms') : null;
    if (mainCategory && mainCategory !== displayProductType) tagSet.push(mainCategory);
    const tags = tagSet.filter(Boolean).join(', ');

    const price = productInfo.convertedPrice
      ? parseFloat(productInfo.convertedPrice)
      : convertPrice(productInfo.originalPrice, productInfo.currency || 'EUR');

    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const footwear = isFootwearType(productType);
    const market = (productInfo.market || 'uk').toLowerCase();
    const sizes = (productInfo.sizes || defaultSizes).map(function(s) {
      return mapSizeLabel(s, lang, footwear, market);
    });

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

    const metafields = [
      { namespace: 'global', key: 'title_tag', value: seoTitle, type: 'single_line_text_field' }
    ];
    if (metaDescription) {
      metafields.push({ namespace: 'global', key: 'description_tag', value: metaDescription, type: 'single_line_text_field' });
    }

    let generatedImages = [];
    if (generatePhotos) {
      const primaryColor = colors[0] || 'the garment colour';
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
      title: seoTitle,
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
      metafields: metafields,
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
    if (ibc && hasColorOption) {
      Object.keys(ibc).forEach(function(color) {
        const vids = colorToVariantIds[String(color).toLowerCase().trim()] || [];
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
      seoTitle: seoTitle,
      urlHandle: urlHandle,
      description: description,
      metaDescription: metaDescription,
      price: price,
      tags: tags,
      colorsUsed: colors,
      imagesGenerated: generatedImages.length
    });

  } catch(err) {
    console.error('[handler] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
