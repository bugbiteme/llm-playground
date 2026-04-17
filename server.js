const express = require('express');
const path = require('path');
const https = require('https');

const app = express();
const port = process.env.PORT || 8080;

// Create HTTPS agent that can be configured via env vars
const rejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0';
const httpsAgent = new https.Agent({
  rejectUnauthorized,
});

console.log(`[SERVER] NODE_TLS_REJECT_UNAUTHORIZED=${process.env.NODE_TLS_REJECT_UNAUTHORIZED}`);
console.log(`[SERVER] TLS certificate validation: ${rejectUnauthorized ? 'ENABLED (strict)' : 'DISABLED (accept self-signed certs)'}`);

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
    const headerList = Array.isArray(headers) ? headers : [];
    const requestHeaders = {};

    headerList.forEach(({ key, value }) => {
      if (key && value) {
        requestHeaders[key] = value;
      }
    });

    const normalizedHeaders = Object.keys(requestHeaders).reduce((acc, name) => {
      acc[name.toLowerCase()] = requestHeaders[name];
      return acc;
    }, {});

    if (!normalizedHeaders['content-type']) {
      normalizedHeaders['content-type'] = 'application/json';
    }

    const fetchOptions = {
      method: 'POST',
      headers: normalizedHeaders,
      body: JSON.stringify(body),
    };

    if (url.startsWith('https')) {
      fetchOptions.agent = httpsAgent;
    }

    console.log('[/api/chat] Sending request to:', url);
    console.log('[/api/chat] Headers:', normalizedHeaders);

    const response = await fetch(url, fetchOptions);

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
    const cause = error.cause || {};
    console.error('[/api/chat] Request failed:', {
      url,
      errorMessage: error.message,
      errorCode: error.code,
      causeMessage: cause.message,
      causeCode: cause.code,
      errorStack: error.stack,
    });

    res.status(500).json({
      error: `Request failed: ${error.message}`,
      cause: cause.message || error.message,
      errorCode: error.code || cause.code,
      details: `${error.message} (${cause.code || 'unknown'})`,
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
