# LLM Chat Client

A lightweight web UI for sending chat-style requests to a custom LLM endpoint.

## Features

- Dynamic LLM endpoint URL input
- Custom request headers
- Model tuning fields: `model`, `max_tokens`, `temperature`, and more
- Persistent chat history
- Live raw request and raw response display
- Backend proxy to forward requests to arbitrary endpoints and avoid CORS issues

## Run locally

1. Install dependencies

```bash
npm install
```

2. Start the app

```bash
npm start
```

If you hit a TLS error locally, just run:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npm start
```

3. Open `http://localhost:8080`

## Container deployment

Build the image:

```bash
docker build -t llm-chat-client .
```

Run it locally:

```bash
docker run -p 8080:8080 llm-chat-client
```

## OpenShift / S2I

This project can be deployed with OpenShift S2I using a Node.js builder image.

Example with a local binary build:

```bash
oc new-build --name=llm-chat-client nodejs:20~. --binary
oc start-build llm-chat-client --from-dir=. --follow
oc new-app llm-chat-client
oc expose svc/llm-chat-client
```

## Kubernetes manifest

A simple deployment manifest is available under `k8s/deployment.yaml`.

## Notes

- The server proxies POST `/api/chat` to the configured LLM endpoint.
- Enter `Content-Type: application/json` in the header section if you want it persisted; it is also applied automatically by the proxy.
- Use the extra JSON options field for OpenAI-style request parameters not exposed by the form.

