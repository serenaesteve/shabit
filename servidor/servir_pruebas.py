"""Arranca un SBD temporal y el servidor de shabit encima, para las pruebas de la app.

    python3 servir_pruebas.py PUERTO
Escribe «listo» cuando acepta peticiones. Nunca toca el SBD de producción.
"""
import os
import sys
import tempfile
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shabit
from bd import Base
from prueba_shabit import arrancar_sbd

carpeta = tempfile.mkdtemp(prefix="shabit-pruebas-")
proceso, url, clave = arrancar_sbd(os.path.join(carpeta, "sbd"))
try:
    base = Base(url, clave)
    base.aplicar_esquema()
    shabit.CUENTAS_POR_HORA = 10_000   # en las pruebas todas las cuentas salen de 127.0.0.1
    srv = shabit.crear_servidor(int(sys.argv[1]), os.path.join(carpeta, "datos"), base, permitir_local=True)
    print("listo", flush=True)
    srv.serve_forever()
finally:
    proceso.terminate()
