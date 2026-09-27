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
