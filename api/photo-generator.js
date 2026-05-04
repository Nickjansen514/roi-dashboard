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

// Submit taak met of zonder referentieafbeelding
async function submitKieTask(prompt, imageUrl) {
  console.log('[Kie.ai] Submitting (' + (imageUrl ? 'remix' : 'text2img') + '):', prompt.substring(0, 80) + '...');

  const model = imageUrl ? 'ideogram/v3-remix' : 'ideogram/v3-text-to-image';

  const input = {
    prompt: prompt,
    rendering_speed: 'BALANCED',
    style: 'REALISTIC'
  };

  // Remix: voeg referentieafbeelding toe met strength
  if (imageUrl) {
    input.image_url = imageUrl;
    input.strength = 0.85; // 0.85 = houdt jurk goed vast maar past model toe
  }

  const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + KIE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: model, input: input })
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

  const { adminUrl, color, referenceImageUrl } = req.body || {};
  if (!adminUrl) return res.status(400).json({ error: 'Admin URL missing' });

  const match = adminUrl.match(/\/products\/(\d+)/);
  if (!match) return res.status(400).json({ error: 'Geen geldig product ID gevonden in URL' });
  const productId = match[1];

  console.log('[photo-generator] Product ID:', productId, '| Color:', color, '| RefImage:', referenceImageUrl);

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

    // Pak eerste productfoto als referentie als geen referentie meegegeven
    let productImageRef = referenceImageUrl || null;
    if (!productImageRef && product.images && product.images.length > 0) {
      productImageRef = product.images[0].src;
      console.log('[photo-generator] Gebruik eerste productfoto als referentie:', productImageRef);
    }

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

    const colorDesc = colorPromptDescription(primaryColor);
    console.log('[photo-generator] Kleur:', primaryColor, '→', colorDesc);

    // 2. Bouw prompts
    // Shots met model (1,2,3,6,7): gebruik remix met productfoto als referentie
    // Shots zonder model (4,5,8): gebruik text-to-image

    const detailKeywords = ['neckline', 'sleeve', 'collar', 'hem', 'waist', 'button', 'zip', 'ruffle', 'bow', 'tie', 'slit', 'pleat', 'gather', 'ruche', 'butterfly'];
    let detail = 'neckline and sleeve detail';
    for (const kw of detailKeywords) {
      if (productTitle.toLowerCase().includes(kw)) { detail = kw + ' detail'; break; }
    }

    const GARMENT = productTitle + ' in ' + colorDesc;

    // { prompt, useRef } — useRef = gebruik productfoto als referentie
    const shots = [
      {
        prompt: 'Professional e-commerce fashion photo. Keep the exact same dress/garment design, neckline, sleeves and details. Replace the background with clean light gray studio background. The model is ' + MODEL + ', neutral confident expression, wearing this exact garment styled with ' + STYLING + '. Cropped from ' + CROP + '. Soft even studio lighting. High-end fashion e-commerce photography. Photorealistic. No text, no watermark.',
        useRef: true
      },
      {
        prompt: 'Professional e-commerce fashion photo. Keep the exact same dress/garment design, neckline, sleeves and all construction details. The model is ' + MODEL + ', turned with her back fully to the camera, looking slightly over her left shoulder. Back details clearly visible. Styled with ' + STYLING + '. Cropped from ' + CROP + '. Clean light gray studio background. Photorealistic. No text, no watermark.',
        useRef: true
      },
      {
        prompt: 'Professional e-commerce fashion photo. Keep the exact same dress/garment design, neckline, sleeves and details. The model is ' + MODEL + ', posed at a 45-degree angle. Styled with ' + STYLING + '. Cropped from ' + CROP + '. Clean light gray studio background. Photorealistic. No text, no watermark.',
        useRef: true
      },
      {
        prompt: 'Extreme macro close-up photo of the fabric of ' + GARMENT + '. The fabric color is ' + colorDesc + '. Shows the weave, texture, and material quality in sharp detail, slight natural fold. Soft diffused natural lighting, neutral background. 3:4 aspect ratio. Photorealistic. No model, no text, no watermark.',
        useRef: false
      },
      {
        prompt: 'Close-up product photo of the ' + detail + ' on ' + GARMENT + '. The fabric color is ' + colorDesc + '. Sharp focus on the detail with slight background blur. Soft studio lighting. 3:4 aspect ratio. Photorealistic. No model, no text, no watermark.',
        useRef: false
      },
      {
        prompt: 'Lifestyle fashion photography. Keep the exact same dress/garment design and details. The model is ' + MODEL + ', natural candid pose outdoors, city sidewalk, warm golden hour sunlight, blurred background. Wearing this exact garment styled with ' + STYLING + ' and a small handbag. Full body visible. Photorealistic. No text, no watermark.',
        useRef: true
      },
      {
        prompt: 'Full-body studio fashion photo. Keep the exact same dress/garment design and details. The model is ' + MODEL + ', standing relaxed, full body visible. Wearing this exact garment styled with ' + STYLING + '. Clean light gray studio background. Fashion lookbook style. Photorealistic. No text, no watermark.',
        useRef: true
      },
      {
        prompt: 'Flat lay product photo of ' + GARMENT + ' laid neatly on a clean white marble surface. Fully spread out, wrinkle-free, all design details visible including neckline and sleeves. Shot from directly above. Soft natural window light. Minimal accessories beside it. 3:4 aspect ratio. Photorealistic. No model, no text, no watermark.',
        useRef: false
      }
    ];

    console.log('[photo-generator] Generating', shots.length, 'photos...');

    // 3. Submit alle taken
    const taskIds = [];
    for (let i = 0; i < shots.length; i++) {
      try {
        const refUrl = shots[i].useRef ? productImageRef : null;
        const taskId = await submitKieTask(shots[i].prompt, refUrl);
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

    // 5. Voeg foto's toe aan Shopify
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
