"""
workspace_api.py — páginas e API do Workspace (Initiatives, Tasks, Calendar,
Team e Settings), num blueprint registrado pelo app.py.

    GET  /initiatives  /initiatives/<id>  /tasks  /calendar  /team  /settings

    GET|POST          /api/initiatives
    GET|PATCH|DELETE  /api/initiatives/<id>
    POST              /api/initiatives/<id>/pin
    POST              /api/initiatives/<id>/tasks
    PATCH|DELETE      /api/initiatives/<id>/tasks/<tid>
    POST              /api/initiatives/<id>/tasks/<tid>/subtasks
    PATCH|DELETE      /api/initiatives/<id>/tasks/<tid>/subtasks/<sid>
    POST              /api/initiatives/<id>/tasks/<tid>/comments
    POST              /api/initiatives/<id>/milestones
    PATCH|DELETE      /api/initiatives/<id>/milestones/<mid>
    GET               /api/tasks
    GET               /api/calendar                       eventos avulsos + datas das iniciativas
    POST              /api/calendar/events
    PATCH|DELETE      /api/calendar/events/<id>
    GET|POST          /api/team                           POST adiciona pelo SID
    GET               /api/team/lookup?sid=               o que o diretório sabe do SID
    PATCH|DELETE      /api/team/<sid>
    POST              /api/team/<sid>/refresh             busca o SID de novo no diretório
    GET|PATCH         /api/settings                       perfil e avisos
    POST              /api/settings/reset
    GET               /api/settings/export-tasks          CSV das tarefas
    GET               /api/shell                          sino, contador e fixadas
    GET               /api/search?q=                      a busca do Ctrl+K
"""

from flask import Blueprint, Response, abort, jsonify, render_template, request

import diretorio
import fatos
import initiatives as ini
import workspace as ws

bp = Blueprint("ws", __name__)


def _body():
    return request.get_json(silent=True) or {}


def _run(fn, *args):
    """Executa a escrita e traduz o erro de regra em JSON {error, code}."""
    try:
        return jsonify(fn(*args))
    except ws.NotFound as exc:
        return jsonify(error=exc.text, code=exc.code), 404
    except ws.WorkspaceError as exc:
        return jsonify(error=exc.text, code=exc.code, params=exc.params), 400


def _detail(project_id):
    p = ini.get(project_id)
    if p is None:
        return jsonify(error="Iniciativa não encontrada.", code="project_not_found"), 404
    return jsonify(ini.detail(p))


def _escrita_iniciativa(fn, *args):
    """Escrita que devolve a iniciativa inteira já com o que a tela calcula."""
    try:
        p = fn(*args)
    except ws.NotFound as exc:
        return jsonify(error=exc.text, code=exc.code), 404
    except ws.WorkspaceError as exc:
        return jsonify(error=exc.text, code=exc.code, params=exc.params), 400
    return jsonify(ini.detail(p))


# ------------------------------------------------------------------ páginas
@bp.route("/initiatives")
def initiatives_page():
    return render_template("initiatives.html", pagina="initiatives")


@bp.route("/initiatives/<project_id>")
def initiative_page(project_id):
    p = ini.get(project_id)
    if p is None:
        abort(404)
    return render_template("initiative.html", pagina="initiatives", projeto=ini.summary(p))


@bp.route("/tasks")
def tasks_page():
    return render_template("tasks.html", pagina="tasks")


@bp.route("/calendar")
def calendar_page():
    return render_template("calendar.html", pagina="calendar")


@bp.route("/team")
def team_page():
    return render_template("team.html", pagina="team")


@bp.route("/settings")
def settings_page():
    return render_template("settings.html", pagina="settings")


# ------------------------------------------------------------- initiatives
@bp.route("/api/initiatives", methods=["GET"])
def api_list():
    return jsonify(cards=ini.list_projects(), meta=ini.meta(), pinned=ws.pinned())


@bp.route("/api/initiatives", methods=["POST"])
def api_create():
    return _escrita_iniciativa(ini.create_project, _body())


@bp.route("/api/initiatives/<project_id>", methods=["GET"])
def api_get(project_id):
    resp = _detail(project_id)
    if isinstance(resp, tuple):
        return resp
    data = resp.get_json()
    data["meta"] = ini.meta()
    return jsonify(data)


@bp.route("/api/initiatives/<project_id>", methods=["PATCH"])
def api_update(project_id):
    return _escrita_iniciativa(ini.update_project, project_id, _body())


@bp.route("/api/initiatives/<project_id>", methods=["DELETE"])
def api_delete(project_id):
    return _run(lambda: {"ok": True, "id": ini.delete_project(project_id)["id"]})


@bp.route("/api/initiatives/<project_id>/pin", methods=["POST"])
def api_pin(project_id):
    if not ini.exists(project_id):
        return jsonify(error="Iniciativa não encontrada.", code="project_not_found"), 404
    lista = ws.toggle_pin(project_id, ini.exists)
    return jsonify(pinned=lista, on=project_id in lista, cards=ini.pinned_cards())


@bp.route("/api/initiatives/<project_id>/tasks", methods=["POST"])
def api_task_add(project_id):
    return _escrita_iniciativa(ini.add_task, project_id, _body())


@bp.route("/api/initiatives/<project_id>/tasks/<task_id>", methods=["PATCH"])
def api_task_update(project_id, task_id):
    return _escrita_iniciativa(ini.update_task, project_id, task_id, _body())


@bp.route("/api/initiatives/<project_id>/tasks/<task_id>", methods=["DELETE"])
def api_task_delete(project_id, task_id):
    return _escrita_iniciativa(ini.delete_task, project_id, task_id)


@bp.route("/api/initiatives/<project_id>/tasks/<task_id>/subtasks", methods=["POST"])
def api_sub_add(project_id, task_id):
    return _escrita_iniciativa(ini.add_subtask, project_id, task_id, _body())


@bp.route("/api/initiatives/<project_id>/tasks/<task_id>/subtasks/<sub_id>", methods=["PATCH"])
def api_sub_update(project_id, task_id, sub_id):
    return _escrita_iniciativa(ini.update_subtask, project_id, task_id, sub_id, _body())


@bp.route("/api/initiatives/<project_id>/tasks/<task_id>/subtasks/<sub_id>", methods=["DELETE"])
def api_sub_delete(project_id, task_id, sub_id):
    return _escrita_iniciativa(ini.delete_subtask, project_id, task_id, sub_id)


@bp.route("/api/initiatives/<project_id>/tasks/<task_id>/comments", methods=["POST"])
def api_comment(project_id, task_id):
    return _escrita_iniciativa(ini.add_comment, project_id, task_id, _body())


@bp.route("/api/initiatives/<project_id>/milestones", methods=["POST"])
def api_ms_add(project_id):
    return _escrita_iniciativa(ini.add_milestone, project_id, _body())


@bp.route("/api/initiatives/<project_id>/milestones/<ms_id>", methods=["PATCH"])
def api_ms_update(project_id, ms_id):
    return _escrita_iniciativa(ini.update_milestone, project_id, ms_id, _body())


@bp.route("/api/initiatives/<project_id>/milestones/<ms_id>", methods=["DELETE"])
def api_ms_delete(project_id, ms_id):
    return _escrita_iniciativa(ini.delete_milestone, project_id, ms_id)


# ------------------------------------------------------------------- tasks
@bp.route("/api/tasks")
def api_tasks():
    tarefas, projetos = ini.all_tasks()
    return jsonify(tasks=tarefas, initiatives=projetos, meta=ini.meta())


# ---------------------------------------------------------------- calendar
def _eventos():
    return sorted(ws.standalone_events() + ini.all_calendar_events(),
                  key=lambda e: (e["date"], e.get("time") or "", e["title"].lower()))


@bp.route("/api/calendar")
def api_calendar():
    tarefas, projetos = ini.all_tasks()
    return jsonify(events=_eventos(), meta=ini.meta(),
                   initiatives=[{"id": p["id"], "name": p["name"], "color": p["color"]} for p in projetos])


@bp.route("/api/calendar/events", methods=["POST"])
def api_event_add():
    return _run(ws.add_event, _body())


@bp.route("/api/calendar/events/<event_id>", methods=["PATCH"])
def api_event_update(event_id):
    return _run(ws.update_event, event_id, _body())


@bp.route("/api/calendar/events/<event_id>", methods=["DELETE"])
def api_event_delete(event_id):
    return _run(ws.delete_event, event_id)


# -------------------------------------------------------------------- team
def _team_payload():
    tarefas, projetos = ini.all_tasks()
    abertas, lidera, em = {}, {}, {}
    for t in tarefas:
        if t.get("status") != ini.DONE and t.get("assignee_sid"):
            abertas[t["assignee_sid"]] = abertas.get(t["assignee_sid"], 0) + 1
    for c in ini.list_projects():
        if c["lead_sid"]:
            lidera[c["lead_sid"]] = lidera.get(c["lead_sid"], 0) + 1
        for p in c["people"]:
            em.setdefault(p["sid"], []).append({"id": c["id"], "name": c["name"], "color": c["color"]})
    doc = ws.settings()
    pessoas = []
    for p in ws.team():
        pessoas.append(dict(p, photo=ws.photo_url(p["sid"]), is_me=p["sid"] == doc["me"],
                            open_tasks=abertas.get(p["sid"], 0), leads=lidera.get(p["sid"], 0),
                            initiatives=em.get(p["sid"], [])))
    return {"people": pessoas, "me": doc["me"], "phonebook": diretorio.phonebook_ok()}


@bp.route("/api/team", methods=["GET"])
def api_team():
    return jsonify(_team_payload())


@bp.route("/api/team/lookup")
def api_team_lookup():
    sid = (request.args.get("sid") or "").strip().upper()
    try:
        ws.clean_sid(sid)
    except ws.WorkspaceError as exc:
        return jsonify(error=exc.text, code=exc.code), 400
    ja = any(p["sid"] == sid for p in ws.team())
    achado = diretorio.lookup(sid)
    if achado:
        achado["photo"] = ws.photo_url(sid)
    return jsonify(found=bool(achado), person=achado, exists=ja)


@bp.route("/api/team", methods=["POST"])
def api_team_add():
    try:
        ws.add_person(_body())
    except ws.WorkspaceError as exc:
        return jsonify(error=exc.text, code=exc.code), 400
    return jsonify(_team_payload())


@bp.route("/api/team/<sid>", methods=["PATCH"])
def api_team_update(sid):
    try:
        ws.update_person(sid.upper(), _body())
    except ws.NotFound as exc:
        return jsonify(error=exc.text, code=exc.code), 404
    except ws.WorkspaceError as exc:
        return jsonify(error=exc.text, code=exc.code), 400
    return jsonify(_team_payload())


@bp.route("/api/team/<sid>/refresh", methods=["POST"])
def api_team_refresh(sid):
    try:
        _, achado = ws.refresh_person(sid.upper())
    except ws.NotFound as exc:
        return jsonify(error=exc.text, code=exc.code), 404
    out = _team_payload()
    out["found"] = bool(achado)
    out["source"] = (achado or {}).get("source", "")
    return jsonify(out)


@bp.route("/api/team/<sid>", methods=["DELETE"])
def api_team_delete(sid):
    sid = sid.upper()
    try:
        ws.check_delete(sid)
        ini.release_person(sid)
        ws.delete_person(sid)
    except ws.NotFound as exc:
        return jsonify(error=exc.text, code=exc.code), 404
    except ws.WorkspaceError as exc:
        return jsonify(error=exc.text, code=exc.code), 400
    return jsonify(_team_payload())


# ---------------------------------------------------------------- settings
def _settings_payload():
    doc = ws.settings()
    tarefas, _ = ini.all_tasks()
    eu = ws.me()
    return {"profile": dict(eu, photo=ws.photo_url(eu["sid"])), "notify": doc["notify"],
            "tasks_total": len(tarefas), "team_total": len(doc["team"]),
            "phonebook": diretorio.phonebook_ok(), "workspace_dir": ws.WS_DIR}


@bp.route("/api/settings", methods=["GET"])
def api_settings():
    return jsonify(_settings_payload())


@bp.route("/api/settings", methods=["PATCH"])
def api_settings_update():
    corpo = _body()
    try:
        if "profile" in corpo:
            ws.update_profile(corpo["profile"])
        if "notify" in corpo:
            ws.update_notify(corpo["notify"])
    except ws.WorkspaceError as exc:
        return jsonify(error=exc.text, code=exc.code), 400
    return jsonify(_settings_payload())


@bp.route("/api/settings/reset", methods=["POST"])
def api_settings_reset():
    ws.reset_preferences()
    return jsonify(_settings_payload())


@bp.route("/api/settings/export-tasks")
def api_export_tasks():
    tarefas, _ = ini.all_tasks()
    return Response(ws.tasks_csv(tarefas), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=exchange_tracker_tasks.csv"})


# ------------------------------------------------------------------- casca
@bp.route("/api/shell")
def api_shell():
    tarefas, _ = ini.all_tasks()
    return jsonify(due=ini.open_due_count(), pinned=ini.pinned_cards(),
                   notifications=ws.notifications(tarefas, _eventos(), ini.recent_activity()))


@bp.route("/api/search")
def api_search():
    q = (request.args.get("q") or "").strip().lower()
    if len(q) < 2:
        return jsonify(results=[])
    out = []
    for c in ini.list_projects():
        if q in " ".join((c["name"], c["description"], c["category"], c["lead_name"])).lower():
            out.append({"kind": "initiative", "title": c["name"], "detail": c["category"] or c["status"],
                        "url": "/initiatives/" + c["id"], "color": c["color"]})
    tarefas, _ = ini.all_tasks()
    for t in tarefas:
        if q in " ".join((t["title"], t.get("assignee_name", ""), t["project_name"])).lower():
            out.append({"kind": "task", "title": t["title"], "detail": t["project_name"] + " · " + t["status"],
                        "url": "/initiatives/%s?task=%s" % (t["project_id"], t["id"]),
                        "color": t["project_color"]})
    for e in ws.standalone_events():
        if q in (e["title"] + " " + e.get("where", "")).lower():
            out.append({"kind": "event", "title": e["title"], "detail": fatos.data_br(e["date"]),
                        "url": "/calendar?d=" + e["date"]})
    for p in ws.team():
        if q in (p["name"] + " " + p["sid"] + " " + p.get("role", "")).lower():
            out.append({"kind": "person", "title": p["name"], "detail": p["sid"] + (" · " + p["role"] if p.get("role") else ""),
                        "url": "/team#" + p["sid"]})
    for f in fatos.listar_cards(q=q)[:8]:
        out.append({"kind": "fato", "title": f.get("empresa") or f.get("titulo", ""),
                    "detail": (f.get("ticker") or "") + " · ref. " + fatos.data_br(f.get("data_referencia") or ""),
                    "url": "/fatos?q=" + q})
    return jsonify(results=out[:40])


def shell_context():
    """O que a casca desenha no servidor: quem sou, o contador da Tasks e as
    iniciativas fixadas (sem piscar ao carregar)."""
    try:
        eu = ws.me()
        return {"ws_me": dict(eu, photo=ws.photo_url(eu["sid"])),
                "ws_due": ini.open_due_count(), "ws_pinned": ini.pinned_cards()}
    except Exception:  # pragma: no cover - a casca abre mesmo sem o armazém
        return {"ws_me": {"sid": "", "name": "", "role": "", "photo": ""}, "ws_due": 0, "ws_pinned": []}


def init_app(app):
    app.register_blueprint(bp)
    app.context_processor(shell_context)
