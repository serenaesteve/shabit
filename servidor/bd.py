"""Datos de shabit en SBD.

La app manda una «instantánea» de sus datos (hábitos, días, cantidades, ánimo y ajustes) y
aquí se reparte en filas de SBD. Para que cada cuenta ocupe poco, un mes de un hábito es una
sola fila de «meses» con un carácter por día. Al guardar solo se escriben las filas que han
cambiado, todo dentro de una transacción.

Todas las órdenes están en el lenguaje de SBD y los valores van siempre como parámetros «?».
"""
import hashlib
import hmac
import json
import os
import secrets
import threading
from datetime import date, timedelta

from sbd.cliente import Cliente

EPOCA = date(1970, 1, 1)
LOTE = 200   # filas de meses por orden al guardar
LIMITES = {"habitos": 200, "meses": 6000, "animo": 600, "nota": 600}
TEMAS = ("claro", "oscuro", "sistema", "arena", "menta", "lavanda")


class Conflicto(Exception):
    """Otro dispositivo guardó antes: se devuelven sus datos para mezclarlos."""

    def __init__(self, version, datos):
        super().__init__("versión antigua")
        self.version, self.datos = version, datos


class DatosNoValidos(ValueError):
    pass


# --------------------------------------------------------------------------- fechas
def mes_y_dia(dia_epoca: int):
    f = EPOCA + timedelta(days=int(dia_epoca))
    return f"{f.year:04d}-{f.month:02d}", f.day


def dia_epoca(mes: str, dia: int) -> int:
    año, m = map(int, mes.split("-"))
    return (date(año, m, dia) - EPOCA).days


# --------------------------------------------------------------------------- instantánea ⇄ filas
CAMPOS_HABITO = ("nombre", "icono", "momento", "color", "tipo", "cantidad", "unidad", "objetivo",
                 "meta", "pasos", "creado", "archivado", "orden", "etiqueta", "reto")
ETIQUETAS = ("salud", "mente", "ejercicio", "casa", "trabajo", "aprender", "social")
HORA = __import__("re").compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _entero(v, minimo=None, maximo=None, defecto=None):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return defecto
    v = int(v)
    if minimo is not None and v < minimo or maximo is not None and v > maximo:
        return defecto
    return v


def _texto(v, largo, defecto=None):
    return str(v)[:largo] if isinstance(v, str) and v.strip() else defecto


def limpiar_habito(h):
    if not isinstance(h, dict):
        raise DatosNoValidos("hábito")
    id_ = _entero(h.get("id"), 1, 10**15)
    nombre = _texto(h.get("nombre"), 60)
    if id_ is None or nombre is None:
        raise DatosNoValidos("hábito sin id o sin nombre")
    dias = h.get("dias")
    concretos = None
    if isinstance(dias, list) and dias:
        concretos = ",".join(str(d) for d in sorted({x for x in dias if isinstance(x, int) and 0 <= x <= 6}))
    avisos = h.get("avisos") if isinstance(h.get("avisos"), list) else [h.get("aviso")]
    avisos = sorted({a for a in avisos if isinstance(a, str) and HORA.match(a)})[:3]
    pausas = []
    for p in (h.get("pausas") or [])[:20]:
        if isinstance(p, list) and len(p) == 2 and isinstance(p[0], int) and (p[1] is None or isinstance(p[1], int)):
            pausas.append([p[0], p[1]])
    return {
        "id": id_, "nombre": nombre, "icono": _texto(h.get("icono"), 20),
        "momento": h.get("momento") if h.get("momento") in ("manana", "tarde", "noche", "cualquiera") else "cualquiera",
        "color": _entero(h.get("color"), 0, 99, 0),
        "tipo": h.get("tipo") if h.get("tipo") in ("simple", "cantidad", "tiempo", "evitar") else "simple",
        "cantidad": _entero(h.get("cantidad"), 1, 999), "unidad": _texto(h.get("unidad"), 15),
        "objetivo": _entero(h.get("objetivo"), 1, 7, 5), "concretos": concretos or None,
        "por_mes": _entero(h.get("porMes"), 1, 31),
        "meta": _entero(h.get("meta"), 1, 10000, 66), "pasos": _entero(h.get("pasos"), 1, 100000),
        "avisos": ",".join(avisos) or None, "pausas": json.dumps(pausas) if pausas else None,
        "etiqueta": h.get("etiqueta") if h.get("etiqueta") in ETIQUETAS else None,
        "reto": _entero(h.get("reto"), 1, 366),
        "inicio_reto": _entero(h.get("inicioReto"), 0, 10**6) if h.get("reto") else None,
        "creado": _entero(h.get("creado"), 0, 10**6, 0),
        "archivado": bool(h.get("archivado")), "orden": _entero(h.get("orden"), 0, 10**6, 0),
    }


def instantanea_a_filas(d):
    """De la instantánea de la app a filas: hábitos, meses, ánimo y ajustes. Lanza DatosNoValidos."""
    if not isinstance(d, dict):
        raise DatosNoValidos("datos")
    habitos = {}
    for h in (d.get("habitos") or []):
        fila = limpiar_habito(h)
        habitos[fila["id"]] = fila
    if len(habitos) > LIMITES["habitos"]:
        raise DatosNoValidos("demasiados hábitos")

    meses = {}   # (habito, mes) -> {"marcas": [...31], "progreso": {}, "notas": {}, "horas": {}}
    def mes_de(hid, mes):
        return meses.setdefault((hid, mes), {"marcas": ["."] * 31, "progreso": {}, "notas": {}, "horas": {}})

    for hid, dias in (d.get("registros") or {}).items():
        hid = _entero(int(hid) if str(hid).isdigit() else None, 1)
        if hid not in habitos or not isinstance(dias, dict):
            continue
        for dia, tipo in dias.items():
            if tipo in ("H", "D", "R") and str(dia).lstrip("-").isdigit():
                mes, n = mes_y_dia(int(dia))
                mes_de(hid, mes)["marcas"][n - 1] = tipo
    for hid, dias in (d.get("progreso") or {}).items():
        hid = _entero(int(hid) if str(hid).isdigit() else None, 1)
        if hid not in habitos or not isinstance(dias, dict):
            continue
        for dia, valor in dias.items():
            v = _entero(valor, 1, 10**6)
            if v and str(dia).lstrip("-").isdigit():
                mes, n = mes_y_dia(int(dia))
                mes_de(hid, mes)["progreso"][str(n)] = v
    for clave, largo, valido in (("notas", LIMITES["nota"], lambda v: isinstance(v, str) and v.strip()),
                                 ("horas", 5, lambda v: isinstance(v, str) and HORA.match(v))):
        for hid, dias in (d.get(clave) or {}).items():
            hid = _entero(int(hid) if str(hid).isdigit() else None, 1)
            if hid not in habitos or not isinstance(dias, dict):
                continue
            for dia, valor in dias.items():
                if valido(valor) and str(dia).lstrip("-").isdigit():
                    mes, n = mes_y_dia(int(dia))
                    mes_de(hid, mes)[clave][str(n)] = valor.strip()[:largo]
    if len(meses) > LIMITES["meses"]:
        raise DatosNoValidos("demasiados meses")

    animo = {}   # mes -> {"niveles": [...31], "notas": {}}
    for dia, a in (d.get("animo") or {}).items():
        if not str(dia).lstrip("-").isdigit() or not isinstance(a, dict):
            continue
        mes, n = mes_y_dia(int(dia))
        fila = animo.setdefault(mes, {"niveles": ["."] * 31, "notas": {}})
        nivel = _entero(a.get("nivel"), 1, 5)
        if nivel:
            fila["niveles"][n - 1] = str(nivel)
        nota = _texto(a.get("nota"), LIMITES["nota"])
        if nota:
            fila["notas"][str(n)] = nota
    if len(animo) > LIMITES["animo"]:
        raise DatosNoValidos("demasiado ánimo")

    aj = d.get("ajustes") if isinstance(d.get("ajustes"), dict) else {}
    ajustes = {"tema": aj.get("tema") if aj.get("tema") in TEMAS else "claro",
               "primer": 0 if aj.get("primer") == 0 else 1,
               "texto": aj.get("texto") if aj.get("texto") in ("normal", "grande", "enorme") else "normal",
               "resumen": aj.get("resumen") if isinstance(aj.get("resumen"), str) and HORA.match(aj["resumen"]) else None,
               "informe": aj.get("informe") is not False}
    js = lambda v: json.dumps(v, sort_keys=True, ensure_ascii=False) if v else None
    return {
        "habitos": habitos,
        "meses": {k: {"marcas": "".join(v["marcas"]), "progreso": js(v["progreso"]), "notas": js(v["notas"]), "horas": js(v["horas"])}
                  for k, v in meses.items()},
        "animo": {k: {"niveles": "".join(v["niveles"]), "notas": json.dumps(v["notas"], sort_keys=True, ensure_ascii=False) if v["notas"] else None}
                  for k, v in animo.items()},
        "ajustes": json.dumps(ajustes, sort_keys=True),
        "zona": _texto(d.get("zona"), 40, "Europe/Madrid"),
    }


def habito_de_fila(h):
    x = {k: h.get(k) for k in CAMPOS_HABITO}
    x["id"] = h["id"]
    x["dias"] = [int(d) for d in h["concretos"].split(",")] if h.get("concretos") else None
    x["porMes"] = h.get("por_mes")
    x["inicioReto"] = h.get("inicio_reto")
    x["avisos"] = h["avisos"].split(",") if h.get("avisos") else []
    x["pausas"] = json.loads(h["pausas"]) if h.get("pausas") else []
    x["archivado"] = bool(h["archivado"])
    return x


def filas_a_instantanea(habitos, meses, animo, ajustes):
    """De las filas de SBD a la instantánea que entiende la app."""
    registros, por_dia = {}, {"progreso": {}, "notas": {}, "horas": {}}
    for m in meses:
        hid = str(m["habito"])
        for i, c in enumerate(m["marcas"]):
            if c in "HDR":
                registros.setdefault(hid, {})[str(dia_epoca(m["mes"], i + 1))] = c
        for clave in por_dia:
            for n, v in json.loads(m.get(clave) or "{}").items():
                por_dia[clave].setdefault(hid, {})[str(dia_epoca(m["mes"], int(n)))] = v
    an = {}
    for a in animo:
        notas = json.loads(a["notas"] or "{}")
        for i, c in enumerate(a["niveles"]):
            nota = notas.get(str(i + 1))
            if c != "." or nota:
                an[str(dia_epoca(a["mes"], i + 1))] = {"nivel": int(c) if c != "." else None, "nota": nota}
    hs = [habito_de_fila(h) for h in habitos]
    return {"habitos": sorted(hs, key=lambda h: (h["orden"], h["id"])), "registros": registros,
            **por_dia, "animo": an, "ajustes": json.loads(ajustes or "{}")}


# --------------------------------------------------------------------------- acceso a SBD
class Base:
    def __init__(self, url, clave, base="shabit"):
        self.db = Cliente(url, clave, base)
        self.cerrojo = threading.Lock()   # una escritura de cuenta cada vez

    def aplicar_esquema(self):
        """Crea las tablas que falten y vuelve a crear los procedimientos almacenados."""
        for archivo in ("esquema.sbd", "procedimientos.sbd"):
            with open(os.path.join(os.path.dirname(__file__), archivo), encoding="utf-8") as f:
                self.db.ejecutar(f.read())

    # ----- cuentas
    def crear_cuenta(self, zona="Europe/Madrid"):
        """Crea una cuenta anónima. Devuelve (id, código secreto); del código solo se guarda la huella."""
        id_ = secrets.token_urlsafe(9)
        secreto = secrets.token_urlsafe(24)
        self.db.ejecutar("insertar en cuentas { id: ?, huella: ?, zona: ? }", [id_, _huella(secreto), zona])
        return id_, f"{id_}.{secreto}"

    def cuenta_del_codigo(self, codigo):
        """Devuelve el id de la cuenta si el código es correcto, o None."""
        if not isinstance(codigo, str) or codigo.count(".") != 1:
            return None
        id_, secreto = codigo.split(".")
        fila = self.db.consultar("buscar cuentas donde id = ? mostrar huella", [id_])
        if fila and hmac.compare_digest(fila[0]["huella"], _huella(secreto)):
            return id_
        return None

    def borrar_cuenta(self, cuenta):
        # Las tablas que apuntan a «cuentas» se borran en cascada.
        self.db.ejecutar("borrar de cuentas donde id = ?", [cuenta])

    # ----- datos
    def leer(self, cuenta):
        c = self.db.consultar("buscar cuentas donde id = ? mostrar version, ajustes", [cuenta])
        if not c:
            return None, None
        habitos = self.db.consultar("ejecutar habitos_de(?)", [cuenta])
        meses = self.db.consultar("ejecutar meses_de(?, ?)", [cuenta, "0000-00"])
        animo = self.db.consultar("buscar animo donde cuenta = ? mostrar mes, niveles, notas", [cuenta])
        return c[0]["version"], filas_a_instantanea(habitos, meses, animo, c[0]["ajustes"])

    def guardar(self, cuenta, version, instantanea):
        """Guarda los cambios si «version» es la actual. Si no, lanza Conflicto con lo que hay."""
        nuevo = instantanea_a_filas(instantanea)
        with self.cerrojo:
            conflicto = self._escribir(cuenta, version, nuevo)
        if conflicto:
            raise Conflicto(*self.leer(cuenta))
        return version + 1

    def _escribir(self, cuenta, version, nuevo):
        """Escribe lo que ha cambiado. Devuelve True si la versión no coincide (y no escribe nada)."""
        with self.db.transaccion() as t:
            actual = t.consultar("buscar cuentas donde id = ? mostrar version", [cuenta])
            if not actual:
                raise KeyError(cuenta)
            if actual[0]["version"] != version:
                return True
            habitos = {h["id"]: h for h in t.consultar("buscar habitos donde cuenta = ?", [cuenta])}
            meses = {(m["habito"], m["mes"]): m for m in t.consultar("ejecutar meses_de(?, ?)", [cuenta, "0000-00"])}
            animo = {a["mes"]: a for a in t.consultar("buscar animo donde cuenta = ? mostrar mes, niveles, notas", [cuenta])}

            for hid in habitos.keys() - nuevo["habitos"].keys():   # sus meses se van en cascada
                t.ejecutar("borrar de habitos donde cuenta = ? y id = ?", [cuenta, hid])
            for hid, h in nuevo["habitos"].items():
                viejo = habitos.get(hid)
                if viejo is None or any(viejo.get(k) != h[k] for k in h if k != "id"):
                    campos = [k for k in h if k != "id"]
                    t.ejecutar("insertar o actualizar en habitos { cuenta: ?, id: ?, " + ", ".join(f"{k}: ?" for k in campos) + " }",
                               [cuenta, hid] + [h[k] for k in campos])
            for (hid, mes) in meses.keys() - nuevo["meses"].keys():
                if hid in nuevo["habitos"]:
                    t.ejecutar("borrar de meses donde cuenta = ? y habito = ? y mes = ?", [cuenta, hid, mes])
            cambiados = [(hid, mes, m) for (hid, mes), m in nuevo["meses"].items()
                         if (v := meses.get((hid, mes))) is None or any(v.get(k) != m[k] for k in m)]
            for i in range(0, len(cambiados), LOTE):   # varias filas por orden: con años de datos va mucho más rápido
                lote = cambiados[i:i + LOTE]
                t.ejecutar("insertar o actualizar en meses " + ", ".join(
                    ["{ cuenta: ?, habito: ?, mes: ?, marcas: ?, progreso: ?, notas: ?, horas: ? }"] * len(lote)),
                    [x for hid, mes, m in lote for x in (cuenta, hid, mes, m["marcas"], m["progreso"], m["notas"], m["horas"])])
            for mes in animo.keys() - nuevo["animo"].keys():
                t.ejecutar("borrar de animo donde cuenta = ? y mes = ?", [cuenta, mes])
            for mes, a in nuevo["animo"].items():
                viejo = animo.get(mes)
                if viejo is None or viejo["niveles"] != a["niveles"] or viejo["notas"] != a["notas"]:
                    t.ejecutar("insertar o actualizar en animo { cuenta: ?, mes: ?, niveles: ?, notas: ? }", [cuenta, mes, a["niveles"], a["notas"]])
            t.ejecutar("actualizar cuentas poner version = version + 1, ajustes = ?, zona = ?, vista = ahora() donde id = ?",
                       [nuevo["ajustes"], nuevo["zona"], cuenta])
        return False

    # ----- recordatorios
    def suscribir(self, cuenta, endpoint, p256dh, auth):
        self.db.ejecutar("insertar o actualizar en suscripciones { endpoint: ?, cuenta: ?, p256dh: ?, auth: ? }", [endpoint, cuenta, p256dh, auth])

    def desuscribir(self, endpoint, cuenta=None):
        if cuenta:
            self.db.ejecutar("borrar de suscripciones donde endpoint = ? y cuenta = ?", [endpoint, cuenta])
        else:
            self.db.ejecutar("borrar de suscripciones donde endpoint = ?", [endpoint])

    def avisos_candidatos(self):
        """Cuentas con alguna suscripción, con su zona, sus ajustes y sus hábitos activos."""
        subs = {}
        for s in self.db.consultar("buscar suscripciones mostrar endpoint, cuenta, p256dh, auth"):
            subs.setdefault(s["cuenta"], []).append(s)
        if not subs:
            return []
        habitos = {}
        for h in self.db.consultar("buscar habitos donde archivado = falso mostrar cuenta, id, nombre, tipo, avisos, concretos, por_mes, pausas, creado"):
            if h["cuenta"] in subs:
                habitos.setdefault(h["cuenta"], []).append(h)
        cuentas = {c["id"]: c for c in self.db.consultar("buscar cuentas mostrar id, zona, ajustes")}
        return [{"cuenta": c, "zona": cuentas.get(c, {}).get("zona") or "Europe/Madrid",
                 "ajustes": json.loads(cuentas.get(c, {}).get("ajustes") or "{}"),
                 "suscripciones": subs[c], "habitos": habitos.get(c, [])} for c in subs if c in cuentas]

    def meses_desde(self, cuenta, desde):
        return self.db.consultar("ejecutar meses_de(?, ?)", [cuenta, desde])

    # ----- compañero: enlace de solo lectura
    def enlace(self, cuenta, crear=False):
        f = self.db.consultar("buscar compartidos donde cuenta = ? mostrar token", [cuenta])
        if f:
            return f[0]["token"]
        if not crear:
            return None
        token = secrets.token_urlsafe(18)
        self.db.ejecutar("insertar en compartidos { token: ?, cuenta: ? }", [token, cuenta])
        return token

    def quitar_enlace(self, cuenta):
        self.db.ejecutar("borrar de compartidos donde cuenta = ?", [cuenta])

    def ver(self, token):
        """Lo que ve un compañero: hábitos activos y sus días de los últimos 400 días. Sin notas ni ánimo."""
        f = self.db.consultar("buscar compartidos donde token = ? mostrar cuenta", [token]) if isinstance(token, str) else []
        if not f:
            return None
        cuenta = f[0]["cuenta"]
        hoy = (date.today() - EPOCA).days
        desde, _ = mes_y_dia(hoy - 400)
        habitos = [habito_de_fila(h) for h in self.db.consultar("ejecutar habitos_de(?)", [cuenta]) if not h["archivado"]]
        for h in habitos:
            for k in ("avisos", "pasos", "orden", "archivado"):
                h.pop(k, None)
        datos = filas_a_instantanea([], self.meses_desde(cuenta, desde), [], None)
        ids = {str(h["id"]) for h in habitos}
        ajustes = json.loads(self.db.consultar("buscar cuentas donde id = ? mostrar ajustes", [cuenta])[0]["ajustes"] or "{}")
        return {"habitos": habitos, "registros": {k: v for k, v in datos["registros"].items() if k in ids},
                "progreso": {k: v for k, v in datos["progreso"].items() if k in ids}, "primer": ajustes.get("primer", 1)}

    # ----- atajos de iPhone: un enlace por hábito que solo sirve para marcarlo
    def atajo(self, cuenta, habito):
        f = self.db.consultar("buscar atajos donde cuenta = ? y habito = ? mostrar token", [cuenta, habito])
        if f:
            return f[0]["token"]
        if not self.db.consultar("buscar habitos donde cuenta = ? y id = ? mostrar id", [cuenta, habito]):
            raise KeyError(habito)
        token = secrets.token_urlsafe(18)
        self.db.ejecutar("insertar en atajos { token: ?, cuenta: ?, habito: ? }", [token, cuenta, habito])
        return token

    def usar_atajo(self, token, zona_por_defecto="Europe/Madrid"):
        """Marca como hecho hoy el hábito del atajo. Devuelve su nombre, o None si el enlace no vale."""
        from datetime import datetime
        from zoneinfo import ZoneInfo
        f = self.db.consultar("buscar atajos como a { unir habitos como h en h.cuenta = a.cuenta y h.id = a.habito "
                              "unir cuentas como c en c.id = a.cuenta donde a.token = ? mostrar a.cuenta, a.habito, h.nombre, c.zona }",
                              [token]) if isinstance(token, str) else []
        if not f:
            return None
        cuenta, habito, nombre, zona = f[0]["cuenta"], f[0]["habito"], f[0]["nombre"], f[0]["zona"]
        try:
            ahora = datetime.now(ZoneInfo(zona or zona_por_defecto))
        except Exception:
            ahora = datetime.now(ZoneInfo(zona_por_defecto))
        mes = f"{ahora.year:04d}-{ahora.month:02d}"
        with self.cerrojo:
            if not self.db.consultar("buscar meses donde cuenta = ? y habito = ? y mes = ? mostrar mes", [cuenta, habito, mes]):
                self.db.ejecutar("insertar en meses { cuenta: ?, habito: ?, mes: ?, marcas: ? }", [cuenta, habito, mes, "." * 31])
            self.db.ejecutar("ejecutar marcar_hecho(?, ?, ?, ?, ?)", [cuenta, habito, mes, ahora.day, ahora.strftime("%H:%M")])
        return nombre

    def cifras(self):
        return {"cuentas": self.db.consultar("ejecutar cifras()")[0],
                "habitos_populares": self.db.consultar("ejecutar habitos_populares()"),
                "por_tipo": self.db.consultar("ejecutar habitos_por_tipo()"),
                "suscripciones": self.db.consultar("buscar suscripciones mostrar contar() como n")[0]["n"]}

    def marcas_del_dia(self, cuenta, mes, dia):
        """{habito: "H" | "D" | "R"} de ese día."""
        r = {}
        for m in self.db.consultar("buscar meses donde cuenta = ? y mes = ? mostrar habito, marcas", [cuenta, mes]):
            c = m["marcas"][dia - 1]
            if c in "HDR":
                r[m["habito"]] = c
        return r

    def enviados(self, cuenta, fecha):
        f = self.db.consultar("buscar enviados donde cuenta = ? mostrar fecha, ids", [cuenta])
        return {str(x) for x in json.loads(f[0]["ids"])} if f and f[0]["fecha"] == fecha else set()

    def marcar_enviados(self, cuenta, fecha, ids):
        self.db.ejecutar("insertar o actualizar en enviados { cuenta: ?, fecha: ?, ids: ? }", [cuenta, fecha, json.dumps(sorted(str(x) for x in ids))])


def _huella(secreto: str) -> str:
    return hashlib.sha256(secreto.encode()).hexdigest()
