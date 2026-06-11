// Wisselt een OAuth 'code' om voor een Shopify Admin access token,
// met de Klant-ID (client_id) en het Geheim (client_secret / shpss_) van
// de app van de winkel. Hiermee kun je een winkel koppelen zonder zelf
// een shpat_-token te hoeven plakken.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });

  const { shop, code, clientId, clientSecret } = req.body || {};
  if (!shop || !code || !clientId || !clientSecret) {
    return res.status(400).json({ error: 'shop, code, clientId en clientSecret zijn verplicht' });
  }

  const cleanShop = String(shop).replace(/^https?:\/\//, '').replace(/\/$/, '');

  try {
    const r = await fetch('https://' + cleanShop + '/admin/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: code })
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) {
      return res.status(400).json({ error: 'Token ophalen mislukt', detail: data });
    }
    return res.status(200).json({ access_token: data.access_token, scope: data.scope });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
