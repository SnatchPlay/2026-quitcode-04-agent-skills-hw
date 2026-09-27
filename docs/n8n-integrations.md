# n8n integrations

| event | напрям | шлях n8n | режим | власник |
|---|---|---|---|---|
| `quote-request` | Next.js → n8n → Next.js (колбек) | `/webhook/quote-request` | Respond to Webhook (202 + job_id), 40–90 с, колбек `POST /api/n8n/quote-request` | Андрій Попович |
| `lead-created` | Next.js → n8n | `/webhook/lead-created` | Immediately (200), подія «до відома» | Андрій Попович |
