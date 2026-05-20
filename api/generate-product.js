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

async function generateDescription(productInfo) {
  console.log('[generateDescription] Starting for:', productInfo.title);
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
      system: `You are the dedicated product listing assistant for Yamira London, a UK-based women's fashion webshop. Create fully compliant Shopify-ready product listings. Follow every rule exactly.

BRAND CONTEXT:
Store: Yamira London. Market: United Kingdom. Language: Natural UK English. Target: Women aged 18-45. Tone: clean, neutral, refined, factual. Never write hype, never exaggerate.

SEO TITLE RULES:
- Use high-volume UK search keywords where relevant: dresses for women, summer dresses, maxi dress, midi dress, black dress, white dress, party dresses, wedding guest dresses, bodycon dress, wrap dress, floral dress, linen dress, satin dress, jumpsuits, womens coats, trench coat, bomber jacket, blazer, cardigan, co-ord set, two piece set
- Title must be descriptive, specific, keyword rich
- MUST end with "for women"
- NEVER use: luxury, elegant, perfect, flattering, shaping, slimming, premium quality, comfort fit
- Structure: Primary keyword + secondary keyword + descriptive detail + for women

PRODUCT DESCRIPTION RULES:
- Structure EXACTLY: Intro paragraph (2 sentences) + 5 bullet points + Closing sentence (1 sentence)
- Use only visible product features
- NEVER mention: comfort, support, posture, pain relief, healing, anti-slip, breathable, slimming, shaping, luxury, elegant, perfect, flattering
- Natural UK English only

META DESCRIPTION RULES:
- EXACTLY like top global fashion e-commerce stores (ASOS, Boohoo, PrettyLittleThing, Missguided)
- Format: [Product type] + [key design feature] + [occasion/style context] + [call to action] — ending with "– Yamira London"
- Max 160 characters STRICTLY
- Include the main search keyword naturally
- Be direct, punchy, benefit-driven — not just descriptive
- Examples of the RIGHT style:
  * "Shop the open back maxi dress that turns heads. Floor-length cotton with V-neck — perfect for summer days. – Yamira London"
  * "The ruched midi dress you need this season. Figure-skimming silhouette, satin finish, available in 4 colours. – Yamira London"
  * "Floral wrap dress for women — feminine print, adjustable tie waist, midi length. Shop new arrivals. – Yamira London"

OUTPUT FORMAT — output ONLY this JSON, no other text, no markdown, no code blocks:
{"seoTitle":"...","description":"...","metaDescription":"..."}`,
      messages: [{
        role: 'user',
        content: 'Create a listing for:\nName: ' + productInfo.title + '\nType: ' + productInfo.type + '\nColors: ' + (productInfo.colors || []).join(', ') + '\nMaterial: ' + (productInfo.material || 'not specified') + '\nSeason: ' + (productInfo.season || 'not specified') + '\nOriginal description: ' + (productInfo.originalDescription || 'none')
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
    return { seoTitle: productInfo.title, description: text, metaDescription: '' };
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

async function createShopifyProduct(productData) {
  const store = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const r = await fetch('https://' + store + '/admin/api/2024-01/products.json', {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: productData })
  });
  if (!r.ok) { const errText = await r.text(); throw new Error('Shopify fout: ' + r.status + ' ' + errText); }
  return r.json();
}

// Upload extra images after product creation (Shopify limiet bij aanmaken)
async function addExtraImages(productId, imageUrls) {
  const store = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/images.json', {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: { src: imageUrls[i], position: i + 2 } })
      });
      // Kleine pauze om rate limit te vermijden
      await new Promise(function(r) { setTimeout(r, 300); });
    } catch(e) {
      console.error('[addExtraImages] Failed for image ' + i + ':', e.message);
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { productInfo, generatePhotos } = req.body || {};
  if (!productInfo) return res.status(400).json({ error: 'Product info missing' });

  console.log('[handler] Product:', productInfo.title);

  try {
    const generated = await generateDescription(productInfo);
    const description = generated.description || '';
    const seoTitle = generated.seoTitle || productInfo.title;
    const metaDescription = generated.metaDescription || '';
    const urlHandle = titleToUrlHandle(seoTitle);
    const colors = (productInfo.colors || []).map(translateColor);
    const productType = productInfo.type || 'Dress';
    const season = productInfo.season || 'ALL YEAR';
    // Tags: seizoen + producttype + hoofdcategorie
    const tagSet = [season, productType];
    const mainCategory = productType.includes('Dress') ? 'Dress' :
                         (productType.includes('Jacket') || productType.includes('Coat') || productType.includes('Blazer')) ? 'Outerwear' :
                         (productType.includes('Top') || productType.includes('Blouse')) ? 'Tops' :
                         (productType.includes('Trouser') || productType.includes('Skirt')) ? 'Bottoms' : null;
    if (mainCategory && mainCategory !== productType) tagSet.push(mainCategory);
    const tags = tagSet.filter(Boolean).join(', ');
    const price = convertPrice(productInfo.originalPrice, productInfo.currency || 'EUR');
    const sizes = (productInfo.sizes || ['XS (UK6)', 'S (UK8)', 'M (UK10)', 'L (UK12)', 'XL (UK14)', 'XXL (UK16)']).map(function(s) {
      return sizeMap[s.toUpperCase().trim()] || s;
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

    // Alleen meta description metafield
    const metafields = metaDescription ? [
      { namespace: 'global', key: 'description_tag', value: metaDescription, type: 'single_line_text_field' }
    ] : [];

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

    const shopifyProduct = {
      title: seoTitle,
      handle: urlHandle,
      body_html: description ? (function(d) {
        // Zet bullet punten om naar echte HTML lijst
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
      vendor: 'Yamira London',
      product_type: productType,
      tags: tags,
      status: 'draft',
      variants: variants,
      options: variants[0] && variants[0].option2 ? [{ name: 'Colour' }, { name: 'Size' }] : [{ name: 'Size' }],
      images: (function() {
        const allImgs = generatedImages.length > 0 ? generatedImages : (productInfo.originalImages || []).map(function(src) { return { src: src }; });
        return allImgs.slice(0, 1); // Stuur alleen eerste foto bij aanmaken
      })()
    };

    const result = await createShopifyProduct(shopifyProduct);

    // Upload alle resterende foto's na aanmaken product
    const productId = result.product && result.product.id;
    if (productId) {
      const allImages = generatedImages.length > 0
        ? generatedImages.map(function(i) { return i.src; })
        : (productInfo.originalImages || []);
      // Sla de eerste over (al toegevoegd bij aanmaken)
      const extraImages = allImages.slice(1);
      if (extraImages.length > 0) {
        console.log('[handler] Uploading', extraImages.length, 'extra images...');
        await addExtraImages(productId, extraImages);
      }
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
