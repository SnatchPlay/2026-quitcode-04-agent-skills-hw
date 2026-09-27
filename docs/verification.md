# Перевірка (Task A–C)

> Лише те, що справді сталося: команди, їхній вивід, SHA комітів. Прогони A/B і фіча «запит на
> кошторис» — у `docs/ab-validation.md` (Task D), тест спрацювання — у `docs/trigger-evals.md` (E2).

- **Інструмент і версія, модель:** Claude Code 2.1.278 · основна сесія — claude-opus-5-5; headless-рев'ю Task A (`claude -p`) — `claude-opus-5[1m]` (з події `init` у журналі сесії); модель інших headless-прогонів вказано біля кожного
- **ОС і термінал, Node:** macOS (Darwin 25.6) · zsh · Node 24.16.0

## Скіли видно у свіжій сесії

- Як перевіряли: `claude -p "/context"` з кореня репозиторію (свіжа сесія), розділ Skills.

| Skill | Звідки | Примітка |
|---|---|---|
| `vercel-react-best-practices` | Project | після коміту `d5aad7a` |
| `building-client-form` | Project | після коміту `eb74387`; видно в `/context` з `--setting-sources project,local` |
| `integrating-n8n-webhooks` | Project | після коміту `e8857a4`; перевірка видимості в копіях A/B — `docs/ab-validation.md` |

- Особисті скіли, які теж видно: `code-craft`, `find-skills`, `no-mistakes` (User) і скіли `anthropic-skills:*`
  (claude.ai sync), а також `~/.claude/CLAUDE.md` у Memory files. `find-skills` поставив сам CLI `skills`
  під час Task A (див. `docs/skill-review.md`, розділ 6). На рев'ю в Task A вони не вплинули: у журналі тієї
  сесії викликано лише `vercel-react-best-practices`. Для A/B (Task D) їх прибирає `--setting-sources`.

## Task A — виправлення за скілом Vercel

### Рев'ю застосунку за скілом

Свіжа headless-сесія, без права змінювати файли:

```bash
claude -p --output-format stream-json --verbose --allowedTools "Skill,Read,Grep,Glob" \
  --disallowedTools "Edit,Write,NotebookEdit,Bash" < review-prompt.txt > review-run.jsonl
```

Запит — з walkthrough, крок 5.1. У журналі: `"skill":"vercel-react-best-practices"` (2 входження),
51 крок, `permission_denials: []`. Агент прочитав `SKILL.md` і 15 файлів `rules/`, увесь `app/`,
`components/`, `lib/` і сам відкрив `node_modules/next/dist/docs/` (`after.md`, `lazy-loading.md`,
`optimizePackageImports.md`). Результат — 17 рядків «файл:рядок | id | що не так | виправлення». Застосовано
п'ять пунктів нижче, решту описано в «що не застосували».

### Як міряли

Продакшн-збірка (`npm run build && npm start`), журнал сервера — у файл. Для кожного стану — той самий
скрипт: прогрів, один запит для лічильників `db:*` (різниця останніх значень `console.count` до й після
запиту), 3 прогони `curl -w "TTFB %{time_starttransfer}s, total %{time_total}s"` з cookie
`leaddesk_session=demo-u_olena`, `curl … | wc -c` для HTML і для `-H "RSC: 1"`, `grep -o '"<поле>"'` у
RSC-відповіді, сума розмірів JS-чанків, на які посилається HTML `/dashboard` (raw і `gzip -9`). Після кожного
виправлення — `npm run lint` і `npm run build` без помилок, потім той самий замір.

### Результати

| Правило (id) | Коміт | Файли | Що змінилось | Було (`main`) | Стало | Як міряли |
|---|---|---|---|---|---|---|
| `async-parallel` | `e6a4386` | `app/dashboard/page.tsx` | три незалежні запити (400 + 1200 + 400 мс) — через `Promise.all` | `/dashboard` 2.239 / 2.228 / 2.236 с | 1.432 / 1.430 / 1.430 с | `curl` total, 3 прогони |
| `server-cache-react` | `9048309` | `lib/data.ts` + 4 виклики `getWorkspace` | `getCurrentUser` у `cache()`; `getWorkspace(slug)` замість `getWorkspace({ slug })` | `getUserBySession` 3, `getWorkspace` 3 на запит | 1 і 1 | лічильники `db:*` на один запит |
| `server-serialization` | `e05b05f` | `app/dashboard/page.tsx`, `components/leads-table.tsx` | у `LeadsTable` іде `LeadRow` з 5 полів замість повного `Lead` | RSC 315 197 Б, HTML 424 592 Б; `internalNotes`/`ipAddress`/`rawPayload` по 172 входження | RSC 31 257 Б, HTML 111 377 Б; усі три — 0 (а також `email`, `phone`, `userAgent`) | `curl … \| wc -c`, `grep -o` у RSC |
| `server-auth-actions` | `6bf349e` | `app/actions.ts` | `updateLeadStatus`/`deleteLead` перевіряють сесію, належність ліда до workspace користувача і сам статус | анонімний `POST /` з `Next-Action: <id deleteLead>` видалив `lead_0001` (сторінка ліда → 404) | той самий запит: лід живий (200), `db:deleteLead` не викликано жодного разу; чужий workspace → `Error: Lead not found`; статус `hacked` → `Error: Unknown lead status`; власник і статус `won` → змінено | прямі виклики дій через `Next-Action` (id з `.next/server/server-reference-manifest.json`) до й після, на `git stash` |
| `bundle-dynamic-imports`, `bundle-conditional` | `9b7a449` | `components/leads-toolbar.tsx` | `exceljs` — `await import()` у обробнику експорту; `SourcesChart` — `next/dynamic` з `ssr: false` | JS при відкритті `/dashboard`: 10 чанків, 1827 KiB raw / 523 KiB gzip; exceljs і recharts у початковому чанку | 9 чанків, 573 KiB / 177 KiB; exceljs (931 KB) і recharts (358 KB) — лише в лінивих чанках | сума чанків з HTML; маркери `xl/workbook.xml` і `recharts-wrapper` у кожному чанку |

- **Основний замір — `async-parallel`**: найбільший і найпростіше відтворюваний ефект на те, на що скаржиться
  клієнт (сторінка довше 2 с). 1.43 с лишається через найповільніший запит — `getLeadStats` 1200 мс плюс
  `getUserBySession` і `getWorkspace` по 100 мс, які йдуть перед ним.
- `server-cache-react` майже не змінив час (1.43 → 1.42 с): layout, header і page рендеряться паралельно,
  тож дублікати запитів перекривались у часі. Виграш — у навантаженні на базу: 6 зайвих запитів на кожне
  відкриття сторінки.
- `bundle-dynamic-imports`: первинна перевірка знайшла рядок `xlsx` у початковому чанку `23yxgann1e0ly.js`
  (12 KB) — це ім'я файлу експорту з нашого коду, не exceljs; маркер `xl/workbook.xml` у ньому — 0.
  Перевірили в браузері, що нічого не зламали: «Показати графік джерел» → підвантажується чанк recharts,
  6 стовпців; «Експорт в Excel» → підвантажується чанк exceljs, файл `leads-2026-09-27.xlsx`, 18 704 Б
  (скачування перехоплено в тесті).
- Порада, яку звірили з документацією і змінили: `bundle-dynamic-imports` з `ssr: false` — лише в Client
  Component (`lazy-loading.md:94-95`), тому `next/dynamic` у `LeadsToolbar`, а не в сторінці. Деталі —
  `docs/skill-review.md`, розділ 5.
- Що не застосували і чому: `server-after-nonblocking` для `submitLead` — відкладено до Task D (виклик
  n8n переробляється за контрактом скіла, інакше BASE для A/B отримав би контракт заздалегідь);
  `async-suspense-boundaries` (стрімінг статистики) — змінює UX завантаження, для заявленої метрики вистачило
  `async-parallel`; `client-swr-dedup`, `rerender-derived-state-no-effect`, `bundle-barrel-imports` (lodash
  у `lead-search.tsx`) — одна переробка пошуку, окрема від скарги клієнта; `js-*`, `rendering-*` — ефект
  у межах похибки для 200 рядків.
- `npm run lint`, `npm run build` після кожного з п'яти виправлень — без помилок (журнали кожного
  прогону збережено поза репозиторієм).

## Task B — `building-client-form`

- Скіл: коміт `eb74387`; `name` = тека, `description` — 817 символів (≤ 1024), `SKILL.md` — 127 рядків.
- Запит у свіжій сесії (скіл не названо), з кореня репозиторію:
  > На сторінці ліда в дашборді (/dashboard/leads/[id]) додай форму «Додати нотатку»: одне текстове поле до 500 символів; нотатка дописується до внутрішніх нотаток ліда.

  ```bash
  claude -p --setting-sources project,local --strict-mcp-config --permission-mode acceptEdits \
    --allowedTools "Bash(npm run lint)" "Bash(npm run build)" "Bash(npx tsc --noEmit)" \
    --output-format stream-json --verbose < prompt1.txt > run1.jsonl
  ```
  `--setting-sources project,local` — щоб headless-агент не отримав особистий allowlist (там є `git push`)
  і особисті скіли. Модель — `claude-opus-5[1m]` (подія `init`); видимі скіли з `init`: `building-client-form`,
  `vercel-react-best-practices` і вбудовані Claude Code, особистих немає.
- **Чи спрацював скіл і як це видно:** так, з першої спроби. Перший виклик інструмента в сесії —
  `Skill` з `"skill":"building-client-form"`, до читання будь-якого файлу проєкту. `description` не змінювали.
- Що зробив агент (коміт `6f6e250` — без змін, як написав агент): Server Action `addNote` в `app/actions.ts`
  (сесія й належність ліда через наявний `requireLeadInUserWorkspace` до запису, валідація 1–500 символів,
  відповідь `{ status, errors, values }`, аудит в `after()`), `components/lead-note-form.tsx`
  (`useActionState`, `label htmlFor`, `aria-invalid`, `aria-describedby`, `role="alert"`,
  `defaultValue={values?.text}`), `db.appendNote`, `NOTE_MAX_LENGTH` у `lib/types.ts`. Агент сам прогнав
  `npm run lint` і `npm run build`, але решту Verify **не** зробив: `npm run dev` не було в дозволах, і він
  зупинився й написав, що не перевірено, замість обходити заборону. Ще дві відмови в журналі —
  `ls ~/.claude/skills`: агент шукав `code-craft`/`self-review`, яких вимагає мій глобальний `~/.claude/CLAUDE.md`.
- Пункти Verify зі скіла — перевірив я, на продакшн-збірці, запитами як від браузера **без** JavaScript
  (multipart з прихованими полями `$ACTION_*` з HTML форми + `Origin`), скрипт поза репозиторієм:

  | Пункт Verify | Результат |
  |---|---|
  | `npm run lint`, `npm run build` | без помилок |
  | Порожня відправка | на коді агента — **відповіді немає** (`curl -m 15` → timeout; той самий запит із заголовком `Next-Action`, як від JS-клієнта, — 200 за 0.21 с з `{"status":"invalid",…}`). Причина: `useActionState(addNote.bind(null, leadId))` — прив'язана дія без JS у Next.js 16.3.5 зависає. Після `bab74df` (id прихованим полем): HTTP 200, `role="alert"`, `aria-invalid="true"`, `aria-describedby="note-text-error"`, текст «Від 1 до 500 символів» |
  | Введене не зникає | 601 символ → помилка, перші 500 символів введеного — у `textarea` |
  | Відправка без JavaScript | валідна нотатка: HTTP 200 за 510 мс, нотатка на сторінці ліда |
  | Дія без сесії | cookie `demo-u_nobody` (проходить `proxy.ts`, бо той дивиться лише на наявність cookie) → 303 на `/login`, нотатку не записано; користувач іншого workspace (`demo-u_marta`) → `Error: Lead not found`, не записано |
  | Журнал сервера | 0 рядків із текстом нотатки; `db:appendNote` — 1 раз (лише валідна відправка), `db:insertAuditEntry` — 1 раз (в `after()`) |
  | Відповідь не чекає зовнішніх сервісів | аудит (250 мс) — в `after()`; 510 мс = сесія, лід, запис і повторний рендер сторінки |

- Що це змінило в скілі: приклад у самому `SKILL.md` містив той самий `.bind()` — агент його й повторив.
  Виправлено скіл (коміт `9283ab6`): id запису прихованим полем, крок 8 і пункт чекліста.

## Task C — `integrating-n8n-webhooks`

Тут скіл лише пакують. Застосовує його агент у прогоні **B** (Task D) — доказ спрацювання, журнал мока й
час відповіді форми — у `docs/ab-validation.md`.

- **Що лишили в `SKILL.md`, а що винесли в `references/`:** у `SKILL.md` (109 рядків, опис 894 символи) —
  таблиця «контракт коротко», 7 кроків, чекліст із 10 пунктів, правила зупинки, Verify з командами скриптів.
  Усе «чому» й повні таблиці — у `references/`: `contract.md` (змінні, запит, повтори, колбек,
  ідемпотентність, журнали, ліміти, реєстр), `callback-route.md` (10 кроків з кодами відповідей і причинами),
  `response-modes.md` (режими, 100 с / 524, тестовий vs production URL, пастки документації),
  `n8n-side-setup.md` (налаштування воркфлоу словами для клієнта), `code-templates.md` (код). Посилання — прямі
  з `SKILL.md`, без ланцюжків. Правила Vercel `server-auth-actions` і `server-after-nonblocking` — лише за id.
- **Доповнення поверх записки** (у скілі позначені як рішення команди): `redirect: "error"` у `fetch` до n8n;
  `callbackUrl` лише з `APP_BASE_URL`; успіх async-виклику — рівно `202` + `job_id`; 413 за `content-length`
  **до** читання тіла + повторна перевірка довжини сирого тексту; запис фічі шукаємо за
  `requestIdempotencyKey` (колбек може випередити `after()`); завершений стан не перезаписується; id запиту —
  `randomUUID()`, статус-сторінка без ПД.
- **Правила зупинки:** `/webhook-test/` у коді чи `.env.example`; секрет у клієнті / `NEXT_PUBLIC_*` / query /
  журналі / відповіді; синхронне очікування воркфлоу ≥ ~100 с чи невідомої тривалості; не-HTTPS нелокальний
  `N8N_WEBHOOK_BASE_URL`; `callbackUrl` чи адреса вебхука з вводу; `runtime = "edge"` або прибрати
  підпис/вікно/ідемпотентність; відповідь n8n не за контрактом; зміна чи експорт воркфлоу клієнта, код вузла Code.
- **SHA коміту зі скілом:** `e8857a4`. BASE для Task D — у `docs/ab-validation.md`.

### Шаблони коду перевірено до коміту

`references/code-templates.md` згенеровано з файлів, які перед тим у тимчасовій копії проєкту (поза
репозиторієм):

- `eslint` і `next build` — без помилок (TypeScript пройшов, маршрут `ƒ /api/n8n/[event]` у збірці);
- `check-contract.mjs` на копії — `Summary: 13 PASS, 0 FAIL, 0 N/A`, exit 0;
- наскрізно з моком (`--mode respond-202 --delay 3000`, `N8N_WEBHOOK_TOKEN` і `N8N_CALLBACK_SECRET`
  згенеровано у файл): форма без JS → 303 за 7 мс; мок —
  `POST /webhook/quote-request -> 202 in 1 ms auth=ok idempotency=new | headers: …,content-type,idempotency-key,…,x-correlation-id,x-n8n-token`,
  потім `callback POST http://127.0.0.1:3100/api/n8n/quote-request -> 202 in 36 ms (try 1/3)`; статус-сторінка
  `processing` → `ready`; журнал сервера — лише
  `n8n out event=quote-request correlation=… attempt=1 result=202 ms=8` і
  `n8n in event=quote-request correlation=… result=202 bytes=382`;
- `send-signed-callback.mjs` проти того ж роуту — 11/11 як очікувано (див. нижче).

**`check-contract.mjs` на коді `main`** (`git archive main | tar -x -C ../leaddesk-main`, `main` = `01a7dd4`),
exit 1:

```
check-contract · root ../leaddesk-main · 27 file(s)
C1   FAIL no n8n test URL (/webhook-test/)
       .env.example:6  test URL /webhook-test/
C2   PASS no NEXT_PUBLIC_N8N_* variables
C3   FAIL n8n calls only in lib/n8n/client.ts (server-only)
       app/actions.ts:54  fetch to n8n outside lib/n8n/client.ts
C4   FAIL timeout on every n8n fetch
       app/actions.ts:54  fetch to n8n without signal: AbortSignal.timeout(...)
C5   FAIL x-n8n-token, idempotency-key, x-correlation-id on every n8n fetch
       app/actions.ts:54  fetch to n8n without header(s): x-n8n-token, idempotency-key, x-correlation-id
C6   FAIL Server Actions call n8n only inside after()
       app/actions.ts:54  Server Action awaits n8n, not in after()
C7   N/A  callback: raw body, JSON only after signature check
C8   N/A  callback: length check + timingSafeEqual, no ===
C9   N/A  callback: +-300 s timestamp window
C10  N/A  callback: 64 KB limit -> 413
C11  PASS no runtime = "edge"
C12  FAIL .env.example and N8N_* names follow the contract
       app/actions.ts:54  N8N_WEBHOOK_URL is not a contract variable
       .env.example  missing N8N_WEBHOOK_BASE_URL
       .env.example  missing N8N_WEBHOOK_TOKEN
       .env.example  missing N8N_CALLBACK_SECRET
       .env.example  missing APP_BASE_URL
       .env.example:6  N8N_WEBHOOK_URL is not a contract variable
C13  PASS no bodies, PII or secrets in logs
Summary: 3 PASS, 6 FAIL, 4 N/A
```

C7–C10 на `main` — N/A, а не PASS: колбек-роуту там немає, перевіряти нічого.

**Що скрипт побачив на навмисно поганому коді.** Мутаційний самотест: чиста копія з шаблонами (0 FAIL) і
23 копії, у кожній зламано рівно одне. Перевірка вважається справжньою, якщо дає FAIL саме вона і exit 1.
Перший прогін пропустив дві речі — їх виправлено в скрипті до коміту: база `…/webhook-test` без кінцевого `/`
(C1 вимагав слеш) і порівняння `header === \`sha256=…\`` (C8 не бачив шаблонного рядка). Фінальний прогін:

```
clean copy: exit 0, Summary: 13 PASS, 0 FAIL, 0 N/A
ok   C1   test URL in .env.example                                -> FAIL, exit 1  .env.example:5  test URL /webhook-test/
ok   C2   NEXT_PUBLIC_N8N_ in a component                         -> FAIL, exit 1  components/leak.tsx:1  NEXT_PUBLIC_N8N_* reaches the client bundle
ok   C3   fetch to n8n from a Server Action file                  -> FAIL, exit 1  app/quotes/actions.ts:44  fetch to n8n outside lib/n8n/client.ts
ok   C3   client without import "server-only"                     -> FAIL, exit 1  lib/n8n/client.ts:2  first statement is not import "server-only"
ok   C4   timeout removed                                         -> FAIL, exit 1  lib/n8n/client.ts:54  fetch to n8n without signal: AbortSignal.timeout(...)
ok   C4   timeout only in a comment                               -> FAIL, exit 1  lib/n8n/client.ts:54  fetch to n8n without signal: AbortSignal.timeout(...)
ok   C4   timeout on another call in the same file                -> FAIL, exit 1  lib/n8n/client.ts:55  fetch to n8n without signal: AbortSignal.timeout(...)
ok   C5   x-correlation-id header removed                         -> FAIL, exit 1  lib/n8n/client.ts:54  fetch to n8n without header(s): x-correlation-id
ok   C6   Server Action awaits the client directly                -> FAIL, exit 1  app/quotes/actions.ts:34  triggerWorkflow() runs in the Server Action, not in after()
ok   C6   Server Action awaits a lib helper that calls the client -> FAIL, exit 1  app/quotes/actions.ts:45  startQuote() runs in the Server Action, not in after()
ok   C7   JSON parsed before the signature check                  -> FAIL, exit 1  app/api/n8n/[event]/route.ts:39  JSON parsed before the signature is verified
ok   C7   request.json() instead of request.text()                -> FAIL, exit 1  app/api/n8n/[event]/route.ts:25  body is not read with request.text()
ok   C8   signature compared with ===                             -> FAIL, exit 1  app/api/n8n/[event]/route.ts  timingSafeEqual is not used
ok   C8   === shortcut next to a real timingSafeEqual             -> FAIL, exit 1  app/api/n8n/[event]/route.ts:20  signature compared with ===/!== instead of timingSafeEqual
ok   C1   test URL hard-coded in the client                       -> FAIL, exit 1  lib/n8n/client.ts:3  test URL /webhook-test/
ok   C8   timingSafeEqual without a length check                  -> FAIL, exit 1  app/api/n8n/[event]/route.ts  no length check before timingSafeEqual (it throws on different lengths)
ok   C9   no timestamp window                                     -> FAIL, exit 1  app/api/n8n/[event]/route.ts  no +-300 s check of x-n8n-timestamp (Math.abs(now - timestamp) > 300)
ok   C10  no 64 KB limit                                          -> FAIL, exit 1  app/api/n8n/[event]/route.ts  no 64 KB body limit answered with 413
ok   C11  runtime = "edge" on the route                           -> FAIL, exit 1  app/api/n8n/[event]/route.ts:5  runtime = "edge" (node:crypto is required)
ok   C12  real-looking secret in .env.example                     -> FAIL, exit 1  .env.example:8  N8N_WEBHOOK_TOKEN: secrets in .env.example must be change-me-… placeholders (value not shown)
ok   C12  APP_BASE_URL missing, extra N8N_WEBHOOK_URL             -> FAIL, exit 1  .env.example  missing APP_BASE_URL
ok   C13  raw callback body logged                                -> FAIL, exit 1  app/api/n8n/[event]/route.ts:58  console.* logs a body, form data, PII, token or signature
ok   C13  email logged in the Server Action flow                  -> FAIL, exit 1  app/quotes/actions.ts:41  console.* logs a body, form data, PII, token or signature
all mutations caught, clean copy passes
```

Що скрипт **не** ловить (статичний аналіз, записую чесно): C9 і C10 перевіряють наявність вікна
(`Math.abs` + 300) і ліміту (64 КБ + 413) у файлі роуту, а не їхній порядок відносно читання тіла; C6
відстежує хелпери на один рівень вкладеності; C4/C5 розв'язують змінну опцій чи заголовків лише в тому
самому файлі. Порядок і поведінку колбека перевіряє `send-signed-callback.mjs` на запущеному застосунку.

**`--changed-since`** (копія `main` з власним `git init`, тег `base`): додано чисті файли шаблонів (untracked),
старий код не чіпали → `Summary: 12 PASS, 0 FAIL, 1 N/A`, exit 0 — старі FAIL з `app/actions.ts:54` не
рахуються; дописано один рядок `fetch(process.env.N8N_WEBHOOK_BASE_URL + "/x")` у кінець `app/actions.ts` →
C3, C4, C5, C6 FAIL саме на `app/actions.ts:79`, exit 1.

**Матриця колбеків** (`send-signed-callback.mjs` проти шаблонного роуту в копії):

```
callback matrix -> http://127.0.0.1:3100/api/n8n/quote-request (event quote-request.completed; no real request: valid case expects 404)
PASS  valid signed callback                    expected 404, got 404
PASS  same callback again (Retry On Fail)      expected 404, got 404
PASS  wrong signature                          expected 401, got 401
PASS  missing signature                        expected 401, got 401
PASS  timestamp 301 s in the past              expected 401, got 401
PASS  timestamp 301 s in the future            expected 401, got 401
PASS  body reformatted after signing           expected 401, got 401
PASS  idempotency-key not bound to the body    expected 400, got 400
PASS  content-type text/plain                  expected 415, got 415
PASS  unknown event in the path                expected 404, got 404
PASS  body over 64 KB                          expected 413, got 413
all cases as expected
```

Не перевірено тут: гілку «повторний колбек для **існуючого** запису → 200 `{"duplicate": true}`» — для неї
потрібен вихідний `idempotency-key` запису, а він зберігається лише в пам'яті сервера. Успішний шлях
(підписаний колбек для існуючого запису → 202) перевірено наскрізним прогоном з моком вище.

**`check-contract.mjs` на фінальному коді** (після перенесення прогону B) — у кінці `docs/ab-validation.md`.
