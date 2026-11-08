#!/bin/bash
# Conecta shabit con el SBD de producción: base «shabit», un usuario solo para ella y una clave de API.
#   sudo bash despliegue/integrar-sbd.sh
# 1. Copia de seguridad de los datos de SBD (no se para el servidor: el «sbd» de terminal respeta sus cerrojos).
# 2. Crea la base si no existe y el usuario «shabit_app» con «puede todo en shabit» (crea sus tablas,
#    pero no ve las demás bases ni administra el servidor).
# 3. Crea una clave de API y la guarda en /srv/shabit-avisos/datos/sbd.json (shabit:shabit 600).
#    La clave no va nunca al repositorio. Si ya existe ese archivo, no hace nada.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "✕ hay que ejecutarlo como root" >&2; exit 1; }
SBD=/srv/sbd/venv/bin/sbd
DATOS=/srv/sbd/datos
ARCHIVO=/srv/shabit-avisos/datos/sbd.json
USUARIO=shabit_app
RESPALDO="/root/sbd/respaldos/$(date +%Y%m%d-%H%M%S)-antes-de-integrar-shabit"
sbd() { (cd /srv/sbd && sudo -u sbd "$SBD" "$DATOS" -e "$1"); }

if [ -f "$ARCHIVO" ]; then
  echo "✓ shabit ya está conectada a SBD ($ARCHIVO). No se cambia nada."
  exit 0
fi

echo "· 1/3 copia de seguridad de SBD"
mkdir -p "$RESPALDO" && chmod 700 "$RESPALDO"
cp -a "$DATOS" "$RESPALDO/datos"
echo "  $RESPALDO"

echo "· 2/3 base «shabit» y usuario «$USUARIO»"
sbd "crear base shabit si no existe" >/dev/null
if ! sbd 'usuarios' | grep -q "^$USUARIO "; then
  sbd "crear usuario $USUARIO clave \"$(openssl rand -hex 24)\" puede todo en shabit" >/dev/null
fi

echo "· 3/3 clave de API"
CLAVE=$(sbd "crear clave api para $USUARIO llamada \"shabit · servidor de la app\"" | grep -o 'sbd_k[^ ]*')
[ -n "$CLAVE" ] || { echo "✕ no se ha podido crear la clave de API" >&2; exit 1; }
install -d -m 700 -o shabit -g shabit /srv/shabit-avisos/datos
umask 077
python3 - "$ARCHIVO" "$CLAVE" <<'PY'
import json, sys
ruta, clave = sys.argv[1:]
with open(ruta, "w") as f:
    json.dump({"url": "http://127.0.0.1:8090", "clave": clave, "base": "shabit"}, f, indent=2)
PY
chown shabit:shabit "$ARCHIVO"
chmod 600 "$ARCHIVO"
echo "✓ shabit conectada a la base «shabit» de SBD."
