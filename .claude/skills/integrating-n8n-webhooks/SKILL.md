---
name: integrating-n8n-webhooks
description: >-
  Контракт команди для зв'язки Next.js 16 ↔ n8n: виклик вебхука лише з lib/n8n/client.ts (Header Auth
  x-n8n-token, idempotency-key, x-correlation-id, конверт version/event/data/callbackUrl, таймаут 10 с,
  повтори), довгі воркфлоу — 202 + підписаний колбек у app/api/n8n/[event]/route.ts (HMAC-SHA256 по сирому
  тілу, вікно 300 с, ідемпотентність), змінні N8N_*, перевірка scripts/check-contract.mjs і мок n8n.
  Use when код запускає воркфлоу n8n або приймає від n8n результат: форма чи Server Action передає дані
  в n8n, ендпоінт, який викличе n8n, довга задача (PDF, кошторис, розсилка) через n8n, змінні N8N_*.
  Тригери: «запусти воркфлоу в n8n», «відправ у n8n», «вебхук n8n», «webhook», «колбек від n8n»,
  «callback», «ендпоінт, який n8n викличе», «n8n повідомить, коли готово», «воркфлоу працює хвилину».
  Не для: побудови чи зміни воркфлоу в редакторі n8n, коду для вузла Code, інтеграцій без n8n.
metadata:
  owner: studio-nova-dev
  version: "0.1.0"
---

# Next.js ↔ n8n за контрактом команди

Кожен проєкт агенції — Next.js поверх воркфлоу клієнта в n8n. Без спільного контракту кожен наступає на ті
самі граблі: тестовий URL у `.env`, форма чекає воркфлоу до 524, незахищений колбек, подвійне оновлення
після повтору, ПД у журналах. Цей контракт — рішення команди; відхилення — лише письмово в PR.

## Коли застосовувати

- Код, що викликає вебхук n8n, колбек-роут для n8n, змінні `N8N_*`, `.env.example` з ними.
- **Не** застосовувати: воркфлоу в редакторі n8n, код вузла Code — це поза межами (правила зупинки).

## Контракт коротко

| Що | Як |
|---|---|
| Змінні (лише серверні) | `N8N_WEBHOOK_BASE_URL` (…`/webhook`), `N8N_WEBHOOK_TOKEN`, `N8N_CALLBACK_SECRET`, `APP_BASE_URL`; ніяких `NEXT_PUBLIC_N8N_*`, ніяких інших `N8N_*` |
| Хто кличе n8n | лише `lib/n8n/client.ts`, перший рядок `import "server-only"` |
| Запит | `POST ${N8N_WEBHOOK_BASE_URL}/<event>`; заголовки `x-n8n-token`, `idempotency-key` (UUID на операцію, збережений із записом), `x-correlation-id`; тіло `{ version: 1, event, data, callbackUrl? }`, `data` — мінімум |
| Опції `fetch` | `signal: AbortSignal.timeout(10_000)`, `redirect: "error"`; до 2 повторів (1 с, 3 с) лише на мережеву помилку, таймаут, 5xx/524, з тим самим ключем |
| Відповідь n8n | лише код статусу: async — рівно `202` + `job_id`; Immediately — `2xx` (n8n дає `200`); 4xx не повторюємо |
| Воркфлоу, що може наблизитися до 100 с або триває невідомо скільки | лише асинхронно: Server Action зберігає запис `queued` і відповідає; виклик — в `after()` (Vercel `server-after-nonblocking`); права й валідація — у дії (Vercel `server-auth-actions`) |
| `callbackUrl` | лише `${APP_BASE_URL}/api/n8n/<event>`, ніколи з вводу |
| Колбек | `app/api/n8n/[event]/route.ts`: 404/415 → 413 за `content-length` → сире тіло потоком з обривом на 64 КБ (`readRawBody`) → ±300 с → HMAC-SHA256 `sha256=<hex>` від `` `${timestamp}.${raw}` ``, довжини + `timingSafeEqual` → застовпити `idempotency-key` (повтор → 200 `{duplicate:true}`) → `JSON.parse`, ключ = `` `${data.jobId}:${event}` `` → зберегти стан → **202** |
| Runtime | Node.js; ніколи `runtime = "edge"` |
| Журнали | подія, напрям, `x-correlation-id`, код, тривалість, спроба; ніколи тіла, ПД, токени, підписи |

Деталі й «чому»: [references/contract.md](references/contract.md) · порядок колбека:
[references/callback-route.md](references/callback-route.md) · режими відповіді й URL:
[references/response-modes.md](references/response-modes.md) · що передати клієнту для n8n:
[references/n8n-side-setup.md](references/n8n-side-setup.md) · готовий код:
[references/code-templates.md](references/code-templates.md).

## Як робимо

1. Визнач подію (kebab-case) і режим: результат не потрібен → Immediately; потрібен і воркфлоу довгий чи
   тривалість невідома → Respond to Webhook 202 + колбек.
2. `lib/n8n/client.ts`, `lib/n8n/callback.ts`, `app/api/n8n/[event]/route.ts` — з
   [code-templates.md](references/code-templates.md), без переписування.
3. Форма й дія — за патерном форм команди (`building-client-form`, якщо він є в проєкті). Запис фічі: id — `randomUUID()`, `status: "queued"`, `idempotencyKey`, `correlationId`; `after()` викликає
   `triggerWorkflow(…, async: true)` і зберігає `processing` + `jobId` або `failed`.
4. Обробник колбека для події: знайти запис за `requestIdempotencyKey`, зберегти `ready`/`failed` і посилання
   до відповіді; завершений стан не перезаписувати.
5. Статус-сторінка: статус і посилання, без email/опису; оновлення, поки `queued`/`processing`.
6. `.env.example` — 4 ключі контракту (секрети `change-me-…`, адреси локальні); справжні значення — `.env.local`.
7. Рядок у `docs/n8n-integrations.md`: `event | напрям | шлях n8n | режим | власник`.

## Чекліст

```
- [ ] 1. Жодного /webhook-test/ і NEXT_PUBLIC_N8N_* у коді та .env.example.
- [ ] 2. fetch до n8n — лише в lib/n8n/client.ts з import "server-only".
- [ ] 3. Кожен виклик: x-n8n-token, idempotency-key, x-correlation-id, AbortSignal.timeout, redirect: "error".
- [ ] 4. Повтори лише мережа/таймаут/5xx, не більше 2, той самий ключ.
- [ ] 5. Server Action не чекає n8n: виклик у after(), дія повертає одразу.
- [ ] 6. Async-успіх — лише 202 + job_id; інший 2xx чи 4xx → failed без повтору (5xx — повтор, п. 4).
- [ ] 7. Колбек: 413 до читання, request.text(), ±300 с, довжини + timingSafeEqual, потім JSON.parse.
- [ ] 8. idempotency-key застовплено, звірено з тілом, звільнено після збою обробки.
- [ ] 9. Стан збережено до відповіді 202; повторний колбек — 200 {duplicate:true}.
- [ ] 10. У журналах — лише подія, correlation id, коди, тривалість.
```

## Правила зупинки — зупинись і спитай людину, якщо:

- у коді чи `.env.example` має з'явитися URL з `/webhook-test/` — навіть «тимчасово»;
- секрет чи токен потрапляє в Client Component, `NEXT_PUBLIC_*`, query string, журнал або відповідь;
- від дії вимагають синхронно дочекатися результату воркфлоу, який може наблизитися до 100 с або триває невідомо скільки;
- `N8N_WEBHOOK_BASE_URL` — не `https://` і не локальна адреса (токен пішов би відкритим текстом);
- `callbackUrl` чи адресу вебхука пропонують брати з вводу користувача;
- потрібно `runtime = "edge"`, прибрати перевірку підпису, вікна часу чи ідемпотентності;
- n8n відповідає не за контрактом (не `202` для async, `401` замість `403`, інший формат колбека) — не підганяй код;
- задача вимагає змінити, експортувати чи імпортувати воркфлоу клієнта або написати код для вузла Code.

## Verify — задача готова, лише коли:

- [ ] `npm run lint` і `npm run build` без помилок.
- [ ] `node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs` — 0 FAIL (для змін у гілці: `--changed-since <ref>`).
- [ ] З моком (`node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode respond-202 --delay 5000`):
      форма відповідає одразу; у журналі мока `/webhook/<event> -> 202 … auth=ok idempotency=new`; колбек `-> 202`; статус-сторінка показує результат.
- [ ] `node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/send-signed-callback.mjs --url http://127.0.0.1:3000/api/n8n/<event>` — усі випадки як очікувано. Без `--job-id`/`--request-key` матриця перевіряє відмови (401/400/413/415/404); успіх 202 для наявного запису перевіряє сценарій з моком вище.
- [ ] У журналі сервера немає тіл, email, телефонів, токенів і підписів.

## Файли скіла

- `references/contract.md` — змінні, запит, повтори, колбек, ідемпотентність, журнали, ліміти, реєстр.
- `references/callback-route.md` — 10 кроків колбека з кодами відповідей і причинами; статус-сторінка.
- `references/response-modes.md` — режими Webhook, правило 100 с / 524, тестовий vs production URL, коди n8n, пастки документації.
- `references/n8n-side-setup.md` — налаштування воркфлоу словами для клієнта; локальний мок.
- `references/code-templates.md` — перевірений код клієнта, колбек-роута, фічі й `.env.example`.
- `scripts/check-contract.mjs` — статична перевірка C1–C13; `--root`, `--changed-since`, `--help`; exit 1 при FAIL.
- `scripts/send-signed-callback.mjs` — матриця колбеків проти запущеного застосунку; `--help`.
- `scripts/mock-n8n.mjs` — офлайн-мок n8n (Webhook, Respond to Webhook, Header Auth, підписаний колбек); `--help`.
