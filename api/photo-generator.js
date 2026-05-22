const KIE_API_KEY = process.env.KIE_API_KEY;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

const MODEL = 'a professional fashion model, mid-20s, fair light skin tone, long dark brown wavy hair worn down in loose waves, slim figure, natural makeup, soft natural lip, relaxed confident expression';
const BG = 'clean light gray studio background, soft even studio lighting, no harsh shadows, white floor';
const STYLING = 'simple beige heels';

function colorPromptDescription(color) {
  const map = {
    'black': 'deep black, NOT dark navy or charcoal',
    'white': 'clean white, NOT off-white or cream',
    'red': 'bright red, NOT burgundy or dark red',
    'dark red': 'deep dark red, NOT bright red or orange-red',
    'pink': 'soft pink, NOT hot pink or magenta',
    'różowy': 'soft pink, NOT hot pink or magenta',
    'blue': 'medium blue, NOT navy or light blue',
    'navy': 'deep navy blue, NOT black or medium blue',
    'green': 'green, NOT olive or khaki',
    'khaki': 'warm khaki olive, NOT bright green or brown',
    'orange': 'warm orange, NOT red-orange or yellow',
    'yellow': 'warm yellow, NOT lime or gold',
    'lilac': 'soft lilac purple, NOT pink or dark purple',
    'liliowy': 'soft lilac purple, NOT pink or dark purple',
    'purple': 'purple, NOT lilac or dark navy',
    'fioletowy': 'purple, NOT lilac or dark navy',
    'grey': 'medium grey, NOT silver or charcoal',
    'szary': 'medium grey, NOT silver or charcoal',
    'beige': 'warm beige, NOT white or cream',
    'beżowy': 'warm beige, NOT white or cream',
    'cream': 'soft cream, NOT white or beige',
    'kremowy': 'soft cream, NOT white or beige',
    'brown': 'warm brown, NOT dark or orange',
    'burgundy': 'deep burgundy wine red, NOT bright red or dark brown',
    'bordowy': 'deep burgundy wine red, NOT bright red or dark brown',
    'czarny': 'deep black, NOT dark navy or charcoal',
    'biały': 'clean white, NOT off-white or cream',
    'czerwony': 'bright red, NOT burgundy or dark red',
    'niebieski': 'medium blue, NOT navy or light blue',
    'granatowy': 'deep navy blue, NOT black or medium blue',
    'zielony': 'green, NOT olive or khaki',
    'złoty': 'warm gold, NOT yellow or bronze',
    'srebrny': 'silver, NOT grey or white',
    'koralowy': 'warm coral, NOT orange or red',
    'miętowy': 'soft mint green, NOT teal or lime',
    'musztardowy': 'warm mustard yellow, NOT bright yellow',
  };
  return map[color.toLowerCase()] || (color + ', NOT any other color');
}

async function analyzeGarmentFromImages(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return null;
  const toAnalyze = imageUrls.slice(0, 3);
  const imageContent = toAnalyze.map(function(url) {
    return { type: 'image', source: { type: 'url', url: url } };
  });
  imageContent.push({
    type: 'text',
Describe this garment for an AI image generation prompt. Include: silhouette, neckline, straps or sleeves, length, fabric texture, and key design details (ruffles, lace, pleats, embroidery, bow). Write ONLY the garment description, no color, no introduction. Maximum 60 words. Avoid words: bare, exposed, revealing, backless.
  });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: imageContent }]
      })
    });
    const data = await response.json();
    return (data.content && data.content[0] && data.content[0].text) || null;
  } catch(e) {
    console.error('[analyzeGarment] Failed:', e.message);
    return null;
  }
}

function buildGarmentDescription(title, garmentAnalysis, colorDesc) {
  if (garmentAnalysis) {
    return garmentAnalysis + ', in ' + colorDesc;
  }
  const t = title.toLowerCase();
  const features = [];
  if (t.includes('v-neck') || t.includes('v neck')) features.push('deep V-neckline');
  else if (t.includes('square neck')) features.push('square neckline');
  else if (t.includes('off shoulder') || t.includes('off-shoulder')) features.push('off-shoulder neckline');
  else if (t.includes('halter')) features.push('halter neckline');
  else if (t.includes('wrap')) features.push('wrap neckline');
  else if (t.includes('cowl')) features.push('cowl neckline');
  if (t.includes('butterfly sleeve')) features.push('dramatic wide butterfly sleeves');
  else if (t.includes('puff sleeve')) features.push('voluminous puff sleeves');
  else if (t.includes('long sleeve')) features.push('long sleeves');
  else if (t.includes('sleeveless')) features.push('sleeveless');
  if (t.includes('maxi')) features.push('floor-length maxi cut');
  else if (t.includes('midi')) features.push('midi length falling below the knee');
  else if (t.includes('mini')) features.push('mini length above the knee');
  if (t.includes('a-line')) features.push('A-line silhouette');
  if (t.includes('bodycon') || t.includes('fitted')) features.push('fitted bodycon silhouette');
  if (t.includes('pleated')) features.push('pleated skirt');
  if (t.includes('ruched')) features.push('ruched fabric detail');
  if (t.includes('tiered')) features.push('tiered skirt');
  if (t.includes('slit')) features.push('side slit');
  const featureList = features.length > 0 ? ', with ' + features.join(', ') : '';
  return title + featureList + ', in ' + colorDesc;
}

function buildPhotoPrompts(garment) {
  return [
    'Professional e-commerce fashion photo. The model is ' + MODEL + '. Full body visible head to toe. She is wearing ' + garment + ', styled with ' + STYLING + '. Posed at a natural 45-degree angle to the camera, weight shifted to one leg, arms relaxed at sides, slight natural smile. ' + BG + '. High-end fashion e-commerce photography style. Photorealistic. No text, no watermark.',

    'Professional e-commerce fashion photo. The model is ' + MODEL + '. Full body visible head to toe. She is wearing ' + garment + ', styled with ' + STYLING + '. Pure side profile view, model facing left, standing tall with relaxed posture, hair falling naturally over shoulder. ' + BG + '. High-end fashion e-commerce photography style. Photorealistic. No text, no watermark.',

    'Professional e-commerce fashion photo. The model is ' + MODEL + '. Full body visible head to toe. She is wearing ' + garment + ', styled with ' + STYLING + '. Turned at a 3/4 angle toward camera, one hand gently touching her neckline/chest, soft natural smile, engaging eye contact with camera. ' + BG + '. High-end fashion e-commerce photography style. Photorealistic. No text, no watermark.'
  ];
}

async function submitKieTask(prompt) {
  console.log('[Kie.ai] Submitting:', prompt.substring(0, 100) + '...');
  const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KIE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'ideogram/v3-text-to-image',
      input: { prompt: prompt, rendering_speed: 'BALANCED', style: 'REALISTIC' }
    })
  });
  const responseText = await r.text();
  if (!r.ok) throw new Error('Kie.ai submit fout: ' + r.status + ' ' + responseText);
  let data;
  try { data = JSON.parse(responseText); } catch(e) { throw new Error('Kie.ai invalid JSON'); }
  const taskId = data && data.data && (data.data.taskId || data.data.task_id) || data && data.taskId;
  if (!taskId) throw new Error('Geen taskId: ' + JSON.stringify(data));
  console.log('[Kie.ai] Task ID:', taskId);
  return taskId;
}

async function pollKieTask(taskId) {
  for (let i = 0; i < 40; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); });
    const poll = await fetch('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + taskId, {
      headers: { 'Authorization': 'Bearer ' + KIE_API_KEY }
    });
    const pollText = await poll.text();
    let result;
    try { result = JSON.parse(pollText); } catch(e) { continue; }
    const state = result && result.data && result.data.state;
    if (state === 'success') {
      let imgUrl = null;
      try { const rj = JSON.parse(result.data.resultJson); imgUrl = rj.resultUrls && rj.resultUrls[0]; } catch(e) {}
      console.log('[Kie.ai] Done! URL:', imgUrl);
      return imgUrl || null;
    }
    if (state === 'fail') {
  const failMsg = result.data && result.data.failMsg;
  throw new Error('Kie.ai task mislukt: ' + taskId + ' | reden: ' + (failMsg || 'onbekend'));
}
    console.log('[Kie.ai] State:', state || 'unknown', '— wachten...');
  }
  throw new Error('Kie.ai timeout: ' + taskId);
}

async function addImagesToShopifyProduct(productId, imageUrls, token, storeDomain) {
  const t = token || SHOPIFY_TOKEN;
  const store = (storeDomain || SHOPIFY_STORE).replace(/^https?:\/\//, '').replace(/\/$/, '');
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const r = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/images.json', {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: { src: imageUrls[i], position: i + 1 } })
      });
      if (!r.ok) {
        const errText = await r.text();
        console.error('[Shopify] Image upload fout:', r.status, errText);
      } else {
        console.log('[Shopify] Image ' + (i + 1) + ' toegevoegd!');
      }
    } catch(e) {
      console.error('[Shopify] Image upload error:', e.message);
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { adminUrl, color, shopifyToken: reqToken, shopifyStore: reqStore, storeId } = req.body || {};
  let activeToken = reqToken || SHOPIFY_TOKEN;
  let activeStore = reqStore || SHOPIFY_STORE;
  if (storeId === 'store2') {
    activeToken = process.env.SHOPIFY_TOKEN_2;
    activeStore = process.env.SHOPIFY_STORE_2 || 'gw5ubt-8p.myshopify.com';
  }
  if (!adminUrl) return res.status(400).json({ error: 'Admin URL missing' });

  const match = adminUrl.match(/\/products\/(\d+)/);
  if (!match) return res.status(400).json({ error: 'Geen geldig product ID gevonden in URL' });
  const productId = match[1];

  console.log('[photo-generator] Product ID:', productId, '| Color:', color);

  try {
    const store = activeStore.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const shopifyR = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '.json', {
      headers: { 'X-Shopify-Access-Token': activeToken }
    });
    if (!shopifyR.ok) {
      const errText = await shopifyR.text();
      throw new Error('Shopify product ophalen mislukt: ' + shopifyR.status + ' ' + errText);
    }

    const shopifyData = await shopifyR.json();
    const product = shopifyData.product;
    const productTitle = product.title;

    // Bestaande Shopify images ophalen voor Claude Vision analyse
    const existingImageUrls = (product.images || []).map(function(img) { return img.src; });
    console.log('[photo-generator] Bestaande images:', existingImageUrls.length);

    // Claude Vision analyseert het kledingstuk
    const garmentAnalysis = await analyzeGarmentFromImages(existingImageUrls);
    console.log('[photo-generator] Garment analyse:', garmentAnalysis);

    // Bepaal kleur(en)
    let colorsToGenerate = [];
    if (color) {
      colorsToGenerate = [color];
    } else {
      const colorOption = product.options && product.options.find(function(o) {
        return o.name.toLowerCase().includes('colour') || o.name.toLowerCase().includes('color') ||
               o.name.toLowerCase().includes('kolor');
      });
      if (colorOption && colorOption.values && colorOption.values.length > 0) {
        colorsToGenerate = colorOption.values;
      } else {
        colorsToGenerate = ['the garment colour'];
      }
    }

    console.log('[photo-generator] Kleuren:', colorsToGenerate);

    // Genereer 3 foto's per kleur
    const taskIds = [];
    for (const col of colorsToGenerate) {
      const colorDesc = colorPromptDescription(col);
      const garment = buildGarmentDescription(productTitle, garmentAnalysis, colorDesc);
      console.log('[photo-generator] Garment voor kleur', col, ':', garment.substring(0, 100));
      const prompts = buildPhotoPrompts(garment);
      for (let i = 0; i < prompts.length; i++) {
        try {
          const taskId = await submitKieTask(prompts[i]);
          taskIds.push({ taskId: taskId, color: col, angle: i + 1 });
        } catch(e) {
          console.error('[photo-generator] Submit failed voor kleur', col, 'shot', i + 1, ':', e.message);
        }
      }
    }

    // Poll alle tasks
    const generatedImageUrls = [];
    for (const item of taskIds) {
      try {
        const imgUrl = await pollKieTask(item.taskId);
        if (imgUrl) {
          generatedImageUrls.push(imgUrl);
          console.log('[photo-generator] Kleur', item.color, 'shot', item.angle, 'klaar:', imgUrl);
        }
      } catch(e) {
        console.error('[photo-generator] Kleur', item.color, 'shot', item.angle, 'mislukt:', e.message);
      }
    }

    console.log('[photo-generator] Totaal gegenereerd:', generatedImageUrls.length);

    if (generatedImageUrls.length > 0) {
      await addImagesToShopifyProduct(productId, generatedImageUrls, activeToken, activeStore);
    }

    return res.status(200).json({
      success: true,
      productId: productId,
      productTitle: productTitle,
      garmentAnalysis: garmentAnalysis,
      colorsProcessed: colorsToGenerate,
      imagesGenerated: generatedImageUrls.length,
      imageUrls: generatedImageUrls
    });

  } catch(err) {
    console.error('[photo-generator] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
