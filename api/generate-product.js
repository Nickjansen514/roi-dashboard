const KIE_API_KEY = process.env.KIE_API_KEY;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

// Price conversion: convert to GBP and round to x4.95 or x9.95
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

// Size mapping
const sizeMap = {
  'XS': 'XS (UK6)', 'S': 'S (UK8)', 'M': 'M (UK10)',
  'L': 'L (UK12)', 'XL': 'XL (UK14)', 'XXL': 'XXL (UK16)',
  '2XL': 'XXL (UK16)', '3XL': 'XXXL (UK18)',
  '34': 'XS (UK6)', '36': 'S (UK8)', '38': 'M (UK10)',
  '40': 'L (UK12)', '42': 'XL (UK14)', '44': 'XXL (UK16)'
};

// Color translation to English UK
const colorMap = {
  'noir': 'black', 'blanc': 'white', 'rouge': 'red', 'bleu': 'blue',
  'vert': 'green', 'rose': 'pink', 'beige': 'beige', 'crème': 'cream',
  'gris': 'grey', 'marron': 'brown', 'orange': 'orange', 'violet': 'purple',
  'jaune': 'yellow', 'marine': 'navy', 'bordeaux': 'burgundy',
  'zwart': 'black', 'wit': 'white', 'blauw': 'blue', 'groen': 'green',
  'roze': 'pink', 'grijs': 'grey', 'bruin': 'brown', 'geel': 'yellow',
  'rood': 'red', 'paars': 'purple', 'lila': 'lilac',
  'negro': 'black', 'blanco': 'white', 'rojo': 'red', 'azul': 'blue',
  'verde': 'green', 'rosa': 'pink', 'gris': 'grey', 'amarillo': 'yellow'
};

function translateColor(color) {
  const lower = color.toLowerCase().trim();
  return colorMap[lower] || lower;
}

function mapSize(size) {
  const upper = size.toUpperCase().trim();
  return sizeMap[upper] || size;
}

// Generate product description using Claude
async function generateDescription(productInfo) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: `You are the dedicated product import and listing assistant for Yamira London, a UK-based women's fashion webshop. You create fully compliant Shopify-ready product listings. Follow these rules exactly:

BRAND CONTEXT: Store name: Yamira London. Market: United Kingdom. Language: Natural UK English. Target audience: Women. Tone: clean, neutral, refined, factual, elegant, premium editorial style. Never write hype, never exaggerate, never make unsupported claims.

SEO TITLE RULES: Always generate a title that is 100% original, highly SEO optimised for UK Google searches, natural UK English, descriptive, specific, keyword rich, ends with "for women". Never use: luxury, elegant, perfect, flattering, shaping, slimming, premium quality, comfort fit. Structure: Primary keyword + secondary keyword + descriptive detail + for women.

PRODUCT DESCRIPTION RULES: Always write in this structure: Intro paragraph (2 sentences), 5 bullet points, Closing sentence (1 sentence). Use visible product features only. Never invent features. Never mention: comfort, support, posture, pain relief, healing, anti-slip, breathable, slimming, shaping, luxury, elegant (as claim).

META DESCRIPTION RULES: max 160 characters, SEO focused, unique, natural UK English, end with "– Yamira London".

URL HANDLE RULES: lowercase only, hyphens only, no special characters, descriptive, unique.

OUTPUT FORMAT - Always output exactly this JSON:
{
  "seoTitle": "...",
  "description": "...",
  "metaDescription": "...",
  "urlHandle": "..."
}

Output ONLY the JSON, no other text.`,
      messages: [{
        role: 'user',
        content: `Create a Shopify product listing for this product:
Name: ${productInfo.title}
Type: ${productInfo.type}
Colors: ${productInfo.colors?.join(', ')}
Material: ${productInfo.material || 'not specified'}
Season: ${productInfo.season}
Original description: ${productInfo.originalDescription || 'none'}`
      }]
    })
  });
  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch(e) {
    return { seoTitle: productInfo.title, description: text, metaDescription: '', urlHandle: '' };
  }
}

// Generate image via kie.ai
async function generateImage(prompt, referenceImageUrl = null) {
  const body = {
    model: referenceImageUrl ? 'ideogram/character' : 'gpt-image-1',
    prompt,
    aspect_ratio: '3:4'
  };

  if (referenceImageUrl) {
    body.character_reference = [referenceImageUrl];
  }

  const r = await fetch('https://api.kie.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + KIE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) throw new Error('Kie.ai fout: ' + r.status);
  const data = await r.json();
  const taskId = data.data?.task_id || data.task_id;
  if (!taskId) throw new Error('Geen task ID van kie.ai');

  // Poll for result
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const poll = await fetch(`https://api.kie.ai/v1/images/generations/${taskId}`, {
      headers: { 'Authorization': 'Bearer ' + KIE_API_KEY }
    });
    const result = await poll.json();
    if (result.data?.status === 'completed' || result.status === 'completed') {
      return result.data?.output?.[0] || result.output?.[0] || null;
    }
    if (result.data?.status === 'failed' || result.status === 'failed') {
      throw new Error('Kie.ai generatie mislukt');
    }
  }
  throw new Error('Kie.ai timeout');
}

// Create product in Shopify
async function createShopifyProduct(productData, images) {
  const store = SHOPIFY_STORE?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const r = await fetch(`https://${store}/admin/api/2024-01/products.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ product: productData })
  });
  if (!r.ok) throw new Error('Shopify fout: ' + r.status);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { productInfo, referenceModelUrl, generatePhotos } = req.body || {};
  if (!productInfo) return res.status(400).json({ error: 'Product info missing' });

  try {
    // 1. Generate description
  const generated = await generateDescription(productInfo);
    console.log('Generated:', JSON.stringify(generated));
const description = generated.description || '';
const seoTitle = generated.seoTitle || productInfo.title;
const urlHandle = generated.urlHandle || '';
const metaDescription = generated.metaDescription || '';

    // 2. Build tags
    const tags = [
      productInfo.type,
      productInfo.season,
      'Yamira London',
      ...( productInfo.colors || []).map(c => translateColor(c)),
      ...(productInfo.extraTags || [])
    ].filter(Boolean).join(', ');

    // 3. Convert price
    const price = convertPrice(productInfo.originalPrice, productInfo.currency || 'EUR');

    // 4. Build variants
    const variants = [];
    const colors = (productInfo.colors || []).map(translateColor);
    const sizes = (productInfo.sizes || ['XS', 'S', 'M', 'L', 'XL', 'XXL']).map(mapSize);

    if (colors.length > 0 && sizes.length > 0) {
      for (const color of colors) {
        for (const size of sizes) {
          variants.push({
            option1: color,
            option2: size,
            price: price.toString(),
            compare_at_price: null,
            taxable: false
          });
        }
      }
    } else {
      for (const size of sizes) {
        variants.push({
          option1: size,
          price: price.toString(),
          compare_at_price: null,
          taxable: false
        });
      }
    }

    // 5. Generate photos if requested
    let generatedImages = [];
    if (generatePhotos && referenceModelUrl) {
      const MODEL = `a confident naturally beautiful woman in her early 30s, medium olive skin tone, long dark brown wavy hair, average slim build, UK size 10-12, British fashion aesthetic`;
      const GARMENT = `${productInfo.title}, ${colors[0] || ''} color`;
      const STYLING = `minimal jewellery, nude heels`;
      const COLOR = colors[0] || 'neutral';

      const prompts = [
        `Professional e-commerce fashion photo. The model is ${MODEL}, neutral confident expression. She is wearing ${GARMENT}, styled with ${STYLING}. The photo is cropped from mid-thigh up — the garment fills the frame. Clean light gray studio background, soft even studio lighting. High-end fashion e-commerce photography style. Photorealistic. No text, no watermark.`,
        `Professional e-commerce fashion photo. The model is ${MODEL}, turned with her back fully to the camera, looking slightly over her left shoulder. She is wearing ${GARMENT} — back details clearly visible. Styled with ${STYLING}. Cropped from mid-thigh up. Clean light gray studio background. Photorealistic. No text, no watermark.`,
        `Extreme macro close-up photo of the fabric of a ${GARMENT}. The fabric color is ${COLOR}. Shows weave and texture in sharp detail, slight natural fold. Soft diffused natural lighting, neutral background. 3:4 aspect ratio. Photorealistic. No model, no text, no watermark.`,
        `Lifestyle fashion photography. The model is ${MODEL}, natural candid pose outdoors in an urban setting — city sidewalk, warm golden hour sunlight, blurred background. She is wearing ${GARMENT} styled with ${STYLING} and a small handbag. Natural expression, slight smile. Full body visible. Photorealistic. No text, no watermark.`
      ];

      for (const prompt of prompts) {
        try {
          const imgUrl = await generateImage(prompt, referenceModelUrl);
          if (imgUrl) generatedImages.push({ src: imgUrl });
        } catch(e) {
          console.error('Image gen fout:', e.message);
        }
      }
    }

    // 6. Build Shopify product
    const shopifyProduct = {
      title: seoTitle,
handle: urlHandle || undefined,
      body_html: `<p>${description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
      metafields: metaDescription ? [{ key: 'description_tag', value: metaDescription, type: 'single_line_text_field', namespace: 'global' }] : [],
      vendor: 'Yamira London',
      product_type: productInfo.type || 'Dress',
      tags,
      status: 'draft',
      variants,
      options: variants[0]?.option2 ? [
        { name: 'Colour' },
        { name: 'Size' }
      ] : [{ name: 'Size' }],
      images: generatedImages.length > 0 ? generatedImages : (productInfo.originalImages || []).map(src => ({ src }))
    };

    // 7. Create in Shopify
    const result = await createShopifyProduct(shopifyProduct);

    return res.status(200).json({
      success: true,
      product: result.product,
      description,
      price,
      tags,
      imagesGenerated: generatedImages.length
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
