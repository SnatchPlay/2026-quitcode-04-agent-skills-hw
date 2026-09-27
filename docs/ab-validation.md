# A/B-перевірка скіла `integrating-n8n-webhooks` (Task D)

> A — без скіла, B — зі скілом. Три прогони на гілку. Числа й цитати — з журналів сесій (`stream-json`),
> журналів мока й сервера; журнали лежать поза репозиторієм, діфи — у `docs/ab/`.

- **Інструмент і версія:** Claude Code 2.1.278, headless (`claude -p`), macOS, Node 24.16.0
- **Модель і рівень міркування, однакові в усіх 6 прогонах:** `--model claude-sonnet-5 --effort high`
  (у події `init` кожного журналу — `"model":"claude-sonnet-5"`)
- **Код:** BASE = `f230079` — після Task C: виправлення Task A, форма нотаток з Task B, три скіли; ще без
  `/quotes` і без змін у виклику n8n. Код і скіли — ті самі, що в коміті скіла `e8857a4`: після нього
  змінено лише `docs/`. Скіл для B-копій — `git archive HEAD .claude/skills/integrating-n8n-webhooks` на тому ж `f230079`
- **Копії:** `../leaddesk-ab-a1`, `-a2`, `-a3` (без жодного скіла), `../leaddesk-ab-b1`, `-b2`, `-b3` (лише
  `integrating-n8n-webhooks`); у кожній — власний `git init`, коміт `start`, тег `base`; `node_modules` —
  APFS-клон з робочого репозиторію (ті самі версії, що дав би `npm install` з того ж `package-lock.json`)
- **Що видалено з усіх копій:** `tools/`, `materials/`, `docs/`, `README.md`, `.coderabbit.yaml`, `.github/` і
  `.claude/skills` (у B повернуто лише `integrating-n8n-webhooks`). Перевірено командами з walkthrough:
  `find … -name SKILL.md` — рівно 3 рядки, усі в `leaddesk-ab-b*`; `ls -A … | grep -xE 'tools|materials|…'` →
  «no hints - ok»; `grep -rlE "x-n8n-token|timingSafeEqual|idempotency-key"` по A-копіях → «no contract - ok»
- **Особисті скіли й налаштування.** На машині є особисті скіли (`~/.claude/skills`: `code-craft`,
  `no-mistakes`, `self-review` — зламаний symlink, `synced` — тека синхронізації; у звичайному `/context` видно
  `code-craft` і `no-mistakes`) і особистий allowlist (зокрема `git push`). Тому всі прогони — з
  `--setting-sources project,local --strict-mcp-config`. Окремий `claude -p "/context"` з тими самими прапорцями:
  у `a1` — жодного проєктного, особистого чи плагінного скіла; у `b1` — лише `integrating-n8n-webhooks | Project`;
  MCP-інструментів — 0 в обох. Однаковим для всіх 6 лишився `~/.claude/CLAUDE.md` (мій «working agreement»:
  доказовість, `code-craft`/`self-review`). Через нього A1 і A3 пробували викликати `code-craft` і отримали
  `Unknown skill: code-craft` — особистий скіл у прогін не потрапив.
- **Запит:** `materials/ab-task.md`, рядки 14–18 між лініями `---`, побайтово (`cmp` з оригіналом), sha256
  `498a125e1d02c546…`. Той самий файл на вході кожного прогону (sha256 записано перед кожним запуском).
- **Дозволи, однакові для всіх:** `--permission-mode acceptEdits`, `--allowedTools "Bash(npm run lint)"
  "Bash(npm run build)" "Bash(npx tsc --noEmit)" "Bash(node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs*)"`.
  В A-копіях цього файлу немає, тож дозвіл нічого не дає. Решту в headless-режимі відхиляє система, не питаючи.
  Читань поза текою копії — жодного (з журналів: 0 шляхів `Read` за межами копії).
- **Відповідь на уточнення:** під час роботи агенти запитань не ставили (headless). Наприкінці A1, A3, B1 і B3
  попросили дозволу запустити dev-сервер і мок для наскрізної перевірки; відповіді не отримав жоден.
- **Мок, однаковий для всіх 6** (з робочого репозиторію, термінал у теці копії):
  `node --env-file=.env.local ../2026-quitcode-04-agent-skills-hw/tools/mock-n8n.mjs --mode respond-202 --delay 5000`,
  без `--callback-url`. `.env.local` у копії — рядки `.env.example`, які лишив агент, плюс
  `N8N_WEBHOOK_TOKEN` і `N8N_CALLBACK_SECRET` мока (згенеровані; змінним агента з `TOKEN`/`SECRET` у назві — ті
  самі значення). Сценарій надсилає форму `/quotes/new` так, як її надіслав би браузер без
  JavaScript (приховані `$ACTION_*` з HTML + поля). Час рахується від запиту до відповіді; потім відкривається `/quotes/<id>` одразу й
  через 9 с.
- **Як запускали:** усі 6 сесій — одночасно, у фоні, кожна у своїй копії (`run-arm.sh <arm>` з однаковими
  прапорцями; dev-сервер агентам заборонено, тож портів вони не ділили). Тривалість сесій — 223–536 с, усі
  завершились за ~9 хв; сценарії з моком — потім, по одній копії, на порту 3000.
- **Правило вибору прогону B для фічі — записане до прогонів** (15:31:45 UTC): найменше FAIL
  `--changed-since base` → сценарій з моком пройшов → менше змінених файлів → нічия = B1.
- **Базова лінія `check-contract.mjs` на копії до прогону** (увесь код, без `--changed-since`), однакова для
  A і B: `Summary: 3 PASS, 6 FAIL, 4 N/A` — FAIL C1 (`.env.example:6`), C3–C6 (`app/actions.ts:56` — у BASE рядок зсунувся на 2 через імпорти Task A), C12. Це
  старий `lead-created`, в оцінку прогонів він не йде.

`check-contract.mjs` на коді прогонів нижче — остаточною версією скрипта (`fc40a70`). Перший перерахунок дав
хибні FAIL: C6 для A2 і C8 для A3 (див. «Що скіл змінив у собі»). Обидва виправлено в скрипті; на B-прогони
жодна зміна скрипта не вплинула — 0 FAIL щоразу. Повний вивід кожного прогону — у згортках під таблицями.

## A — без скіла

- **Які скіли бачив агент** (`/context` у `a1`, прапорці як у прогоні): жодного проєктного; `init.skills`
  у журналах A1–A3 — лише вбудовані Claude Code. Виклики `Skill`: A1 — `code-craft` (Unknown skill),
  A2 — жодного, A3 — `code-craft` (Unknown skill) і вбудований `run`.
- **Що зробили агенти.** Усі три зробили схожу фічу: `/quotes/new`, Server Action, колбек-роут
  `app/api/quotes/[id]/callback` (A1, A3) чи `…/complete` (A2), `/quotes/[id]` з автооновленням, запис у
  `lib/db.ts`. Контракту n8n не дотримався жоден:
  - одна змінна з повним URL (`N8N_QUOTE_WEBHOOK_URL`) і прикладом
    `http://127.0.0.1:5678/webhook-test/quote-request` у `.env.example`;
  - `fetch` без `x-n8n-token`, `idempotency-key` і `x-correlation-id`;
  - колбек захищений **статичним** секретом у заголовку: `x-n8n-secret` через `!==` в A1; `x-webhook-secret`
    з перевіркою довжини й `timingSafeEqual` в A2, A3. HMAC тіла, вікна часу й ідемпотентності немає;
    тіло читається `request.json()`;
  - A2 ще й відправляє `callbackSecret: process.env.N8N_CALLBACK_SECRET` **у тілі запиту до n8n**;
  - дані до n8n містять email і опис задачі;
  - A1 і A3 чекають n8n прямо в дії, A2 — в `after()`.
- **Звідки агенти взяли домовленості:** з наявного коду і документації Next.js у `node_modules`. Усі троє
  читали `app/actions.ts` і `.env.example` зі старим `N8N_WEBHOOK_URL=…/webhook-test/lead-created` — і
  повторили цей шаблон. A1–A3 відкривали `node_modules/next/dist/docs/…/server-actions.md` і
  `…/route-handlers.md`; після цього A2 поставив виклик в `after()`. Записки й мока в копіях не було.
- **Фінальні відповіді (скорочено):** A1 — «Running a background dev server needs your approval… I have
  **not** yet verified the live request flow»; A2 — «Added the quote-request feature end to end… Guarded by
  a shared secret… compared with `timingSafeEqual`»; A3 — «I'm blocked from doing a full runtime test…».

| | A1 | A2 | A3 |
|---|---|---|---|
| Змінені файли (`git diff --cached --stat base`) | 12 (+420/−2) | 16 (+423/−26) | 10 (+435/−1) |
| Діф | `docs/ab/a-without-skill.diff` | `docs/ab/a2.diff` | `docs/ab/a3.diff` |
| Змінні, додані в `.env.example` | `N8N_QUOTE_WEBHOOK_URL` (`/webhook-test/`), `N8N_CALLBACK_SECRET` (порожнє), `APP_BASE_URL` | `N8N_QUOTE_WEBHOOK_URL` (`/webhook-test/`), `N8N_CALLBACK_SECRET=change-me`, `APP_URL` | `N8N_QUOTE_WEBHOOK_URL` (`/webhook-test/`), `N8N_CALLBACK_SECRET` (порожнє) |
| `check-contract --changed-since base` | 4 PASS, **9 FAIL**: C1 C3 C5 C6 C7 C8 C9 C10 C12 | 5 PASS, **8 FAIL**: C1 C3 C4 C5 C7 C9 C10 C12 | 4 PASS, **9 FAIL**: C1 C3 C4 C5 C6 C7 C9 C10 C12 |
| Час сесії / вартість / кроки | 295 с · $1.26 · 53 | 536 с · $2.05 · 82 | 348 с · $1.46 · 57 |

<details><summary>A1: повний вивід <code>check-contract.mjs --root ../leaddesk-ab-a1 --changed-since base</code></summary>

```
check-contract · root ../leaddesk-ab-a1 · 35 file(s) · changed since base: 12 file(s)
C1   FAIL no n8n test URL (/webhook-test/)
       .env.example:11  test URL /webhook-test/
C2   PASS no NEXT_PUBLIC_N8N_* variables
C3   FAIL n8n calls only in lib/n8n/client.ts (server-only)
       app/quotes/actions.ts:33  fetch to n8n outside lib/n8n/client.ts
C4   PASS timeout on every n8n fetch
C5   FAIL x-n8n-token, idempotency-key, x-correlation-id on every n8n fetch
       app/quotes/actions.ts:33  fetch to n8n without header(s): x-n8n-token, idempotency-key, x-correlation-id
C6   FAIL Server Actions call n8n only inside after()
       app/quotes/actions.ts:33  Server Action awaits n8n, not in after()
C7   FAIL callback: raw body, JSON only after signature check
       app/api/quotes/[id]/callback/route.ts:16  body is not read raw (request.text() or a request.body reader)
       app/api/quotes/[id]/callback/route.ts:16  no signature verification (timingSafeEqual) in POST
C8   FAIL callback: length check + timingSafeEqual, no ===
       app/api/quotes/[id]/callback/route.ts:16  timingSafeEqual is not used
C9   FAIL callback: +-300 s timestamp window
       app/api/quotes/[id]/callback/route.ts:16  no x-n8n-timestamp check: |now - timestamp| > 300 s -> 401
C10  FAIL callback: 64 KB limit -> 413
       app/api/quotes/[id]/callback/route.ts:16  no limit on the body actually read: > 64 KB -> 413 (content-length alone is not enough)
C11  PASS no runtime = "edge"
C12  FAIL .env.example and N8N_* names follow the contract
       app/quotes/actions.ts:33  N8N_QUOTE_WEBHOOK_URL is not a contract variable
       .env.example  missing N8N_WEBHOOK_BASE_URL
       .env.example  missing N8N_WEBHOOK_TOKEN
       .env.example:11  N8N_QUOTE_WEBHOOK_URL is not a contract variable
       .env.example:16  N8N_CALLBACK_SECRET: secrets in .env.example must be change-me-… placeholders (value not shown)
C13  PASS no bodies, PII or secrets in logs
Summary: 4 PASS, 9 FAIL, 0 N/A
```

</details>

<details><summary>A2: повний вивід <code>check-contract.mjs --root ../leaddesk-ab-a2 --changed-since base</code></summary>

```
check-contract · root ../leaddesk-ab-a2 · 38 file(s) · changed since base: 16 file(s)
C1   FAIL no n8n test URL (/webhook-test/)
       .env.example:9  test URL /webhook-test/
C2   PASS no NEXT_PUBLIC_N8N_* variables
C3   FAIL n8n calls only in lib/n8n/client.ts (server-only)
       app/quotes/actions.ts:30  fetch to n8n outside lib/n8n/client.ts
C4   FAIL timeout on every n8n fetch
       app/quotes/actions.ts:30  fetch to n8n without signal: AbortSignal.timeout(...)
C5   FAIL x-n8n-token, idempotency-key, x-correlation-id on every n8n fetch
       app/quotes/actions.ts:30  fetch to n8n without header(s): x-n8n-token, idempotency-key, x-correlation-id
C6   PASS Server Actions call n8n only inside after()
C7   FAIL callback: raw body, JSON only after signature check
       app/api/quotes/[id]/complete/route.ts:10  body is not read raw (request.text() or a request.body reader)
C8   PASS callback: length check + timingSafeEqual, no ===
C9   FAIL callback: +-300 s timestamp window
       app/api/quotes/[id]/complete/route.ts:10  no x-n8n-timestamp check: |now - timestamp| > 300 s -> 401
C10  FAIL callback: 64 KB limit -> 413
       app/api/quotes/[id]/complete/route.ts:10  no limit on the body actually read: > 64 KB -> 413 (content-length alone is not enough)
C11  PASS no runtime = "edge"
C12  FAIL .env.example and N8N_* names follow the contract
       app/quotes/actions.ts:30  N8N_QUOTE_WEBHOOK_URL is not a contract variable
       .env.example  missing N8N_WEBHOOK_BASE_URL
       .env.example  missing N8N_WEBHOOK_TOKEN
       .env.example  missing APP_BASE_URL
       .env.example:9  N8N_QUOTE_WEBHOOK_URL is not a contract variable
       .env.example:14  N8N_CALLBACK_SECRET: secrets in .env.example must be change-me-… placeholders (value not shown)
C13  PASS no bodies, PII or secrets in logs
Summary: 5 PASS, 8 FAIL, 0 N/A
```

</details>

<details><summary>A3: повний вивід <code>check-contract.mjs --root ../leaddesk-ab-a3 --changed-since base</code></summary>

```
check-contract · root ../leaddesk-ab-a3 · 35 file(s) · changed since base: 10 file(s)
C1   FAIL no n8n test URL (/webhook-test/)
       .env.example:10  test URL /webhook-test/
C2   PASS no NEXT_PUBLIC_N8N_* variables
C3   FAIL n8n calls only in lib/n8n/client.ts (server-only)
       app/quotes/actions.ts:29  fetch to n8n outside lib/n8n/client.ts
C4   FAIL timeout on every n8n fetch
       app/quotes/actions.ts:29  fetch to n8n without signal: AbortSignal.timeout(...)
C5   FAIL x-n8n-token, idempotency-key, x-correlation-id on every n8n fetch
       app/quotes/actions.ts:29  fetch to n8n without header(s): x-n8n-token, idempotency-key, x-correlation-id
C6   FAIL Server Actions call n8n only inside after()
       app/quotes/actions.ts:29  Server Action awaits n8n, not in after()
C7   FAIL callback: raw body, JSON only after signature check
       app/api/quotes/[id]/callback/route.ts:32  body is not read raw (request.text() or a request.body reader)
C8   PASS callback: length check + timingSafeEqual, no ===
C9   FAIL callback: +-300 s timestamp window
       app/api/quotes/[id]/callback/route.ts:32  no x-n8n-timestamp check: |now - timestamp| > 300 s -> 401
C10  FAIL callback: 64 KB limit -> 413
       app/api/quotes/[id]/callback/route.ts:32  no limit on the body actually read: > 64 KB -> 413 (content-length alone is not enough)
C11  PASS no runtime = "edge"
C12  FAIL .env.example and N8N_* names follow the contract
       app/quotes/actions.ts:29  N8N_QUOTE_WEBHOOK_URL is not a contract variable
       .env.example  missing N8N_WEBHOOK_BASE_URL
       .env.example  missing N8N_WEBHOOK_TOKEN
       .env.example  missing APP_BASE_URL
       .env.example:10  N8N_QUOTE_WEBHOOK_URL is not a contract variable
       .env.example:14  N8N_CALLBACK_SECRET: secrets in .env.example must be change-me-… placeholders (value not shown)
C13  PASS no bodies, PII or secrets in logs
Summary: 4 PASS, 9 FAIL, 0 N/A
```

</details>

Журнал мока (сценарій форма → колбек → `/quotes/<id>`):

```
A1  POST /webhook-test/quote-request -> 404 in 1 ms  | headers: accept,accept-language,content-type,user-agent | body 344 B
A2  POST /webhook-test/quote-request -> 404 in 1 ms  | headers: accept,accept-language,content-type,user-agent | body 370 B
A3  POST /webhook-test/quote-request -> 404 in 0 ms  | headers: accept,accept-language,content-type,user-agent | body 348 B
```

Тестовий URL мок, як і n8n, реєструє лише з `--listen` на 120 с, тож відповідь — 404. `auth=` і `idempotency=` у
журналі немає, бо немає заголовків; воркфлоу не запустився, колбека не було.

- **Час від «Надіслати» до відповіді форми:** A1 — 232 мс, A2 — 137 мс, A3 — 232 мс (303 на `/quotes/<id>`).
  A1 і A3 чекають відповідь n8n у дії; тут вона прийшла за 1 мс, бо це 404. На реальному воркфлоу 40–90 с,
  до того ж без таймауту (`AbortSignal.timeout` є лише в A1), відповідь форми залежала б від n8n.
- **Що показала `/quotes/<id>`:** A1 — «Не вдалося підготувати кошторис · Воркфлоу відповів помилкою 404»,
  A2 — через 9 с «Не вдалося підготувати кошторис… Спробувати ще раз», A3 — «Не вдалося підготувати
  кошторис». Усі три показують на статус-сторінці **email і опис задачі**. В A2 id послідовний
  (`/quotes/quote_0001`) — будь-хто може перебрати чужі запити.
- **Журнал сервера:** email, компанії й опису — 0 входжень у всіх трьох; тіл і токенів немає. A2 і A3 пишуть
  стек помилки (`Failed to start quote workflow for quote_0001 Error: n8n responded with 404`).

## B — зі скілом

- **Які скіли бачив агент** (`/context` у `b1`): лише `integrating-n8n-webhooks | Project`.
- **Чи викликав агент скіл:** так, у всіх трьох. Спершу інструмент `Skill` з `integrating-n8n-webhooks`, потім
  `Read` для `references/code-templates.md`, `callback-route.md`, `contract.md`, `response-modes.md` і запуск
  `scripts/check-contract.mjs` (B1–B3 — з `--changed-since` на свій стартовий коміт). Документацію Next.js
  B2 і B3 не відкривали, B1 — лише `route.md` і `typedRoutes.md`.
- **Що зробили агенти.** Усі троє перенесли з `code-templates.md` без змін `lib/n8n/client.ts`,
  `lib/n8n/callback.ts`, `app/api/n8n/[event]/route.ts` і `lib/quotes.ts` (для B1 побайтову ідентичність
  шаблонам перевірено `cmp`). Сторінки, форму й дію написали самі; у `.env.example` — 4 ключі контракту зі значеннями
  `change-me-…` і локальними адресами; додали рядок у `docs/n8n-integrations.md`. Старий `lead-created` не чіпали.
- **Фінальні відповіді (скорочено):** B1 — «passes `lint`, `build`, and the project's automated n8n-contract
  checker (13/13 PASS). The last verification step… needs to start background processes»; B2 — «static
  verification (lint, build, and the contract checker) all pass, but I couldn't complete the live mock-n8n
  round-trip… treating as a block rather than something to route around»; B3 — «The mock-n8n server needs
  your explicit approval to run».

| | B1 | B2 | B3 |
|---|---|---|---|
| Змінені файли | 10 (+475) | 11 (+533) | 10 (+485) |
| Діф | `docs/ab/b-with-skill.diff` | `docs/ab/b2.diff` | `docs/ab/b3.diff` |
| Змінні в `.env.example` | `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_TOKEN`, `N8N_CALLBACK_SECRET`, `APP_BASE_URL` | ті самі 4 | ті самі 4 |
| `check-contract --changed-since base` | **13 PASS, 0 FAIL** | **13 PASS, 0 FAIL** | **13 PASS, 0 FAIL** |
| Час сесії / вартість / кроки | 342 с · $1.71 · 66 | 273 с · $1.25 · 52 | 223 с · $1.02 · 42 |

<details><summary>B1: повний вивід <code>check-contract.mjs --root ../leaddesk-ab-b1 --changed-since base</code></summary>

```
check-contract · root ../leaddesk-ab-b1 · 36 file(s) · changed since base: 9 file(s)
C1   PASS no n8n test URL (/webhook-test/)
C2   PASS no NEXT_PUBLIC_N8N_* variables
C3   PASS n8n calls only in lib/n8n/client.ts (server-only)
C4   PASS timeout on every n8n fetch
C5   PASS x-n8n-token, idempotency-key, x-correlation-id on every n8n fetch
C6   PASS Server Actions call n8n only inside after()
C7   PASS callback: raw body, JSON only after signature check
C8   PASS callback: length check + timingSafeEqual, no ===
C9   PASS callback: +-300 s timestamp window
C10  PASS callback: 64 KB limit -> 413
C11  PASS no runtime = "edge"
C12  PASS .env.example and N8N_* names follow the contract
C13  PASS no bodies, PII or secrets in logs
Summary: 13 PASS, 0 FAIL, 0 N/A
```

</details>

<details><summary>B2: повний вивід <code>check-contract.mjs --root ../leaddesk-ab-b2 --changed-since base</code></summary>

```
check-contract · root ../leaddesk-ab-b2 · 37 file(s) · changed since base: 10 file(s)
C1   PASS no n8n test URL (/webhook-test/)
C2   PASS no NEXT_PUBLIC_N8N_* variables
C3   PASS n8n calls only in lib/n8n/client.ts (server-only)
C4   PASS timeout on every n8n fetch
C5   PASS x-n8n-token, idempotency-key, x-correlation-id on every n8n fetch
C6   PASS Server Actions call n8n only inside after()
C7   PASS callback: raw body, JSON only after signature check
C8   PASS callback: length check + timingSafeEqual, no ===
C9   PASS callback: +-300 s timestamp window
C10  PASS callback: 64 KB limit -> 413
C11  PASS no runtime = "edge"
C12  PASS .env.example and N8N_* names follow the contract
C13  PASS no bodies, PII or secrets in logs
Summary: 13 PASS, 0 FAIL, 0 N/A
```

</details>

<details><summary>B3: повний вивід <code>check-contract.mjs --root ../leaddesk-ab-b3 --changed-since base</code></summary>

```
check-contract · root ../leaddesk-ab-b3 · 36 file(s) · changed since base: 9 file(s)
C1   PASS no n8n test URL (/webhook-test/)
C2   PASS no NEXT_PUBLIC_N8N_* variables
C3   PASS n8n calls only in lib/n8n/client.ts (server-only)
C4   PASS timeout on every n8n fetch
C5   PASS x-n8n-token, idempotency-key, x-correlation-id on every n8n fetch
C6   PASS Server Actions call n8n only inside after()
C7   PASS callback: raw body, JSON only after signature check
C8   PASS callback: length check + timingSafeEqual, no ===
C9   PASS callback: +-300 s timestamp window
C10  PASS callback: 64 KB limit -> 413
C11  PASS no runtime = "edge"
C12  PASS .env.example and N8N_* names follow the contract
C13  PASS no bodies, PII or secrets in logs
Summary: 13 PASS, 0 FAIL, 0 N/A
```

</details>

Журнал мока:

```
B1  POST /webhook/quote-request -> 202 in 1 ms auth=ok idempotency=new | headers: …,content-type,idempotency-key,…,x-correlation-id,x-n8n-token | body 311 B
    workflow d0450e1d-… running for 5000 ms, then callback event=quote-request.completed
    callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 30 ms (try 1/3) event=quote-request.completed body 382 B
B2  POST /webhook/quote-request -> 202 in 1 ms auth=ok idempotency=new | … | body 311 B
    callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 33 ms (try 1/3)
B3  POST /webhook/quote-request -> 202 in 0 ms auth=ok idempotency=new | … | body 311 B
    callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 26 ms (try 1/3)
```

- **Час від «Надіслати» до відповіді форми:** 12 мс у всіх трьох (303; виклик n8n — в `after()`).
- **Що показала `/quotes/<id>`:** одразу — «У черзі», через 9 с — «Кошторис готовий · Завантажити кошторис (PDF)»
  у B1, B2 і B3. Id — UUID; email і опис на сторінці не показуються.
- **Журнал сервера:** лише `n8n out event=quote-request correlation=… attempt=1 result=202 ms=25` і
  `n8n in event=quote-request correlation=… result=202 bytes=382`; email, компанії й опису — 0 входжень.

## Порівняння

| Що дивимось | A — без скіла (A1 / A2 / A3) | B — зі скілом (B1 / B2 / B3) |
|---|---|---|
| Скіл викликано | — (A1 і A3 пробували особистий `code-craft` → Unknown skill) | так / так / так |
| `check-contract.mjs` на коді прогону: FAIL | 9 / 8 / 9: C1, C3, C5, C7, C9, C10, C12 у всіх; C4 (A2, A3), C6 (A1, A3), C8 (A1) | 0 / 0 / 0 |
| URL вебхука | `/webhook-test/quote-request` у всіх | `/webhook/quote-request` у всіх |
| `auth=` / `idempotency=` у журналі мока | немає (404 до автентифікації, заголовків немає) | `auth=ok` / `idempotency=new` у всіх |
| Колбек дійшов; код відповіді застосунку | ні (воркфлоу не стартував) | так, 202 / 202 / 202 |
| Захист колбека (з коду) | статичний секрет у заголовку; A2 ще й шле цей секрет у тілі до n8n | HMAC-SHA256 від `timestamp.raw`, ±300 с, `timingSafeEqual`, ідемпотентність |
| Час відповіді форми | 232 / 137 / 232 мс (A1 і A3 чекають n8n у дії) | 12 / 12 / 12 мс |
| ПД на статус-сторінці; id | email і опис у всіх; A2 — послідовний `quote_0001` | немає; UUID |
| Тіла чи ПД у журналі сервера | немає / немає / немає | немає / немає / немає |
| Змінених файлів | 12 / 16 / 10 | 10 / 11 / 10 |
| Запитання агента | наприкінці: дозвіл на dev-сервер (A1, A3) | наприкінці: дозвіл на мок і dev-сервер (B1, B3); B2 — звіт про блок |

## Перенесення прогону B у гілку (фіча)

- **Який прогін:** B1, за правилом, записаним до прогонів. У B1–B3 по 0 FAIL і пройдений сценарій; змінених
  файлів 10 / 11 / 10; нічия між B1 і B3 → B1.
- **Як переносили:** `git apply --3way docs/ab/b-with-skill.diff` на гілці → «Applied patch to '.env.example'
  cleanly» + 9 нових файлів; `cmp` кожного з 10 файлів з `../leaddesk-ab-b1` — побайтово однакові. Коміт
  `334c15f`. `.env.local`, `node_modules` і `package*.json` не переносили (агент залежностей не додавав).
- **Що довелось доробити руками (і чому скіл цього не дав):**
  - `78d01c8` — доступні помилки у формі кошторису (`htmlFor`, `aria-invalid`, `aria-describedby`, підсумок
    `role="alert"`). Це патерн `building-client-form`, якого за протоколом у копії B не було, а n8n-скіл
    форм не описує. Межа скіла: він дає контракт інтеграції, а не UI.
  - `24fcb22` — старий `lead-created` у `app/actions.ts` → `triggerWorkflow` з `lib/n8n/client.ts` в
    `after()` (мінімальні дані, без IP, user agent і сирої форми); з `.env.example` прибрано
    `N8N_WEBHOOK_URL` з `/webhook-test/`. Скіл застосовується до коду, який агент пише: наявного коду B1–B3 не
    чіпали, хоча `check-contract` без `--changed-since` на ньому FAIL.
  - `d967665` — у `docs/n8n-integrations.md` агент записав власником email облікового запису (узяв його з
    контексту сесії Claude Code; так зробили всі три B-прогони); замінено на ім'я, додано рядок
    `lead-created`. У діфах-доказах `docs/ab/b-with-skill.diff`, `b2.diff`, `b3.diff` цей email замінено на
    `<email облікового запису — прибрано з доказу>`; решта діфів — як їх дав `git diff --cached base`.
- **Що скіл змінив у собі після прогонів:**
  - `80397fa` — C6 давав хибний FAIL для A2: `fetch` лежав у неекспортованому хелпері, який дія викликає лише в
    `after()`. Тепер C6 іде від такого хелпера до місць його виклику. До мутаційного самотесту додано випадки
    «хелпер лише в `after()` → PASS» і «той самий хелпер з `await` у дії → FAIL».
  - `ca5b1ee` — `npm run lint` давав 5 попереджень `no-unused-expressions` на `check-contract.mjs` (їх бачили й
    B-агенти). Скрипт переписано без виразів через кому; вивід на `main` і самотест не змінились.
  - `54ceb41` — C8 давав хибний FAIL для A3: правий операнд `expectedBuf.length !== providedBuf.length) return false`
    не розпізнавався як порівняння довжин.
  - Після сліпого рев'ю всієї гілки: `fc40a70` (контрприклади до `check-contract.mjs`: незахищений колбек, проігнорований
    `timingSafeEqual`, `import * as`, дані форми в журналі, ліміт лише за `content-length`, `--changed-since` у підтеці),
    `3dbc7c6` і `5f83104` (узгодження текстів обох скілів). Самотест — 33/33, вивід на `main` не змінився, числа A/B
    вище не змінились.
- **Виправлення коду за сліпим рев'ю** (після перенесення, окремими комітами): `79d721f` — немає змінної середовища →
  запит `failed`, а не вічне «У черзі»; `a0773fb` — тіло колбека читається потоком з обривом на 64 КБ (chunked-запит
  без `content-length`); `6681c69` — пізній підписаний колбек може виправити `failed` з боку тригера; `242d017` —
  межі довжини полів і бюджет як текст (`5,000` більше не губиться мовчки); `acbed72` — UUID для `lead-created`,
  аудит в окремому `after()`, CRLF у нотатках.
- **Ключі контракту в `.env.example`:** `N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook`,
  `N8N_WEBHOOK_TOKEN=change-me-webhook-token`, `N8N_CALLBACK_SECRET=change-me-callback-secret`,
  `APP_BASE_URL=http://127.0.0.1:3000`; `/webhook-test/` немає. У `.env.local` — ті самі 4 ключі зі
  згенерованими значеннями; у git файл не потрапляє, що підтверджує `git check-ignore`.
- **`npm run lint`, `npm run build` на гілці:** без помилок і попереджень; у збірці `ƒ /api/n8n/[event]`,
  `ƒ /quotes/[id]`, `○ /quotes/new`.
- **`check-contract.mjs` на фінальному коді** (увесь код, без `--changed-since`), exit 0:
  ```
  C1   PASS no n8n test URL (/webhook-test/)
  C2   PASS no NEXT_PUBLIC_N8N_* variables
  C3   PASS n8n calls only in lib/n8n/client.ts (server-only)
  C4   PASS timeout on every n8n fetch
  C5   PASS x-n8n-token, idempotency-key, x-correlation-id on every n8n fetch
  C6   PASS Server Actions call n8n only inside after()
  C7   PASS callback: raw body, JSON only after signature check
  C8   PASS callback: length check + timingSafeEqual, no ===
  C9   PASS callback: +-300 s timestamp window
  C10  PASS callback: 64 KB limit -> 413
  C11  PASS no runtime = "edge"
  C12  PASS .env.example and N8N_* names follow the contract
  C13  PASS no bodies, PII or secrets in logs
  Summary: 13 PASS, 0 FAIL, 0 N/A
  ```
- **Сценарій «форма → колбек → `/quotes/<id>`» на гілці** (продакшн-збірка, той самий мок з `.env.local`
  гілки, після виправлень за рев'ю):
  - форма кошторису → 303 за 13 мс;
  - мок — `POST /webhook/quote-request -> 202 in 1 ms auth=ok idempotency=new`, потім
    `callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 36 ms (try 1/3)`;
  - `/quotes/<id>` — «У черзі» → «Кошторис готовий · Завантажити кошторис (PDF)»;
  - форма з помилками без JS: `role="alert"`, 4 поля з `aria-invalid="true"`, введене (зокрема бюджет `5,000`) на місці;
  - стара форма заявки: відповідь за 135 мс, мок — `POST /webhook/lead-created -> 202 in 0 ms auth=ok idempotency=new`;
  - матриця колбеків (`send-signed-callback.mjs`) — 12/12 як очікувано, зокрема chunked-тіло > 64 КБ без `content-length` → 413;
  - без `APP_BASE_URL` (шаблонна копія) запит стає `failed`, у журналі — лише `misconfigured APP_BASE_URL is not set`;
  - журнал сервера — лише рядки `n8n out/in` з подією, correlation id, кодом і розміром; email, компанії й
    опису — 0 входжень.
- **Реєстр інтеграцій:** `docs/n8n-integrations.md` — `quote-request` (Respond to Webhook 202 + колбек) і
  `lead-created` (Immediately).

## Висновок

Скіл змінив результат суттєво й стабільно:

- **Зі скілом (3 з 3):** код прогону — 0 FAIL за 13 перевірками контракту; сценарій з моком працює (202 з
  `auth=ok`, підписаний колбек прийнято, статус «готовий»); форма відповідає за 12 мс.
- **Без скіла (3 з 3):** 8–9 FAIL; тестовий URL; немає Header Auth та ідемпотентності; статичний секрет
  замість підпису (в A2 — ще й секрет у тілі запиту до n8n); ПД на статус-сторінці.

Без скіла агент брав домовленості з наявного коду: `/webhook-test/` він скопіював зі старого `.env.example`.
Решта — з документації Next.js, звідти `after()` в A2. Це загальна практика, але не рішення команди.

Межа скіла: він покриває новий код інтеграції. Форма без доступних помилок і старий `lead-created` лишились
за людиною. Після прогонів у скрипті скіла виправлено два хибні FAIL (C6, C8) і попередження lint. Наступне,
що варто додати, — посилання на `building-client-form` у кроці про форму, щоб агент з обома скілами брав
UI-патерн звідти.
