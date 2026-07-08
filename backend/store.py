"""
Couche de stockage SQLite (Phase 4.5).

Document store minimaliste : chaque collection (projects / suites / results) est
une table (id TEXT, ord INTEGER, data TEXT-JSON). L'ordre d'insertion est conservé
via la colonne `ord` (l'app insère les nouveautés en tête → ord croissant = plus
récent d'abord, comme l'ancien comportement JSON).

L'API get_all / replace_all reproduit exactement la sémantique de read_json /
write_json (lecture d'une liste, réécriture complète), donc les routes existantes
n'ont pas à changer. La première initialisation migre automatiquement les anciens
fichiers data/*.json s'ils existent.
"""

import json
import sqlite3
import threading
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "studio.db"
TABLES = ("projects", "suites", "results")

_LOCK = threading.RLock()


def _conn():
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.execute("PRAGMA journal_mode=WAL;")
    c.execute("PRAGMA busy_timeout=5000;")
    return c


def init_db(migrate_from: Path = None):
    DB_PATH.parent.mkdir(exist_ok=True)
    with _LOCK:
        conn = _conn()
        try:
            for t in TABLES:
                conn.execute(
                    f"CREATE TABLE IF NOT EXISTS {t} "
                    "(id TEXT PRIMARY KEY, ord INTEGER, data TEXT)"
                )
            conn.commit()
        finally:
            conn.close()

    if migrate_from:
        for t in TABLES:
            if get_all(t):
                continue  # déjà des données → ne pas écraser
            jf = Path(migrate_from) / f"{t}.json"
            if jf.exists():
                try:
                    items = json.loads(jf.read_text(encoding="utf-8"))
                    if isinstance(items, list) and items:
                        replace_all(t, items)
                except Exception:
                    pass


def get_all(table: str):
    if table not in TABLES:
        raise ValueError(f"Table inconnue: {table}")
    with _LOCK:
        conn = _conn()
        try:
            rows = conn.execute(f"SELECT data FROM {table} ORDER BY ord ASC").fetchall()
        finally:
            conn.close()
    out = []
    for (raw,) in rows:
        try:
            out.append(json.loads(raw))
        except Exception:
            pass
    return out


def replace_all(table: str, items):
    if table not in TABLES:
        raise ValueError(f"Table inconnue: {table}")
    with _LOCK:
        conn = _conn()
        try:
            conn.execute(f"DELETE FROM {table}")
            conn.executemany(
                f"INSERT INTO {table} (id, ord, data) VALUES (?, ?, ?)",
                [
                    (str(it.get("id", i)), i, json.dumps(it, ensure_ascii=False))
                    for i, it in enumerate(items)
                ],
            )
            conn.commit()
        finally:
            conn.close()
