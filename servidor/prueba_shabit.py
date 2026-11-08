"""Pruebas del servidor de shabit contra un SBD de verdad (uno temporal, nunca el de producción).

    python3 -m unittest prueba_shabit -v
"""
import json
import os
import re
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import push
import shabit
from bd import Base, dia_epoca, filas_a_instantanea, instantanea_a_filas

AQUI = os.path.dirname(os.path.abspath(__file__))
ZONA = ZoneInfo("Europe/Madrid")
LUNES = datetime(2026, 11, 9, 21, 30, tzinfo=ZONA)
HOY = dia_epoca("2026-11", 9)


def puerto_libre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def arrancar_sbd(carpeta):
    """SBD temporal con la base «shabit», un usuario solo para ella y una clave de API."""
    sbd = lambda orden: subprocess.run([sys.executable, "-m", "sbd", carpeta, "-e", orden], cwd=AQUI, capture_output=True, text=True, check=True).stdout
    sbd("crear base shabit")
    sbd('crear usuario shabit_app clave "una clave de prueba larga" puede todo en shabit')
    clave = re.search(r"sbd_k\S+", sbd('crear clave api para shabit_app llamada "pruebas"')).group(0)
    puerto = puerto_libre()
    proceso = subprocess.Popen([sys.executable, "-m", "sbd", "servidor", carpeta, "--puerto", str(puerto), "--silencio"], cwd=AQUI,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{puerto}"
    for _ in range(100):
        try:
            urllib.request.urlopen(url + "/salud", timeout=1)
            break
        except OSError:
            time.sleep(0.1)
    return proceso, url, clave


class Navegador:
    """Hace de navegador suscrito: tiene sus claves y sabe descifrar lo que le llega."""

    def __init__(self, endpoint):
        self.privada = ec.generate_private_key(ec.SECP256R1())
        self.publica = push._bruta(self.privada.public_key())
        self.auth = os.urandom(16)
        self.suscripcion = {"endpoint": endpoint, "keys": {"p256dh": push.b64u(self.publica), "auth": push.b64u(self.auth)}}

    def descifrar(self, cuerpo):
        sal, n = cuerpo[:16], cuerpo[20]
        as_publica, cifrado = cuerpo[21:21 + n], cuerpo[21 + n:]
        assert struct.unpack("!I", cuerpo[16:20])[0] == 4096
        compartido = self.privada.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_publica))
        ikm = push._hkdf(self.auth, compartido, b"WebPush: info\x00" + self.publica + as_publica, 32)
        cek = push._hkdf(sal, ikm, b"Content-Encoding: aes128gcm\x00", 16)
        nonce = push._hkdf(sal, ikm, b"Content-Encoding: nonce\x00", 12)
        claro = AESGCM(cek).decrypt(nonce, cifrado, None)
        return json.loads(claro[:-1])


class ServicioPush(ThreadingHTTPServer):
    def __init__(self):
        self.recibidos, self.codigo = [], 201
        servicio = self

        class M(BaseHTTPRequestHandler):
            def log_message(self, *a): pass
            def do_POST(self):
                servicio.recibidos.append((dict(self.headers), self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(servicio.codigo); self.end_headers()

        super().__init__(("127.0.0.1", 0), M)
        threading.Thread(target=self.serve_forever, daemon=True).start()


def datos_ejemplo():
    return {
        "habitos": [
            {"id": 1, "nombre": "Leer", "icono": "libro", "momento": "noche", "color": 1, "tipo": "tiempo", "cantidad": 20,
             "objetivo": 5, "meta": 66, "aviso": "21:30", "creado": HOY - 40, "orden": 0},
            {"id": 2, "nombre": "Gimnasio", "icono": "pesa", "momento": "tarde", "color": 0, "tipo": "simple", "dias": [1, 3, 5],
             "objetivo": 3, "meta": 66, "aviso": "21:30", "creado": HOY - 40, "orden": 1},
            {"id": 3, "nombre": "Beber agua", "icono": "agua", "tipo": "cantidad", "cantidad": 8, "unidad": "vasos", "creado": HOY - 40, "orden": 2},
        ],
        "registros": {"1": {str(HOY - 1): "H", str(HOY - 2): "D", str(HOY - 35): "H"}, "3": {str(HOY - 1): "H"}},
        "progreso": {"1": {str(HOY - 1): 1200}, "3": {str(HOY): 3, str(HOY - 1): 8}},
        "animo": {str(HOY - 1): {"nivel": 4, "nota": "Buen día"}, str(HOY - 3): {"nivel": 2}},
        "ajustes": {"tema": "oscuro", "primer": 1},
        "zona": "Europe/Madrid",
    }


class PruebasShabit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.carpeta = tempfile.mkdtemp()
        cls.sbd, url, clave = arrancar_sbd(os.path.join(cls.carpeta, "sbd"))
        cls.base = Base(url, clave)
        cls.base.aplicar_esquema()
        cls.base.aplicar_esquema()       # se puede aplicar dos veces
        cls.srv = shabit.crear_servidor(0, os.path.join(cls.carpeta, "datos"), cls.base, permitir_local=True)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.api = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close()
        cls.sbd.terminate(); cls.sbd.wait()

    def setUp(self):
        self.push = ServicioPush()
        self.nav = Navegador(f"http://127.0.0.1:{self.push.server_address[1]}/envio")

    def tearDown(self):
        self.push.shutdown(); self.push.server_close()

    def pedir(self, metodo, ruta, datos=None, codigo=None, ip="10.0.0.1"):
        cab = {"Content-Type": "application/json", "X-Forwarded-For": ip}
        if codigo:
            cab["Authorization"] = f"Bearer {codigo}"
        pet = urllib.request.Request(self.api + ruta, data=json.dumps(datos).encode() if datos is not None else None, method=metodo, headers=cab)
        try:
            with urllib.request.urlopen(pet) as r:
                cuerpo = r.read()
                return r.status, json.loads(cuerpo) if cuerpo and r.headers.get_content_type() == "application/json" else cuerpo
        except urllib.error.HTTPError as e:
            cuerpo = e.read()
            return e.code, json.loads(cuerpo) if cuerpo.startswith(b"{") else cuerpo

    def cuenta_nueva(self, datos=None):
        estado, r = self.pedir("POST", "/api/cuenta", {"datos": datos or datos_ejemplo(), "zona": "Europe/Madrid"}, ip=f"10.1.{os.getpid() % 200}.{int(time.time() * 1000) % 250}")
        self.assertEqual(estado, 201, r)
        return r["codigo"], r["version"]

    # ----------------------------------------------------------------- datos
    def test_ida_y_vuelta_sin_perder_nada(self):
        d = datos_ejemplo()
        f = instantanea_a_filas(d)
        self.assertEqual(len(f["meses"]), 3, "una fila por hábito y mes (Leer: octubre y noviembre; agua: noviembre), no una por día")
        vuelta = filas_a_instantanea(
            [{**h, "cuenta": "x"} for h in f["habitos"].values()],
            [{"habito": k[0], "mes": k[1], **v} for k, v in f["meses"].items()],
            [{"mes": k, **v} for k, v in f["animo"].items()], f["ajustes"])
        self.assertEqual(vuelta["registros"], d["registros"])
        self.assertEqual(vuelta["progreso"], d["progreso"])
        self.assertEqual(vuelta["animo"][str(HOY - 1)], {"nivel": 4, "nota": "Buen día"})
        self.assertEqual(vuelta["habitos"][1]["dias"], [1, 3, 5])

    def test_crear_leer_y_guardar(self):
        codigo, version = self.cuenta_nueva()
        self.assertEqual(version, 2)
        estado, r = self.pedir("GET", "/api/datos", codigo=codigo)
        self.assertEqual(estado, 200)
        self.assertEqual(r["datos"]["registros"], datos_ejemplo()["registros"])
        self.assertEqual([h["nombre"] for h in r["datos"]["habitos"]], ["Leer", "Gimnasio", "Beber agua"])
        self.assertEqual({k: r["datos"]["ajustes"][k] for k in ("primer", "tema")}, {"primer": 1, "tema": "oscuro"})
        # Se guarda un cambio y queda en SBD
        d = datos_ejemplo()
        d["registros"]["2"] = {str(HOY): "H"}
        d["habitos"] = d["habitos"][:2]                 # borra «Beber agua»: sus meses se van en cascada
        estado, r = self.pedir("PUT", "/api/datos", {"version": 2, "datos": d}, codigo=codigo)
        self.assertEqual((estado, r["version"]), (200, 3))
        cuenta = codigo.split(".")[0]
        self.assertEqual(self.base.marcas_del_dia(cuenta, "2026-11", 9), {2: "H"})
        self.assertEqual(self.base.db.consultar("buscar meses donde cuenta = ? y habito = 3 mostrar contar() como n", [cuenta])[0]["n"], 0)

    def test_otro_dispositivo_con_version_antigua_recibe_los_datos(self):
        codigo, version = self.cuenta_nueva()
        self.pedir("PUT", "/api/datos", {"version": version, "datos": datos_ejemplo()}, codigo=codigo)
        estado, r = self.pedir("PUT", "/api/datos", {"version": version, "datos": {"habitos": []}}, codigo=codigo)
        self.assertEqual(estado, 409)
        self.assertEqual(r["version"], version + 1)
        self.assertEqual(len(r["datos"]["habitos"]), 3, "no se ha pisado nada")

    def test_codigo_incorrecto_y_borrar_cuenta(self):
        codigo, _ = self.cuenta_nueva()
        cuenta, secreto = codigo.split(".")
        self.assertEqual(self.pedir("GET", "/api/datos", codigo=f"{cuenta}.{'x' * len(secreto)}")[0], 401)
        self.assertEqual(self.pedir("GET", "/api/datos")[0], 401)
        self.assertEqual(self.pedir("DELETE", "/api/cuenta", codigo=codigo)[0], 204)
        self.assertEqual(self.pedir("GET", "/api/datos", codigo=codigo)[0], 401)
        for tabla in ("habitos", "meses", "animo"):
            n = self.base.db.consultar(f"buscar {tabla} donde cuenta = ? mostrar contar() como n", [cuenta])[0]["n"]
            self.assertEqual(n, 0, tabla)

    def test_datos_no_validos(self):
        codigo, version = self.cuenta_nueva()
        self.assertEqual(self.pedir("PUT", "/api/datos", {"version": version, "datos": {"habitos": [{"id": "x"}]}}, codigo=codigo)[0], 400)
        self.assertEqual(self.pedir("PUT", "/api/datos", {"datos": {}}, codigo=codigo)[0], 400)
        largo = datos_ejemplo()
        largo["habitos"][0]["nombre"] = "L" * 500
        self.assertEqual(self.pedir("PUT", "/api/datos", {"version": version, "datos": largo}, codigo=codigo)[0], 200)
        self.assertEqual(len(self.pedir("GET", "/api/datos", codigo=codigo)[1]["datos"]["habitos"][0]["nombre"]), 60)

    def test_limite_de_cuentas_nuevas(self):
        estados = [self.pedir("POST", "/api/cuenta", {}, ip="10.9.9.9")[0] for _ in range(shabit.CUENTAS_POR_HORA + 1)]
        self.assertEqual(estados[-1], 429)
        self.assertEqual(estados.count(201), shabit.CUENTAS_POR_HORA)

    # ----------------------------------------------------------------- recordatorios
    def revisar(self, ahora=LUNES):
        return shabit.revisar(self.base, self.srv.vapid, ahora.astimezone(ZoneInfo("UTC")), registro=lambda *a: None)

    def test_aviso_cifrado_firmado_y_sin_lo_ya_hecho(self):
        codigo, version = self.cuenta_nueva()
        self.assertEqual(self.pedir("POST", "/api/suscripcion", {"suscripcion": self.nav.suscripcion}, codigo=codigo)[0], 204)
        self.assertEqual(self.revisar(), 1)
        cab, cuerpo = self.push.recibidos[-1]
        self.assertEqual(self.nav.descifrar(cuerpo)["texto"], "Es la hora de: Leer y Gimnasio")
        t = cab["Authorization"].split("t=")[1].split(",")[0]
        a, b, firma = t.split(".")
        crudo = push.deb64u(firma)
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), push.deb64u(self.srv.vapid.publica)).verify(
            encode_dss_signature(int.from_bytes(crudo[:32], "big"), int.from_bytes(crudo[32:], "big")), f"{a}.{b}".encode(), ec.ECDSA(hashes.SHA256()))
        self.assertEqual(self.revisar(), 0, "no se repite el mismo día")
        # Al día siguiente (martes, no toca gimnasio) y con Leer ya hecho: no avisa
        martes = datetime(2026, 11, 10, 21, 31, tzinfo=ZONA)
        d = datos_ejemplo()
        d["registros"]["1"][str(HOY + 1)] = "H"
        self.pedir("PUT", "/api/datos", {"version": version, "datos": d}, codigo=codigo)
        self.assertEqual(self.revisar(martes), 0)

    def test_suscripcion_caducada_y_destinos_no_permitidos(self):
        codigo, _ = self.cuenta_nueva()
        self.pedir("POST", "/api/suscripcion", {"suscripcion": self.nav.suscripcion}, codigo=codigo)
        self.push.codigo = 410
        self.revisar()
        n = self.base.db.consultar("buscar suscripciones donde endpoint = ? mostrar contar() como n", [self.nav.suscripcion["endpoint"]])[0]["n"]
        self.assertEqual(n, 0)
        malo = {**self.nav.suscripcion, "endpoint": "https://ejemplo.com/robar"}
        self.assertEqual(self.pedir("POST", "/api/suscripcion", {"suscripcion": malo}, codigo=codigo)[0], 400)
        self.assertTrue(push.servicio_permitido("https://web.push.apple.com/abc"))
        self.assertFalse(push.servicio_permitido("https://fcm.googleapis.com.malo.com/x"))

    def test_clave_publica(self):
        estado, clave = self.pedir("GET", "/api/clave")
        self.assertEqual((estado, len(push.deb64u(clave.decode()))), (200, 65))


class PruebasNuevas(PruebasShabit):
    """Lo nuevo: varios avisos, pausas, dejar algo, resumen, informe, compañero, atajos, notas."""
    test_ida_y_vuelta_sin_perder_nada = test_crear_leer_y_guardar = None
    test_otro_dispositivo_con_version_antigua_recibe_los_datos = test_codigo_incorrecto_y_borrar_cuenta = None
    test_datos_no_validos = test_limite_de_cuentas_nuevas = test_aviso_cifrado_firmado_y_sin_lo_ya_hecho = None
    test_suscripcion_caducada_y_destinos_no_permitidos = test_clave_publica = None

    def cuenta_con(self, habitos, registros=None, ajustes=None, **extra):
        d = {"habitos": habitos, "registros": registros or {}, "ajustes": ajustes or {"tema": "claro", "primer": 1}, "zona": "Europe/Madrid", **extra}
        codigo, version = self.cuenta_nueva(d)
        self.pedir("POST", "/api/suscripcion", {"suscripcion": self.nav.suscripcion}, codigo=codigo)
        return codigo, version

    def textos(self):
        return [self.nav.descifrar(c)["texto"] for _, c in self.push.recibidos]

    def test_varios_avisos_y_pausa(self):
        h = {"id": 5, "nombre": "Agua", "avisos": ["08:00", "21:30"], "creado": HOY - 5}
        p = {"id": 6, "nombre": "Correr", "avisos": ["21:30"], "creado": HOY - 5, "pausas": [[HOY - 1, HOY + 3]]}
        self.cuenta_con([h, p])
        self.assertEqual(self.revisar(datetime(2026, 11, 9, 8, 1, tzinfo=ZONA)), 1)
        self.assertEqual(self.revisar(), 1)
        self.assertEqual(self.textos(), ["Es la hora de: Agua", "Es la hora de: Agua"], "el pausado no avisa")

    def test_dejar_algo_solo_avisa_si_no_ha_recaido(self):
        h = {"id": 7, "nombre": "Sin fumar", "tipo": "evitar", "avisos": ["21:30"], "creado": HOY - 10}
        self.cuenta_con([h], {"7": {str(HOY): "R"}})
        self.assertEqual(self.revisar(), 0)

    def test_resumen_de_la_manana(self):
        hs = [{"id": 1, "nombre": "Agua", "creado": HOY - 3}, {"id": 2, "nombre": "Leer", "creado": HOY - 3},
              {"id": 3, "nombre": "Gimnasio", "dias": [2, 4], "creado": HOY - 3}]
        self.cuenta_con(hs, {"2": {str(HOY): "H"}}, {"resumen": "08:30"})
        self.assertEqual(self.revisar(datetime(2026, 11, 9, 8, 32, tzinfo=ZONA)), 1)
        self.assertEqual(self.textos(), ["Hoy te toca 1 hábito: Agua."], "sin lo ya hecho ni lo que no toca el lunes")
        self.assertEqual(self.revisar(datetime(2026, 11, 9, 8, 35, tzinfo=ZONA)), 0)

    def test_informe_del_domingo(self):
        domingo = datetime(2026, 11, 15, 20, 2, tzinfo=ZONA)
        hd = dia_epoca("2026-11", 15)
        reg = {"1": {str(hd - k): "H" for k in range(7)}, "2": {str(hd - k): "H" for k in (0, 2, 4)}}
        self.cuenta_con([{"id": 1, "nombre": "Agua", "creado": hd - 20}, {"id": 2, "nombre": "Leer", "creado": hd - 20}], reg)
        self.assertEqual(self.revisar(domingo), 1)
        self.assertEqual(self.textos(), ["Esta semana has cumplido el 71 %. Lo más constante: Agua (7 de 7)."])
        self.assertEqual(self.revisar(LUNES), 0, "solo los domingos")

    def test_notas_horas_y_recaidas_ida_y_vuelta(self):
        d = datos_ejemplo()
        d["notas"] = {"1": {str(HOY - 1): "30 páginas"}}
        d["horas"] = {"1": {str(HOY - 1): "21:04"}}
        d["habitos"].append({"id": 9, "nombre": "Sin azúcar", "tipo": "evitar", "creado": HOY - 3, "reto": 30, "inicioReto": HOY - 2, "etiqueta": "salud"})
        d["registros"]["9"] = {str(HOY - 1): "R"}
        codigo, _ = self.cuenta_nueva(d)
        r = self.pedir("GET", "/api/datos", codigo=codigo)[1]["datos"]
        self.assertEqual(r["notas"]["1"][str(HOY - 1)], "30 páginas")
        self.assertEqual(r["horas"]["1"][str(HOY - 1)], "21:04")
        self.assertEqual(r["registros"]["9"][str(HOY - 1)], "R")
        h = [x for x in r["habitos"] if x["id"] == 9][0]
        self.assertEqual((h["tipo"], h["reto"], h["inicioReto"], h["etiqueta"]), ("evitar", 30, HOY - 2, "salud"))

    def test_companero_ve_lo_justo(self):
        d = datos_ejemplo()
        d["notas"] = {"1": {str(HOY - 1): "privado"}}
        codigo, _ = self.cuenta_nueva(d)
        token = self.pedir("POST", "/api/compartir", {}, codigo=codigo)[1]["token"]
        self.assertEqual(self.pedir("POST", "/api/compartir", {}, codigo=codigo)[1]["token"], token, "el mismo enlace")
        estado, ver = self.pedir("GET", f"/api/ver/{token}")
        self.assertEqual(estado, 200)
        self.assertEqual([h["nombre"] for h in ver["habitos"]], ["Leer", "Gimnasio", "Beber agua"])
        self.assertNotIn("notas", ver); self.assertNotIn("animo", ver)
        self.assertNotIn("avisos", ver["habitos"][0])
        self.assertEqual(self.pedir("DELETE", "/api/compartir", codigo=codigo)[0], 204)
        self.assertEqual(self.pedir("GET", f"/api/ver/{token}")[0], 404)

    def test_atajo_marca_hecho_hoy(self):
        codigo, version = self.cuenta_nueva()
        estado, r = self.pedir("POST", "/api/atajo", {"habito": 2}, codigo=codigo)
        self.assertEqual(estado, 200)
        token = r["token"]
        self.assertEqual(self.pedir("GET", f"/api/atajo/{token}")[0], 200, "GET enseña el botón, no marca")
        estado, texto = self.pedir("POST", f"/api/atajo/{token}", {})
        self.assertEqual(estado, 200)
        self.assertIn("Gimnasio", texto.decode())
        cuenta = codigo.split(".")[0]
        ahora = datetime.now(ZONA)
        self.assertEqual(self.base.marcas_del_dia(cuenta, ahora.strftime("%Y-%m"), ahora.day).get(2), "H")
        estado, r = self.pedir("GET", "/api/datos", codigo=codigo)
        self.assertGreater(r["version"], version, "la app ve que hay cambios")
        self.assertEqual(self.pedir("POST", "/api/atajo/inventado", {})[0], 404)
        self.assertEqual(self.pedir("POST", "/api/atajo", {"habito": 999}, codigo=codigo)[0], 404)

    def test_procedimientos_de_cifras(self):
        self.cuenta_nueva()
        c = self.base.cifras()
        self.assertGreaterEqual(c["cuentas"]["cuentas"], 1)
        self.assertIn("leer", [h["habito"] for h in c["habitos_populares"]])
        self.assertIn("simple", [x["tipo"] for x in c["por_tipo"]])
        import io, cifras
        salida = io.StringIO()
        cifras.pintar(c, salida)
        self.assertIn("Los más comunes", salida.getvalue())

    def test_rendimiento_cinco_años(self):
        """20 hábitos con 5 años de días marcados: guardar, leer, un cambio pequeño y el repaso de avisos."""
        habitos = [{"id": 100 + i, "nombre": f"Hábito {i}", "creado": HOY - 5 * 365, "avisos": ["21:30"],
                    "tipo": "evitar" if i == 3 else "simple"} for i in range(20)]
        registros = {str(100 + i): {str(d): ("R" if i == 3 else "H") for d in range(HOY - 5 * 365, HOY) if (d * 7 + i * 13) % 10 < (1 if i == 3 else 7)}
                     for i in range(20)}
        notas = {"100": {str(HOY - k): f"nota {k}" for k in range(300)}}
        t = time.perf_counter()
        codigo, version = self.cuenta_con(habitos, registros, notas=notas)
        crear = time.perf_counter() - t
        t = time.perf_counter()
        estado, r = self.pedir("GET", "/api/datos", codigo=codigo)
        leer = time.perf_counter() - t
        self.assertEqual(estado, 200)
        self.assertEqual(sum(len(x) for x in r["datos"]["registros"].values()), sum(len(x) for x in registros.values()))
        d = r["datos"]
        d["registros"]["101"][str(HOY)] = "H"
        t = time.perf_counter()
        estado, r = self.pedir("PUT", "/api/datos", {"version": r["version"], "datos": d}, codigo=codigo)
        cambio = time.perf_counter() - t
        self.assertEqual(estado, 200, r)
        t = time.perf_counter()
        self.revisar()
        repaso = time.perf_counter() - t
        print(f"\n  5 años × 20 hábitos: crear {crear*1000:.0f} ms · leer {leer*1000:.0f} ms · un cambio {cambio*1000:.0f} ms · repaso de avisos {repaso*1000:.0f} ms", end=" ")
        self.assertLess(max(crear, leer, cambio, repaso), 3.0)


if __name__ == "__main__":
    unittest.main()
