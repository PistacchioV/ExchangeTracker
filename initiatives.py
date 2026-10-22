"""
initiatives.py — Initiatives e Tasks do EDG Tracker, com as regras do OTC
Tracker (features/projects): status, categorias, prioridades, o time da
iniciativa, o responsável saído dos envolvidos, o marco como EVENTO, o
burn-up e a atividade estruturada.

Um documento só (data/workspace/initiatives.json). Toda escrita valida pelas
regras, altera dentro do `STORE.mutate` e devolve a iniciativa inteira já
gravada — a tela se redesenha dela. O id (`INI-0001`) e os ids filhos são
CONTADORES gravados: apagado nunca volta.
"""

from datetime import date, timedelta

import workspace as ws
from workspace import WorkspaceError, NotFound, clean_text, clean_block, iso_date, choice

# ------------------------------------------------------------- classificações
STATUSES = ["On going", "On hold", "Concluded"]
DEFAULT_STATUS = "On going"
TASK_STATUSES = ["To do", "In progress", "In review", "Done"]
DONE = "Done"
PRIORITIES = ["Low", "Medium", "High", "Urgent"]
DEFAULT_PRIORITY = "Medium"
# Lista fechada, gravada em inglês como o status (a mesma do OTC Tracker).
CATEGORIES = ["Process Review", "Tech Issue", "Projects", "B3 - Improvements", "Stomp/Red"]

# Cor e ícone são LISTA FECHADA: a cor vira `var(--hue-<cor>)` e o ícone um
# desenho do JS — valor livre seria texto do usuário dentro de CSS.
COLORS = ["blue", "purple", "pink", "orange", "green", "teal", "indigo", "yellow"]
ICONS = ["folder", "rocket", "leaf", "flame", "layout-grid", "chart-column", "sparkles", "workflow"]

# O MARCO é o EVENTO da iniciativa: nasce do "New event", com hora, duração,
# tipo e local — só o título é obrigatório.
EVENT_TYPES = ws.EVENT_TYPES
DEFAULT_EVENT_TYPE = "Milestone"
EVENT_LENGTHS = ws.EVENT_LENGTHS
MILESTONE_FIELDS = ("title", "date", "time", "length", "type", "where")

MAX_NAME = 120
MAX_DESCRIPTION = 600
MAX_TITLE = 200
MAX_COMMENT = 2000
MAX_ACTIVITY = 200
MAX_MEMBERS = 30
MAX_BURNUP_POINTS = 120

_STATUS_ORDER = {s: i for i, s in enumerate(STATUSES)}
_TASK_ORDER = {s: i for i, s in enumerate(TASK_STATUSES)}
_PRIO_ORDER = {p: i for i, p in enumerate(reversed(PRIORITIES))}


def _vazio():
    return {"seq": 0, "projects": []}


STORE = ws.Doc("initiatives.json", _vazio)


def meta():
    """As listas fechadas e as pessoas elegíveis, para os modais."""
    return {"statuses": STATUSES, "task_statuses": TASK_STATUSES, "priorities": PRIORITIES,
            "categories": CATEGORIES, "colors": COLORS, "icons": ICONS,
            "event_types": EVENT_TYPES, "event_lengths": EVENT_LENGTHS,
            "people": ws.eligible(), "me": ws.me()["sid"]}


# ------------------------------------------------------------------ regras
def _person(sid, people, field, required):
    sid = str(sid or "").strip().upper()
    if not sid:
        if required:
            raise WorkspaceError("lead_required", "Escolha o Lead.")
        return "", ""
    for p in people:
        if p["sid"] == sid:
            return sid, p["name"]
    raise WorkspaceError("not_eligible", 'Esta pessoa não pode ser escolhida em "%s".' % field, field=field)


def validate_project(data, people, current=None):
    """Os campos de uma iniciativa, limpos. `current` = a que está sendo
    editada: só muda o que veio, e o Lead já gravado continua válido mesmo que
    a pessoa tenha sido desativada no Team."""
    data = data or {}
    out = {}
    partial = current is not None

    if not partial or "name" in data:
        out["name"] = clean_text(data.get("name"), MAX_NAME)
        if not out["name"]:
            raise WorkspaceError("name_required", "Dê um nome à iniciativa.")
    if not partial or "description" in data:
        out["description"] = clean_block(data.get("description"), MAX_DESCRIPTION)
    if not partial or "lead_sid" in data:
        sid = str(data.get("lead_sid") or "").strip().upper()
        if partial and sid and sid == current.get("lead_sid"):
            out["lead_sid"], out["lead_name"] = sid, current.get("lead_name", "")
        else:
            out["lead_sid"], out["lead_name"] = _person(sid, people, "Lead", True)
    if not partial or "category" in data:
        if not str(data.get("category") or "").strip():
            raise WorkspaceError("category_required", "Escolha a categoria.")
        out["category"] = choice(data.get("category"), CATEGORIES, None, "categoria")
    if not partial or "status" in data:
        out["status"] = choice(data.get("status"), STATUSES, DEFAULT_STATUS, "status")
    if not partial or "color" in data:
        out["color"] = choice(data.get("color"), COLORS, COLORS[0], "cor")
    if not partial or "icon" in data:
        out["icon"] = choice(data.get("icon"), ICONS, ICONS[0], "ícone")
    if not partial or "start_date" in data:
        out["start_date"] = iso_date(data.get("start_date"), "início")
    if not partial or "due_date" in data:
        out["due_date"] = iso_date(data.get("due_date"), "data-alvo")
    if not partial or "member_sids" in data:
        lead = out.get("lead_sid", (current or {}).get("lead_sid", ""))
        out["members"] = _members(data.get("member_sids"), people, current, lead)

    start = out.get("start_date", (current or {}).get("start_date", ""))
    due = out.get("due_date", (current or {}).get("due_date", ""))
    if start and due and due < start:
        raise WorkspaceError("due_before_start", "A data-alvo é anterior ao início.")
    return out


def _members(sids, people, current, lead_sid):
    """O time, limpo: [{sid, name}] sem repetir e sem o Lead. Quem JÁ estava
    continua mesmo desativado; quem entra agora tem de ser elegível."""
    if sids is None or sids == "":
        sids = []
    if not isinstance(sids, (list, tuple)):
        raise WorkspaceError("bad_choice", 'Valor inválido em "time".', field="members")
    ja = {m.get("sid"): m.get("name", "") for m in (current or {}).get("members") or []}
    out, vistos = [], set()
    for sid in sids:
        sid = str(sid or "").strip().upper()
        if not sid or sid in vistos or sid == str(lead_sid or "").upper():
            continue
        vistos.add(sid)
        if sid in ja:
            out.append({"sid": sid, "name": ja[sid]})
        else:
            sid, nome = _person(sid, people, "time", False)
            out.append({"sid": sid, "name": nome})
    if len(out) > MAX_MEMBERS:
        raise WorkspaceError("too_many_members", "No máximo %d pessoas no time." % MAX_MEMBERS)
    return out


def new_members(before, after):
    antes = {m.get("sid") for m in before or []}
    return [m for m in after or [] if m.get("sid") not in antes]


def involved_sids(project):
    """Lead, time e quem já tem tarefa."""
    return [p["sid"] for p in people(project, {})]


def assignable(project, people_list, data, current=None):
    """O responsável da tarefa sai dos ENVOLVIDOS na iniciativa. Fora deles
    recusa dizendo o que fazer: incluir a pessoa no time primeiro. O
    responsável que a tarefa JÁ tem é mantido."""
    dentro = set(involved_sids(project))
    sid = str((data or {}).get("assignee_sid") or "").strip().upper()
    if sid and sid not in dentro and sid != (current or {}).get("assignee_sid"):
        if any(p["sid"] == sid for p in people_list or []):
            raise WorkspaceError("assignee_not_in_team",
                                 "Inclua esta pessoa no time da iniciativa antes de dar uma tarefa a ela.")
    return [p for p in people_list or [] if p["sid"] in dentro]


def validate_task(data, people_list, current=None):
    data = data or {}
    out = {}
    partial = current is not None
    if not partial or "title" in data:
        out["title"] = clean_text(data.get("title"), MAX_TITLE)
        if not out["title"]:
            raise WorkspaceError("title_required", "Dê um título à tarefa.")
    if not partial or "assignee_sid" in data:
        sid = str(data.get("assignee_sid") or "").strip().upper()
        if partial and sid and sid == current.get("assignee_sid"):
            out["assignee_sid"], out["assignee_name"] = sid, current.get("assignee_name", "")
        else:
            out["assignee_sid"], out["assignee_name"] = _person(sid, people_list, "responsável", False)
    if not partial or "priority" in data:
        out["priority"] = choice(data.get("priority"), PRIORITIES, DEFAULT_PRIORITY, "prioridade")
    if not partial or "status" in data:
        out["status"] = choice(data.get("status"), TASK_STATUSES, TASK_STATUSES[0], "status")
    if not partial or "due" in data:
        out["due"] = iso_date(data.get("due"), "prazo")
    if not partial or "estimate" in data:
        out["estimate"] = _estimate(data.get("estimate"))
    return out


def _estimate(value):
    s = str(value if value is not None else "").strip().replace(",", ".")
    if not s:
        return None
    try:
        v = float(s)
    except ValueError:
        raise WorkspaceError("bad_estimate", "A estimativa é um número de horas.")
    if v < 0 or v > 10000:
        raise WorkspaceError("bad_estimate", "A estimativa é um número de horas.")
    return round(v, 2)


def validate_milestone(data):
    """O marco — o EVENTO da iniciativa. Sem hora é do dia inteiro e não tem
    duração; com hora e sem duração vale a padrão (30 min)."""
    data = data or {}
    title = clean_text(data.get("title"), MAX_TITLE)
    if not title:
        raise WorkspaceError("title_required", "Dê um título ao marco.")
    hora = ws.hhmm(data.get("time"))
    return {"title": title, "date": iso_date(data.get("date"), "data"),
            "time": hora,
            "length": ws.event_length(data.get("length")) if hora else None,
            "type": choice(data.get("type"), EVENT_TYPES, DEFAULT_EVENT_TYPE, "tipo"),
            "where": clean_text(data.get("where"), ws.MAX_WHERE)}


# ---------------------------------------------------------------- leituras
def _d(iso):
    try:
        return date.fromisoformat(str(iso)[:10])
    except (TypeError, ValueError):
        return None


def progress(project):
    """% de tarefas feitas. Sem tarefa: 100 se concluída, senão 0."""
    tasks = project.get("tasks") or []
    if not tasks:
        return 100 if project.get("status") == "Concluded" else 0
    done = sum(1 for t in tasks if t.get("status") == DONE)
    return int(round(100.0 * done / len(tasks)))


def milestone_order(m):
    return (m.get("date") or "9999-12-31", m.get("time") or "", m.get("id", ""))


def next_milestone(project):
    abertos = [m for m in project.get("milestones") or [] if not m.get("done")]
    abertos.sort(key=milestone_order)
    return abertos[0] if abertos else None


def days_left(project, today):
    due = _d(project.get("due_date"))
    return (due - today).days if due else None


def people(project, directory):
    """O Lead primeiro, depois o time e quem tem tarefa — cada um com as
    tarefas em aberto."""
    ordem, vistos = [], set()

    def add(sid, name):
        sid = str(sid or "").upper()
        if sid and sid not in vistos:
            vistos.add(sid)
            info = directory.get(sid) or {}
            ordem.append({"sid": sid, "name": info.get("name") or name or sid,
                          "position": info.get("position", ""),
                          "is_lead": sid == project.get("lead_sid"), "open_tasks": 0})

    add(project.get("lead_sid"), project.get("lead_name"))
    for m in project.get("members") or []:
        add(m.get("sid"), m.get("name"))
    for t in project.get("tasks") or []:
        add(t.get("assignee_sid"), t.get("assignee_name"))
    abertas = {}
    for t in project.get("tasks") or []:
        if t.get("status") != DONE and t.get("assignee_sid"):
            abertas[t["assignee_sid"]] = abertas.get(t["assignee_sid"], 0) + 1
    for p in ordem:
        p["open_tasks"] = abertas.get(p["sid"], 0)
    return ordem


def burnup(project, today):
    """Tarefas feitas × total, dia a dia, do início até hoje."""
    tasks = project.get("tasks") or []
    inicio = _d(project.get("start_date")) or _d(project.get("created_at")) or today
    criadas = [(_d(t.get("created_at")) or inicio) for t in tasks]
    if criadas:
        inicio = min([inicio] + criadas)
    fim = max(today, inicio)
    dias = (fim - inicio).days + 1
    passo = max(1, -(-dias // MAX_BURNUP_POINTS))
    pontos = [inicio + timedelta(days=i) for i in range(0, dias, passo)]
    if pontos[-1] != fim:
        pontos.append(fim)
    feitas = [_d(t.get("done_at")) if t.get("status") == DONE else None for t in tasks]
    return {"labels": [p.isoformat() for p in pontos],
            "total": [sum(1 for c in criadas if c <= p) for p in pontos],
            "done": [sum(1 for f in feitas if f and f <= p) for p in pontos]}


def summary(project):
    """O cartão da lista."""
    tasks = project.get("tasks") or []
    ms = project.get("milestones") or []
    nxt = next_milestone(project)
    return {
        "id": project["id"], "name": project.get("name", ""),
        "description": project.get("description", ""),
        "status": project.get("status", DEFAULT_STATUS),
        "category": project.get("category", ""),
        "color": project.get("color", COLORS[0]), "icon": project.get("icon", ICONS[0]),
        "lead_sid": project.get("lead_sid", ""), "lead_name": project.get("lead_name", ""),
        "members": [{"sid": m.get("sid", ""), "name": m.get("name", "")} for m in project.get("members") or []],
        "start_date": project.get("start_date", ""), "due_date": project.get("due_date", ""),
        "progress": progress(project),
        "tasks_total": len(tasks),
        "tasks_done": sum(1 for t in tasks if t.get("status") == DONE),
        "milestones_total": len(ms),
        "milestones_done": sum(1 for m in ms if m.get("done")),
        "next_milestone": {"title": nxt["title"], "date": nxt.get("date", "")} if nxt else None,
        "people": [{"sid": p["sid"], "name": p["name"]} for p in people(project, {})],
        "updated_at": project.get("updated_at", ""),
    }


def activity(kind, actor, at, **params):
    """Um evento da atividade. Vai ESTRUTURADO (tipo + parâmetros): a frase
    é montada na tela."""
    return {"at": at, "sid": actor["sid"], "name": actor["name"], "kind": kind, "params": params}


def push_activity(project, event):
    log = project.setdefault("activity", [])
    log.append(event)
    if len(log) > MAX_ACTIVITY:
        del log[:len(log) - MAX_ACTIVITY]


def calendar_events(projects):
    """As datas das iniciativas para o Calendar: a data-alvo, os marcos e o
    prazo das tarefas EM ABERTO. Derivadas na leitura — o calendário nunca
    guarda cópia."""
    out = []
    for p in projects or []:
        base = {"project_id": p["id"], "project_name": p.get("name", ""), "color": p.get("color", COLORS[0])}
        if p.get("due_date"):
            out.append(dict(base, kind="project", date=p["due_date"], title=p.get("name", ""),
                            status=p.get("status", DEFAULT_STATUS)))
        for m in p.get("milestones") or []:
            if m.get("date"):
                out.append(dict(base, kind="milestone", date=m["date"], title=m.get("title", ""),
                                id=m.get("id", ""), done=bool(m.get("done")), time=m.get("time", ""),
                                length=m.get("length"), type=m.get("type", DEFAULT_EVENT_TYPE),
                                where=m.get("where", "")))
        for t in p.get("tasks") or []:
            if t.get("due") and t.get("status") != DONE:
                out.append(dict(base, kind="task", date=t["due"], title=t.get("title", ""),
                                id=t.get("id", ""), status=t.get("status", ""),
                                priority=t.get("priority", ""), assignee_name=t.get("assignee_name", "")))
    out.sort(key=lambda e: (e["date"], e.get("time") or "", e["project_name"].lower(), e["kind"]))
    return out


def _nomes_atuais(card, dir_):
    """O nome gravado é o do momento da escrita; a tela mostra o atual do Team."""
    if card.get("lead_sid") in dir_:
        card["lead_name"] = dir_[card["lead_sid"]]["name"]
    for p in card.get("people") or []:
        if p["sid"] in dir_:
            p["name"] = dir_[p["sid"]]["name"]
    return card


def list_projects():
    """Os cartões: On going -> On hold -> Concluded, e pela data-alvo."""
    dir_ = ws.directory()
    cards = [_nomes_atuais(summary(p), dir_) for p in STORE.load()["projects"]]
    cards.sort(key=lambda c: (_STATUS_ORDER.get(c["status"], 9), c["due_date"] or "9999-12-31",
                              c["name"].lower()))
    return cards


def find(doc, project_id):
    for p in doc["projects"]:
        if p["id"] == project_id:
            return p
    return None


def get(project_id):
    return find(STORE.load(), project_id)


def exists(project_id):
    return get(project_id) is not None


def detail(project, today=None):
    today = today or ws.today()
    dir_ = ws.directory()
    tarefas = sorted(project.get("tasks") or [], key=lambda t: (
        _TASK_ORDER.get(t.get("status"), 9), _PRIO_ORDER.get(t.get("priority"), 9),
        t.get("due") or "9999-12-31", t.get("id", "")))
    marcos = sorted(project.get("milestones") or [], key=milestone_order)
    nxt = next_milestone(project)
    feitas = sum(1 for t in tarefas if t.get("status") == DONE)
    out = dict(summary(project))
    out.update({
        "created_at": project.get("created_at", ""),
        "created_by_name": project.get("created_by_name", ""),
        "tasks": tarefas, "milestones": marcos,
        "next_milestone_id": nxt["id"] if nxt else None,
        "open_tasks": len(tarefas) - feitas,
        "days_left": days_left(project, today),
        "people": people(project, dir_),
        "burnup": burnup(project, today),
        "activity": list(reversed(project.get("activity") or []))[:30],
        "pinned": project["id"] in ws.pinned(),
    })
    if out["lead_sid"] in dir_:
        out["lead_name"] = dir_[out["lead_sid"]]["name"]
    for t in out["tasks"]:
        if t.get("assignee_sid") in dir_:
            t["assignee_name"] = dir_[t["assignee_sid"]]["name"]
    return out


def all_tasks():
    """Toda tarefa de toda iniciativa, com a iniciativa ao lado — o quadro
    agrupa e filtra no navegador. Devolve (tarefas, iniciativas)."""
    tarefas, projetos = [], []
    for p in STORE.load()["projects"]:
        abertas = 0
        for t in p.get("tasks") or []:
            item = dict(t)
            item.update({"project_id": p["id"], "project_name": p.get("name", ""),
                         "project_color": p.get("color", COLORS[0]),
                         "project_category": p.get("category", ""),
                         "project_status": p.get("status", DEFAULT_STATUS)})
            tarefas.append(item)
            if t.get("status") != DONE:
                abertas += 1
        projetos.append({"id": p["id"], "name": p.get("name", ""), "color": p.get("color", COLORS[0]),
                         "status": p.get("status", DEFAULT_STATUS), "open": abertas,
                         "involved": involved_sids(p)})
    tarefas.sort(key=lambda t: (_PRIO_ORDER.get(t.get("priority"), 9), t.get("due") or "9999-12-31",
                                t.get("project_id", ""), t.get("id", "")))
    projetos.sort(key=lambda p: (_STATUS_ORDER.get(p["status"], 9), p["name"].lower()))
    return tarefas, projetos


def all_calendar_events():
    return calendar_events(STORE.load()["projects"])


def recent_activity(limit=30):
    """A atividade de todas as iniciativas, a mais nova primeiro (o sino)."""
    out = []
    for p in STORE.load()["projects"]:
        for a in p.get("activity") or []:
            out.append(dict(a, project_id=p["id"], project_name=p.get("name", ""),
                            color=p.get("color", COLORS[0])))
    out.sort(key=lambda a: a.get("at", ""), reverse=True)
    return out[:limit]


def involved_everywhere():
    sids = set()
    for p in STORE.load()["projects"]:
        sids.update(involved_sids(p))
    return sids


def open_due_count(today=None):
    """O contador da Tasks na sidebar: tarefas em aberto que vencem hoje ou
    estão atrasadas."""
    hoje = (today or ws.today()).isoformat()
    n = 0
    for p in STORE.load()["projects"]:
        for t in p.get("tasks") or []:
            if t.get("status") != DONE and t.get("due") and t["due"] <= hoje:
                n += 1
    return n


def pinned_cards():
    ids = ws.pinned()
    por_id = {p["id"]: p for p in STORE.load()["projects"]}
    return [{"id": i, "name": por_id[i].get("name", ""), "color": por_id[i].get("color", COLORS[0])}
            for i in ids if i in por_id]


# ---------------------------------------------------------------- escritas
def _actor():
    m = ws.me()
    return {"sid": m["sid"], "name": m["name"]}


def _project(doc, project_id):
    p = find(doc, project_id)
    if p is None:
        raise NotFound("project_not_found", "Iniciativa não encontrada.")
    return p


def _child(items, child_id, code, text):
    for it in items or []:
        if it.get("id") == child_id:
            return it
    raise NotFound(code, text)


def _child_id(parent, campo, prefixo):
    parent[campo] = int(parent.get(campo) or 0) + 1
    return "%s%d" % (prefixo, parent[campo])


def _event(project, actor, kind, **params):
    project["updated_at"] = ws.now()
    push_activity(project, activity(kind, actor, project["updated_at"], **params))


def create_project(data):
    actor = _actor()
    campos = validate_project(data, ws.eligible())

    def go(doc):
        agora = ws.now()
        doc["seq"] = int(doc.get("seq") or 0) + 1
        p = dict(campos)
        p.update({"id": "INI-%04d" % doc["seq"], "created_at": agora, "updated_at": agora,
                  "created_by_sid": actor["sid"], "created_by_name": actor["name"],
                  "start_date": campos["start_date"] or agora[:10],
                  "tasks": [], "milestones": [], "activity": []})
        _event(p, actor, "created")
        doc["projects"].append(p)
        return p
    return STORE.mutate(go)


def update_project(project_id, data):
    actor = _actor()
    people_list = ws.eligible()

    def go(doc):
        p = _project(doc, project_id)
        antes_membros = list(p.get("members") or [])
        campos = validate_project(data, people_list, current=p)
        mudou = [k for k, v in campos.items() if p.get(k, [] if k == "members" else None) != v]
        p.update(campos)
        novos = new_members(antes_membros, p.get("members"))
        if "status" in mudou:
            _event(p, actor, "status", status=p["status"])
        if novos:
            _event(p, actor, "members_added", names=", ".join(m["name"] or m["sid"] for m in novos))
        if any(k not in ("status", "members") for k in mudou) or ("members" in mudou and not novos):
            _event(p, actor, "edited")
        return p
    return STORE.mutate(go)


def delete_project(project_id):
    def go(doc):
        p = _project(doc, project_id)
        doc["projects"] = [x for x in doc["projects"] if x is not p]
        return p
    p = STORE.mutate(go)
    if project_id in ws.pinned():
        ws.toggle_pin(project_id, lambda _i: True)
    return p


def _set_done_at(task, status_antes):
    if task["status"] == DONE and status_antes != DONE:
        task["done_at"] = ws.now()
    elif task["status"] != DONE:
        task["done_at"] = ""


def add_task(project_id, data):
    actor = _actor()
    people_list = ws.eligible()

    def go(doc):
        p = _project(doc, project_id)
        campos = validate_task(data, assignable(p, people_list, data))
        t = dict(campos)
        t.update({"id": _child_id(p, "tseq", "t"), "created_at": ws.now(),
                  "created_by_sid": actor["sid"], "created_by_name": actor["name"],
                  "done_at": "", "subtasks": [], "comments": []})
        _set_done_at(t, None)
        p.setdefault("tasks", []).append(t)
        _event(p, actor, "task_added", task=t["title"])
        return p
    return STORE.mutate(go)


def update_task(project_id, task_id, data):
    actor = _actor()
    people_list = ws.eligible()

    def go(doc):
        p = _project(doc, project_id)
        t = _child(p.get("tasks"), task_id, "task_not_found", "Tarefa não encontrada.")
        antes = t.get("status")
        campos = validate_task(data, assignable(p, people_list, data, t), current=t)
        t.update(campos)
        _set_done_at(t, antes)
        if t["status"] != antes:
            if t["status"] == DONE:
                _event(p, actor, "task_done", task=t["title"])
            else:
                _event(p, actor, "task_moved", task=t["title"], status=t["status"])
        else:
            p["updated_at"] = ws.now()
        return p
    return STORE.mutate(go)


def delete_task(project_id, task_id):
    actor = _actor()

    def go(doc):
        p = _project(doc, project_id)
        t = _child(p.get("tasks"), task_id, "task_not_found", "Tarefa não encontrada.")
        p["tasks"] = [x for x in p["tasks"] if x is not t]
        _event(p, actor, "task_deleted", task=t["title"])
        return p
    return STORE.mutate(go)


def add_subtask(project_id, task_id, data):
    titulo = clean_text((data or {}).get("title"), MAX_TITLE)
    if not titulo:
        raise WorkspaceError("title_required", "Dê um título à subtarefa.")

    def go(doc):
        p = _project(doc, project_id)
        t = _child(p.get("tasks"), task_id, "task_not_found", "Tarefa não encontrada.")
        t.setdefault("subtasks", []).append({"id": _child_id(t, "sseq", "s"), "title": titulo, "done": False})
        p["updated_at"] = ws.now()
        return p
    return STORE.mutate(go)


def update_subtask(project_id, task_id, sub_id, data):
    data = data or {}

    def go(doc):
        p = _project(doc, project_id)
        t = _child(p.get("tasks"), task_id, "task_not_found", "Tarefa não encontrada.")
        s = _child(t.get("subtasks"), sub_id, "subtask_not_found", "Subtarefa não encontrada.")
        if "done" in data:
            s["done"] = bool(data.get("done"))
        if "title" in data:
            titulo = clean_text(data.get("title"), MAX_TITLE)
            if not titulo:
                raise WorkspaceError("title_required", "Dê um título à subtarefa.")
            s["title"] = titulo
        p["updated_at"] = ws.now()
        return p
    return STORE.mutate(go)


def delete_subtask(project_id, task_id, sub_id):
    def go(doc):
        p = _project(doc, project_id)
        t = _child(p.get("tasks"), task_id, "task_not_found", "Tarefa não encontrada.")
        s = _child(t.get("subtasks"), sub_id, "subtask_not_found", "Subtarefa não encontrada.")
        t["subtasks"] = [x for x in t["subtasks"] if x is not s]
        p["updated_at"] = ws.now()
        return p
    return STORE.mutate(go)


def add_comment(project_id, task_id, data):
    actor = _actor()
    texto = clean_block((data or {}).get("text"), MAX_COMMENT)
    if not texto:
        raise WorkspaceError("comment_required", "Escreva o comentário primeiro.")

    def go(doc):
        p = _project(doc, project_id)
        t = _child(p.get("tasks"), task_id, "task_not_found", "Tarefa não encontrada.")
        t.setdefault("comments", []).append(
            {"id": _child_id(t, "cseq", "c"), "sid": actor["sid"], "name": actor["name"],
             "text": texto, "at": ws.now()})
        _event(p, actor, "commented", task=t["title"])
        return p
    return STORE.mutate(go)


def add_milestone(project_id, data):
    actor = _actor()
    campos = validate_milestone(data)

    def go(doc):
        p = _project(doc, project_id)
        m = dict(campos)
        m.update({"id": _child_id(p, "mseq", "m"), "done": False, "done_at": ""})
        p.setdefault("milestones", []).append(m)
        _event(p, actor, "milestone_added", milestone=m["title"])
        return p
    return STORE.mutate(go)


def update_milestone(project_id, ms_id, data):
    actor = _actor()
    data = data or {}

    def go(doc):
        p = _project(doc, project_id)
        m = _child(p.get("milestones"), ms_id, "milestone_not_found", "Marco não encontrado.")
        if any(k in data for k in MILESTONE_FIELDS):
            atual = {k: m.get(k) for k in MILESTONE_FIELDS}
            atual.update({k: data[k] for k in MILESTONE_FIELDS if k in data})
            m.update(validate_milestone(atual))
            p["updated_at"] = ws.now()
        if "done" in data:
            novo = bool(data.get("done"))
            if novo != bool(m.get("done")):
                m["done"] = novo
                m["done_at"] = ws.now() if novo else ""
                _event(p, actor, "milestone_done" if novo else "milestone_reopened", milestone=m["title"])
        return p
    return STORE.mutate(go)


def delete_milestone(project_id, ms_id):
    def go(doc):
        p = _project(doc, project_id)
        m = _child(p.get("milestones"), ms_id, "milestone_not_found", "Marco não encontrado.")
        p["milestones"] = [x for x in p["milestones"] if x is not m]
        p["updated_at"] = ws.now()
        return p
    return STORE.mutate(go)
