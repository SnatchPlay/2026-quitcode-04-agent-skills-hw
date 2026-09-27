# Рев'ю стороннього скіла: `vercel-react-best-practices`

> Рев'ю зроблено **до** встановлення (розділи 1–4 і 6 закомічено окремим комітом раніше за коміт
> зі скілом). Розділ 5 дописано після виправлень Task A — там поради, звірені з документацією
> Next.js 16.3.5 під час роботи.

**Дата, інструмент, ОС:** 27.09.2026 · Claude Code 2.1.278 · macOS (Darwin 25.6) + zsh · Node 24.16.0

## Що рев'юємо

| | |
|---|---|
| Репозиторій | <https://github.com/vercel-labs/agent-skills> |
| Тека в репозиторії → `name` | `skills/react-best-practices` → `name: vercel-react-best-practices` |
| Версія | тег `agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278` = коміт `063bee94c3f4df8453406c830b0a7df0f2860278` (28.08.2026) |
| Навіщо нам | клієнт скаржиться на `/dashboard` > 2 с і «задумливу» форму; експерта з продуктивності React у команді немає |

## 1. Подивитись, не встановлюючи

- Як дивились:
  1. `DISABLE_TELEMETRY=1 npx -y skills@1.7.0 add "vercel-labs/agent-skills#agent-skills-063bee94…" --list` —
     CLI показав 10 скілів пакета з описами, у репозиторій нічого не записав (`git status --short` порожній).
  2. `git clone --depth 1 --branch agent-skills-063bee94… https://github.com/vercel-labs/agent-skills.git ../review-agent-skills`
     (поза репозиторієм); `git rev-parse HEAD` = `063bee94c3f4df8453406c830b0a7df0f2860278`.
     Файли читали як дані, нічого з них не запускали.
- Склад скіла (`find skills/react-best-practices -type f | wc -l` → **76**; CLI не копіює `metadata.json`, тож після встановлення має бути 75):

  | Файл / тека | Розмір | Що це |
  |---|---|---|
  | `SKILL.md` | 7 251 Б | frontmatter + перелік 70 правил за категоріями, посилання на `rules/*.md` і `AGENTS.md` |
  | `AGENTS.md` | 108 261 Б | усі правила, зібрані в один документ |
  | `README.md` | 3 360 Б | опис структури для контриб'юторів |
  | `metadata.json` | 921 Б | версія, автор, список посилань; CLI його не встановлює |
  | `rules/` | 72 файли | 70 правил + `_sections.md` і `_template.md` |

- Frontmatter `SKILL.md`: `name`, `description`, `license: MIT`, `metadata` (`author: vercel`,
  `version: "1.0.0"`). **Немає** `allowed-tools`, `hooks`, `context`, `disable-model-invocation`.

## 2. Що скіл може виконати, завантажити чи змінити

| Перевірка | Результат | Як перевіряли |
|---|---|---|
| `scripts/` та інші виконувані файли | немає; єдиний не-markdown файл — `metadata.json` (дані) | `find "$S" -type f ! -name "*.md"` |
| `allowed-tools` | немає | frontmatter через `awk '/^---$/{n++; next} n==1'` |
| Команди під час рендеру `` !`cmd` `` | немає | `grep -rn '!\`' "$S"` — порожньо |
| Хуки, MCP-сервери, `plugin.json`, API-ключі | немає | `find "$S" -name "*hooks*.json" -o -name "*mcp*.json" -o -name "plugin.json" -o -name "settings*.json"` — порожньо; ключів не вимагає |
| Інструкції щось завантажити чи виконати | лише `npx svgo --precision=1 --multipass icon.svg` як приклад у правилі `rendering-svg-precision` (і його копія в `AGENTS.md:2477`) — порада людині оптимізувати SVG, не інструкція агенту виконати щось на старті | `grep -rnE "npx \|curl \|wget \|Invoke-WebRequest\|WebFetch" "$S"` |
| Посилання | 35 унікальних URL: react.dev, nextjs.org, vercel.com (блог, docs), swr.vercel.app, github.com/shuding/better-all, github.com/isaacs/node-lru-cache, MDN, webpack/vite/esbuild docs, npmjs, x.com/shuding і плейсхолдери `example.com` у прикладах коду. Жодного «прочитай інструкції звідси» | `grep -rhoE "https?://…" "$S" \| sort -u` |
| Приховані інструкції | не знайдено: жодного `ignore previous`, `system prompt`, HTML-коментарів; 0 файлів із zero-width символами | `grep -rniE "ignore (all \|the )?previous\|system prompt\|<!--"`; Node-скрипт з шаблону → `0 file(s) with zero-width characters` |

Спостереження під час рев'ю: коли робоча тека shell-сесії агента на мить опинилась у `../review-agent-skills`,
Claude Code автоматично підвантажив `CLAUDE.md` того репозиторію в контекст сесії (інструкції для
контриб'юторів Vercel про структуру скілів). Нічого з нього не виконувалось, тека одразу змінена
назад — але це підтверджує пораду шаблону: клон чужого репозиторію не можна відкривати як робочу теку агента.

## 3. Аудити

| Аудит | Результат | Дата аналізу |
|---|---|---|
| Gen Agent Trust Hub | PASS, risk level SAFE; як загальний ризик названо лише «поверхню для indirect prompt injection», бо скіл обробляє код користувача | 14.09.2026, 22:49 |
| Socket | PASS (malicious behavior, security concerns, obfuscation, suspicious patterns) | 14.09.2026, 22:49 |
| Snyk | PASS, risk level LOW, «No issues detected» | 14.09.2026, 22:48 |

- Де взяли: <https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices> і сторінки
  `…/security/agent-trust-hub`, `…/security/socket`, `…/security/snyk` (читали у вбудованому браузері;
  там же: 747.1K встановлень, 31.6K зірок, first seen 19.01.2026).
- Чому CLI не показав блок: у `--list` вище стояв `DISABLE_TELEMETRY=1` — з ним CLI аудити не завантажує
  взагалі. Встановлення в агентській сесії CLI сам запускає з `--yes`, тож навіть показаний блок не дав би
  шансу відмовитись. Тому встановлення запускає людина у своєму терміналі без `DISABLE_TELEMETRY` (розділ 6).
- До чого прив'язаний аудит: до «репозиторій + назва скіла», не до тега. Socket вказує лише хеш вмісту
  (`pkg:socket/skills-sh/…vercel-react-best-practices/@ca7b0c0c…`), без SHA коміту. Щоб зрозуміти, чи
  аудит стосується нашої версії, перевірили історію: `gh api repos/vercel-labs/agent-skills/compare/063bee94…...main`
  → `ahead_by=0` (наш тег і є поточний `main`), а останній коміт у `skills/react-best-practices` —
  `dc8367e6f91c` від 14.04.2026. Отже 14.09.2026 аудитори бачили ті самі файли, що в нашому тезі.
  Після оновлення тега цей висновок треба перевіряти заново.

## 4. Ліцензія й походження

- Ліцензія: MIT — у frontmatter `SKILL.md` (`license: MIT`) і в `README.md` кореня репозиторію
  (розділ «License»). Окремого файлу `LICENSE` у репозиторії немає, GitHub API показує `license: null`.
  Для внутрішнього використання копії з атрибуцією (файли не змінюємо) цього досить.
- Видавець і активність: організація `vercel-labs` (Vercel), репозиторій створено 08.12.2025, 31 612 зірок,
  2 767 форків, останній push 28.08.2026 (це і є наш тег; автор коміту — співробітниця Vercel).
  Сам скіл активно правили до 14.04.2026 («new rule», «update example»), відтоді стабільний.

## 5. Чи правдивий зміст для нашого стеку

Звіряли з `node_modules/next/dist/docs/` (Next.js 16.3.5), шлях — від цієї теки. Поради взято з рев'ю
застосунку, яке зробила свіжа сесія зі скілом (17 знахідок; `docs/verification.md`, Task A).

| Порада скіла (id) | Що каже скіл | Що каже документація нашої версії | Висновок |
|---|---|---|---|
| `async-parallel` | незалежні `await` → `Promise.all` | `01-app/01-getting-started/06-fetching-data.md:462-468` — послідовні `await` в одному компоненті блокують один одного; `:476` — «await them with `Promise.all`» | застосовано (`app/dashboard/page.tsx`), виміряно |
| `server-cache-react` | `React.cache()` для дедуплікації в межах запиту | `06-fetching-data.md:602-604` — мемоізація за тими самими аргументами, лише в межах одного запиту; автоматично мемоізується лише `fetch` (`04-functions/fetch.md:88`), а наша «база» — не `fetch` | застосовано; в нашому коді порада мала підступ: `getWorkspace` уже був у `cache()`, але з аргументом-об'єктом `{ slug }`, тож кеш ніколи не влучав — треба було змінити сигнатуру на рядок |
| `server-auth-actions` | Server Action — публічний ендпоінт, перевіряй сесію всередині | `01-app/02-guides/data-security.md:291` — «treat Server Actions as reachable via direct POST requests»; `:339`, `:368` — перевірка на рівні сторінки не поширюється на дії | застосовано; до виправлення анонімний POST з `Next-Action` видалив лід — `proxy.ts` цього не зупиняє |
| `bundle-dynamic-imports` | `next/dynamic` для важких компонентів | `01-app/02-guides/lazy-loading.md:66,94-95` — `ssr: false` працює лише в Client Components; у Server Component це помилка збірки | застосовано саме в `components/leads-toolbar.tsx` (`"use client"`). У `app/dashboard/page.tsx` (Server Component) та сама порада зламала б збірку |
| `bundle-barrel-imports` (`lodash`) | імпортувати напряму, не з барел-файлу | `02-pages/…/optimizePackageImports.md` і `01-app/03-api-reference/05-config/01-next-config-js/optimizePackageImports.md:21-25` — у дефолтному списку є `lodash-es`, **немає** `lodash` | порада для нашого `import { debounce } from "lodash"` правдива; у Task A не застосовували (див. «що не застосували» у `docs/verification.md`) |
| `server-after-nonblocking` | повільні побічні ефекти — в `after()` | `01-app/03-api-reference/04-functions/after.md:8` — працює в Server Functions і Route Handlers | правдива; для `submitLead` свідомо відкладено до Task D (виклик n8n переробляємо за контрактом скіла, інакше BASE для A/B отримав би частину контракту заздалегідь) |

## 6. Закріплення версії й коміт

- Команда встановлення (запускає людина у своєму терміналі, без `DISABLE_TELEMETRY`, щоб побачити
  «Security Risk Assessments» перед «Proceed with installation?»; scope — **Project**):
  ```bash
  npx skills@1.7.0 add vercel-labs/agent-skills#agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278 \
    --skill vercel-react-best-practices -a claude-code --copy
  ```
- Де лягли файли (перевірено після встановлення): `.claude/skills/vercel-react-best-practices/` — 75
  справжніх файлів (`find … -type f | wc -l` → 75, `find .claude/skills -type l` → порожньо);
  `diff -r` з переглянутим клоном тега — єдина відмінність `Only in …: metadata.json`, тобто встановлено
  рівно те, що рев'ювали. `.agents/` у проєкті немає.
- Що потрапило в git (коміт `d5aad7a`): тека скіла і `skills-lock.json` з `"source": "vercel-labs/agent-skills"`,
  `"ref": "agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278"`, `"computedHash": "3219a194…"`.
- **Побічний ефект CLI, якого немає в документації walkthrough:** під час встановлення `skills@1.7.0`
  запропонував і поставив **глобальний** особистий скіл `find-skills` (`vercel-labs/skills`) у
  `~/.claude/skills/find-skills/` з записом у `~/.agents/.skill-lock.json` — без тега, без рев'ю, поза
  проєктом. Його опис радить агенту шукати й ставити скіли через `npx skills add`, що суперечить розділу
  безпеки `AGENTS.md`. `claude -p "/context"` у проєкті показує його як `find-skills | User`. У git він
  не потрапив, але видно його в кожній сесії на цій машині, і він забруднив би обидві гілки A/B (Task D).
  Висновок: на запитання CLI про `find-skills` відповідати «ні».
- Як оновлювати: та сама команда з новим тегом → `git diff .claude/skills/vercel-react-best-practices skills-lock.json`
  → рев'ю змін за цим чеклістом (нові скрипти, `allowed-tools`, посилання, приховані інструкції) → окремий
  коміт. Файли скіла вручну не редагуємо.

## Вердикт

**Встановити з умовами.** Ризик низький: скіл — лише текст (жодних скриптів, хуків, MCP, `allowed-tools`,
мережевих інструкцій агенту), видавець — Vercel, три незалежні аудити PASS для вмісту, ідентичного нашому
тегу. Умови: версія закріплена тегом і перевіряється через `skills-lock.json`; кожну пораду перед
застосуванням звіряємо з документацією Next.js 16.3.5 у `node_modules/next/dist/docs/` (скіл писали не під
конкретну версію — розділ 5); оновлення — лише новим тегом з повторним рев'ю.
