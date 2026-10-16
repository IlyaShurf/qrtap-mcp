# Скиллы QRTap для ИИ-ассистентов

Готовые инструкции под конкретные задачи бизнеса. Каждый файл самодостаточен: его можно
целиком отдать ассистенту — Claude, ChatGPT, любому агенту с доступом к API — и он выполнит
сценарий, не читая остальную документацию.

*English index below — [Skills for AI agents](#skills-for-ai-agents).*

## Как пользоваться

Три способа, по возрастанию удобства:

1. **Скопировать в диалог.** Открыть файл, вставить его содержимое ассистенту, добавить свои
   данные (название заведения, ссылки, телефон). Работает в любом чате.
2. **Положить в проект.** Файлы из `ru/` кладутся в `.claude/skills/` или в папку проекта —
   ассистент подхватит их сам, когда задача совпадёт.
3. **Подключить MCP-сервер.** Установить [`qrtap-mcp`](../README.ru.md) —
   тогда вместо curl ассистент вызывает инструменты напрямую. В каждом скилле есть оба
   варианта: вызовы MCP и равнозначные HTTP-запросы.

## Что нужно один раз

- Аккаунт QRTap и API-ключ рабочего пространства:
  [app.qrtap.kg/workspace/api](https://app.qrtap.kg/workspace/api). Ключ выпускается на любом
  тарифе, включая бесплатный, — попробовать можно до покупки
  ([тарифы](https://app.qrtap.kg/pricing)).
- Ключ хранится в переменной окружения `QRTAP_API_KEY` или в блоке `env` MCP-клиента. Не в
  тексте промпта, не в репозитории, не в общем документе: ключ действует в правах всего
  рабочего пространства.

```bash
export QRTAP_API_KEY=qrtap_key_XXXX
curl -s -H "Authorization: Bearer $QRTAP_API_KEY" https://app.qrtap.kg/api/v1/codes
```

Без ключа тот же запрос отвечает `401 {"error":"unauthorized"}` — на этом удобно проверять,
что ключ вообще подхватился.

## Скиллы

| Скилл | Задача | Файл |
|---|---|---|
| Меню без перепечатки | QR на меню или прайс, содержимое меняется в любой момент | [ru/menu-bez-perepechatki.md](ru/menu-bez-perepechatki.md) |
| Страница специалиста | Визитка с контактами и услугами за пять минут | [ru/stranica-specialista.md](ru/stranica-specialista.md) |
| Один QR на отзывы | Гость сам выбирает 2ГИС, Google или Яндекс | [ru/odin-qr-otzyvy.md](ru/odin-qr-otzyvy.md) |
| Партия кодов | Наклейки, витрины, филиалы — до 500 кодов одним вызовом | [ru/partiya-kodov.md](ru/partiya-kodov.md) |
| Заявки на запись | Приём заявок с публичной страницы и работа с ними | [ru/zayavki-na-zapis.md](ru/zayavki-na-zapis.md) |

## Что стоит знать до начала

**Главная идея продукта.** QR-код кодирует постоянную короткую ссылку, а адрес назначения за
ней меняется сколько угодно раз. Печатать код нужно один раз; дальше меняется только то, куда
он ведёт. На этом построены почти все сценарии ниже.

**Читать перед перезаписью.** `PATCH /api/v1/pages/{slug}` и `PUT .../smart-rules` заменяют
содержимое целиком: всё, что не передано, стирается. Сначала прочитать текущее состояние,
внести правку, отправить объект целиком.

**Спрашивать перед публичными действиями.** Смена адреса живого кода, публикация или скрытие
отзыва, подтверждение заявки меняют то, что видят реальные клиенты. Ассистент показывает, что
собирается сделать, и ждёт согласия.

**Лимиты.** Действуют два бюджета сразу — в минуту и в сутки, оба по тарифу:

| Тариф | В минуту | В сутки | Ключей | Bulk и scan-вебхуки |
|---|---|---|---|---|
| Бесплатный | 60 | 100 | 1 | нет |
| Стандартный | 120 | 5 000 | 3 | да |
| Полный | 300 | 50 000 | 10 | да |

При превышении приходит `429` с указанием, что кончилось: `scope=minute` — ждать секунды,
`scope=day` — до полуночи UTC. Партию кодов создавать через `/codes/bulk`, а не циклом; на
бесплатном тарифе bulk отвечает `402 plan_required`.

---

# Skills for AI agents

Ready-made instructions for concrete business jobs. Each file is self-contained: hand the
whole thing to an assistant and it can run the scenario without reading anything else. The
Russian versions in `ru/` are the full ones; `en/` holds shorter English equivalents.

| Skill | Job | File |
|---|---|---|
| Changeable menu | A QR on a menu or price list you can update without reprinting | [en/changeable-menu.md](en/changeable-menu.md) |
| Specialist page | A business card page with contacts and services in five minutes | [en/specialist-page.md](en/specialist-page.md) |
| Review router | One QR, guest picks 2GIS, Google or Yandex | [en/review-router.md](en/review-router.md) |
| Bulk codes | Stickers, shop windows, branches — up to 500 codes in one call | [en/bulk-codes.md](en/bulk-codes.md) |
| Booking inbox | Take booking requests from a public page and work through them | [en/booking-inbox.md](en/booking-inbox.md) |

Setup is the same: a QRTap workspace API key from
[app.qrtap.kg/workspace/api](https://app.qrtap.kg/workspace/api), exported as
`QRTAP_API_KEY`, or the [`qrtap-mcp`](../README.md) server configured in
your MCP client. API reference: [app.qrtap.kg/developers](https://app.qrtap.kg/developers).

Three things carry across every skill: a code's printed link is permanent while its
destination stays editable; page and smart-rule writes replace content wholesale, so read
first and merge; and anything that changes what customers see needs the user's confirmation
before the call.
