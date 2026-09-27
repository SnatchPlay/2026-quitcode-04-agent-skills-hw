---
name: building-client-form
description: >-
  Патерн команди для форм у Next.js 16 App Router: Server Action з перевіркою сесії, прав і валідацією
  всередині дії, useActionState, доступні помилки полів, збереження введеного після помилки, мала
  відповідь { status, … }, жодних персональних даних у журналах, повільні побічні ефекти в after().
  Use when додаєш або виправляєш форму, що щось надсилає на сервер: заявка, кошторис, зворотний
  зв'язок, нотатка, налаштування, зміна статусу. Тригери: «додай форму…», «форма заявки», «форма
  зворотного зв'язку», «додай поле до форми», «помилки валідації не видно», «форма губить введене»,
  «зроби Server Action для форми», «форма довго думає після відправки».
  Не для: фільтрів і пошуку без відправки на сервер, форми входу через стороннього провайдера,
  самого контракту з n8n (виклик вебхука й колбек — окремий скіл команди).
metadata:
  owner: studio-nova-dev
  version: "0.1.0"
---

# Форма з Server Action

Кожна форма агенції — публічний POST-ендпоінт, який бачить скрінрідер і на який користувач чекає.
Тому форму робимо одним способом: права й валідація на сервері, помилки чути, введене не зникає,
відповідь мала, повільне — після відповіді.

## Коли застосовувати

- Нова форма або зміна наявної: сторінка, Client Component з `<form>`, Server Action у `app/**/actions.ts`.
- **Не** застосовувати до пошуку/фільтрів без мутації на сервері і до контракту n8n.

## Як робимо

1. **Дія** — файл з `"use server"`. Server Action — публічний POST: `proxy.ts` і перевірка на сторінці
   її не захищають (`server-auth-actions`). У такому порядку, до будь-якого запису:
   1. сесія — `await getCurrentUser()` (у публічної форми сесії немає — тоді крок пропускаємо свідомо й пишемо чому);
   2. права — ресурс належить workspace користувача (`lead.workspaceId === workspace.id`), інакше `throw`;
   3. валідація `FormData` — довжини, формати, значення зі списку; `FormData.get()` — завжди `unknown`.
2. **Відповідь дії** — лише `{ status: "ok", id? }` / `{ status: "invalid", errors, values }` / `{ status: "error" }`
   (або `redirect()` на сторінку створеного запису).
   Ніколи не рядок з бази й не весь об'єкт: усе повернене серіалізується в клієнт (`server-serialization`).
   `values` — лише те, що ввів користувач, щоб повернути його в поля.
3. **Повільне — в `after()`**: листи, n8n, аудит, аналітика (`server-after-nonblocking`). Дія зберігає запис
   і відповідає; Next.js виконує Server Actions по одній на клієнта, тож очікування блокує наступну дію.
4. **Журнали** — подія, id запису, код, тривалість. Ніколи `formData`, email, телефон, ім'я, IP, тіло запиту.
5. **Клієнт** — `useActionState(action, { status: "idle" })`, `<form action={formAction}>`: форма працює й
   без JavaScript. Кнопка `disabled={pending}` з текстом «Надсилаємо…».
6. **Доступність**: кожне поле — `<label htmlFor>`; поле з помилкою — `aria-invalid` і `aria-describedby`
   на текст помилки з унікальним `id`; над формою підсумок у `role="alert"`.
7. **Введене не зникає**: React 19 скидає неконтрольовані поля після дії — тому `defaultValue={values?.x}`,
   а для `<select>` і чекбоксів ще `key={values?.x}`, бо змінений `defaultValue` після монтування не діє.
8. **Id запису — прихованим полем**, не `action.bind(null, id)`: у Next.js 16.3.5 прив'язана дія в
   `useActionState` без JavaScript не отримала відповіді (перевірено в цьому проєкті: `curl -m 15` — timeout, з
   прихованим полем — 200), хоча `forms.md` у документації Next.js стверджує, що `bind` підтримує прогресивне покращення. Id з форми —
   такий самий ненадійний ввід, тому права перевіряє дія (крок 1.2).

```tsx
// app/dashboard/leads/[id]/actions.ts
"use server";
import { after } from "next/server";
import { logAudit } from "@/lib/audit";
import { getCurrentUser, getLead, getWorkspace } from "@/lib/data";
import { db } from "@/lib/db";

export type NoteState =
  | { status: "idle" | "ok" }
  | { status: "invalid"; errors: { text?: string }; values: { text: string } };

export async function addNote(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const rawId = formData.get("leadId");
  const leadId = typeof rawId === "string" ? rawId : "";
  const user = await getCurrentUser();
  const [workspace, lead] = await Promise.all([getWorkspace(user.workspaceSlug), getLead(leadId)]);
  if (!lead || lead.workspaceId !== workspace.id) throw new Error("Lead not found");

  const raw = formData.get("text");
  const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : ""; // браузер шле CRLF
  if (text.length === 0 || text.length > 500) {
    return { status: "invalid", errors: { text: "Від 1 до 500 символів" }, values: { text } };
  }
  if (!(await db.appendNote(leadId, text))) throw new Error("Lead not found"); // видалено між перевіркою й записом
  after(() => logAudit("lead.note_added", leadId));
  return { status: "ok" };
}
```

```tsx
// компонент форми, "use client"
const [state, formAction, pending] = useActionState(addNote, { status: "idle" });
const errors = state.status === "invalid" ? state.errors : {};
const values = state.status === "invalid" ? state.values : undefined;

<form action={formAction} noValidate>
  <input type="hidden" name="leadId" value={leadId} />
  {state.status === "invalid" && <p role="alert">Перевірте поля, позначені нижче.</p>}
  <label htmlFor="note-text">Нотатка</label>
  <textarea id="note-text" name="text" maxLength={500} defaultValue={values?.text}
    aria-invalid={errors.text ? true : undefined}
    aria-describedby={errors.text ? "note-text-error" : undefined} />
  {errors.text && <p id="note-text-error">{errors.text}</p>}
  <button type="submit" disabled={pending}>{pending ? "Надсилаємо…" : "Додати"}</button>
</form>
```

## Чекліст

```
- [ ] 1. Дія перевіряє сесію і права до першого запису (або публічність записано явно).
- [ ] 2. Валідація — у дії, на сервері; атрибути HTML (required, maxLength) — лише підказка.
- [ ] 3. Дія повертає { status, id?, errors?, values? } (або redirect) і нічого з бази.
- [ ] 4. Листи, n8n, аудит — в after(); дія не чекає зовнішніх сервісів.
- [ ] 5. Жодного console.* з formData, email, телефоном, іменем чи тілом запиту.
- [ ] 6. label/htmlFor, aria-invalid, aria-describedby, підсумок role="alert".
- [ ] 7. Після помилки введене на місці, включно з <select> і чекбоксами.
- [ ] 8. Форма відправляється без JavaScript; id запису — прихованим полем, не через .bind().
```

## Правила зупинки — зупинись і спитай людину, якщо:

- дія має писати дані без сесії, а форма не публічна, або незрозуміло, хто має право на ресурс;
- у відповідь дії чи в журнал треба покласти персональні дані;
- дія мусить синхронно дочекатися зовнішнього сервісу, щоб відповісти (результат замість цього показує сторінка статусу);
- валідацію пропонують лише на клієнті.

## Verify — задача готова, лише коли:

- [ ] `npm run lint` і `npm run build` без помилок.
- [ ] Порожня відправка: помилка біля поля, `role="alert"` над формою, введене на місці.
- [ ] Відправка з вимкненим JavaScript доходить до дії й показує результат.
- [ ] Виклик дії без cookie сесії (прямий `POST` з заголовком `Next-Action`) нічого не змінює.
- [ ] Журнал сервера після відправки: немає тексту полів, email, телефонів.
- [ ] Відповідь форми не чекає на зовнішні сервіси (DevTools → Network, час `POST`).
