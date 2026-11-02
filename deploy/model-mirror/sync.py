#!/usr/bin/env python3
"""Синхронизация зеркала моделей на VPS.

Берёт опубликованный манифест https://vetor-studio.ru/model-mirror.json (его собирает
scripts/model-mirror.mjs при деплое сайта), качает недостающие файлы из оригинальных
источников, сверяет размер и SHA-256 и атомарно кладёт в каталог зеркала. Лишние файлы
удаляет. Ничего не принимает извне, кроме манифеста, и не требует ключей: сервер сам
тянет данные, на сервер никто ничего не пушит.

Запуск: systemd-таймер vetor-models-sync (пользователь vetormodels, см. README.md).
"""

import fcntl
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.parse
import urllib.request

MANIFEST_URL = os.environ.get('MANIFEST_URL', 'https://vetor-studio.ru/model-mirror.json')
ROOT = os.environ.get('MIRROR_ROOT', '/var/www/vetor-models')
STATE = os.environ.get('MIRROR_STATE', '/var/lib/vetor-models/state.json')
LOCK = os.environ.get('MIRROR_LOCK', '/var/lib/vetor-models/sync.lock')

MAX_FILE = 800 * 1024 * 1024        # один файл
MAX_TOTAL = 4 * 1024 * 1024 * 1024  # всё зеркало
KEEP_FREE = 1536 * 1024 * 1024      # на диске VPS всегда остаётся ≥1,5 ГБ
MAX_MANIFEST = 2 * 1024 * 1024

KEY_RE = re.compile(r'^(site|hf|ext)/[A-Za-z0-9._\-]+(/[A-Za-z0-9._\-]+)*$')
SHA_RE = re.compile(r'^[0-9a-f]{64}$')
# Откуда разрешено качать: только оригинальные источники.
ALLOWED_SRC = {
    'site/': ('vetor-studio.ru', '/models/'),
    'hf/': ('huggingface.co', '/'),
    'ext/': ('storage.googleapis.com', '/mediapipe-models/'),
}
UA = 'vetor-model-mirror/1.0'


def log(*a):
    print(time.strftime('%Y-%m-%d %H:%M:%S'), *a, flush=True)


def fetch_manifest():
    req = urllib.request.Request(MANIFEST_URL, headers={'User-Agent': UA, 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read(MAX_MANIFEST + 1)
    if len(raw) > MAX_MANIFEST:
        raise ValueError('манифест слишком большой')
    return json.loads(raw)


def validate(manifest):
    files = manifest.get('files')
    if not isinstance(files, dict) or not files:
        raise ValueError('в манифесте нет files')
    out, total = {}, 0
    for key, f in files.items():
        if not isinstance(key, str) or not KEY_RE.match(key) or '..' in key:
            raise ValueError(f'недопустимый путь: {key!r}')
        size, sha, src = f.get('size'), f.get('sha256'), f.get('src')
        if not isinstance(size, int) or not (0 < size <= MAX_FILE):
            raise ValueError(f'{key}: недопустимый размер {size!r}')
        if not isinstance(sha, str) or not SHA_RE.match(sha):
            raise ValueError(f'{key}: недопустимый sha256')
        u = urllib.parse.urlsplit(src or '')
        host, prefix = next(v for k, v in ALLOWED_SRC.items() if key.startswith(k))
        if u.scheme != 'https' or u.hostname != host or not u.path.startswith(prefix) or u.username or u.port:
            raise ValueError(f'{key}: источник не из белого списка: {src!r}')
        total += size
        out[key] = {'size': size, 'sha256': sha, 'src': src}
    if total > MAX_TOTAL:
        raise ValueError(f'зеркало больше лимита: {total} байт')
    return out


def load_state():
    try:
        with open(STATE) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_state(state):
    tmp = STATE + '.tmp'
    with open(tmp, 'w') as fh:
        json.dump(state, fh)
    os.replace(tmp, STATE)


def is_current(path, f, st):
    """Файл на месте и не менялся с прошлой проверки (размер + mtime), иначе пересчитываем хэш."""
    try:
        s = os.stat(path)
    except OSError:
        return False
    if s.st_size != f['size']:
        return False
    if st and st.get('sha256') == f['sha256'] and st.get('mtime') == s.st_mtime_ns:
        return True
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest() == f['sha256']


def download(key, f, dest):
    if shutil.disk_usage(ROOT).free - f['size'] < KEEP_FREE:
        raise OSError('мало места на диске')
    tmpdir = os.path.join(ROOT, '.tmp')
    os.makedirs(tmpdir, mode=0o750, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=tmpdir)
    try:
        h, got = hashlib.sha256(), 0
        req = urllib.request.Request(f['src'], headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=60) as r, os.fdopen(fd, 'wb') as out:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                got += len(chunk)
                if got > f['size']:
                    raise ValueError('файл больше заявленного')
                h.update(chunk)
                out.write(chunk)
        if got != f['size'] or h.hexdigest() != f['sha256']:
            raise ValueError(f'не сошлись размер/хэш ({got} байт)')
        os.chmod(tmp, 0o644)
        os.makedirs(os.path.dirname(dest), mode=0o755, exist_ok=True)
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def prune(keep):
    removed = 0
    for dirpath, dirnames, filenames in os.walk(ROOT, topdown=False):
        rel_dir = os.path.relpath(dirpath, ROOT)
        if rel_dir.split(os.sep)[0] == '.tmp':
            continue
        for name in filenames:
            rel = os.path.normpath(os.path.join(rel_dir, name)).replace(os.sep, '/')
            if rel not in keep:
                os.unlink(os.path.join(dirpath, name))
                removed += 1
        if dirpath != ROOT and not os.listdir(dirpath):
            os.rmdir(dirpath)
    return removed


def main():
    os.makedirs(os.path.dirname(LOCK), exist_ok=True)
    lock = open(LOCK, 'w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log('уже идёт синхронизация — выхожу')
        return 0
    files = validate(fetch_manifest())
    state = load_state()
    new_state, errors, fetched = {}, 0, 0
    for key, f in sorted(files.items()):
        dest = os.path.join(ROOT, *key.split('/'))
        try:
            if not is_current(dest, f, state.get(key)):
                log('качаю', key, f'{f["size"] / 1e6:.1f} МБ')
                download(key, f, dest)
                fetched += 1
            new_state[key] = {'sha256': f['sha256'], 'mtime': os.stat(dest).st_mtime_ns}
        except Exception as e:  # noqa: BLE001 — один битый файл не должен ронять остальные
            errors += 1
            log('ОШИБКА', key, e)
            if os.path.exists(dest) and not is_current(dest, f, None):
                os.unlink(dest)  # устаревший файл не держим: сайт всё равно его отвергнет
    save_state(new_state)
    removed = prune(set(new_state))
    log(f'готово: файлов {len(new_state)}/{len(files)}, скачано {fetched}, удалено {removed}, ошибок {errors}')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
