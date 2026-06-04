// api/google-ads.js
// Haalt Google Ads cijfers op. Ververst zelf het token via de refresh_token.
//   /api/google-ads?days=30                 -> totalen + per campagne
//   /api/google-ads?level=product&days=30   -> per product (voor de Producten-tabel)

const API_VERSION = 'v23';

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Token verversen mislukt: ' + JSON.stringify(data));
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const customerId = req.query.customerId || process.env.GOOGLE_CUSTOMER_ID;
  const loginCustomerId = req.query.loginCustomerId || process.env.GOOGLE_LOGIN_CUSTOMER_ID;
  const days = req.query.days;
  const isProduct = req.query.level === 'product';
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN;

  const missing = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!process.env.GOOGLE_REFRESH_TOKEN) missing.push('GOOGLE_REFRESH_TOKEN');
  if (!developerToken) missing.push('GOOGLE_DEVELOPER_TOKEN');
  if (missing.length) return res.status(500).json({ error: 'Ontbrekende env vars in Vercel: ' + missing.join(', ') });
  if (!customerId) return res.status(400).json({ error: 'Geen customerId' });

  const cleanCustomerId = String(customerId).replace(/-/g, '');
  const cleanLoginId = loginCustomerId ? String(loginCustomerId).replace(/-/g, '') : null;

  const d = parseInt(days) || 7;
  const fmt = (date) => date.toISOString().slice(0, 10);
  const end = fmt(new Date());
  const start = fmt(new Date(Date.now() - (d - 1) * 86400000));

  let query;
  if (isProduct) {
    query = `
      SELECT segments.product_item_id, segments.product_title,
        metrics.cost_micros, metrics.clicks, metrics.impressions,
        metrics.conversions, metrics.conversions_value
      FROM shopping_performance_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
    `.trim();
  } else {
    query = `
      SELECT campaign.id, campaign.name, campaign.status,
        metrics.cost_micros, metrics.clicks, metrics.impressions,
        metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${start}' AND '${end}'
    `.trim();
  }

  try {
    const accessToken = await getAccessToken();
    const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cleanCustomerId}/googleAds:search`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json'
    };
    if (cleanLoginId) headers['login-customer-id'] = cleanLoginId;

    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query }) });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: 'Google Ads fout', status: r.status, detail: data });

    const rows = data.results || [];

    if (isProduct) {
      const map = {};
      rows.forEach((row) => {
        const seg = row.segments || {};
        const id = seg.productItemId || '_unknown';
        if (!map[id]) map[id] = { productItemId: id, productTitle: seg.productTitle || id, spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0 };
        const m = row.metrics || {};
        map[id].spend += Number(m.costMicros || 0) / 1000000;
        map[id].clicks += Number(m.clicks || 0);
        map[id].impressions += Number(m.impressions || 0);
        map[id].conversions += Number(m.conversions || 0);
        map[id].conversionValue += Number(m.conversionsValue || 0);
      });
      return res.status(200).json({ period: { start, end, days: d }, products: Object.values(map), rowCount: rows.length });
    }

    const campaigns = rows.map((row) => {
      const m = row.metrics || {};
      const spend = Number(m.costMicros || 0) / 1000000;
      const clicks = Number(m.clicks || 0);
      const impressions = Number(m.impressions || 0);
      return {
        id: row.campaign?.id, name: row.campaign?.name, status: row.campaign?.status,
        spend, clicks, impressions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        conversions: Number(m.conversions || 0), conversionValue: Number(m.conversionsValue || 0),
        roas: spend > 0 ? Number(m.conversionsValue || 0) / spend : 0
      };
    });
    const totals = campaigns.reduce((t, c) => ({
      spend: t.spend + c.spend, clicks: t.clicks + c.clicks,
      impressions: t.impressions + c.impressions, conversionValue: t.conversionValue + c.conversionValue
    }), { spend: 0, clicks: 0, impressions: 0, conversionValue: 0 });
    totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    totals.roas = totals.spend > 0 ? totals.conversionValue / totals.spend : 0;

    return res.status(200).json({ period: { start, end, days: d }, totals, campaigns, rowCount: rows.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
