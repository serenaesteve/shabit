"""Servidor de shabit: guarda los datos de la app en SBD y manda los recordatorios.

API (Apache la sirve en https://shabit.serenaesteve.com/api/):

    POST   /api/cuenta        crea una cuenta anónima y devuelve su código       {datos?, zona?}
    GET    /api/datos         lee los datos de la cuenta                          Authorization: Bearer <código>
    PUT    /api/datos         guarda los datos si la versión coincide (si no, 409 con lo que hay) {version, datos}
    DELETE /api/cuenta        borra la cuenta y todos sus datos
    POST   /api/suscripcion   guarda una suscripción push                          {suscripcion}
    DELETE /api/suscripcion   la quita                                             {endpoint}
    GET    /api/clave         clave pública VAPID para suscribirse
    POST   /api/compartir     crea (o devuelve) el enlace de solo lectura para un compañero; DELETE lo quita
    GET    /api/ver/<token>   lo que ve el compañero (público)
    POST   /api/atajo         enlace para marcar un hábito desde Atajos o Siri               {habito}
    POST   /api/atajo/<token> marca ese hábito como hecho hoy (GET enseña un botón para hacerlo)

Cada 20 segundos mira en SBD qué recordatorios tocan y avisa de los hábitos que aún no están hechos.

    python3 shabit.py --puerto 8102 --datos /srv/shabit-avisos/datos --sbd /srv/shabit-avisos/datos/sbd.json
"""
import argparse
import calendar
import json
from html import escape
import os
import threading
import time
from collections import defaultdict, deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import push
from bd import Base, Conflicto, DatosNoValidos

VENTANA_MIN = 10              # si el servidor se retrasa, aún avisa hasta 10 minutos tarde
MAX_CUERPO = 2 * 1024 * 1024
CUENTAS_POR_HORA = 20         # cuentas nuevas por hora desde la misma dirección


def zona_valida(z):
    try:
        ZoneInfo(z)
        return z
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return "Europe/Madrid"


def texto_aviso(nombres):
    if len(nombres) == 1:
        return f"Es la hora de: {nombres[0]}"
    return "Es la hora de: " + ", ".join(nombres[:-1]) + f" y {nombres[-1]}"


def _en_pausa(h, dia):
    for desde, hasta in json.loads(h.get("pausas") or "[]"):
        if dia >= desde and (hasta is None or dia <= hasta):
            return True
    return False


def _toca(h, dia, dia_semana):
    if _en_pausa(h, dia) or (h.get("creado") or 0) > dia:
        return False
    return not h.get("concretos") or str(dia_semana) in h["concretos"].split(",")


def informe_semanal(base, cuenta, habitos, hoy, dia_epoca_hoy):
    """Texto del informe del domingo: porcentaje de la semana y el hábito más constante."""
    from bd import dia_epoca, mes_y_dia
    desde = dia_epoca_hoy - 6
    marcas = {}
    for m in base.meses_desde(cuenta, mes_y_dia(desde)[0]):
        año, mes = map(int, m["mes"].split("-"))
        for i, c in enumerate(m["marcas"][:calendar.monthrange(año, mes)[1]]):
            if c != ".":
                marcas[(m["habito"], dia_epoca(m["mes"], i + 1))] = c
    tocan = hechos = 0
    mejor = None
    for h in habitos:
        if h.get("por_mes"):
            continue
        t = n = 0
        for d in range(desde, dia_epoca_hoy + 1):
            ds = (d + 4) % 7
            c = marcas.get((h["id"], d), ".")
            if h["tipo"] == "evitar":
                if (h.get("creado") or 0) <= d and not _en_pausa(h, d):
                    t += 1; n += c != "R"
            elif _toca(h, d, ds) and c != "D":
                t += 1; n += c == "H"
        if t:
            tocan += t; hechos += min(n, t)
            if mejor is None or n / t > mejor[1]:
                mejor = (h["nombre"], n / t, n, t)
    if not tocan:
        return None
    texto = f"Esta semana has cumplido el {round(100 * hechos / tocan)} %."
    if mejor and mejor[2]:
        texto += f" Lo más constante: {mejor[0]} ({mejor[2]} de {mejor[3]})."
    return texto


def revisar(base, vapid, ahora_utc=None, registro=print):
    """Manda lo que toca ahora: avisos de cada hábito, el resumen de la mañana y el informe del domingo.
    Devuelve cuántas notificaciones han salido bien."""
    from bd import EPOCA
    ahora_utc = ahora_utc or datetime.now(ZoneInfo("UTC"))
    enviadas = 0
    for c in base.avisos_candidatos():
        ahora = ahora_utc.astimezone(ZoneInfo(zona_valida(c["zona"])))
        minuto = ahora.hour * 60 + ahora.minute
        dia_semana = ahora.isoweekday() % 7               # 0 = domingo, como en JavaScript
        hoy = (ahora.date() - EPOCA).days
        fecha = ahora.date().isoformat()
        en_hora = lambda hhmm: 0 <= minuto - (int(hhmm[:2]) * 60 + int(hhmm[3:])) <= VENTANA_MIN
        tocan_hoy = [h for h in c["habitos"] if _toca(h, hoy, dia_semana) and not h.get("por_mes")]
        mensajes, claves = [], set()
        ya = None

        avisos = [(h, hora) for h in tocan_hoy for hora in (h["avisos"] or "").split(",") if hora and en_hora(hora)]
        resumen = c["ajustes"].get("resumen")
        hay_resumen = bool(resumen) and en_hora(resumen)
        hay_informe = dia_semana == 0 and c["ajustes"].get("informe", True) is not False and en_hora("20:00")
        if not (avisos or hay_resumen or hay_informe):
            continue
        ya = base.enviados(c["cuenta"], fecha)
        hechos = base.marcas_del_dia(c["cuenta"], fecha[:7], ahora.day)
        pendiente = lambda h: (hechos.get(h["id"]) != "R") if h["tipo"] == "evitar" else h["id"] not in hechos

        nombres = []
        for h, hora in avisos:
            clave = f"a:{h['id']}:{hora}"
            if clave in ya or not pendiente(h):
                continue
            claves.add(clave)
            if h["nombre"] not in nombres:
                nombres.append(h["nombre"])
        if nombres:
            mensajes.append({"titulo": "shabit", "texto": texto_aviso(nombres), "etiqueta": f"aviso-{fecha}-{minuto}"})
        if hay_resumen and "resumen" not in ya:
            claves.add("resumen")
            faltan = [h["nombre"] for h in tocan_hoy if h["tipo"] != "evitar" and pendiente(h)]
            if faltan:
                lista = ", ".join(faltan[:4]) + (f" y {len(faltan) - 4} más" if len(faltan) > 4 else "")
                mensajes.append({"titulo": "Buenos días", "texto": f"Hoy te {'toca 1 hábito' if len(faltan) == 1 else f'tocan {len(faltan)} hábitos'}: {lista}.", "etiqueta": f"resumen-{fecha}"})
        if hay_informe and "informe" not in ya:
            claves.add("informe")
            texto = informe_semanal(base, c["cuenta"], c["habitos"], ahora, hoy)
            if texto:
                mensajes.append({"titulo": "Tu semana en shabit", "texto": texto, "etiqueta": f"informe-{fecha}", "url": "./#/progreso"})
        if not claves:
            continue
        for datos in mensajes:
            datos.setdefault("url", "./#/hoy")
            for s in c["suscripciones"]:
                estado = push.enviar(vapid, {"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}}, datos)
                if estado in (404, 410):
                    base.desuscribir(s["endpoint"])           # el navegador ya no la usa
                    registro(f"suscripción caducada, borrada ({c['cuenta'][:4]}…)")
                elif 200 <= estado < 300:
                    enviadas += 1
                else:
                    registro(f"envío fallido ({estado}) para {c['cuenta'][:4]}…")
        base.marcar_enviados(c["cuenta"], fecha, ya | claves)
    return enviadas


PAGINA_ATAJO = """<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>shabit</title><body style="font:600 18px/1.5 -apple-system,system-ui,sans-serif;background:#f6f5f2;color:#1c1d21;display:grid;place-items:center;min-height:90vh;margin:0;text-align:center;padding:24px">
<div>{cuerpo}</div></body></html>"""


def crear_servidor(puerto, carpeta, base, permitir_local=False, host="127.0.0.1"):
    os.makedirs(carpeta, exist_ok=True)
    vapid = push.Vapid(carpeta)
    altas = defaultdict(deque)          # ip -> horas de las últimas cuentas creadas
    cerrojo_altas = threading.Lock()

    class Manejador(BaseHTTPRequestHandler):
        server_version = "shabit"

        def log_message(self, *a):
            pass

        def _responder(self, codigo, datos=None):
            cuerpo = b"" if datos is None else (datos if isinstance(datos, bytes) else json.dumps(datos, ensure_ascii=False).encode())
            self.send_response(codigo)
            self.send_header("Content-Type", "text/plain; charset=utf-8" if isinstance(datos, bytes) else "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)

        def _html(self, codigo, texto):
            cuerpo = texto.encode()
            self.send_response(codigo)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)

        def _cuerpo(self):
            largo = int(self.headers.get("Content-Length") or 0)
            if largo > MAX_CUERPO:
                raise ValueError("demasiado grande")
            return json.loads(self.rfile.read(largo) or b"{}")

        def _cuenta(self):
            a = self.headers.get("Authorization") or ""
            return base.cuenta_del_codigo(a[7:].strip()) if a.startswith("Bearer ") else None

        def _ip(self):
            return (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[-1].strip()

        def _manejar(self, metodo):
            try:
                self._rutas(metodo)
            except ValueError as e:
                self._responder(400, {"error": str(e)})
            except Exception as e:                    # SBD caído u otro fallo: que la app reintente
                print("error:", type(e).__name__, e, flush=True)
                self._responder(503, {"error": "no disponible"})

        def do_GET(self): self._manejar("GET")
        def do_POST(self): self._manejar("POST")
        def do_PUT(self): self._manejar("PUT")
        def do_DELETE(self): self._manejar("DELETE")

        def _rutas(self, metodo):
            ruta = self.path.split("?")[0]
            if (metodo, ruta) == ("GET", "/api/clave"):
                return self._responder(200, vapid.publica.encode())

            if (metodo, ruta) == ("POST", "/api/cuenta"):
                datos = self._cuerpo()
                ahora = time.time()
                with cerrojo_altas:
                    q = altas[self._ip()]
                    while q and q[0] < ahora - 3600:
                        q.popleft()
                    if len(q) >= CUENTAS_POR_HORA:
                        return self._responder(429, {"error": "demasiadas cuentas nuevas; prueba más tarde"})
                    q.append(ahora)
                cuenta, codigo = base.crear_cuenta(zona_valida(datos.get("zona")))
                version = 1
                if isinstance(datos.get("datos"), dict):
                    try:
                        version = base.guardar(cuenta, 1, datos["datos"])
                    except DatosNoValidos as e:
                        base.borrar_cuenta(cuenta)
                        raise ValueError(str(e))
                return self._responder(201, {"codigo": codigo, "version": version})

            # Rutas públicas: lo que ve un compañero y los atajos (el enlace es la llave)
            if metodo == "GET" and ruta.startswith("/api/ver/"):
                datos = base.ver(ruta[len("/api/ver/"):])
                return self._responder(200, datos) if datos else self._responder(404, {"error": "este enlace ya no existe"})
            if ruta.startswith("/api/atajo/") and metodo in ("GET", "POST"):
                token = ruta[len("/api/atajo/"):]
                if metodo == "GET":
                    cuerpo = ('<form method="post"><p>¿Marcar el hábito como hecho hoy?</p>'
                              '<button style="font:inherit;padding:14px 28px;border:0;border-radius:14px;background:#1c1d21;color:#fff">Marcar como hecho</button></form>')
                    return self._html(200, PAGINA_ATAJO.format(cuerpo=cuerpo))
                nombre = base.usar_atajo(token)
                if nombre is None:
                    return self._responder(404, {"error": "este atajo ya no existe"})
                if "application/json" in (self.headers.get("Accept") or ""):
                    return self._responder(200, {"hecho": nombre})
                texto = f"✓ {nombre}: hecho hoy"
                if "text/html" in (self.headers.get("Accept") or ""):
                    return self._html(200, PAGINA_ATAJO.format(cuerpo=f"<p style='font-size:28px'>{escape(texto)}</p><p><a href='/app/'>Abrir shabit</a></p>"))
                return self._responder(200, texto.encode())

            cuenta = self._cuenta()
            if ruta.startswith("/api/") and ruta != "/api/clave" and cuenta is None:
                return self._responder(401, {"error": "código no válido"})

            if (metodo, ruta) == ("GET", "/api/datos"):
                version, datos = base.leer(cuenta)
                return self._responder(200, {"version": version, "datos": datos})
            if (metodo, ruta) == ("PUT", "/api/datos"):
                d = self._cuerpo()
                if not isinstance(d.get("version"), int):
                    raise ValueError("version")
                try:
                    version = base.guardar(cuenta, d["version"], d.get("datos"))
                except Conflicto as c:
                    return self._responder(409, {"version": c.version, "datos": c.datos})
                except DatosNoValidos as e:
                    raise ValueError(str(e))
                return self._responder(200, {"version": version})
            if (metodo, ruta) == ("DELETE", "/api/cuenta"):
                base.borrar_cuenta(cuenta)
                return self._responder(204)
            if (metodo, ruta) == ("POST", "/api/compartir"):
                return self._responder(200, {"token": base.enlace(cuenta, crear=True)})
            if (metodo, ruta) == ("GET", "/api/compartir"):
                return self._responder(200, {"token": base.enlace(cuenta)})
            if (metodo, ruta) == ("DELETE", "/api/compartir"):
                base.quitar_enlace(cuenta)
                return self._responder(204)
            if (metodo, ruta) == ("POST", "/api/atajo"):
                habito = self._cuerpo().get("habito")
                if not isinstance(habito, int):
                    raise ValueError("habito")
                try:
                    return self._responder(200, {"token": base.atajo(cuenta, habito)})
                except KeyError:
                    return self._responder(404, {"error": "ese hábito aún no está guardado en SBD"})
            if (metodo, ruta) == ("POST", "/api/suscripcion"):
                s = self._cuerpo().get("suscripcion") or {}
                claves = s.get("keys") or {}
                if not isinstance(s.get("endpoint"), str) or len(s["endpoint"]) > 600 or not push.servicio_permitido(s["endpoint"], permitir_local):
                    raise ValueError("endpoint")
                if not isinstance(claves.get("p256dh"), str) or not isinstance(claves.get("auth"), str) or len(claves["p256dh"]) > 120 or len(claves["auth"]) > 40:
                    raise ValueError("claves")
                base.suscribir(cuenta, s["endpoint"], claves["p256dh"], claves["auth"])
                return self._responder(204)
            if (metodo, ruta) == ("DELETE", "/api/suscripcion"):
                endpoint = self._cuerpo().get("endpoint")
                if isinstance(endpoint, str):
                    base.desuscribir(endpoint, cuenta)
                return self._responder(204)
            return self._responder(404, {"error": "no existe"})

    servidor = ThreadingHTTPServer((host, puerto), Manejador)
    servidor.base, servidor.vapid = base, vapid
    return servidor


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--puerto", type=int, default=8102)
    p.add_argument("--datos", default="datos", help="carpeta para la clave VAPID")
    p.add_argument("--sbd", default="datos/sbd.json", help="JSON con url, clave y base de SBD")
    a = p.parse_args()
    with open(a.sbd, encoding="utf-8") as f:
        conf = json.load(f)
    base = Base(conf["url"], conf["clave"], conf.get("base", "shabit"))
    base.aplicar_esquema()
    servidor = crear_servidor(a.puerto, a.datos, base)

    def bucle():
        while True:
            try:
                revisar(base, servidor.vapid)
            except Exception as e:  # que un fallo puntual (SBD reiniciándose…) no pare los avisos
                print("error al revisar:", e, flush=True)
            time.sleep(20)

    threading.Thread(target=bucle, daemon=True).start()
    print(f"shabit en 127.0.0.1:{a.puerto}, datos en SBD ({conf.get('base', 'shabit')})", flush=True)
    servidor.serve_forever()


if __name__ == "__main__":
    main()
