# Контракт Next.js ↔ n8n — деталі

Читати, коли пишеш або змінюєш виклик n8n, колбек-роут чи `.env.example`. Порядок обробки колбека
крок за кроком — у `callback-route.md`, готовий код — у `code-templates.md`.

## 1. Змінні середовища — лише серверні

| Змінна | Що це | Локально (мок) |
|---|---|---|
| `N8N_WEBHOOK_BASE_URL` | база production-URL вебхуків, закінчується на `/webhook`, без `/` в кінці | `http://127.0.0.1:5678/webhook` |
| `N8N_WEBHOOK_TOKEN` | значення заголовка `x-n8n-token` = credential Header Auth в n8n | `change-me-webhook-token` |
| `N8N_CALLBACK_SECRET` | секрет HMAC колбеків = Hmac Secret у Crypto credential в n8n | `change-me-callback-secret` |
| `APP_BASE_URL` | адреса застосунку, за якою n8n бачить колбек-ендпоінти | `http://127.0.0.1:3000` |

- Жодна змінна `N8N_*` не має префікса `NEXT_PUBLIC_`: Next.js вбудовує такі змінні в клієнтський бандл.
- Інших `N8N_*` не вигадуємо. Справжні значення — лише в `.env.local` (git-ignored) і на хостингу.
- У `.env.example` секрети — `change-me-…`, адреси — локальні. Ніколи `/webhook-test/`.
- Секрет генеруємо: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- Секрет не йде в query string, у Client Component, у журнал, у відповідь.

## 2. Запит Next.js → n8n

- Код — один модуль `lib/n8n/client.ts`, перший рядок `import "server-only"`. Прямих `fetch` до n8n
  поза ним немає.
- `POST ${N8N_WEBHOOK_BASE_URL}/<event>`, `<event>` — ім'я події в kebab-case (`quote-request`). Одна
  подія — один шлях (n8n дозволяє один вебхук на пару «шлях + метод»).

| Заголовок | Значення |
|---|---|
| `content-type` | `application/json` |
| `x-n8n-token` | `N8N_WEBHOOK_TOKEN` |
| `idempotency-key` | UUID, створений **один раз** на бізнес-операцію і збережений разом із записом; у повторах — той самий |
| `x-correlation-id` | UUID ланцюжка дій; його ж пишемо в журнали обох систем |

Тіло — конверт:

```json
{ "version": 1, "event": "quote-request", "data": { "quoteId": "…", "company": "…", "budget": 1500 },
  "callbackUrl": "http://127.0.0.1:3000/api/n8n/quote-request" }
```

- `version` — версія конверта: нове необов'язкове поле — та сама версія; перейменування чи зміна сенсу —
  нова версія, і воркфлоу якийсь час приймає обидві.
- `data` — мінімум, потрібний воркфлоу. Не весь рядок з бази: IP, user agent, внутрішні нотатки, сирі
  дані форми n8n не потрібні.
- `callbackUrl` — лише для асинхронних подій і **лише** з `APP_BASE_URL` + `/api/n8n/<event>`, ніколи з
  вводу користувача (інакше будь-хто спрямує n8n на свою адресу).

Опції `fetch` (рішення команди):

- `signal: AbortSignal.timeout(10_000)` — прямо в опціях виклику. В асинхронному режимі n8n відповідає
  одразу, тож довга відповідь — це збій, а не «повільний воркфлоу».
- `redirect: "error"` — токен не має піти за редиректом на іншу адресу.
- `cache: "no-store"`.

Повтори: не більше двох (разом три спроби), паузи 1 с і 3 с, **лише** для мережевої помилки, таймауту,
5xx (зокрема 524). Той самий `idempotency-key` у кожній спробі. 4xx не повторюємо: 403 — неправильний
токен, 404 — воркфлоу не опубліковано або це тестовий URL.

Відповідь: дивимось на **код статусу**, текст повідомлення не парсимо (документація n8n пише «Workflow got
started», код повертає `{"message":"Workflow was started"}`).

- Асинхронна подія: успіх — **рівно `202`** і непорожній `job_id` у тілі; будь-що інше (зокрема `200`
  від режиму Immediately) — неправильно налаштований воркфлоу: запис → `failed`, повтору немає.
- Подія «до відома» (`lead-created`, режим Immediately): успіх — `200`.

## 3. Хто викликає

- Дія з UI — Server Action: сесія/права/валідація всередині (правило Vercel `server-auth-actions`).
  Дія зберігає запис (`status: "queued"`, `idempotencyKey`, `correlationId`) і відповідає одразу;
  виклик n8n із повторами — в `after()` (правило Vercel `server-after-nonblocking`). Next.js виконує Server
  Actions по одній на клієнта: очікування n8n блокує наступну дію того ж користувача.
- Результат `after()` зберігаємо: `202 + job_id` → `status: "processing"`, `jobId`; інакше → `failed`.
- Не-React клієнт (cron, інший сервіс) — Route Handler.
- Ніколи `export const runtime = "edge"`: у Next.js 16 edge застарілий, а потрібен `node:crypto`.

## 4. Колбек n8n → Next.js

`POST /api/n8n/<event>` — Route Handler `app/api/n8n/[event]/route.ts`. Публічний ендпоінт: довіряємо
лише підпису.

| Заголовок | Значення |
|---|---|
| `content-type` | `application/json` |
| `x-n8n-timestamp` | Unix-час у секундах, коли n8n підписав запит |
| `x-n8n-signature` | `sha256=<hex HMAC-SHA256(N8N_CALLBACK_SECRET, "${timestamp}.${rawBody}")>` |
| `idempotency-key` | `<data.jobId>:<event з тіла>`, напр. `5f0c…:quote-request.completed` |
| `x-correlation-id` | скопійований з запиту, що запустив воркфлоу |

```json
{ "version": 1, "event": "quote-request.completed",
  "data": { "jobId": "5f0c…", "status": "completed", "correlationId": "9b1e…",
            "requestIdempotencyKey": "c3d4…",
            "result": { "documentUrl": "https://files.example.test/n8n/5f0c….pdf" },
            "completedAt": "2026-09-21T12:00:00.000Z" } }
```

- `data.status` — `completed` або `failed` (тоді замість `result` — `error: { code }`).
- Запис знаходимо за `data.requestIdempotencyKey` (наш вихідний ключ): колбек може прийти раніше, ніж
  `after()` збереже `jobId`. `jobId` зберігаємо з колбека, якщо його ще немає, і звіряємо, якщо є.
- Порядок обробки й коди відповідей — `callback-route.md`.

## 5. Ідемпотентність з обох боків

- Next.js → n8n: той самий `idempotency-key` у кожній спробі; в n8n одразу за Webhook — Remove Duplicates
  за цим заголовком.
- n8n → Next.js: Retry On Fail повторює колбек; застосунок «застовплює» `idempotency-key` (унікальний запис)
  і приймає лише ключ, що дорівнює полям підписаного тіла. Повтор → `200 {"duplicate": true}`.
- Сховище ключів — база чи KV з унікальним обмеженням. Пам'ять процесу — лише демо (на serverless
  обробники не ділять стан).

## 6. Журнали

| Пишемо | Не пишемо ніколи |
|---|---|
| подію, напрям, `x-correlation-id` | тіло запиту чи відповіді |
| код статусу, тривалість, номер спроби | ім'я, email, телефон, IP клієнта |
| довжину тіла і його sha256 | токен, підпис, секрет, повний URL з query string |

Відповіді з помилкою не містять внутрішніх подробиць (стек, SQL, URL n8n).

## 7. Ліміти

| Ліміт | Значення |
|---|---|
| Тіло запиту до вебхука n8n | 16 МБ (`N8N_PAYLOAD_SIZE_MAX` на self-hosted) |
| Тіло Server Action | 1 МБ за замовчуванням (`serverActions.bodySizeLimit`) |
| Відповідь вебхука на n8n Cloud | 100 с, далі 524 |
| Тестовий URL | 120 с після «Listen for test event» |
| Колбек у Next.js | 64 КБ, вікно часу ±300 с — рішення команди |

Файли не передаємо — лише посилання.

## 8. Реєстр інтеграцій

Кожна подія — рядок у `docs/n8n-integrations.md` проєкту: `event | напрям | шлях n8n | режим | власник`.
Немає файлу — створи його разом з інтеграцією.
