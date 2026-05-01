const KIE_API_KEY = process.env.KIE_API_KEY;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

// Vast Yamira London model — altijd gebruiken voor productfoto's
const DEFAULT_MODEL_URL = 'https://cdn.shopify.com/s/files/1/0994/5202/7219/files/10cc9f8a1cbbadd4ca5fd1f3cee5a16f_1777666053_adp3xdip.png?v=1777666156';

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

// Generate product description using Claude
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
        content: `Create a Shopify product listing for this product:
Name: ${productInfo.title}
Type: ${productInfo.type}
Colors: ${(productInfo.colors || []).join(', ')}
Material: ${productInfo.material || 'not specified'}
Season: ${productInfo.season || 'not specified'}
Original description: ${productInfo.originalDescription || 'none'}`
      }]
    })
  });

  console.log('[generateDescription] Claude API status:', response.status);

  if (!response.ok) {
    const errText = await response.text();
    console.error('[generateDescription] Claude API error:', errText);
    throw new Error('Claude API error: ' + response.status + ' ' + errText);
  }

  const data = await response.json();
  console.log('[generateDescription] Raw Claude response:', JSON.stringify(data));

  const text = data.content?.[0]?.text || '{}';
  console.log('[generateDescription] Text from Claude:', text);

  try {
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parsed = JSON.parse(clean);
    console.log('[generateDescription] Parsed result:', JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    console.error('[generateDescription] JSON parse failed:', e.message, '| Raw text:', text);
    return {
      seoTitle: productInfo.title,
      description: text,
      metaDescription: '',
      urlHandle: productInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    };
  }
}

// Generate image via kie.ai - submit task
async function submitKieTask(prompt, referenceImageUrl = null) {
  const body = {
    prompt,
    aspect_ratio: '3:4',
    model: 'ideogram-v3'
  };

  if (referenceImageUrl) {
    body.image_url = referenceImageUrl;
  }

  console.log('[Kie.ai] Submitting task, prompt:', prompt.substring(0, 80) + '...');

  const r = await fetch('https://api.kie.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + KIE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const responseText = await r.text();
  console.log('[Kie.ai] Submit response status:', r.status, '| Body:', responseText);

  if (!r.ok) throw new Error('Kie.ai submit fout: ' + r.status + ' ' + responseText);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error('Kie.ai invalid JSON response: ' + responseText);
  }

  const taskId = data?.data?.task_id || data?.task_id || data?.id;
  if (!taskId) {
    console.error('[Kie.ai] No task_id in response:', JSON.stringify(data));
    throw new Error('Geen task ID van kie.ai. Response: ' + JSON.stringify(data));
  }

  console.log('[Kie.ai] Task submitted, ID:', taskId);
  return taskId;
}

// Poll kie.ai for result
async function pollKieTask(taskId) {
  const maxAttempts = 40;
  const delayMs = 4000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const poll = await fetch(`https://api.kie.ai/v1/images/generations/${taskId}`, {
      headers: { 'Authorization': 'Bearer ' + KIE_API_KEY }
    });

    const pollText = await poll.text();
    console.log(`[Kie.ai] Poll attempt ${i + 1}, status: ${poll.status}, body: ${pollText.substring(0, 200)}`);

    let result;
    try {
      result = JSON.parse(pollText);
    } catch (e) {
      console.error('[Kie.ai] Poll JSON parse error:', pollText);
      continue;
    }

    const status = result?.data?.status || result?.status;
    const output = result?.data?.output || result?.output || result?.data?.images || result?.images;

    if (status === 'completed' || status === 'succeed' || status === 'succeeded') {
      const imgUrl = Array.isArray(output) ? output[0] : output;
      console.log('[Kie.ai] Task completed! Image URL:', imgUrl);
      return imgUrl || null;
    }

    if (status === 'failed' || status === 'error') {
      throw new Error('Kie.ai generatie mislukt voor task: ' + taskId);
    }

    console.log('[Kie.ai] Status:', status, 'still waiting...');
  }

  throw new Error('Kie.ai timeout na ' + maxAttempts + ' pogingen voor task: ' + taskId);
}

// Create product in Shopify
async function createShopifyProduct(productData) {
  const store = SHOPIFY_STORE?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  console.log('[Shopify] Creating product in store:', store);

  const r = await fetch(`https://${store}/admin/api/2024-01/products.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ product: productData })
  });

  if (!r.ok) {
    const errText = await r.text();
    console.error('[Shopify] Error:', r.status, errText);
    throw new Error('Shopify fout: ' + r.status + ' ' + errText);
  }

  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { productInfo, referenceModelUrl, generatePhotos } = req.body || {};
  if (!productInfo) return res.status(400).json({ error: 'Product info missing' });

  console.log('[handler] Received request for product:', productInfo.title);
  console.log('[handler] generatePhotos:', generatePhotos, '| referenceModelUrl:', referenceModelUrl);

  try {
    // 1. Generate description via Claude
    const generated = await generateDescription(productInfo);
    console.log('[handler] Generated content:', JSON.stringify(generated));

    const description = generated.description || '';
    const seoTitle = generated.seoTitle || productInfo.title;
    const urlHandle = generated.urlHandle || productInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const metaDescription = generated.metaDescription || '';

    console.log('[handler] seoTitle:', seoTitle);
    console.log('[handler] description length:', description.length);
    console.log('[handler] metaDescription:', metaDescription);

    // 2. Build tags
    const tags = [
      productInfo.type,
      productInfo.season,
      'Yamira London',
      ...(productInfo.colors || []).map(c => translateColor(c)),
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

    // 5. Generate photos via kie.ai if requested
    // Altijd het vaste Yamira London model gebruiken — optioneel override via dashboard
    let generatedImages = [];
    if (generatePhotos) {
      const modelUrl = referenceModelUrl || DEFAULT_MODEL_URL;

      const GARMENT = `${seoTitle}, ${colors[0] || ''} color`;
      const STYLING = `minimal jewellery, nude heels`;
      const COLOR = colors[0] || 'neutral';

      const prompts = [
        `Professional e-commerce fashion photo. The reference model is wearing ${GARMENT}, styled with ${STYLING}. Cropped from mid-thigh up, garment fills the frame. Clean light gray studio background, soft studio lighting. High-end fashion e-commerce photography. Photorealistic. No text, no watermark.`,
        `Professional e-commerce fashion photo. The reference model is turned with her back to the camera, looking slightly over her left shoulder. She is wearing ${GARMENT}, back details clearly visible. Styled with ${STYLING}. Cropped from mid-thigh up. Clean light gray studio background. Photorealistic. No text, no watermark.`,
        `Extreme macro close-up photo of the fabric of ${GARMENT}. The fabric color is ${COLOR}. Shows weave and texture in sharp detail, slight natural fold. Soft diffused natural lighting, neutral background. 3:4 aspect ratio. Photorealistic. No model, no text, no watermark.`,
        `Lifestyle fashion photography. The reference model in a natural candid pose outdoors, city sidewalk, warm golden hour sunlight, blurred background. She is wearing ${GARMENT} styled with ${STYLING} and a small handbag. Natural expression, slight smile. Full body visible. Photorealistic. No text, no watermark.`
      ];

      console.log('[handler] Starting image generation for', prompts.length, 'photos using model:', modelUrl);

      // Submit alle taken
      const taskIds = [];
      for (let i = 0; i < prompts.length; i++) {
        try {
          const taskId = await submitKieTask(prompts[i], modelUrl);
          taskIds.push({ taskId, index: i });
        } catch (e) {
          console.error(`[handler] Failed to submit image task ${i}:`, e.message);
        }
      }

      // Poll alle taken
      for (const { taskId, index } of taskIds) {
        try {
          const imgUrl = await pollKieTask(taskId);
          if (imgUrl) {
            generatedImages.push({ src: imgUrl, position: index + 1 });
            console.log(`[handler] Image ${index + 1} done:`, imgUrl);
          }
        } catch (e) {
          console.error(`[handler] Image ${index + 1} poll failed:`, e.message);
        }
      }

      console.log('[handler] Total images generated:', generatedImages.length);
    }

    // 6. Build Shopify product payload
    const shopifyProduct = {
      title: seoTitle,
      handle: urlHandle || undefined,
      body_html: description
        ? `<p>${description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
        : '',
      metafields: metaDescription
        ? [{
            key: 'description_tag',
            value: metaDescription,
            type: 'single_line_text_field',
            namespace: 'global'
          }]
        : [],
      vendor: 'Yamira London',
      product_type: productInfo.type || 'Dress',
      tags,
      status: 'draft',
      variants,
      options: variants[0]?.option2
        ? [{ name: 'Colour' }, { name: 'Size' }]
        : [{ name: 'Size' }],
      images: generatedImages.length > 0
        ? generatedImages
        : (productInfo.originalImages || []).map(src => ({ src }))
    };

    console.log('[handler] Shopify product payload title:', shopifyProduct.title);
    console.log('[handler] body_html length:', shopifyProduct.body_html.length);
    console.log('[handler] images count:', shopifyProduct.images.length);

    // 7. Create product in Shopify
    const result = await createShopifyProduct(shopifyProduct);

    return res.status(200).json({
      success: true,
      product: result.product,
      description,
      seoTitle,
      metaDescription,
      price,
      tags,
      imagesGenerated: generatedImages.length
    });

  } catch (err) {
    console.error('[handler] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
