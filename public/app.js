const endpointEl = document.getElementById('endpoint');
const headersEl = document.getElementById('headers');
const modelEl = document.getElementById('model');
const maxTokensEl = document.getElementById('max_tokens');
const temperatureEl = document.getElementById('temperature');
const topPEl = document.getElementById('top_p');
const nEl = document.getElementById('n');
const stopEl = document.getElementById('stop');
const extraOptionsEl = document.getElementById('extra-options');
const sendBtn = document.getElementById('send-btn');
const clearChatBtn = document.getElementById('clear-chat');
const chatInputEl = document.getElementById('chat-input');
const chatWindow = document.getElementById('chat-window');
const rawRequestEl = document.getElementById('raw-request');
const rawResponseEl = document.getElementById('raw-response');

let messages = [];

function createHeaderRow(key = 'Content-Type', value = 'application/json') {
  const row = document.createElement('div');
  row.className = 'header-row';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.placeholder = 'Header name';
  keyInput.value = key;

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.placeholder = 'Header value';
  valueInput.value = value;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'icon-button';
  removeButton.textContent = '✕';
  removeButton.title = 'Remove header';
  removeButton.addEventListener('click', () => row.remove());

  row.append(keyInput, valueInput, removeButton);
  headersEl.appendChild(row);
}

function getHeaders() {
  const rows = Array.from(headersEl.children);
  return rows
    .map((row) => {
      const [keyInput, valueInput] = row.querySelectorAll('input');
      return { key: keyInput.value.trim(), value: valueInput.value.trim() };
    })
    .filter(({ key, value }) => key && value);
}

function setRawContent(element, data) {
  element.textContent = JSON.stringify(data, null, 2);
}

function appendChatMessage(role, content) {
  const message = document.createElement('div');
  message.className = `chat-message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = content;

  const label = document.createElement('div');
  label.className = 'chat-role';
  label.textContent = role === 'user' ? 'You' : 'Assistant';

  message.append(label, bubble);
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function getAssistantText(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;

  if (Array.isArray(body?.choices) && body.choices[0]) {
    const message = body.choices[0].message;
    if (message?.content) return message.content;
    if (body.choices[0].text) return body.choices[0].text;
  }

  if (Array.isArray(body?.output) && body.output[0]) {
    const output = body.output[0];
    if (typeof output.content === 'string') return output.content;
    if (Array.isArray(output.content)) {
      return output.content.map((item) => item.text || '').join('');
    }
  }

  return JSON.stringify(body, null, 2);
}

function buildPayload(userText) {
  const body = {
    model: modelEl.value.trim() || undefined,
    messages: [...messages, { role: 'user', content: userText }],
    max_tokens: Number(maxTokensEl.value) || undefined,
    temperature: Number(temperatureEl.value) || undefined,
  };

  if (topPEl.value.trim()) {
    body.top_p = Number(topPEl.value);
  }

  if (nEl.value.trim()) {
    body.n = Number(nEl.value);
  }

  if (stopEl.value.trim()) {
    try {
      body.stop = JSON.parse(stopEl.value);
    } catch {
      body.stop = stopEl.value;
    }
  }

  const extraValue = extraOptionsEl.value.trim();
  if (extraValue) {
    try {
      const extra = JSON.parse(extraValue);
      Object.assign(body, extra);
    } catch (err) {
      throw new Error('Extra JSON options must be valid JSON.');
    }
  }

  return body;
}

async function sendMessage() {
  const userText = chatInputEl.value.trim();
  if (!userText) return;

  const endpoint = endpointEl.value.trim();
  if (!endpoint) {
    alert('Please enter a valid LLM endpoint URL.');
    return;
  }

  const useStreaming = document.getElementById('stream-mode').checked;
  const headers = getHeaders();
  const requestData = {
    url: endpoint,
    headers,
    body: buildPayload(userText),
  };

  messages.push({ role: 'user', content: userText });
  appendChatMessage('user', userText);
  chatInputEl.value = '';

  setRawContent(rawRequestEl, requestData);
  rawResponseEl.textContent = 'Waiting for model response...';

  try {
    if (useStreaming) {
      await sendStreamingMessage(requestData);
    } else {
      await sendNonStreamingMessage(requestData);
    }
  } catch (err) {
    setRawContent(rawResponseEl, { error: err.message });
    appendChatMessage('assistant', `Network error: ${err.message}`);
  }
}

async function sendNonStreamingMessage(requestData) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestData),
  });

  const responseData = await response.json();
  setRawContent(rawResponseEl, responseData);

  if (!response.ok) {
    appendChatMessage('assistant', `Request failed: ${responseData.error || response.statusText}`);
    return;
  }

  const assistantText = getAssistantText(responseData.body);
  messages.push({ role: 'assistant', content: assistantText });
  appendChatMessage('assistant', assistantText);
}

async function sendStreamingMessage(requestData) {
  const response = await fetch('/api/chat-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestData),
  });

  if (!response.ok) {
    try {
      const error = await response.json();
      appendChatMessage('assistant', `Request failed: ${error.error || response.statusText}`);
    } catch {
      appendChatMessage('assistant', `Request failed: ${response.statusText}`);
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let assistantText = '';

  const chatMessage = document.createElement('div');
  chatMessage.className = 'chat-message assistant';

  const label = document.createElement('div');
  label.className = 'chat-role';
  label.textContent = 'Assistant';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = 'Streaming...';

  chatMessage.append(label, bubble);
  chatWindow.appendChild(chatMessage);

  const responseLog = {};
  let streamedChunks = 0;

  try {
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            console.log('[Stream] Received [DONE]');
          } else {
            try {
              const parsed = JSON.parse(data);
              streamedChunks++;
              responseLog[streamedChunks] = parsed;

              const content = getStreamedContent(parsed);
              if (content) {
                assistantText += content;
                bubble.textContent = assistantText;
                chatWindow.scrollTop = chatWindow.scrollHeight;
              }
            } catch (err) {
              console.log('[Stream] Skipped malformed JSON:', data);
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
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            streamedChunks++;
            responseLog[streamedChunks] = parsed;
            const content = getStreamedContent(parsed);
            if (content) {
              assistantText += content;
              bubble.textContent = assistantText;
            }
          } catch (err) {
            console.log('[Stream] Skipped malformed JSON:', data);
          }
        }
      }
    }

    if (assistantText.length === 0) {
      bubble.textContent = '(No streaming content received - LLM might not support streaming)';
      console.warn('[Stream] No content streamed. HTTPRoute may be buffering the response.');
    } else {
      console.log(`[Stream] Completed with ${streamedChunks} chunks`);
    }

    messages.push({ role: 'assistant', content: assistantText || '(Streaming ended without content)' });
    setRawContent(rawResponseEl, responseLog);
  } catch (error) {
    console.error('[Stream] Error:', error);
    bubble.textContent = `Error: ${error.message}`;
    setRawContent(rawResponseEl, { error: error.message, streamedChunks });
  }
}

function getStreamedContent(chunk) {
  if (!chunk || typeof chunk !== 'object') return '';

  if (chunk.choices && Array.isArray(chunk.choices) && chunk.choices[0]) {
    const choice = chunk.choices[0];
    if (choice.delta?.content) return choice.delta.content;
    if (choice.text) return choice.text;
  }

  if (chunk.output && Array.isArray(chunk.output) && chunk.output[0]) {
    const output = chunk.output[0];
    if (output.delta?.content) return output.delta.content;
    if (typeof output.content === 'string') return output.content;
  }

  return '';
}

// ── Rate Limit Monitor ──────────────────────────────────────────────────────

const rlpContainer = document.getElementById('rlp-table-container');
const rlpIndicator = document.getElementById('rlp-status-indicator');

function renderRlpTable(limits) {
  if (!Array.isArray(limits) || limits.length === 0) {
    rlpContainer.innerHTML = '<p class="rlp-empty">No active rate limits</p>';
    return;
  }

  const rows = limits.map((entry) => {
    const name = entry.limit?.name ?? '—';
    const namespace = entry.limit?.namespace ?? '—';
    const max = entry.limit?.max_value ?? 0;
    const windowSec = entry.limit?.seconds ?? 0;
    const expiresIn = entry.expires_in_seconds ?? 0;
    const remaining = entry.remaining;
    const userId = entry.set_variables
      ? Object.values(entry.set_variables)[0] ?? '—'
      : '—';

    // remaining is a uint64 — values near max uint64 mean "unlimited / unused"
    const remainingBig = BigInt(remaining);
    const isUnlimited = remainingBig > BigInt(Number.MAX_SAFE_INTEGER);
    const remainingDisplay = isUnlimited ? '∞' : String(remaining);

    let usedPct = 0;
    let barClass = '';
    if (!isUnlimited && max > 0) {
      usedPct = Math.min(100, Math.round(((max - Number(remaining)) / max) * 100));
      barClass = usedPct >= 90 ? 'critical' : usedPct >= 70 ? 'warn' : '';
    }

    return `<tr>
      <td>${name}</td>
      <td>${namespace}</td>
      <td>${userId}</td>
      <td>${max.toLocaleString()}</td>
      <td>${remainingDisplay}</td>
      <td>${windowSec}s</td>
      <td>${expiresIn}s</td>
      <td class="rlp-bar-cell">
        <div class="rlp-bar-bg">
          <div class="rlp-bar-fill ${barClass}" style="width:${usedPct}%"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  rlpContainer.innerHTML = `<table class="rlp-table">
    <thead><tr>
      <th>Name</th><th>Namespace</th><th>User</th>
      <th>Max</th><th>Remaining</th><th>Window</th><th>Expires</th><th>Usage</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function pollRlpStatus() {
  try {
    const res = await fetch('/api/rlpstatus');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderRlpTable(data);
    rlpIndicator.className = 'rlp-indicator live';
  } catch {
    rlpIndicator.className = 'rlp-indicator error';
  }
}

// ────────────────────────────────────────────────────────────────────────────

function resetChat() {
  messages = [];
  chatWindow.innerHTML = '';
  rawRequestEl.textContent = '';
  rawResponseEl.textContent = '';
}

function init() {
  createHeaderRow();
  createHeaderRow('Authorization', 'APIKEY my-own-custom-key');

  document.getElementById('add-header').addEventListener('click', () => createHeaderRow('', ''));
  sendBtn.addEventListener('click', sendMessage);
  clearChatBtn.addEventListener('click', resetChat);
  chatInputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  pollRlpStatus();
  setInterval(pollRlpStatus, 1000);
}

init();
