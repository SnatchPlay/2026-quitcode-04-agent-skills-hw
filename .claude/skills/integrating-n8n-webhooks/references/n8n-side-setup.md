# Налаштування на боці n8n — текст для клієнта

Воркфлоу клієнта — його власність: ми не експортуємо й не імпортуємо JSON воркфлоу і не пишемо код для
вузла Code. Налаштування передаємо словами — ось так (приклад для `quote-request`).

1. **Webhook**: HTTP Method `POST`, Path — ім'я події (`quote-request`). Authentication — **Header Auth**,
   credential з Name `x-n8n-token` і Value = `N8N_WEBHOOK_TOKEN`. Неправильний чи відсутній заголовок →
   **403** «Authorization data is wrong!». Respond — `Using 'Respond to Webhook' Node` (для подій «до
   відома» — `Immediately`). Фіксовані IP хостингу — Options → IP(s) Allowlist (за reverse proxy —
   `N8N_PROXY_HOPS`). Далі у вузлах дані — `$json.body`, заголовки — `$json.headers` (у нижньому регістрі).
2. **Remove Duplicates**: «Remove Items Processed in Previous Executions», значення
   `{{ $json.headers['idempotency-key'] }}`.
3. **Respond to Webhook**: Respond With JSON, Response Code `202`, тіло `{"job_id": "{{ $execution.id }}"}`.
4. … робота воркфлоу (PDF тощо) …
5. **Edit Fields**: `ts` = `{{ Math.floor($now.toSeconds()) }}`; `body` =
   `{{ JSON.stringify({ version: 1, event: 'quote-request.completed', data: { jobId: $execution.id, status: 'completed', correlationId: $('Webhook').item.json.headers['x-correlation-id'], requestIdempotencyKey: $('Webhook').item.json.headers['idempotency-key'], result: { documentUrl: … }, completedAt: $now.toISO() } }) }}`.
   Тіло підписуємо й відправляємо **одним і тим самим рядком**.
6. **Crypto** (v2): Action `Hmac`, Type `SHA256`, Encoding `HEX`, значення `{{ $json.ts + '.' + $json.body }}`,
   credential **Crypto** з Hmac Secret = `N8N_CALLBACK_SECRET`.
7. **HTTP Request**: `POST` на `{{ $('Webhook').item.json.body.callbackUrl }}`. Заголовки
   `x-n8n-timestamp` = `ts`, `x-n8n-signature` = `sha256=` + результат Crypto, `idempotency-key` =
   `{{ $execution.id }}:quote-request.completed`, `x-correlation-id` — з вхідних заголовків. Body Content
   Type — **Raw**, Content Type `application/json`, Body — поле `body` (не «JSON → Using Fields Below»:
   n8n не гарантує тих самих байтів, що підписали). Options → Timeout `10000`. Settings → Retry On Fail,
   Max Tries `3`, Wait Between Tries `1000`. n8n у Docker, застосунок на хості — `host.docker.internal`.
8. **Save** і **Publish**. Після кожної зміни — Publish знову.

## Локально — мок замість n8n

`scripts/mock-n8n.mjs` (копія `tools/mock-n8n.mjs`) поводиться як Webhook + Respond to Webhook + HTTP
Request з підписом. Значень секретів і тіл не друкує.

```bash
# з кореня проєкту
node .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --help
node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode respond-202 --delay 5000
#   N8N_WEBHOOK_TOKEN → вимагає x-n8n-token (403 без нього); N8N_CALLBACK_SECRET → підписаний колбек
#   на callbackUrl із запиту через 5 с
node .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode slow --cloud-timeout 5000   # 524, як на Cloud
```

У журналі мока: метод, шлях, статус, тривалість, імена заголовків, `auth=`, `idempotency=new|repeat|absent`.
