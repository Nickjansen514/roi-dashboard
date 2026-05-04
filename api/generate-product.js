const KIE_API_KEY = process.env.KIE_API_KEY;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

const MODEL = 'a confident professional fashion model, early 30s, light medium skin tone, long dark brown wavy hair, slim build, UK size 10, standing upright, British fashion aesthetic';
const CROP = 'mid-thigh up';
const STYLING = 'minimal delicate jewellery, nude heels';

function convertPrice(originalPrice, currency = 'EUR') {
  const rates = { EUR: 0.86, USD: 0.79, GBP: 1 };
  const gbp = originalPrice * (rates[currency] || 0.86);
  const base = Math.floor(gbp);
  const remainder = base % 10;
  let rounded;
  if (remainder < 5) rounded = Math.floor(base / 10) * 10 + 4.95;
  else rounded = Math.floor(base / 10) * 10 + 9.95;
  return rounded;
}

const sizeMap = {
  'XS': 'XS (UK6)', 'S': 'S (UK8)', 'M': 'M (UK10)',
  'L': 'L (UK12)', 'XL': 'XL (UK14)', 'XXL': 'XXL (UK16)',
  '2XL': 'XXL (UK16)', '3XL': 'XXXL (UK18)',
  '34': 'XS (UK6)', '36': 'S (UK8)', '38': 'M (UK10)',
  '40': 'L (UK12)', '42': 'XL (UK14)', '44': 'XXL (UK16)'
};

const colorMap = {
  'noir': 'black', 'blanc': 'white', 'rouge': 'red', 'bleu': 'blue',
  'vert': 'green', 'rose': 'pink', 'beige': 'beige', 'creme': 'cream',
  'gris': 'grey', 'marron': 'brown', 'orange': 'orange', 'violet': 'purple',
  'jaune': 'yellow', 'marine': 'navy', 'bordeaux': 'burgundy',
  'rouge fonce': 'dark red', 'khaki': 'khaki', 'lila': 'lilac',
  'zwart': 'black', 'wit': 'white', 'blauw': 'blue', 'groen': 'green',
  'roze': 'pink', 'grijs': 'grey', 'bruin': 'brown', 'geel': 'yellow',
  'rood': 'red', 'paars': 'purple',
  'negro': 'black', 'blanco': 'white', 'rojo': 'red', 'azul': 'blue',
  'verde': 'green', 'rosa': 'pink', 'amarillo': 'yellow'
};

function translateColor(color) {
  const lower = color.toLowerCase().trim();
  return colorMap[lower] || lower;
}

function mapSize(size) {
  const upper = size.toUpperCase().trim();
  return sizeMap[upper] || size;
}

function colorPromptDescription(color) {
  const descriptions = {
    'black': 'deep black, NOT dark navy or charcoal',
    'white': 'clean white, NOT off-white or cream',
    'red': 'bright red, NOT burgundy or dark red',
    'dark red': 'deep dark red, NOT bright red or orange-red',
    'pink': 'soft pink, NOT hot pink or magenta',
    'blue': 'medium blue, NOT navy or light blue',
    'navy': 'deep navy blue, NOT black or medium blue',
    'green': 'green, NOT olive or khaki',
    'khaki': 'warm khaki olive, NOT bright green or brown',
    'orange': 'warm orange, NOT red-orange or yellow',
    'yellow': 'warm yellow, NOT lime or gold',
    'lilac': 'soft lilac purple, NOT pink or dark purple',
    'purple': 'purple, NOT lilac or dark navy',
    'grey': 'medium grey, NOT silver or charcoal',
    'beige': 'warm beige, NOT white or cream',
    'cream': 'soft cream, NOT white or beige',
    'brown': 'warm brown, NOT dark or orange',
    'burgundy': 'deep burgundy wine red, NOT bright red or dark brown',
  };
  return descriptions[color.toLowerCase()] || color;
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
      system: `You are the dedicated product import and listing assistant for Yamira London, a UK-based women's fashion webshop. You create fully compliant Shopify-ready product listings. Follow these rules exactly:

BRAND CONTEXT: Store name: Yamira London. Market: United Kingdom. Language: Natural UK English. Target audience: Women. Tone: clean, neutral, refined, factual, elegant, premium editorial style. Never write hype, never exaggerate, never make unsupported claims.

SEO TITLE RULES: Always generate a title that is 100% original, highly SEO optimised for UK Google searches, natural UK English, descriptive, specific, keyword rich, ends with "for women". Never use: luxury, elegant, perfect, flattering, shaping, slimming, premium quality, comfort fit. Structure: Primary keyword + secondary keyword + descriptive detail + for women.

PRODUCT DESCRIPTION RULES: Always write in this structure: Intro paragraph (2 sentences), 5 bullet points, Closing sentence (1 sentence). Use visible product features only. Never invent features. Never mention: comfort, support, posture, pain relief, healing, anti-slip, breathable, slimming, shaping, luxury, elegant (as claim).

META DESCRIPTION RULES: max 160 characters, SEO focused, unique, natural UK English, end with "– Yamira London".

URL HANDLE RULES: lowercase only, hyphens only, no special characters, descriptive, unique.

OUTPUT FORMAT - Always output exactly this JSON with no other text, no markdown, no code blocks:
{"seoTitle":"...","description":"...","metaDescription":"...","urlHandle":"..."}`,
      messages: [{
        role: 'user',
        content: 'Create a Shopify product listing for this product:\nName: ' + productInfo.title + '\nType: ' + productInfo.type + '\nColors: ' + (productInfo.colors || []).join(', ') + '\nMaterial: ' + (productInfo.material || 'not specified') + '\nSeason: ' + (productInfo.season || 'not specified') + '\nOriginal description: ' + (productInfo.originalDescription || 'none')
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Claude API error: ' + response.status + ' ' + errText);
  }

  const data = await response.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '{}';
  console.log('[generateDescription] Claude text:', text.substring(0, 200));

  try {
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('[generateDescription] Parse failed:', e.message);
    return {
      seoTitle: productInfo.title,
      description: text,
      metaDescription: '',
      urlHandle: productInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    };
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
  console.log('[Kie.ai] Submitting:', prompt.substring(0, 80) + '...');

  const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + KIE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'ideogram/v3-text-to-image',
      input: {
        prompt: prompt,
        rendering_speed: 'BALANCED',
        style: 'REALISTIC'
      }
    })
  });

  const responseText = await r.text();
  console.log('[Kie.ai] Submit status:', r.status, '| Body:', responseText.substring(0, 200));

  if (!r.ok) throw new Error('Kie.ai submit fout: ' + r.status + ' ' + responseText);

  let data;
  try { data = JSON.parse(responseText); } catch(e) { throw new Error('Kie.ai invalid JSON: ' + responseText); }

  const taskId = data && data.data && (data.data.taskId || data.data.task_id) || data && data.taskId;
  if (!taskId) throw new Error('Geen taskId van kie.ai: ' + JSON.stringify(data));

  console.log('[Kie.ai] Task ID:', taskId);
  return taskId;
}

// ✅ GECORRIGEERD: juist poll-adres en juiste response parsing
async function pollKieTask(taskId) {
  for (let i = 0; i < 40; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); });

    const poll = await fetch('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + taskId, {
      headers: { 'Authorization': 'Bearer ' + KIE_API_KEY }
    });
    const pollText = await poll.text();
    console.log('[Kie.ai] Poll ' + (i + 1) + ' for ' + taskId + ':', pollText.substring(0, 200));

    let result;
    try { result = JSON.parse(pollText); } catch(e) { continue; }

    const state = result && result.data && result.data.state;

    if (state === 'success') {
      let imgUrl = null;
      try {
        const resultJson = JSON.parse(result.data.resultJson);
        imgUrl = resultJson.resultUrls && resultJson.resultUrls[0];
      } catch(e) {
        console.error('[Kie.ai] resultJson parse error:', result.data && result.data.resultJson);
      }
      console.log('[Kie.ai] Done! URL:', imgUrl);
      return imgUrl || null;
    }

    if (state === 'fail') {
      throw new Error('Kie.ai task mislukt: ' + taskId + ' | ' + (result.data && result.data.failMsg));
    }

    console.log('[Kie.ai] State:', state || 'unknown', '— wachten...');
  }
  throw new Error('Kie.ai timeout: ' + taskId);
}

async function createShopifyProduct(productData) {
  const store = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const r = await fetch('https://' + store + '/admin/api/2024-01/products.json', {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ product: productData })
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error('Shopify fout: ' + r.status + ' ' + errText);
  }
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { productInfo, generatePhotos } = req.body || {};
  if (!productInfo) return res.status(400).json({ error: 'Product info missing' });

  console.log('[handler] Product:', productInfo.title, '| generatePhotos:', generatePhotos);

  try {
    const generated = await generateDescription(productInfo);
    const description = generated.description || '';
    const seoTitle = generated.seoTitle || productInfo.title;
    const urlHandle = generated.urlHandle || productInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const metaDescription = generated.metaDescription || '';

    const colors = (productInfo.colors || []).map(translateColor);
    const tags = [
      productInfo.type, productInfo.season, 'Yamira London',
      ...colors, ...(productInfo.extraTags || [])
    ].filter(Boolean).join(', ');

    const price = convertPrice(productInfo.originalPrice, productInfo.currency || 'EUR');
    const sizes = (productInfo.sizes || ['XS', 'S', 'M', 'L', 'XL', 'XXL']).map(mapSize);

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
      const primaryColor = colors[0] || 'the garment colour';
      const prompts = buildPhotoPrompts(seoTitle, primaryColor);
      console.log('[handler] Generating', prompts.length, 'photos for colour:', primaryColor);

      const taskIds = [];
      for (let i = 0; i < prompts.length; i++) {
        try {
          const taskId = await submitKieTask(prompts[i]);
          taskIds.push({ taskId: taskId, index: i });
        } catch(e) {
          console.error('[handler] Submit task ' + i + ' failed:', e.message);
        }
      }

      for (let j = 0; j < taskIds.length; j++) {
        const item = taskIds[j];
        try {
          const imgUrl = await pollKieTask(item.taskId);
          if (imgUrl) {
            generatedImages.push({ src: imgUrl, position: item.index + 1 });
            console.log('[handler] Photo ' + (item.index + 1) + ' done:', imgUrl);
          }
        } catch(e) {
          console.error('[handler] Photo ' + (item.index + 1) + ' failed:', e.message);
        }
      }
      console.log('[handler] Total photos:', generatedImages.length);
    }

    const shopifyProduct = {
      title: seoTitle,
      handle: urlHandle || undefined,
      body_html: description ? '<p>' + description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>' : '',
      metafields: metaDescription ? [{ key: 'description_tag', value: metaDescription, type: 'single_line_text_field', namespace: 'global' }] : [],
      vendor: 'Yamira London',
      product_type: productInfo.type || 'Dress',
      tags: tags,
      status: 'draft',
      variants: variants,
      options: variants[0] && variants[0].option2 ? [{ name: 'Colour' }, { name: 'Size' }] : [{ name: 'Size' }],
      images: generatedImages.length > 0
        ? generatedImages
        : (productInfo.originalImages || []).map(function(src) { return { src: src }; })
    };

    const result = await createShopifyProduct(shopifyProduct);

    return res.status(200).json({
      success: true,
      product: result.product,
      seoTitle: seoTitle,
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
