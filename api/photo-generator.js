const KIE_API_KEY = process.env.KIE_API_KEY;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

const MODEL = 'a confident professional fashion model, early 30s, light medium skin tone, long dark brown wavy hair, slim build, UK size 10, standing upright, British fashion aesthetic';
const CROP = 'mid-thigh up';
const STYLING = 'minimal delicate jewellery, nude heels';

function colorPromptDescription(color) {
  const descriptions = {
    'black': 'deep black, NOT dark navy or charcoal',
    'white': 'clean white, NOT off-white or cream',
    'red': 'bright red, NOT burgundy or dark red',
    'dark red': 'deep dark red, NOT bright red or orange-red',
    'pink': 'soft pink, NOT hot pink or magenta',
    'roze': 'soft pink, NOT hot pink or magenta',
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

// Haal garment kenmerken uit producttitel voor gebruik in prompts
function extractGarmentFeatures(title) {
  const t = title.toLowerCase();
  const features = [];

  // Neckline
  if (t.includes('v-neck') || t.includes('v neck')) features.push('deep V-neckline');
  else if (t.includes('high neck') || t.includes('turtleneck') || t.includes('mock neck')) features.push('high neckline');
  else if (t.includes('square neck')) features.push('square neckline');
  else if (t.includes('off shoulder') || t.includes('off-shoulder')) features.push('off-shoulder neckline');
  else if (t.includes('halter')) features.push('halter neckline');
  else if (t.includes('wrap')) features.push('wrap neckline');
  else if (t.includes('cowl')) features.push('cowl neckline');
  else if (t.includes('round neck') || t.includes('crew neck')) features.push('round neckline');

  // Sleeves
  if (t.includes('butterfly sleeve') || t.includes('butterfly-sleeve')) features.push('dramatic butterfly sleeves that flare wide at the shoulders');
  else if (t.includes('puff sleeve') || t.includes('puffed sleeve')) features.push('puff sleeves');
  else if (t.includes('ruffle sleeve')) features.push('ruffle sleeves');
  else if (t.includes('bell sleeve')) features.push('bell sleeves');
  else if (t.includes('cap sleeve')) features.push('cap sleeves');
  else if (t.includes('long sleeve') || t.includes('long-sleeve')) features.push('long sleeves');
  else if (t.includes('short sleeve')) features.push('short sleeves');
  else if (t.includes('sleeveless') || t.includes('no sleeve')) features.push('sleeveless');
  else if (t.includes('flutter sleeve')) features.push('flutter sleeves');

  // Length
  if (t.includes('maxi')) features.push('floor-length maxi length');
  else if (t.includes('midi')) features.push('midi length reaching below the knee');
  else if (t.includes('mini')) features.push('mini length above the knee');

  // Silhouette/fit
  if (t.includes('gathered') || t.includes('ruched')) features.push('gathered fabric with ruching detail');
  if (t.includes('fitted') || t.includes('bodycon')) features.push('fitted silhouette');
  if (t.includes('flowy') || t.includes('flare') || t.includes('a-line')) features.push('flowy A-line silhouette');
  if (t.includes('pleated')) features.push('pleated skirt detail');
  if (t.includes('ruffle')) features.push('ruffle trim detail');
  if (t.includes('slit')) features.push('side slit');
  if (t.includes('wrap')) features.push('wrap style front');
  if (t.includes('tiered')) features.push('tiered skirt');

  return features;
}

function buildPhotoPrompts(productTitle, color) {
  const colorDesc = colorPromptDescription(color);
  const features = extractGarmentFeatures(productTitle);

  // Bouw een gedetailleerde garment beschrijving
  const garmentDesc = features.length > 0
    ? productTitle + ' — specifically featuring: ' + features.join(', ')
    : productTitle;

  const featureStr = features.length > 0
    ? 'The dress has the following exact features that MUST be visible: ' + features.join(', ') + '. '
    : '';

  const colorStr = 'The garment color is ' + colorDesc + '. ';

  return [
    // Shot 1 — Front View
    'Professional e-commerce fashion photo. The model is ' + MODEL + ', neutral confident expression. She is wearing a ' + garmentDesc + '. ' + featureStr + colorStr + 'Styled with ' + STYLING + '. Cropped from ' + CROP + ', garment fills the frame. Clean light gray studio background, soft even studio lighting. High-end fashion e-commerce photography. Photorealistic. No text, no watermark.',

    // Shot 2 — Back View
    'Professional e-commerce fashion photo. The model is ' + MODEL + ', turned with her back fully to the camera, looking slightly over her left shoulder. She is wearing a ' + garmentDesc + '. ' + featureStr + colorStr + 'Back details clearly visible. Styled with ' + STYLING + '. Cropped from ' + CROP + '. Clean light gray studio background. Photorealistic. No text, no watermark.',

    // Shot 3 — Three-Quarter View
    'Professional e-commerce fashion photo. The model is ' + MODEL + ', posed at a 45-degree angle. She is wearing a ' + garmentDesc + '. ' + featureStr + colorStr + 'Styled with ' + STYLING + '. Cropped from ' + CROP + '. Clean light gray studio background. Photorealistic. No text, no watermark.',

    // Shot 4 — Fabric Close-Up
    'Extreme macro close-up photo of the fabric of a ' + colorDesc + ' dress. ' + colorStr + 'Shows the weave, texture, and material quality in sharp detail, slight natural fold. Soft diffused natural lighting, neutral background. 3:4 aspect ratio. Photorealistic. No model, no text, no watermark.',

    // Shot 5 — Detail Close-Up
    'Close-up product photo of the ' + (features[0] || 'neckline and sleeve detail') + ' of a ' + colorDesc + ' dress. ' + colorStr + 'Sharp focus on the garment detail with slight background blur. Soft studio lighting. 3:4 aspect ratio. Photorealistic. No model, no text, no watermark.',

    // Shot 6 — Lifestyle
    'Lifestyle fashion photography. The model is ' + MODEL + ', natural candid pose outdoors, city sidewalk, warm golden hour sunlight, blurred background. She is wearing a ' + garmentDesc + '. ' + featureStr + colorStr + 'Styled with ' + STYLING + ' and a small handbag. Full body visible. Photorealistic. No text, no watermark.',

    // Shot 7 — Full Body Studio
    'Full-body studio fashion photo. The model is ' + MODEL + ', standing relaxed, full body visible. She is wearing a ' + garmentDesc + '. ' + featureStr + colorStr + 'Styled with ' + STYLING + '. Clean light gray studio background. Fashion lookbook style. Photorealistic. No text, no watermark.',

    // Shot 8 — Flat Lay
    'Flat lay product photo of a ' + colorDesc + ' ' + productTitle + ' laid neatly on a clean white marble surface. ' + featureStr + 'Fully spread out, wrinkle-free, all design details clearly visible. Shot from directly above. Soft natural window light. Minimal accessories. 3:4 aspect ratio. Photorealistic. No model, no text, no watermark.'
  ];
}

async function submitKieTask(prompt) {
  console.log('[Kie.ai] Submitting text2img:', prompt.substring(0, 100) + '...');

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

async function addImagesToShopifyProduct(productId, imageUrls) {
  const store = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const r = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/images.json', {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json'
        },
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

  const { adminUrl, color } = req.body || {};
  if (!adminUrl) return res.status(400).json({ error: 'Admin URL missing' });

  const match = adminUrl.match(/\/products\/(\d+)/);
  if (!match) return res.status(400).json({ error: 'Geen geldig product ID gevonden in URL' });
  const productId = match[1];

  console.log('[photo-generator] Product ID:', productId, '| Color:', color);

  try {
    const store = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const shopifyR = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '.json', {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
    });

    if (!shopifyR.ok) {
      const errText = await shopifyR.text();
      throw new Error('Shopify product ophalen mislukt: ' + shopifyR.status + ' ' + errText);
    }

    const shopifyData = await shopifyR.json();
    const product = shopifyData.product;
    const productTitle = product.title;

    console.log('[photo-generator] Product titel:', productTitle);

    let primaryColor = color || '';
    if (!primaryColor) {
      const colorOption = product.options && product.options.find(function(o) {
        return o.name.toLowerCase().includes('colour') || o.name.toLowerCase().includes('color');
      });
      if (colorOption && colorOption.values && colorOption.values.length > 0) {
        primaryColor = colorOption.values[0].toLowerCase();
      } else {
        primaryColor = 'the garment colour';
      }
    }

    const features = extractGarmentFeatures(productTitle);
    console.log('[photo-generator] Kleur:', primaryColor, '| Features:', features.join(', '));

    const prompts = buildPhotoPrompts(productTitle, primaryColor);
    console.log('[photo-generator] Generating', prompts.length, 'photos...');

    // Submit alle taken
    const taskIds = [];
    for (let i = 0; i < prompts.length; i++) {
      try {
        const taskId = await submitKieTask(prompts[i]);
        taskIds.push({ taskId: taskId, index: i });
      } catch(e) {
        console.error('[photo-generator] Submit task ' + i + ' failed:', e.message);
      }
    }

    // Poll alle taken
    const generatedImageUrls = [];
    for (let j = 0; j < taskIds.length; j++) {
      const item = taskIds[j];
      try {
        const imgUrl = await pollKieTask(item.taskId);
        if (imgUrl) {
          generatedImageUrls.push(imgUrl);
          console.log('[photo-generator] Photo ' + (item.index + 1) + ' done:', imgUrl);
        }
      } catch(e) {
        console.error('[photo-generator] Photo ' + (item.index + 1) + ' failed:', e.message);
      }
    }

    console.log('[photo-generator] Total photos generated:', generatedImageUrls.length);

    if (generatedImageUrls.length > 0) {
      await addImagesToShopifyProduct(productId, generatedImageUrls);
    }

    return res.status(200).json({
      success: true,
      productId: productId,
      productTitle: productTitle,
      imagesGenerated: generatedImageUrls.length,
      imageUrls: generatedImageUrls
    });

  } catch(err) {
    console.error('[photo-generator] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
