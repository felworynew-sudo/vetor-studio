# Зеркало моделей на VPS

Нейросети инструментов качаются с нашего сервера `https://api.vetor-studio.ru/models/`,
а если он недоступен или отдал что-то не то — с оригинала: свои модели с GitHub Pages
(`vetor-studio.ru/models/…`), чужие с HuggingFace / Google.

## Как это устроено

1. `scripts/model-mirror.mjs` (часть `npm run build`) собирает манифест: для каждого файла —
   размер, SHA-256 и оригинальный адрес. Свои модели хэшируются из `public/models`, чужие
   берутся из `scripts/model-mirror.remote.json` (ревизии HuggingFace закреплены по коммиту;
   обновить — `npm run models:mirror`).
2. Манифест попадает в сборку сайта (`src/data/model-mirror.json`) и публикуется рядом
   (`https://vetor-studio.ru/model-mirror.json`).
3. Браузер (`src/utils/modelMirror.js`) качает файл с зеркала и по ходу считает SHA-256.
   Не совпали размер или хэш, ошибка, таймаут — файл отбрасывается, загрузка идёт с оригинала,
   а зеркало до конца сессии вкладки больше не используется.
4. VPS раз в час запускает `sync.py`: берёт опубликованный манифест, качает недостающее
   из оригинальных источников, сверяет хэши и атомарно кладёт файлы. Лишнее удаляет.

## Безопасность

- Подменённый на сервере файл не будет использован: хэши зашиты в сборку сайта, которую
  публикует GitHub, а не сервер.
- На сервер никто ничего не загружает: он сам скачивает файлы по манифесту. Ключей и паролей
  в этой схеме нет.
- `sync.py` принимает пути только вида `site|hf|ext/…` без `..`, источники — только из белого
  списка хостов, есть лимиты на размер файла и всего зеркала, на диске всегда остаётся ≥1,5 ГБ.
- Синхронизация идёт от системного пользователя `vetormodels` без входа в систему,
  под systemd-песочницей (`ProtectSystem=strict`, запись только в каталог зеркала и своё состояние).
- Caddy отдаёт каталог только на чтение: без листинга, без скрытых файлов, только GET/HEAD/OPTIONS,
  CORS — только для vetor-studio.ru (и localhost для разработки), `nosniff`, без сжатия.

## Установка на сервере (уже сделана)

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin vetormodels
install -d -o vetormodels -g vetormodels -m 755 /var/www/vetor-models
install -d -o vetormodels -g vetormodels -m 700 /var/lib/vetor-models
cp sync.py /opt/vetor-models/ && cp vetor-models-sync.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now vetor-models-sync.timer
```

Правило Caddy — `Caddyfile.snippet` (внутрь блока `api.vetor-studio.ru`, перед общим `handle`).
Перед правкой: копия `Caddyfile.bak_<дата>`, затем `caddy validate` и `systemctl reload caddy`.

Проверить вручную: `systemctl start vetor-models-sync && journalctl -u vetor-models-sync -n 20`.
