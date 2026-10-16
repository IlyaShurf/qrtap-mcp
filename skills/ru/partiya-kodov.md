# Скилл: массовая выдача кодов на партию

## Задача

Выпустить сразу много кодов: наклейки на партию товара, коды на столы, витрины сети,
коды для филиалов или партнёров. До 500 штук одним запросом, с готовыми файлами для печати
и общей статистикой по всей партии.

## Когда применять

- Тираж наклеек, где на каждой единице свой код.
- Сеть из десятков точек, и по каждой нужно видеть сканы отдельно.
- Партнёрская программа: у каждого партнёра свой код и свой отчёт.
- Оборудование: код на каждом станке ведёт на его инструкцию.

Для одного-двух кодов проще обычный `POST /api/v1/codes` — см.
[скилл про меню](menu-bez-perepechatki.md).

## Требуется платный тариф

`POST /api/v1/codes/bulk` — платная возможность. На бесплатном тарифе приходит:

```json
{"error": "plan_required", "detail": "…available on a paid plan…", "plan": "FREE", "upgrade_url": "…"}
```

со статусом `402`. Это не отказ в доступе: запрос корректен, не хватает тарифа.

Проверить тариф стоит **до** того, как готовить файл на 300 позиций. Запасной путь на
бесплатном — цикл из обычных `POST /api/v1/codes`, но суточная квота там 100 запросов, то
есть партия больше сотни за сутки не пройдёт. Скажите об этом пользователю прямо, а не
упирайтесь в ошибку на середине выгрузки.

## Ключевые понятия

**`external_ref`** — ваш идентификатор кода: номер филиала, артикул, id партнёра, номер
стола. До 200 символов, уникален в рамках организации. Создание идемпотентно по нему:
повторный вызов с тем же `external_ref` вернёт существующий код, а не создаст дубль. Именно
поэтому частично сбойнувшую партию можно спокойно прогнать заново.

**`group`** — корзина для аналитики, одно из пяти значений: `partner`, `equipment`,
`event_menu`, `bag_insert`, `training`. Коды с одной группой суммируются одним запросом.
Свои значения группы придумать нельзя — под нестандартный признак используйте `external_ref`
с префиксом, например `shop-07`, `shop-08`.

## Шаги

### 1. Подготовить список

Каждому элементу нужен `target_url`. Практически всегда стоит добавить `external_ref` и
`group`, иначе партия потом не соберётся в отчёт.

```json
[
  {"target_url": "https://example.com/shop/07", "external_ref": "shop-07", "group": "partner", "label": "Филиал 07, Аламедин"},
  {"target_url": "https://example.com/shop/08", "external_ref": "shop-08", "group": "partner", "label": "Филиал 08, Джал"},
  {"target_url": "https://example.com/shop/09", "external_ref": "shop-09", "group": "partner", "label": "Филиал 09, Восток"}
]
```

### 2. Создать партию

Тело запроса — сам массив, без обёртки. Максимум 500 элементов; если больше, делите на части.

**Через MCP** (там поля называются `url` и `title`, сервер переводит их в `target_url` и
`label`):

```
qrtap_create_codes_bulk(items = [
  {"url": "https://example.com/shop/07", "external_ref": "shop-07", "group": "partner", "title": "Филиал 07"},
  {"url": "https://example.com/shop/08", "external_ref": "shop-08", "group": "partner", "title": "Филиал 08"}
])
```

**Через HTTP:**

```bash
curl -s -X POST https://app.qrtap.kg/api/v1/codes/bulk \
  -H "Authorization: Bearer $QRTAP_API_KEY" \
  -H "Content-Type: application/json" \
  -d @batch.json
```

### 3. Разобрать ответ

Ответ поэлементный — одна плохая ссылка не роняет всю партию:

```json
{
  "created": 2,
  "failed": 1,
  "data": [
    {"ok": true, "id": "…", "external_ref": "shop-07", "short_url": "https://app.qrtap.kg/a1b2", "png_url": "…"},
    {"ok": true, "id": "…", "external_ref": "shop-08", "short_url": "https://app.qrtap.kg/c3d4", "png_url": "…"},
    {"ok": false, "external_ref": "shop-09", "error": "invalid_url"}
  ]
}
```

Порядок действий при `failed > 0`: собрать элементы с `ok: false`, исправить причину
(`invalid_url` — битый адрес, `unknown_design_template` — чужой или несуществующий шаблон) и
отправить **только их** повторно. Успешные не пострадают: `external_ref` защищает от дублей.

Ответ стоит сохранить в CSV — он связывает ваш `external_ref` с `short_url` и `id`:

```bash
curl -s -X POST https://app.qrtap.kg/api/v1/codes/bulk \
  -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" \
  -d @batch.json \
| python3 -c "
import json,sys,csv
out=csv.writer(sys.stdout); out.writerow(['external_ref','id','short_url','error'])
for i in json.load(sys.stdin)['data']:
    out.writerow([i.get('external_ref'), i.get('id',''), i.get('short_url',''), '' if i.get('ok') else i.get('error')])
" > partiya.csv
```

### 4. Забрать файлы для печати

Артефакты запрашиваются по одному, с тем же ключом. Для тиража нужен PDF или SVG:

```bash
while IFS=, read -r ref id short err; do
  [ -z "$id" ] && continue
  curl -s -H "Authorization: Bearer $QRTAP_API_KEY" \
    "https://app.qrtap.kg/api/v1/codes/$id/qr?format=pdf" -o "qr-$ref.pdf"
  sleep 0.6   # минутный бюджет: 60/120/300 в зависимости от тарифа
done < <(tail -n +2 partiya.csv)
```

Пауза здесь не для красоты: без неё сотня кодов упирается в лимит и получает `429`.
Для PNG задавайте `size` — примерно 2000 для печати, около 1080 для экрана.

### 5. Брендировать партию (необязательно)

Если у организации есть шаблон оформления, его id подставляется каждому элементу:

```bash
curl -s -H "Authorization: Bearer $QRTAP_API_KEY" https://app.qrtap.kg/api/v1/design-templates
```

Дальше в каждый элемент партии добавляется `"design_template_id": "<uuid>"`. Шаблоны
создаются владельцем в кабинете: они содержат данные логотипа, и через ассистента их не
заводят.

При рендере платформа проверяет читаемость и, если логотип мешает, уменьшает или снимает
его. Итог сообщает заголовок `X-QRTap-QA`: `branded`, `downgraded` или `plain`.

### 6. Отчёт по всей партии

Сумма по группе одним запросом, без обхода кодов:

```bash
curl -s -H "Authorization: Bearer $QRTAP_API_KEY" \
  "https://app.qrtap.kg/api/v1/groups/partner/stats?from=2026-07-01T00:00:00Z"
```

Ответ: `codes` (сколько кодов в группе), `total`, `by_day`, `by_device`.

Сравнить точки между собой — списком со сканами у каждого:

```bash
curl -s -H "Authorization: Bearer $QRTAP_API_KEY" \
  "https://app.qrtap.kg/api/v1/codes?group=partner&include=stats&limit=500"
```

Через MCP: `qrtap_group_stats(group)` и `qrtap_list_codes(group, include_stats = true)`.
Именно так, а не циклом из `qrtap_code_stats` по каждому коду — это лишние сотни запросов.

### 7. Перевести всю партию на новый адрес

Массового перенацеливания в API нет — только по одному коду, с паузой:

```bash
while IFS=, read -r ref id short err; do
  [ -z "$id" ] && continue
  curl -s -X PATCH "https://app.qrtap.kg/api/v1/codes/$id" \
    -H "Authorization: Bearer $QRTAP_API_KEY" -H "Content-Type: application/json" \
    -d "{\"target_url\": \"https://example.com/new/$ref\"}" > /dev/null
  sleep 0.6
done < <(tail -n +2 partiya.csv)
```

Действие публичное и массовое: сотни напечатанных кодов начнут вести в другое место.
Ассистент показывает пользователю размер партии и новый адрес и ждёт подтверждения.

## Как проверить результат

1. **Сошлось количество.** `created + failed` равно числу отправленных элементов.
2. **Нет провалов.** `failed: 0`, либо все причины разобраны и перевыпущены.
3. **Нет дублей.** `GET /api/v1/codes?group=partner&limit=500` возвращает ровно столько
   кодов, сколько точек, и `external_ref` не повторяются.
4. **Повтор безопасен.** Повторный прогон того же файла даёт `created` с теми же `id`, а не
   новые коды.
5. **Ссылки живые.** Выборочно `curl -sI <short_url>` по нескольким кодам — редирект на
   нужный адрес.
6. **Файлы получены.** Число файлов `qr-*.pdf` совпадает с числом успешных кодов.
7. **Аналитика собирается.** `GET /api/v1/groups/partner/stats` показывает `codes`, равный
   размеру партии.

## Типичные ошибки

| Симптом | Причина | Что делать |
|---|---|---|
| `400` на всю партию | Не массив, пустой массив или больше 500 элементов | Проверить формат, разбить на части по 500 |
| `invalid_url` у элемента | Адрес без схемы или длиннее 2048 символов | Исправить и переотправить только этот элемент |
| `unknown_design_template` | Шаблон чужой организации или удалён | Взять актуальный id из `GET /api/v1/design-templates` |
| `429 scope=minute` при выгрузке файлов | Минутный бюджет (60/120/300 по тарифу) | Пауза 0.5–1 с между запросами, соблюдать `Retry-After` |
| `429 scope=day` | Кончилась суточная квота (100/5 000/50 000) | Продолжить после полуночи UTC либо перейти на старший тариф |
| `402 plan_required` на `/codes/bulk` | Bulk не входит в бесплатный тариф | Перейти на платный либо выпускать коды циклом `POST /api/v1/codes` в пределах суточной квоты |
| Дубли кодов | Партия прогнана без `external_ref` | Всегда задавать; при дублях лишние архивируются в кабинете |
| Группа не принимается | Значение вне списка из пяти | Использовать `partner`, `equipment`, `event_menu`, `bag_insert`, `training`; свой признак — в `external_ref` |
