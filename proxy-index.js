const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Proxy: scrape Inmuebles24 search results
app.get('/buscar', (req, res) => {
  const zona = req.query.zona || 'tijuana';
  const m2min = req.query.m2min || '';
  const m2max = req.query.m2max || '';
  const pmin = req.query.pmin || '';
  const pmax = req.query.pmax || '';

  // Build Inmuebles24 URL
  const zonaSlug = zona.toLowerCase()
    .replace(/\s+/g, '-')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let path = `/bodegas-en-renta-en-${zonaSlug}-tijuana.html?`;
  const params = [];
  if (pmin) params.push(`precio_desde=${pmin}`);
  if (pmax) params.push(`precio_hasta=${pmax}`);
  if (m2min) params.push(`superficie_desde=${m2min}`);
  if (m2max) params.push(`superficie_hasta=${m2max}`);
  if (params.length) path += params.join('&');

  const options = {
    hostname: 'www.inmuebles24.com',
    path: path,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-MX,es;q=0.9',
    }
  };

  let html = '';
  const proxyReq = https.request(options, (proxyRes) => {
    proxyRes.on('data', chunk => html += chunk);
    proxyRes.on('end', () => {
      // Extract property listings from HTML
      const listings = parseInmuebles24(html);
      res.set('Access-Control-Allow-Origin', '*');
      res.json({ listings, total: listings.length, url: `https://www.inmuebles24.com${path}` });
    });
  });

  proxyReq.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
  proxyReq.end();
});

function parseInmuebles24(html) {
  const listings = [];

  // Extract JSON-LD structured data (most reliable)
  const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const block of jsonLdMatches) {
    try {
      const json = JSON.parse(block.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, ''));
      if (json['@type'] === 'ItemList' && json.itemListElement) {
        for (const item of json.itemListElement) {
          if (item.item) listings.push(formatListing(item.item));
        }
      }
    } catch(e) {}
  }

  // Fallback: extract from postingData
  if (!listings.length) {
    const postingMatches = html.match(/"posting":\s*\{[^}]+\}/g) || [];
    for (const m of postingMatches.slice(0, 20)) {
      try {
        const obj = JSON.parse('{' + m.split('{')[1]);
        listings.push(formatListing(obj));
      } catch(e) {}
    }
  }

  // Fallback: regex extraction
  if (!listings.length) {
    const titleMatches = html.match(/data-qa="posting-title"[^>]*>([^<]+)</g) || [];
    const priceMatches = html.match(/data-qa="price"[^>]*>([^<]+)</g) || [];
    const locationMatches = html.match(/data-qa="posting-location"[^>]*>([^<]+)</g) || [];
    
    for (let i = 0; i < Math.min(titleMatches.length, 15); i++) {
      listings.push({
        id: 'i24-' + i,
        titulo: (titleMatches[i] || '').replace(/data-qa="posting-title"[^>]*>/, '').trim(),
        precio_display: (priceMatches[i] || '').replace(/data-qa="price"[^>]*>/, '').trim(),
        zona: (locationMatches[i] || '').replace(/data-qa="posting-location"[^>]*>/, '').trim(),
        fuente: 'Inmuebles24',
      });
    }
  }

  return listings.slice(0, 20);
}

function formatListing(item) {
  return {
    id: 'i24-' + (item.identifier || item.id || Math.random().toString(36).substr(2,8)),
    titulo: item.name || item.title || 'Bodega en renta',
    precio_display: item.offers?.price ? `$${Number(item.offers.price).toLocaleString()} ${item.offers.priceCurrency || 'USD'}` : 'Consultar',
    precio_num: item.offers?.price || 0,
    moneda: item.offers?.priceCurrency || 'USD',
    zona: item.address?.addressLocality || item.location || 'Tijuana',
    direccion: item.address?.streetAddress || '',
    m2: item.floorSize?.value || item.size || null,
    descripcion: (item.description || '').substring(0, 200),
    url: item.url || item['@id'] || '#',
    imagen: item.image?.[0] || item.image || null,
    fuente: 'Inmuebles24',
  };
}

app.get('/', (req, res) => res.json({ status: 'Bodega Proxy OK — Inmuebles24 scraper activo' }));

app.listen(PORT, () => console.log(`Proxy corriendo en puerto ${PORT}`));
