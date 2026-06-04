// api/google-ads.js
// Haalt Google Ads cijfers op (spend, kliks, impressies, CTR, ROAS) per campagne.
// Werkt hetzelfde als shopify.js, maar dan voor Google Ads.
//
// Aanroepen (test): /api/google-ads?token=GOOGLE_ACCESS_TOKEN&customerId=435-946-8143&loginCustomerId=403-323-0776&days=30

const API_VERSION = 'v23'; // Check actuele versie: https://developers.google.com/google-ads/api/docs/release-notes

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token, customerId, loginCustomerId, days } = req.query;
  if (!token) return res.status(400).json({ error: 'Missing token (Google OAuth access token)' });
  if (!customerId) return res.status(400).json({ error: 'Missing customerId' });

  // Developer token uit Vercel env var (veiliger dan in de URL).
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN;
  if (!developerToken) {
    return res.status(500).json({ error: 'GOOGLE_DEVELOPER_TOKEN env var ontbreekt in Vercel' });
  }

  // Streepjes weghalen uit de account-ID's (435-946-8143 -> 4359468143).
  const cleanCustomerId = String(customerId).replace(/-/g, '');
  const cleanLoginId = loginCustomerId ? String(loginCustomerId).replace(/-/g, '') : null;

  // Periode bepalen (7 / 30 / 90 dagen). GAQL wil echte datums, geen los getal.
  const d = parseInt(days) || 7;
  const fmt = (date) => date.toISOString().slice(0, 10); // YYYY-MM-DD
  const end = fmt(new Date());
  const start = fmt(new Date(Date.now() - (d - 1) * 86400000));

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `.trim();

  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cleanCustomerId}/googleAds:search`;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json'
  };
  // Belangrijk bij toegang via een manager-account: de manager als login-customer-id meesturen.
  if (cleanLoginId) headers['login-customer-id'] = cleanLoginId;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query })
    });

    const data = await r.json();

    // Bij een fout: geef de VOLLEDIGE melding van Google terug, zodat we precies zien wat er mis is.
    if (!r.ok) {
      return res.status(r.status).json({
        error: 'Google Ads fout',
        status: r.status,
        detail: data
      });
    }

    const rows = data.results || [];

    const campaigns = rows.map((row) => {
      const m = row.metrics || {};
      const spend = Number(m.costMicros || 0) / 1000000;     // micros -> euro's
      const clicks = Number(m.clicks || 0);
      const impressions = Number(m.impressions || 0);
      const conversions = Number(m.conversions || 0);
      const conversionValue = Number(m.conversionsValue || 0);
      return {
        id: row.campaign?.id,
        name: row.campaign?.name,
        status: row.campaign?.status,
        spend,
        clicks,
        impressions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        conversions,
        conversionValue,
        roas: spend > 0 ? conversionValue / spend : 0
      };
    });

    const totals = campaigns.reduce((t, c) => ({
      spend: t.spend + c.spend,
      clicks: t.clicks + c.clicks,
      impressions: t.impressions + c.impressions,
      conversionValue: t.conversionValue + c.conversionValue
    }), { spend: 0, clicks: 0, impressions: 0, conversionValue: 0 });
    totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    totals.roas = totals.spend > 0 ? totals.conversionValue / totals.spend : 0;

    return res.status(200).json({
      period: { start, end, days: d },
      totals,
      campaigns,
      rowCount: rows.length
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
