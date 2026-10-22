"""
diretorio.py — quem é o SID: nome, e-mail, cargo, equipe e foto, buscados
internamente, como no OTC Tracker.

Ordem das fontes (a primeira que achar o SID responde; o que ela não trouxe a
seguinte completa):

  1. o cadastro de usuários do OTC Tracker (`Users_OTCTracker.db`, DuckDB:
     SID, Name, Email, Position, Role_Description) — EDG_USERS_DB aponta o
     arquivo; sem ela, tenta a pasta do OTC Tracker ao lado desta;
  2. o catálogo do Outlook da máquina (Windows + pywin32): o SID resolve como
     destinatário e o usuário Exchange dá nome, e-mail, cargo e departamento.

A foto é `static/img/users/<sid>.jpg`. Se ela ainda não existe aqui e o OTC
Tracker tem a do SID (`images/users/<sid>.jpg`), ela é copiada na busca.

Cada SID fica em memória por 10 minutos; o cadastro e o Outlook são lidos só
quando alguém é adicionado ou a tela pede.
"""

import logging
import os
import re
import shutil
import sys
import threading
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PHOTOS_DIR = os.path.join(BASE_DIR, "static", "img", "users")
_OTC_DB_PADRAO = os.path.join(os.path.dirname(BASE_DIR), "OTC Tracker", "apps", "static",
                              "data", "db", "Users_OTCTracker.db")
_TTL = 600.0
_RE_SID = re.compile(r"^[A-Z0-9]{2,20}$")

log = logging.getLogger(__name__)
_lock = threading.Lock()
_memo = {}


def users_db():
    caminho = os.environ.get("EDG_USERS_DB") or _OTC_DB_PADRAO
    return caminho if os.path.isfile(caminho) else ""


def _do_otc(sid):
    caminho = users_db()
    if not caminho:
        return None
    try:
        import duckdb
    except ImportError:
        log.info("duckdb ausente: cadastro do OTC Tracker não consultado")
        return None
    try:
        conn = duckdb.connect(caminho, read_only=True)
        try:
            linha = conn.execute(
                "SELECT SID, Name, Email, Position, Role_Description FROM users WHERE upper(SID) = ?",
                [sid]).fetchone()
        finally:
            conn.close()
    except Exception:
        log.warning("não li o cadastro de usuários do OTC Tracker em %s", caminho, exc_info=True)
        return None
    if not linha:
        return None
    _, nome, email, cargo, desc = linha
    return {"name": (nome or "").strip(), "email": (email or "").strip(),
            "role": (cargo or "").strip(), "team": (desc or "").strip(), "source": "OTC Tracker"}


def _do_outlook(sid):
    if sys.platform != "win32":
        return None
    try:
        import pythoncom
        import win32com.client
    except ImportError:
        return None
    pythoncom.CoInitialize()
    try:
        ns = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
        rec = ns.CreateRecipient(sid)
        rec.Resolve()
        if not rec.Resolved:
            return None
        entrada = rec.AddressEntry
        ex = entrada.GetExchangeUser()
        if ex is None:
            return {"name": str(entrada.Name or "").strip(), "email": "", "role": "", "team": "",
                    "source": "Outlook"}
        return {"name": str(ex.Name or "").strip(),
                "email": str(ex.PrimarySmtpAddress or "").strip(),
                "role": str(ex.JobTitle or "").strip(),
                "team": str(ex.Department or "").strip(), "source": "Outlook"}
    except Exception:
        log.warning("o Outlook não resolveu o SID %s", sid, exc_info=True)
        return None
    finally:
        pythoncom.CoUninitialize()


def photo_path(sid):
    return os.path.join(PHOTOS_DIR, sid.lower() + ".jpg")


def _foto(sid):
    """Garante a foto local (copiando a do OTC Tracker, se houver)."""
    destino = photo_path(sid)
    if os.path.isfile(destino):
        return True
    db = users_db()
    if not db:
        return False
    # o banco mora em apps/static/data/db/; as fotos em apps/static/images/users/
    origem = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(db))),
                          "images", "users", sid.lower() + ".jpg")
    if not os.path.isfile(origem):
        return False
    try:
        os.makedirs(PHOTOS_DIR, exist_ok=True)
        shutil.copyfile(origem, destino)
        return True
    except OSError:
        log.warning("não copiei a foto de %s", sid, exc_info=True)
        return False


def lookup(sid):
    """{sid, name, email, role, team, photo, source} do SID, ou None se nenhuma
    fonte o conhece (a foto sozinha não basta)."""
    sid = str(sid or "").strip().upper()
    if not _RE_SID.match(sid):
        return None
    with _lock:
        hit = _memo.get(sid)
        if hit and time.time() - hit[0] < _TTL:
            return dict(hit[1]) if hit[1] else None
    achado = None
    for fonte in (_do_otc, _do_outlook):
        r = fonte(sid)
        if not r:
            continue
        if achado is None:
            achado = r
        else:
            for k, v in r.items():
                if not achado.get(k):
                    achado[k] = v
        if all(achado.get(k) for k in ("name", "email", "role", "team")):
            break
    if achado:
        achado["sid"] = sid
        achado["photo"] = _foto(sid)
    with _lock:
        _memo[sid] = (time.time(), achado)
    return dict(achado) if achado else None


def has_photo(sid):
    return os.path.isfile(photo_path(str(sid or "")))
