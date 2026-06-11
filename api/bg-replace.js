const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const PIAPI_KEY = process.env.PIAPI_KEY;
const BG_COLOR = (process.env.BG_COLOR || 'e8e8e8').replace('#', '');

function resizeShopifyUrl(url) {
  if (!url.includes('cdn.shopify.com')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'width=2048&height=2048';
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
      return out.image_url || out.image || (out.images && out.images[0]) || null;
    }
    if (status && status.toLowerCase() === 'failed') {
      throw new Error('BgRemove failed: ' + JSON.stringify(data.data && data.data.error));
    }
  }
  throw new Error('BgRemove timeout: ' + taskId);
}

// Transparante PNG op egale BG_COLOR plakken via wsrv.nl, terug als base64.
async function flattenToBase64(transparentUrl) {
  const wsrv = 'https://wsrv.nl/?url=' + encodeURIComponent(transparentUrl) +
    '&bg=' + BG_COLOR + '&output=jpg&q=90&w=2048';
  const r = await fetch(wsrv);
  if (!r.ok) throw new Error('wsrv flatten failed: ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.toString('base64');
}

async function addImage(store, token, productId, base64, position) {
  const r = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '/images.json', {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: { attachment: base64, position: position } })
  });
  if (!r.ok) {
    const e = await r.text();
    console.error('[bg-replace] add image error:', r.status, e);
    return null;
  }
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

  const { adminUrl, productId: bodyPid, shopifyToken: reqToken, shopifyStore: reqStore, storeId } = req.body || {};
  let token = reqToken || SHOPIFY_TOKEN;
  let storeDomain = reqStore || SHOPIFY_STORE;
  if (storeId === 'store2') {
    token = process.env.SHOPIFY_TOKEN_2;
    storeDomain = process.env.SHOPIFY_STORE_2 || 'gw5ubt-8p.myshopify.com';
  }
  const store = (storeDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  let productId = bodyPid;
  if (!productId && adminUrl) {
    const m = adminUrl.match(/\/products\/(\d+)/);
    if (m) productId = m[1];
  }
  if (!productId) return res.status(400).json({ error: 'Geen product ID' });
  if (!PIAPI_KEY) return res.status(500).json({ error: 'PIAPI_KEY not configured' });

  try {
    const pr = await fetch('https://' + store + '/admin/api/2024-01/products/' + productId + '.json', {
      headers: { 'X-Shopify-Access-Token': token }
    });
    if (!pr.ok) {
      const e = await pr.text();
      throw new Error('Shopify fetch failed: ' + pr.status + ' ' + e);
    }
    const product = (await pr.json()).product;
    const images = (product.images || []).map(function(img) { return { id: img.id, src: img.src, position: img.position }; });

    if (images.length === 0) {
      return res.status(200).json({ success: true, via: 'bg-replace', productId: productId, productTitle: product.title, total: 0, recolored: 0, replaced: 0, note: 'geen foto\'s' });
    }

    // Stap 1: per foto achtergrond weg + #BG_COLOR erachter (parallel).
    const greys = await Promise.all(images.map(async function(img) {
      try {
        const tid = await submitBgRemove(resizeShopifyUrl(img.src));
        const turl = await pollBgRemove(tid);
        if (!turl) return null;
        const b64 = await flattenToBase64(turl);
        return { base64: b64, position: img.position };
      } catch (e) {
        console.error('[bg-replace] foto mislukt:', e.message);
        return null;
      }
    }));
    const ok = greys.filter(Boolean);

    // Stap 2: nieuwe (ingekleurde) foto's toevoegen, nieuwe IDs onthouden.
    const newIds = [];
    for (const g of ok) {
      const id = await addImage(store, token, productId, g.base64, g.position);
      if (id) newIds.push(id);
    }

    const allOk = newIds.length === images.length;

    if (allOk) {
      // Alles gelukt -> originelen verwijderen (vervangen).
      let deleted = 0;
      for (const img of images) {
        const done = await deleteImage(store, token, productId, img.id);
        if (done) deleted++;
      }
      return res.status(200).json({ success: true, via: 'bg-replace', bgColor: '#' + BG_COLOR, productId: productId, productTitle: product.title, total: images.length, recolored: newIds.length, replaced: deleted });
    } else {
      // Niet alles gelukt -> nieuwe foto's terugdraaien zodat het product onveranderd blijft.
      for (const id of newIds) { await deleteImage(store, token, productId, id); }
      return res.status(200).json({ success: false, via: 'bg-replace', productId: productId, productTitle: product.title, total: images.length, recolored: 0, replaced: 0, error: 'Niet alle foto\'s gelukt (' + ok.length + '/' + images.length + ') — product onveranderd gelaten' });
    }
  } catch (err) {
    console.error('[bg-replace] Fatal:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
