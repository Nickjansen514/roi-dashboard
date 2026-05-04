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

function buildPhotoPrompts(productTitle, color) {
  const colorDesc = colorPromptDescription(color);
  const GARMENT = productTitle + ' in ' + colorDesc;

  const detailKeywords = ['neckline', 'sleeve', 'collar', 'hem', 'waist', 'button', 'zip', 'ruffle', 'bow', 'tie', 'slit', 'pleat', 'gather', 'ruche', 'butterfly'];
  let detail = 'neckline and sleeve detail';
  for (const kw of detailKeywords) {
    if (productTitle.toLowerCase().includes(kw)) { detail = kw + ' detail'; break; }
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

async function pollKieTask(taskId) {
  for (let i = 0; i < 40; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); });

    const poll = await fetch('https://api.kie.ai/api/v1/jobs/result/' + taskId, {
      headers: { 'Authorization': 'Bearer ' + KIE_API_KEY }
    });
    const pollText = await poll.text();
    console.log('[Kie.ai] Poll ' + (i + 1) + ' for ' + taskId + ':', pollText.substring(0, 150));

    let result;
    try { result = JSON.parse(pollText); } catch(e) { continue; }

    const status = (result.data && result.data.status) || result.status;
    const output = (result.data && (result.data.output || result.data.images)) || result.output;

    if (['completed', 'succeed', 'succeeded', 'SUCCESS'].includes(status)) {
      const imgUrl = Array.isArray(output) ? output[0] : (typeof output === 'string' ? output : null);
      console.log('[Kie.ai] Done! URL:', imgUrl);
      return imgUrl || null;
    }
    if (['failed', 'error', 'FAILED'].includes(status)) {
      throw new Error('Kie.ai task mislukt: ' + taskId);
    }
    console.log('[Kie.ai] Status:', status, '— wachten...');
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
        body: JSON.stringify({
          image: {
            src: imageUrls[i],
            position: i + 1
          }
        })
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

  // Haal product ID uit de admin URL
  // bijv: https://admin.shopify.com/store/yamira-london/products/10569417523539
  const match = adminUrl.match(/\/products\/(\d+)/);
  if (!match) return res.status(400).json({ error: 'Geen geldig product ID gevonden in URL' });
  const productId = match[1];

  console.log('[photo-generator] Product ID:', productId, '| Color:', color);

  try {
    // 1. Haal productinfo op uit Shopify
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

    // Kleur bepalen
    let primaryColor = color || '';
    if (!primaryColor) {
      // Probeer eerste optie (kleur) uit Shopify product
      const colorOption = product.options && product.options.find(function(o) {
        return o.name.toLowerCase().includes('colour') || o.name.toLowerCase().includes('color');
      });
      if (colorOption && colorOption.values && colorOption.values.length > 0) {
        primaryColor = colorOption.values[0].toLowerCase();
      } else {
        primaryColor = 'the garment colour';
      }
    }

    console.log('[photo-generator] Kleur:', primaryColor);

    // 2. Bouw prompts
    const prompts = buildPhotoPrompts(productTitle, primaryColor);
    console.log('[photo-generator] Generating', prompts.length, 'photos...');

    // 3. Submit alle taken naar kie.ai
    const taskIds = [];
    for (let i = 0; i < prompts.length; i++) {
      try {
        const taskId = await submitKieTask(prompts[i]);
        taskIds.push({ taskId: taskId, index: i });
      } catch(e) {
        console.error('[photo-generator] Submit task ' + i + ' failed:', e.message);
      }
    }

    // 4. Poll alle taken
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

    // 5. Voeg foto's toe aan Shopify product
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
