// photo-ops.js — 3 endpoints in 1 function (Vercel Hobby: max 12 functions).
// mode: 'list'  -> alle producten van de winkel teruggeven
// mode: 'bg'    -> achtergrond -> #e8e8e8 (background-remove via PIAPI + wsrv flatten)
// mode: 'model' -> model vervangen (Lorenzari-stijl) via kie.ai Nano Banana edit

const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const PIAPI_KEY = process.env.PIAPI_KEY;
const KIE_API_KEY = process.env.KIE_API_KEY;
const FACE_IMAGE_URL = process.env.FACE_IMAGE_URL;
const BG_COLOR = (process.env.BG_COLOR || 'e8e8e8').replace('#', '');

// ---------- gedeeld ----------
function resolveStore(body) {
  let token = body.shopifyToken || SHOPIFY_TOKEN;
  let storeDomain = body.shopifyStore || SHOPIFY_STORE;
  let faceUrl = FACE_IMAGE_URL;
  if (body.storeId === 'store2') {
    token = process.env.SHOPIFY_TOKEN_2;
    storeDomain = process.env.SHOPIFY_STORE_2 || 'gw5ubt-8p.myshopify.com';
    faceUrl = process.env.FACE_IMAGE_URL_2 || FACE_IMAGE_URL;
  }
  if (body.faceImageUrl) faceUrl = body.faceImageUrl;
  const store = (storeDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return { token: token, store: store, faceUrl: faceUrl };
}

function resizeShopifyUrl(url) {
  if (!url.includes('cdn.shopify.com')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'width=2048&height=2048';
}

async function addImage(store, token, productId, base64, position) {
  const r = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/images.json', {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: { attachment: base64, position: position } })
  });
  if (!r.ok) { const e = await r.text(); console.error('[photo-ops] add image error:', r.status, e); return null; }
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

// ---------- BG (PIAPI background-remove + wsrv flatten) ----------
async function submitBgRemove(imageUrl) {
  const r = await fetch('https://api.piapi.ai/api/v1/task', {
    method: 'POST',
    headers: { 'x-api-key': PIAPI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'Qubico/image-toolkit', task_type: 'background-remove', input: { rmbg_model: 'RMBG-2.0', image: imageUrl } })
  });
  const data = await r.json();
  if (!r.ok || !data.data || !data.data.task_id) throw new Error('BgRemove submit failed: ' + JSON.stringify(data));
  return data.data.task_id;
}

async function pollBgRemove(taskId) {
  for (let i = 0; i < 30; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); });
    const r = await fetch('https://api.piapi.ai/api/v1/task/' + taskId, { headers: { 'x-api-key': PIAPI_KEY } });
    const data = await r.json();
    const status = data.data && data.data.status;
    if (status && status.toLowerCase() === 'completed') {
      const out = (data.data && data.data.output) || {};
      return out.image_url || out.image || (out.images && out.images[0]) || null;
    }
    if (status && status.toLowerCase() === 'failed') throw new Error('BgRemove failed: ' + JSON.stringify(data.data && data.data.error));
  }
  throw new Error('BgRemove timeout: ' + taskId);
}

async function flattenToBase64(transparentUrl) {
  const wsrv = 'https://wsrv.nl/?url=' + encodeURIComponent(transparentUrl) + '&bg=' + BG_COLOR + '&output=jpg&q=90&w=2048';
  const r = await fetch(wsrv);
  if (!r.ok) throw new Error('wsrv flatten failed: ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.toString('base64');
}

// ---------- MODEL (kie.ai Nano Banana edit) ----------
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

// ---------- handler ----------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.body || {};
  const mode = body.mode || 'model';
  const { token, store, faceUrl } = resolveStore(body);
  if (!token || !store) return res.status(400).json({ error: 'Geen winkel/token' });

  // ----- LIST -----
  if (mode === 'list') {
    try {
      let url = 'https://' + store + '/admin/api/2024-01/products.json?fields=id,title,images&limit=250';
      const out = [];
      for (let page = 0; page < 20 && url; page++) {
        const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
        if (!r.ok) { const e = await r.text(); return res.status(500).json({ error: 'Shopify list failed: ' + r.status + ' ' + e }); }
        const data = await r.json();
        (data.products || []).forEach(function(p) { out.push({ id: p.id, title: p.title, imageCount: (p.images || []).length }); });
        const link = r.headers.get('link') || r.headers.get('Link') || '';
        const next = link.match(/<([^>]+)>;\s*rel="next"/);
        url = next ? next[1] : null;
      }
      return res.status(200).json({ success: true, count: out.length, products: out });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ----- BG of MODEL: product ophalen -----
  let productId = body.productId;
  if (!productId && body.adminUrl) {
    const m = body.adminUrl.match(/\/products\/(\d+)/);
    if (m) productId = m[1];
  }
  if (!productId) return res.status(400).json({ error: 'Geen product ID' });

  if (mode === 'bg' && !PIAPI_KEY) return res.status(500).json({ error: 'PIAPI_KEY not configured' });
  if (mode === 'model') {
    if (!KIE_API_KEY) return res.status(500).json({ error: 'KIE_API_KEY not configured' });
    if (!faceUrl) return res.status(500).json({ error: 'Geen referentie-gezicht voor deze winkel' });
  }

  try {
    const pr = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '.json', {
      headers: { 'X-Shopify-Access-Token': token }
    });
    if (!pr.ok) { const e = await pr.text(); throw new Error('Shopify fetch failed: ' + pr.status + ' ' + e); }
    const product = (await pr.json()).product;
    const images = (product.images || []).map(function(img) { return { id: img.id, src: img.src, position: img.position }; });
    const via = mode === 'bg' ? 'bg-replace' : 'model-swap';

    if (images.length === 0) {
      return res.status(200).json({ success: true, via: via, productId: productId, productTitle: product.title, total: 0, recolored: 0, replaced: 0, note: 'geen foto\'s' });
    }

    // Per foto bewerken (parallel).
    const processed = await Promise.all(images.map(async function(img) {
      try {
        if (mode === 'bg') {
          const tid = await submitBgRemove(resizeShopifyUrl(img.src));
          const turl = await pollBgRemove(tid);
          if (!turl) return null;
          const b64 = await flattenToBase64(turl);
          return { base64: b64, position: img.position };
        } else {
          const taskId = await submitKieEdit([img.src, faceUrl]);
          const outUrl = await pollKieTask(taskId);
          if (!outUrl) return null;
          const b64 = await fetchToBase64(outUrl);
          return { base64: b64, position: img.position };
        }
      } catch (e) {
        console.error('[photo-ops/' + mode + '] foto mislukt:', e.message);
        return null;
      }
    }));
    const ok = processed.filter(Boolean);

    // Nieuwe foto's toevoegen.
    const newIds = [];
    for (const g of ok) {
      const id = await addImage(store, token, productId, g.base64, g.position);
      if (id) newIds.push(id);
    }

    const allOk = newIds.length === images.length;
    if (allOk) {
      let deleted = 0;
      for (const img of images) { const done = await deleteImage(store, token, productId, img.id); if (done) deleted++; }
      const resp = { success: true, via: via, productId: productId, productTitle: product.title, total: images.length, recolored: newIds.length, replaced: deleted };
      if (mode === 'bg') resp.bgColor = '#' + BG_COLOR;
      if (mode === 'model') resp.faceImageUrl = faceUrl;
      return res.status(200).json(resp);
    } else {
      for (const id of newIds) { await deleteImage(store, token, productId, id); }
      return res.status(200).json({ success: false, via: via, productId: productId, productTitle: product.title, total: images.length, recolored: 0, replaced: 0, error: 'Niet alle foto\'s gelukt (' + ok.length + '/' + images.length + ') — product onveranderd gelaten' });
    }
  } catch (err) {
    console.error('[photo-ops/' + mode + '] Fatal:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
