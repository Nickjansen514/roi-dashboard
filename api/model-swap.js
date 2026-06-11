const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const KIE_API_KEY = process.env.KIE_API_KEY;
const FACE_IMAGE_URL = process.env.FACE_IMAGE_URL;
const BG_COLOR = (process.env.BG_COLOR || 'e8e8e8').replace('#', '');

function buildSwapPrompt() {
  return 'You are given two images. IMAGE 1 is a fashion e-commerce photo of a woman modelling a garment. ' +
    'IMAGE 2 is a reference portrait of a different woman. Re-render IMAGE 1 so the model becomes the woman from IMAGE 2: ' +
    'copy her exact face, her hair colour and her hairstyle. Keep the garment from IMAGE 1 completely unchanged — same design, ' +
    'colour, fabric, fit, length, neckline and every detail. Keep the same body pose, proportions and framing. ' +
    'Replace the background with a clean, even, solid light gray (#' + BG_COLOR + ') studio backdrop. ' +
    'Photorealistic high-end fashion e-commerce photography, soft even studio lighting. No text, no watermark, no extra people.';
}

async function submitKieEdit(imageUrls) {
  const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KIE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'google/nano-banana', input: { prompt: buildSwapPrompt(), image_urls: imageUrls } })
  });
  const txt = await r.text();
  if (!r.ok) throw new Error('Kie edit submit fout: ' + r.status + ' ' + txt);
  let data;
  try { data = JSON.parse(txt); } catch (e) { throw new Error('Kie edit invalid JSON'); }
  const taskId = (data && data.data && (data.data.taskId || data.data.task_id)) || (data && data.taskId);
  if (!taskId) throw new Error('Geen taskId: ' + JSON.stringify(data));
  return taskId;
}

async function pollKieTask(taskId) {
  for (let i = 0; i < 40; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); });
    const poll = await fetch('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + taskId, { headers: { 'Authorization': 'Bearer ' + KIE_API_KEY } });
    const pollText = await poll.text();
    let result;
    try { result = JSON.parse(pollText); } catch (e) { continue; }
    const state = result && result.data && result.data.state;
    if (state === 'success') {
      let imgUrl = null;
      try { const rj = JSON.parse(result.data.resultJson); imgUrl = rj.resultUrls && rj.resultUrls[0]; } catch (e) {}
      return imgUrl || null;
    }
    if (state === 'fail') throw new Error('Kie task mislukt: ' + taskId);
  }
  throw new Error('Kie timeout: ' + taskId);
}

async function fetchToBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('download mislukt: ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.toString('base64');
}

async function addImage(store, token, productId, base64, position) {
  const r = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/images.json', {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: { attachment: base64, position: position } })
  });
  if (!r.ok) { const e = await r.text(); console.error('[model-swap] add image error:', r.status, e); return null; }
  const data = await r.json();
  return data.image && data.image.id;
}

async function deleteImage(store, token, productId, imageId) {
  const r = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/images/' + imageId + '.json', {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': token }
  });
  return r.ok;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { adminUrl, productId: bodyPid, shopifyToken: reqToken, shopifyStore: reqStore, storeId, faceImageUrl: reqFaceUrl } = req.body || {};
  let token = reqToken || SHOPIFY_TOKEN;
  let storeDomain = reqStore || SHOPIFY_STORE;
  let faceUrl = FACE_IMAGE_URL;
  if (storeId === 'store2') {
    token = process.env.SHOPIFY_TOKEN_2;
    storeDomain = process.env.SHOPIFY_STORE_2 || 'gw5ubt-8p.myshopify.com';
    faceUrl = process.env.FACE_IMAGE_URL_2 || FACE_IMAGE_URL;
  }
  if (reqFaceUrl) faceUrl = reqFaceUrl;
  const store = (storeDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  let productId = bodyPid;
  if (!productId && adminUrl) {
    const m = adminUrl.match(/\/products\/(\d+)/);
    if (m) productId = m[1];
  }
  if (!productId) return res.status(400).json({ error: 'Geen product ID' });
  if (!KIE_API_KEY) return res.status(500).json({ error: 'KIE_API_KEY not configured' });
  if (!faceUrl) return res.status(500).json({ error: 'Geen referentie-gezicht voor deze winkel' });

  try {
    const pr = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '.json', {
      headers: { 'X-Shopify-Access-Token': token }
    });
    if (!pr.ok) { const e = await pr.text(); throw new Error('Shopify fetch failed: ' + pr.status + ' ' + e); }
    const product = (await pr.json()).product;
    const images = (product.images || []).map(function(img) { return { id: img.id, src: img.src, position: img.position }; });
    if (images.length === 0) {
      return res.status(200).json({ success: true, via: 'model-swap', productId: productId, productTitle: product.title, total: 0, recolored: 0, replaced: 0, note: 'geen foto\'s' });
    }

    // Per foto: Nano Banana edit (productfoto + referentiegezicht) -> nieuw model, jurk behouden.
    const edited = await Promise.all(images.map(async function(img) {
      try {
        const taskId = await submitKieEdit([img.src, faceUrl]);
        const outUrl = await pollKieTask(taskId);
        if (!outUrl) return null;
        const b64 = await fetchToBase64(outUrl);
        return { base64: b64, position: img.position };
      } catch (e) {
        console.error('[model-swap] foto mislukt:', e.message);
        return null;
      }
    }));
    const ok = edited.filter(Boolean);

    const newIds = [];
    for (const g of ok) {
      const id = await addImage(store, token, productId, g.base64, g.position);
      if (id) newIds.push(id);
    }

    const allOk = newIds.length === images.length;
    if (allOk) {
      let deleted = 0;
      for (const img of images) { const done = await deleteImage(store, token, productId, img.id); if (done) deleted++; }
      return res.status(200).json({ success: true, via: 'model-swap', faceImageUrl: faceUrl, productId: productId, productTitle: product.title, total: images.length, recolored: newIds.length, replaced: deleted });
    } else {
      for (const id of newIds) { await deleteImage(store, token, productId, id); }
      return res.status(200).json({ success: false, via: 'model-swap', productId: productId, productTitle: product.title, total: images.length, error: 'Niet alle foto\'s gelukt (' + ok.length + '/' + images.length + ') — product onveranderd gelaten' });
    }
  } catch (err) {
    console.error('[model-swap] Fatal:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
