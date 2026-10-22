"""
diretorio.py — quem é o SID: nome, e-mail, cargo e equipe, buscados
internamente.

Ordem das fontes (a primeira que achar o SID responde; o que ela não trouxe a
seguinte completa):

  1. o phonebook interno do JPMorgan pela `awmpy` (`get_phonebook_data(sid)`:
     nameFull, email, positionName), instalada do Artifactory pelo iniciar.bat;
  2. o Active Directory (Windows + pywin32): o SID é o sAMAccountName; a busca
     vai ao Global Catalog (a floresta toda) e, se ele não responder, ao
     domínio da máquina — displayName, mail, title e department;
  3. o catálogo do Outlook da máquina (Windows + pywin32): o SID resolve como
     destinatário e o usuário Exchange dá nome, e-mail, cargo e departamento;
  4. só para o SID de quem está logado: o nome de exibição do Windows
     (GetUserNameExW, sem dependência).

A foto é `static/img/users/<sid>.jpg` (fora do git).

Cada SID fica em memória por 10 minutos; as fontes são lidas só quando alguém
é adicionado ou a tela pede.
"""

import logging
import os
import re
import sys
import threading
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PHOTOS_DIR = os.path.join(BASE_DIR, "static", "img", "users")
_TTL = 600.0
_RE_SID = re.compile(r"^[A-Z0-9]{2,20}$")

log = logging.getLogger(__name__)
_lock = threading.Lock()
_memo = {}


# o phonebook não documenta o nome do campo de área; o primeiro que vier serve
_AWM_EQUIPE = ("departmentName", "department", "orgUnitName", "lobName", "lineOfBusiness",
               "businessUnitName", "costCenterName")


def _do_awmpy(sid):
    try:
        import awmpy
    except ImportError:
        log.info("awmpy ausente: phonebook do JPMorgan não consultado")
        return None
    try:
        data = awmpy.get_phonebook_data(sid) or {}
    except Exception:
        log.warning("o phonebook (awmpy) falhou para o SID %s", sid, exc_info=True)
        return None
    if not isinstance(data, dict):
        return None
    texto = lambda k: str(data.get(k) or "").strip()
    equipe = next((texto(k) for k in _AWM_EQUIPE if texto(k)), "")
    return {"name": texto("nameFull"), "email": texto("email"), "role": texto("positionName"),
            "team": equipe, "source": "Phonebook JPMorgan"}


def _do_ad(sid):
    """O SID no Active Directory. O SID já foi validado como [A-Z0-9], então
    entra no filtro LDAP sem risco de injeção."""
    if sys.platform != "win32":
        return None
    try:
        import pythoncom
        import win32com.client
    except ImportError:
        return None
    pythoncom.CoInitialize()
    try:
        root = win32com.client.GetObject("LDAP://rootDSE")
        bases = []
        try:
            bases.append("GC://" + root.Get("rootDomainNamingContext"))
        except Exception:
            pass
        try:
            bases.append("LDAP://" + root.Get("defaultNamingContext"))
        except Exception:
            pass
        conn = win32com.client.Dispatch("ADODB.Connection")
        conn.Provider = "ADsDSOObject"
        conn.Open("Active Directory Provider")
        try:
            for base in bases:
                cmd = win32com.client.Dispatch("ADODB.Command")
                cmd.ActiveConnection = conn
                cmd.CommandText = ("<%s>;(&(objectCategory=person)(sAMAccountName=%s));"
                                   "displayName,mail,title,department;subtree" % (base, sid))
                try:
                    rs = cmd.Execute()[0]
                except Exception:
                    continue
                if rs.EOF:
                    continue

                def campo(nome):
                    v = rs.Fields(nome).Value
                    if isinstance(v, (list, tuple)):
                        v = v[0] if v else ""
                    return str(v or "").strip()
                return {"name": campo("displayName"), "email": campo("mail"), "role": campo("title"),
                        "team": campo("department"), "source": "Active Directory"}
        finally:
            conn.Close()
    except Exception:
        log.warning("o Active Directory não respondeu para o SID %s", sid, exc_info=True)
    finally:
        pythoncom.CoUninitialize()
    return None


def _usuario_da_maquina():
    try:
        import getpass
        return re.sub(r"[^A-Za-z0-9]", "", getpass.getuser() or "").upper()
    except Exception:
        return ""


def _do_windows(sid):
    """O nome de exibição de quem está logado (GetUserNameExW, NameDisplay)."""
    if sys.platform != "win32" or sid != _usuario_da_maquina():
        return None
    try:
        import ctypes
        tam = ctypes.c_ulong(0)
        ctypes.windll.secur32.GetUserNameExW(3, None, ctypes.byref(tam))
        if not tam.value:
            return None
        buf = ctypes.create_unicode_buffer(tam.value)
        if not ctypes.windll.secur32.GetUserNameExW(3, buf, ctypes.byref(tam)):
            return None
        nome = buf.value.strip()
    except Exception:
        return None
    return {"name": nome, "email": "", "role": "", "team": "", "source": "Windows"} if nome else None


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
        if sid == _usuario_da_maquina():
            # o próprio usuário: o perfil do Outlook já é ele, sem resolver nome
            entrada = ns.CurrentUser.AddressEntry
        else:
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


def lookup(sid, fresco=False):
    """{sid, name, email, role, team, photo, source} do SID, ou None se nenhuma
    fonte o conhece (a foto sozinha não basta). `fresco` ignora a memória."""
    sid = str(sid or "").strip().upper()
    if not _RE_SID.match(sid):
        return None
    with _lock:
        hit = _memo.get(sid)
        if hit and not fresco and time.time() - hit[0] < _TTL:
            return dict(hit[1]) if hit[1] else None
    achado = None
    for fonte in (_do_awmpy, _do_ad, _do_outlook, _do_windows):
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
    if achado and not achado.get("name"):
        achado = None if not any(achado.get(k) for k in ("email", "role", "team")) else achado
    if achado:
        achado["sid"] = sid
        achado["photo"] = has_photo(sid)
    with _lock:
        _memo[sid] = (time.time(), achado)
    return dict(achado) if achado else None


def phonebook_ok():
    """A `awmpy` está instalada nesta máquina?"""
    import importlib.util
    return importlib.util.find_spec("awmpy") is not None


def has_photo(sid):
    return os.path.isfile(photo_path(str(sid or "")))
