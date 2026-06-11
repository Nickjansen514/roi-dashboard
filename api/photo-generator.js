const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const PIAPI_KEY = process.env.PIAPI_KEY;
const FACE_IMAGE_URL = process.env.FACE_IMAGE_URL;
const BG_COLOR = (process.env.BG_COLOR || 'e8e8e8').replace('#', '');

function resizeShopifyUrl(url) {
  if (!url.includes('cdn.shopify.com')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'width=2048&height=2048';
}

async function submitFaceSwap(targetImageUrl, faceUrl) {
  const resizedUrl = resizeShopifyUrl(targetImageUrl);
  const r = await fetch('https://api.piapi.ai/api/v1/task', {
    method: 'POST',
    headers: { 'x-api-key': PIAPI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'Qubico/image-toolkit',
      task_type: 'face-swap',
      input: { target_image: resizedUrl, swap_image: faceUrl }
    })
  });
  const data = await r.json();
  if (!r.ok || !data.data || !data.data.task_id) {
    throw new Error('FaceSwap submit failed: ' + JSON.stringify(data));
  }
  console.log('[FaceSwap] Task submitted:', data.data.task_id);
  return data.data.task_id;
}

async function pollFaceSwap(taskId) {
  for (let i = 0; i < 40; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); });
    const r = await fetch('https://api.piapi.ai/api/v1/task/' + taskId, {
      headers: { 'x-api-key': PIAPI_KEY }
    });
    const data = await r.json();
    const status = data.data && data.data.status;
    if (status && status.toLowerCase() === 'completed') {
      const url = data.data.output && data.data.output.image_url;
      console.log('[FaceSwap] Done:', taskId, url);
      return url || null;
    }
    if (status && status.toLowerCase() === 'failed') {
      const err = data.data && data.data.error;
      throw new Error('FaceSwap failed: ' + JSON.stringify(err));
    }
    console.log('[FaceSwap] Status:', status || 'unknown', '— waiting...');
  }
  throw new Error('FaceSwap timeout: ' + taskId);
}

async function submitBgRemove(imageUrl) {
  const r = await fetch('https://api.piapi.ai/api/v1/task', {
    method: 'POST',
    headers: { 'x-api-key': PIAPI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'Qubico/image-toolkit',
      task_type: 'background-remove',
      input: { rmbg_model: 'RMBG-2.0', image: imageUrl }
    })
  });
  const data = await r.json();
  if (!r.ok || !data.data || !data.data.task_id) {
    throw new Error('BgRemove submit failed: ' + JSON.stringify(data));
  }
  console.log('[BgRemove] Task submitted:', data.data.task_id);
  return data.data.task_id;
}

async function pollBgRemove(taskId) {
  for (let i = 0; i < 30; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); });
    const r = await fetch('https://api.piapi.ai/api/v1/task/' + taskId, {
      headers: { 'x-api-key': PIAPI_KEY }
    });
    const data = await r.json();
    const status = data.data && data.data.status;
    if (status && status.toLowerCase() === 'completed') {
      const out = (data.data && data.data.output) || {};
      const url = out.image_url || out.image || (out.images && out.images[0]) || null;
      console.log('[BgRemove] Done:', taskId, url);
      return url;
    }
    if (status && status.toLowerCase() === 'failed') {
      throw new Error('BgRemove failed: ' + JSON.stringify(data.data && data.data.error));
    }
    console.log('[BgRemove] Status:', status || 'unknown', '— waiting...');
  }
  throw new Error('BgRemove timeout: ' + taskId);
}

// Transparante PNG op egale BG_COLOR plakken via wsrv.nl, en als base64 teruggeven.
async function flattenToBase64(transparentUrl) {
  const wsrv = 'https://wsrv.nl/?url=' + encodeURIComponent(transparentUrl) +
    '&bg=' + BG_COLOR + '&output=jpg&q=90&w=2048';
  const r = await fetch(wsrv);
  if (!r.ok) throw new Error('wsrv flatten failed: ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.toString('base64');
}

async function addImagesToShopifyProduct(productId, images, token, storeDomain) {
  const t = token || SHOPIFY_TOKEN;
  const store = (storeDomain || SHOPIFY_STORE).replace(/^https?:\/\//, '').replace(/\/$/, '');
  for (let i = 0; i < images.length; i++) {
    try {
      const img = images[i].attachment
        ? { attachment: images[i].attachment, position: i + 1 }
        : { src: images[i].src, position: i + 1 };
      const r = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/images.json', {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: img })
      });
      if (!r.ok) {
        const errText = await r.text();
        console.error('[Shopify] Image upload error:', r.status, errText);
      } else {
        console.log('[Shopify] Image ' + (i + 1) + ' added!');
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

  const { adminUrl, shopifyToken: reqToken, shopifyStore: reqStore, storeId, faceImageUrl: reqFaceUrl } = req.body || {};
  let activeToken = reqToken || SHOPIFY_TOKEN;
  let activeStore = reqStore || SHOPIFY_STORE;
  let activeFaceUrl = FACE_IMAGE_URL;
  if (storeId === 'store2') {
    activeToken = process.env.SHOPIFY_TOKEN_2;
    activeStore = process.env.SHOPIFY_STORE_2 || 'gw5ubt-8p.myshopify.com';
    activeFaceUrl = process.env.FACE_IMAGE_URL_2 || FACE_IMAGE_URL;
  }
  if (reqFaceUrl) activeFaceUrl = reqFaceUrl;

  if (!adminUrl) return res.status(400).json({ error: 'Admin URL missing' });
  const match = adminUrl.match(/\/products\/(\d+)/);
  if (!match) return res.status(400).json({ error: 'No valid product ID in URL' });
  const productId = match[1];

  if (!PIAPI_KEY) return res.status(500).json({ error: 'PIAPI_KEY not configured' });
  if (!activeFaceUrl) return res.status(500).json({ error: 'Geen gezicht-URL voor deze winkel (FACE_IMAGE_URL / FACE_IMAGE_URL_2 of winkel-gezicht ontbreekt)' });

  console.log('[photo-generator] Product ID:', productId);
  console.log('[photo-generator] Gezicht in gebruik:', activeFaceUrl);

  try {
    const store = activeStore.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const shopifyR = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '.json', {
      headers: { 'X-Shopify-Access-Token': activeToken }
    });
    if (!shopifyR.ok) {
      const errText = await shopifyR.text();
      throw new Error('Shopify fetch failed: ' + shopifyR.status + ' ' + errText);
    }

    const shopifyData = await shopifyR.json();
    const product = shopifyData.product;
    const existingImageUrls = (product.images || []).map(function(img) { return img.src; });
    console.log('[photo-generator] Existing images:', existingImageUrls.length);

    if (existingImageUrls.length === 0) {
      return res.status(400).json({ error: 'No existing product images found' });
    }

    const tasks = [];
    for (const imgUrl of existingImageUrls) {
      try {
        const taskId = await submitFaceSwap(imgUrl, activeFaceUrl);
        tasks.push(taskId);
      } catch(e) {
        console.error('[photo-generator] Submit failed:', e.message);
      }
    }

    const results = await Promise.all(
      tasks.map(function(taskId) {
        return pollFaceSwap(taskId).catch(function(e) {
          console.error('[photo-generator] Poll failed for', taskId, ':', e.message);
          return null;
        });
      })
    );
    const swappedUrls = results.filter(Boolean);
    console.log('[photo-generator] Total swapped:', swappedUrls.length);

    // Achtergrond per foto vervangen door BG_COLOR (#e8e8e8): PIAPI haalt de achtergrond weg,
    // wsrv zet er een egale kleur achter. Parallel zodat het niet te lang duurt.
    const finalImages = await Promise.all(swappedUrls.map(async function(swappedUrl) {
      try {
        const bgTaskId = await submitBgRemove(swappedUrl);
        const transparentUrl = await pollBgRemove(bgTaskId);
        if (!transparentUrl) return { src: swappedUrl };
        const base64 = await flattenToBase64(transparentUrl);
        return { attachment: base64 };
      } catch (e) {
        console.error('[photo-generator] BG-stap mislukt, val terug op swap zonder kleur:', e.message);
        return { src: swappedUrl };
      }
    }));

    if (finalImages.length > 0) {
      await addImagesToShopifyProduct(productId, finalImages, activeToken, activeStore);
    }

    return res.status(200).json({
      success: true,
      via: 'piapi-faceswap',
      faceImageUrl: activeFaceUrl,
      bgColor: '#' + BG_COLOR,
      productId: productId,
      productTitle: product.title,
      originalImages: existingImageUrls.length,
      imagesSwapped: swappedUrls.length,
      imageUrls: swappedUrls
    });

  } catch(err) {
    console.error('[photo-generator] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
