const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));

app.post('/api/chat', async (req, res) => {
  const { url, headers, body } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' });
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid body in request body' });
  }

  try {
    const requestHeaders = new fetch.Headers();
    const headerList = Array.isArray(headers) ? headers : [];

    headerList.forEach(({ key, value }) => {
      if (key && value) {
        requestHeaders.set(key, value);
      }
    });

    if (!requestHeaders.has('content-type')) {
      requestHeaders.set('content-type', 'application/json');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let responseBody;

    try {
      responseBody = JSON.parse(responseText);
    } catch (err) {
      responseBody = responseText;
    }

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    res.status(response.status).json({
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
      rawRequest: { url, headers: headerList, body },
      rawResponse: { status: response.status, headers: responseHeaders, body: responseBody },
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      rawRequest: { url, headers, body },
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
