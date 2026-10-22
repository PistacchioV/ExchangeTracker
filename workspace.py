"""
workspace.py — o armazém do Workspace do EDG Tracker (Initiatives, Tasks,
Calendar e Settings) e as preferências de quem usa a ferramenta.

Cada área é UM documento JSON em data/workspace/ (fora do git), lido e gravado
inteiro dentro de uma trava: ler -> alterar -> gravar, com gravação atômica
(arquivo temporário + os.replace), para uma escrita pela metade nunca virar o
documento.

  initiatives.json   {"seq": n, "projects": [...]}           (initiatives.py)
  calendar.json      {"seq": n, "events": [...]}             eventos avulsos
  settings.json      perfil, time, avisos e iniciativas fixadas

A pasta muda com EDG_WORKSPACE.
"""

import copy
import csv
import getpass
import io
import json
import os
import re
import threading
from datetime import date, datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WS_DIR = os.environ.get("EDG_WORKSPACE") or os.path.join(BASE_DIR, "data", "workspace")


class WorkspaceError(ValueError):
    """Pedido recusado — `code` identifica o erro, `text` é a frase da tela."""

    def __init__(self, code, text, **params):
        super().__init__(text)
        self.code = code
        self.text = text
        self.params = params


class NotFound(WorkspaceError):
    """O item pedido não existe — 404."""


def now():
    return datetime.now().replace(microsecond=0).isoformat()


def today():
    return date.today()


# ---------------------------------------------------------------- armazém
class Doc:
    """Um documento JSON com trava própria. `padrao()` é o documento vazio."""

    def __init__(self, nome, padrao):
        self.caminho = os.path.join(WS_DIR, nome)
        self.padrao = padrao
        self.lock = threading.RLock()

    def _ler(self):
        try:
            with open(self.caminho, encoding="utf-8") as f:
                doc = json.load(f)
        except FileNotFoundError:
            return self.padrao()
        base = self.padrao()
        base.update(doc if isinstance(doc, dict) else {})
        return base

    def _gravar(self, doc):
        os.makedirs(os.path.dirname(self.caminho), exist_ok=True)
        tmp = self.caminho + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.caminho)

    def load(self):
        with self.lock:
            return copy.deepcopy(self._ler())

    def mutate(self, fn):
        """Lê, aplica `fn(doc)` e grava. Se `fn` levanta, nada é gravado."""
        with self.lock:
            doc = self._ler()
            out = fn(doc)
            self._gravar(doc)
            return copy.deepcopy(out)


# ------------------------------------------------------------------ campos
def clean_text(value, limit):
    return re.sub(r"\s+", " ", str(value if value is not None else "")).strip()[:limit]


def clean_block(value, limit):
    """Texto de várias linhas (descrição, comentário): mantém as quebras."""
    linhas = [l.rstrip() for l in str(value if value is not None else "").replace("\r", "").split("\n")]
    return "\n".join(linhas).strip()[:limit]


def iso_date(value, field):
    """'' ou 'AAAA-MM-DD'. Aceita também dd/mm/aaaa, o formato da tela."""
    s = str(value or "").strip()
    if not s:
        return ""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:10], fmt).date().isoformat()
        except ValueError:
            continue
    raise WorkspaceError("bad_date", 'Data inválida em "%s" — use dd/mm/aaaa.' % field, field=field)


def hhmm(value):
    s = str(value or "").strip()
    if not s:
        return ""
    m = re.match(r"^(\d{1,2}):(\d{2})$", s)
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        raise WorkspaceError("bad_time", "Hora inválida — use hh:mm.", field="time")
    return "%02d:%02d" % (int(m.group(1)), int(m.group(2)))


def choice(value, options, default, field):
    if value is None or value == "":
        return default
    for o in options:
        if str(value).strip().lower() == str(o).lower():
            return o
    raise WorkspaceError("bad_choice", 'Valor inválido em "%s".' % field, field=field)


# --------------------------------------------------------------- settings
MAX_NAME = 80
MAX_ROLE = 80
MAX_EMAIL = 120
MAX_TEAM = 200
RE_SID = re.compile(r"^[A-Z0-9]{2,20}$")

# Os avisos do sino, com o padrão de quem nunca abriu a Settings.
NOTIFY_KEYS = ("due_dates", "events_today", "activity")
DEFAULT_NOTIFY = {k: True for k in NOTIFY_KEYS}


def _settings_vazio():
    return {"me": "", "team": [], "notify": dict(DEFAULT_NOTIFY), "pinned": []}


SETTINGS = Doc("settings.json", _settings_vazio)


def clean_sid(value):
    sid = re.sub(r"\s+", "", str(value or "")).upper()
    if not RE_SID.match(sid):
        raise WorkspaceError("bad_sid", "SID inválido — só letras e números.")
    return sid


def _sid_da_maquina():
    """O usuário da máquina: na rede do banco ele É o SID."""
    try:
        nome = getpass.getuser() or ""
    except Exception:  # pragma: no cover - sem usuário no ambiente
        nome = ""
    sid = re.sub(r"[^A-Za-z0-9]", "", nome).upper()
    return sid if RE_SID.match(sid) else "ME"


def _garantir_me(doc):
    """Quem usa a ferramenta é sempre uma pessoa do time (o "me"), pelo SID da
    máquina; nome, e-mail e cargo vêm do diretório (diretorio.py)."""
    if any(p["sid"] == doc.get("me") for p in doc["team"]):
        return False
    sid = _sid_da_maquina()
    achado = _buscar(sid) or {}
    doc["team"] = [p for p in doc["team"] if p["sid"] != sid]
    doc["team"].insert(0, {"sid": sid, "name": achado.get("name") or sid.title(),
                           "email": achado.get("email", ""), "role": achado.get("role", ""),
                           "team": achado.get("team", ""), "active": True})
    doc["me"] = sid
    return True


def _buscar(sid):
    import diretorio
    try:
        return diretorio.lookup(sid)
    except Exception:  # pragma: no cover - diretório fora do ar não impede abrir
        return None


def settings():
    doc = SETTINGS.load()
    if not any(p["sid"] == doc.get("me") for p in doc["team"]):
        doc = SETTINGS.mutate(lambda d: (_garantir_me(d), d)[1])
    notify = dict(DEFAULT_NOTIFY)
    for k, v in (doc.get("notify") or {}).items():
        if k in notify and isinstance(v, bool):
            notify[k] = v
    doc["notify"] = notify
    return doc


def me():
    """{sid, name, role, email, team} de quem usa a ferramenta."""
    doc = settings()
    for p in doc["team"]:
        if p["sid"] == doc["me"]:
            return dict(p)
    return {"sid": "", "name": "Eu", "role": "", "email": "", "team": "", "active": True}


def team(apenas_ativos=False):
    pessoas = settings()["team"]
    if apenas_ativos:
        pessoas = [p for p in pessoas if p.get("active", True)]
    return sorted(pessoas, key=lambda p: p["name"].lower())


def photo_url(sid):
    """A foto de `static/img/users/<sid>.jpg`, ou '' (a tela fica com as
    iniciais)."""
    import diretorio
    return "/static/img/users/%s.jpg" % sid.lower() if sid and diretorio.has_photo(sid) else ""


def eligible():
    """Quem pode ser Lead, entrar no time de uma iniciativa e receber tarefa:
    as pessoas ATIVAS do Team (no OTC, os usuários BO/Admin ativos)."""
    return [{"sid": p["sid"], "name": p["name"], "position": p.get("role", ""),
             "photo": photo_url(p["sid"])}
            for p in team(apenas_ativos=True)]


def directory():
    return {p["sid"]: {"name": p["name"], "position": p.get("role", "")} for p in team()}


def _pessoa(data, atual=None):
    data = data or {}
    out = {}
    if atual is None or "name" in data:
        out["name"] = clean_text(data.get("name"), MAX_NAME)
        if not out["name"]:
            raise WorkspaceError("name_required", "Informe o nome.")
    for campo, limite in (("role", MAX_ROLE), ("team", MAX_ROLE)):
        if atual is None or campo in data:
            out[campo] = clean_text(data.get(campo), limite)
    if atual is None or "email" in data:
        email = clean_text(data.get("email"), MAX_EMAIL)
        if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            raise WorkspaceError("bad_email", "E-mail inválido.")
        out["email"] = email
    if atual is None or "active" in data:
        out["active"] = bool(data.get("active", True))
    return out


def update_profile(data):
    campos = _pessoa(data, atual={})
    campos.pop("active", None)

    def go(doc):
        _garantir_me(doc)
        for p in doc["team"]:
            if p["sid"] == doc["me"]:
                p.update(campos)
                return p
    return SETTINGS.mutate(go)


def add_person(data):
    """Adiciona ao Team pelo SID. O que a tela não mandou é completado pelo
    diretório (banco de usuários do OTC Tracker, Outlook) — a tela já mostra o
    que foi achado antes de salvar, e o que a pessoa digitou vale."""
    data = dict(data or {})
    sid = clean_sid(data.get("sid"))
    achado = _buscar(sid) or {}
    for campo in ("name", "email", "role", "team"):
        if not str(data.get(campo) or "").strip():
            data[campo] = achado.get(campo, "")
    campos = _pessoa(data)

    def go(doc):
        if any(p["sid"] == sid for p in doc["team"]):
            raise WorkspaceError("person_exists", "%s já está no time." % sid)
        if len(doc["team"]) >= MAX_TEAM:
            raise WorkspaceError("team_full", "O time chegou ao limite de %d pessoas." % MAX_TEAM)
        p = dict(campos, sid=sid, added_at=now())
        doc["team"].append(p)
        return p
    return SETTINGS.mutate(go)


def update_person(sid, data):
    def go(doc):
        for p in doc["team"]:
            if p["sid"] == sid:
                campos = _pessoa(data, atual=p)
                if sid == doc.get("me") and campos.get("active") is False:
                    raise WorkspaceError("me_inactive", "Você não pode se desativar.")
                p.update(campos)
                return p
        raise NotFound("person_not_found", "Pessoa não encontrada.")
    return SETTINGS.mutate(go)


def delete_person(sid, em_uso):
    """Tira a pessoa do time. Quem lidera, está num time ou tem tarefa fica —
    desative em vez de apagar (`em_uso` = SIDs envolvidos em iniciativas)."""
    def go(doc):
        if sid == doc.get("me"):
            raise WorkspaceError("me_delete", "Você não pode se remover do time.")
        if sid in em_uso:
            raise WorkspaceError("person_in_use",
                                 "Esta pessoa está em uma iniciativa — desative em vez de remover.")
        antes = len(doc["team"])
        doc["team"] = [p for p in doc["team"] if p["sid"] != sid]
        if len(doc["team"]) == antes:
            raise NotFound("person_not_found", "Pessoa não encontrada.")
        return True
    return SETTINGS.mutate(go)


def update_notify(data):
    data = data or {}

    def go(doc):
        n = dict(DEFAULT_NOTIFY)
        n.update({k: v for k, v in (doc.get("notify") or {}).items() if k in n})
        for k, v in data.items():
            if k not in NOTIFY_KEYS or not isinstance(v, bool):
                raise WorkspaceError("bad_choice", "Aviso desconhecido.", field=k)
            n[k] = v
        doc["notify"] = n
        return n
    return SETTINGS.mutate(go)


def reset_preferences():
    """Avisos e iniciativas fixadas voltam ao padrão; perfil e time ficam."""
    def go(doc):
        doc["notify"] = dict(DEFAULT_NOTIFY)
        doc["pinned"] = []
        return True
    return SETTINGS.mutate(go)


def pinned():
    return list(settings().get("pinned") or [])


def toggle_pin(project_id, existe):
    def go(doc):
        lista = [x for x in doc.get("pinned") or [] if existe(x)]
        if project_id in lista:
            lista.remove(project_id)
        else:
            lista.append(project_id)
        doc["pinned"] = lista
        return lista
    return SETTINGS.mutate(go)


# ---------------------------------------------------------------- calendar
# Evento AVULSO do Calendar. O evento de uma iniciativa é um MARCO dela
# (initiatives.py) e o calendário o lê de lá — nunca guarda cópia.
EVENT_TYPES = ["Milestone", "Meeting", "Deadline", "Review", "Go-live"]
DEFAULT_EVENT_TYPE = "Meeting"
EVENT_LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240]
DEFAULT_EVENT_LENGTH = 30
MAX_TITLE = 200
MAX_WHERE = 200
MAX_NOTES = 1000


def _calendar_vazio():
    return {"seq": 0, "events": []}


CALENDAR = Doc("calendar.json", _calendar_vazio)


def event_length(value):
    if value is None or str(value).strip() == "":
        return DEFAULT_EVENT_LENGTH
    try:
        n = int(str(value).strip())
    except ValueError:
        n = None
    if n not in EVENT_LENGTHS:
        raise WorkspaceError("bad_choice", 'Valor inválido em "duração".', field="length")
    return n


def validate_event(data, default_type=DEFAULT_EVENT_TYPE):
    """Sem hora o evento é do dia inteiro e não tem duração; com hora e sem
    duração vale a padrão (30 min). Só o título e a data são obrigatórios."""
    data = data or {}
    titulo = clean_text(data.get("title"), MAX_TITLE)
    if not titulo:
        raise WorkspaceError("title_required", "Dê um título ao evento.")
    dia = iso_date(data.get("date"), "data")
    if not dia:
        raise WorkspaceError("date_required", "Informe a data do evento.")
    hora = hhmm(data.get("time"))
    return {"title": titulo, "date": dia, "time": hora,
            "length": event_length(data.get("length")) if hora else None,
            "type": choice(data.get("type"), EVENT_TYPES, default_type, "tipo"),
            "where": clean_text(data.get("where"), MAX_WHERE),
            "notes": clean_block(data.get("notes"), MAX_NOTES)}


def add_event(data):
    campos = validate_event(data)

    def go(doc):
        doc["seq"] = int(doc.get("seq") or 0) + 1
        ev = dict(campos, id="EV-%04d" % doc["seq"], created_at=now())
        doc["events"].append(ev)
        return ev
    return CALENDAR.mutate(go)


def update_event(event_id, data):
    def go(doc):
        for ev in doc["events"]:
            if ev["id"] == event_id:
                atual = {k: ev.get(k) for k in ("title", "date", "time", "length", "type", "where", "notes")}
                atual.update(data or {})
                ev.update(validate_event(atual))
                return ev
        raise NotFound("event_not_found", "Evento não encontrado.")
    return CALENDAR.mutate(go)


def delete_event(event_id):
    def go(doc):
        antes = len(doc["events"])
        doc["events"] = [e for e in doc["events"] if e["id"] != event_id]
        if len(doc["events"]) == antes:
            raise NotFound("event_not_found", "Evento não encontrado.")
        return True
    return CALENDAR.mutate(go)


def standalone_events():
    out = []
    for ev in CALENDAR.load()["events"]:
        out.append(dict(ev, kind="event", color="lime"))
    return out


# -------------------------------------------------------------------- CSV
_FORMULA = ("=", "+", "-", "@")


def _celula(v):
    """Neutraliza fórmula: o título é digitado por qualquer um e o Excel
    executaria `=...`."""
    s = "" if v is None else str(v)
    return "'" + s if s.startswith(_FORMULA) else s


def tasks_csv(tarefas):
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Initiative", "Category", "Task", "Status", "Priority", "Assignee", "Due",
                "Estimate (h)", "Subtasks", "Created", "Done"])
    for t in tarefas:
        subs = t.get("subtasks") or []
        feitas = sum(1 for s in subs if s.get("done"))
        w.writerow([_celula(t.get("project_name")), _celula(t.get("project_category")),
                    _celula(t.get("title")), t.get("status", ""), t.get("priority", ""),
                    _celula(t.get("assignee_name")), _br(t.get("due")),
                    "" if t.get("estimate") is None else str(t["estimate"]).replace(".", ","),
                    # "1 of 3", nunca "1/3": o Excel lê como data
                    ("%d of %d" % (feitas, len(subs))) if subs else "",
                    _br(t.get("created_at")), _br(t.get("done_at"))])
    return "﻿" + buf.getvalue()


def _br(iso):
    s = str(iso or "")[:10]
    if len(s) == 10 and s[4] == "-":
        return "%s/%s/%s" % (s[8:10], s[5:7], s[0:4])
    return ""


# ------------------------------------------------------------------- sino
def notifications(tarefas, eventos, atividade, hoje=None):
    """O sino: prazos (tarefas em aberto atrasadas ou de hoje), os eventos de
    hoje e a atividade recente das iniciativas — cada bloco só se o aviso
    está ligado na Settings."""
    hoje = (hoje or today()).isoformat()
    n = settings()["notify"]
    out = []
    if n["due_dates"]:
        for t in tarefas:
            if t.get("status") == "Done" or not t.get("due") or t["due"] > hoje:
                continue
            out.append({"kind": "overdue" if t["due"] < hoje else "due_today",
                        "title": t["title"], "detail": t.get("project_name", ""),
                        "date": t["due"], "at": t["due"] + "T00:00:00",
                        "url": "/initiatives/%s?task=%s" % (t["project_id"], t["id"])})
    if n["events_today"]:
        for e in eventos:
            if e.get("date") == hoje and e.get("kind") in ("event", "milestone"):
                out.append({"kind": "event", "title": e["title"],
                            "detail": " · ".join(x for x in (e.get("time"), e.get("project_name") or e.get("where")) if x),
                            "date": e["date"], "at": e["date"] + "T" + (e.get("time") or "00:00") + ":00",
                            "url": "/calendar?d=" + e["date"]})
    if n["activity"]:
        for a in atividade[:15]:
            out.append(dict(a, kind="activity"))
    return out
