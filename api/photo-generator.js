const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const PIAPI_KEY = process.env.PIAPI_KEY;
const FACE_IMAGE_URL = process.env.FACE_IMAGE_URL;

function resizeShopifyUrl(url) {
  if (!url.includes('cdn.shopify.com')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'width=2048&height=2048';
}

async function submitFaceSwap(targetImageUrl) {
  const resizedUrl = resizeShopifyUrl(targetImageUrl);
  const r = await fetch('https://api.piapi.ai/api/v1/task', {
    method: 'POST',
    headers: { 'x-api-key': PIAPI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'Qubico/image-toolkit',
      task_type: 'face-swap',
      input: { target_image: resizedUrl, swap_image: FACE_IMAGE_URL }
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

  const { adminUrl, shopifyToken: reqToken, shopifyStore: reqStore, storeId } = req.body || {};
  let activeToken = reqToken || SHOPIFY_TOKEN;
  let activeStore = reqStore || SHOPIFY_STORE;
  if (storeId === 'store2') {
    activeToken = process.env.SHOPIFY_TOKEN_2;
    activeStore = process.env.SHOPIFY_STORE_2 || 'gw5ubt-8p.myshopify.com';
  }

  if (!adminUrl) return res.status(400).json({ error: 'Admin URL missing' });
  const match = adminUrl.match(/\/products\/(\d+)/);
  if (!match) return res.status(400).json({ error: 'No valid product ID in URL' });
  const productId = match[1];

  if (!PIAPI_KEY) return res.status(500).json({ error: 'PIAPI_KEY not configured' });
  if (!FACE_IMAGE_URL) return res.status(500).json({ error: 'FACE_IMAGE_URL not configured' });

  console.log('[photo-generator] Product ID:', productId);

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
        const taskId = await submitFaceSwap(imgUrl);
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

    if (swappedUrls.length > 0) {
      await addImagesToShopifyProduct(productId, swappedUrls, activeToken, activeStore);
    }

    return res.status(200).json({
      success: true,
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
