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

app.post('/api/chat-stream', async (req, res) => {
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

    const requestBody = { ...body, stream: true, stream_options: { include_usage: true } };

    const fetchOptions = {
      method: 'POST',
      headers: normalizedHeaders,
      body: JSON.stringify(requestBody),
    };

    if (url.startsWith('https')) {
      fetchOptions.agent = httpsAgent;
    }

    console.log('[/api/chat-stream] Sending streaming request to:', url);
    console.log('[/api/chat-stream] Request body:', requestBody);

    const response = await fetch(url, fetchOptions);

    console.log('[/api/chat-stream] Response status:', response.status);
    console.log('[/api/chat-stream] Response headers:', {
      contentType: response.headers.get('content-type'),
      transferEncoding: response.headers.get('transfer-encoding'),
    });

    if (!response.ok) {
      res.status(response.status).json({ error: `Stream request failed with status ${response.status}` });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        console.log(`[/api/chat-stream] Chunk ${chunkCount}: ${chunk.length} bytes`);
        
        buffer += chunk;
        const lines = buffer.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
            } else {
              try {
                const parsed = JSON.parse(data);
                res.write(`data: ${JSON.stringify(parsed)}\n\n`);
              } catch (err) {
                res.write(`data: ${data}\n\n`);
              }
            }
          }
        }
        buffer = lines[lines.length - 1];
      }

      if (buffer.trim()) {
        const line = buffer.trim();
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
          } else {
            try {
              const parsed = JSON.parse(data);
              res.write(`data: ${JSON.stringify(parsed)}\n\n`);
            } catch (err) {
              res.write(`data: ${data}\n\n`);
            }
          }
        }
      }

      console.log(`[/api/chat-stream] Stream complete after ${chunkCount} chunks`);
      res.end();
    } catch (error) {
      console.error('[/api/chat-stream] Stream error:', error.message);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('[/api/chat-stream] Request failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

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
