const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Proxy all /api/* requests to EasyBroker
app.use('/api', (req, res) => {
  const ebPath = req.url;
  const apiKey = req.headers['x-authorization'] || '';
  const ebHost = 'api.easybroker.com';

  const options = {
    hostname: ebHost,
    path: '/v1' + ebPath,
    method: req.method,
    headers: {
      'X-Authorization': apiKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    res.set('Content-Type', 'application/json');
    res.set('Access-Control-Allow-Origin', '*');
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  if (req.body) proxyReq.write(JSON.stringify(req.body));
  proxyReq.end();
});

app.get('/', (req, res) => res.json({ status: 'EasyBroker Proxy OK' }));

app.listen(PORT, () => console.log(`Proxy corriendo en puerto ${PORT}`));
