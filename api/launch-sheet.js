// api/launch-sheet.js
// Leest de launch sheet (als gepubliceerde CSV) en geeft per Shopify product-ID de inkoopprijs in euro's.

const USD_TO_EUR = 0.92; // Pas aan naar de actuele dollarkoers indien gewenst.

function parseCsvLine(line) {
  var out = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; } }
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseNumber(s) {
  if (s === undefined || s === null) return 0;
  var t = String(s).replace(/[^0-9.,-]/g, '').trim();
  if (!t) return 0;
  if (t.indexOf(',') > -1 && t.indexOf('.') === -1) t = t.replace(',', '.');
  else t = t.replace(/,/g, '');
  var n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var url = process.env.LAUNCH_SHEET_CSV_URL;
  if (!url) return res.status(500).json({ error: 'LAUNCH_SHEET_CSV_URL env var ontbreekt in Vercel' });

  try {
    var r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: 'Kon sheet niet ophalen: ' + r.status });
    var text = await r.text();

    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    var rows = lines.map(parseCsvLine);

    var headerIdx = -1;
    for (var i = 0; i < Math.min(rows.length, 6); i++) {
      var joined = rows[i].join('|').toLowerCase();
      if (joined.indexOf('admin link') > -1 || joined.indexOf('product name') > -1) { headerIdx = i; break; }
    }
    if (headerIdx === -1) return res.status(500).json({ error: 'Kon de kolomkoppen niet vinden in de sheet' });

    var headers = rows[headerIdx].map(function (h) { return h.trim().toLowerCase(); });
    function colIndex(match) {
      for (var j = 0; j < headers.length; j++) { if (headers[j].indexOf(match) > -1) return j; }
      return -1;
    }
    var idxAdmin = colIndex('admin link');
    var idxCog = colIndex('cog uk');
    var idxName = colIndex('product name');

    var costs = {};
    var matched = 0, withCost = 0;
    for (var k = headerIdx + 1; k < rows.length; k++) {
      var row = rows[k];
      var adminLink = idxAdmin > -1 ? (row[idxAdmin] || '') : '';
      var m = adminLink.match(/products\/(\d+)/);
      if (!m) continue;
      var pid = m[1];
      var costUsd = idxCog > -1 ? parseNumber(row[idxCog]) : 0;
      costs[pid] = { costEur: costUsd * USD_TO_EUR, name: idxName > -1 ? (row[idxName] || '') : '' };
      matched++;
      if (costUsd > 0) withCost++;
    }

    return res.status(200).json({ rate: USD_TO_EUR, count: matched, withCost: withCost, costs: costs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
