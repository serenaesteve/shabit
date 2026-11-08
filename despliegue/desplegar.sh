#!/bin/bash
# Publica (o actualiza) shabit en shabit.serenaesteve.com: la web, la app y el servidor de recordatorios.
# Se puede lanzar las veces que haga falta.
#   bash despliegue/desplegar.sh
# Si cambia algún archivo de web/app, sube VERSION en web/app/sw.js para que los móviles descarguen la nueva.
set -euo pipefail

DOMINIO=shabit.serenaesteve.com
IP_SERVIDOR=82.165.244.40
ORIGEN=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DESTINO=/var/www/shabit

# 1. Solo la web (página, estilos, imágenes, fuentes y el APK)
install -d -m 755 "$DESTINO"
rsync -a --delete --chown=root:www-data --chmod=D755,F644 "$ORIGEN/web/" "$DESTINO/"

# 1b. Servidor de shabit (datos en SBD y recordatorios): usuario propio, código en /srv/shabit-avisos/app
id -u shabit >/dev/null 2>&1 || useradd --system --home-dir /srv/shabit-avisos --shell /usr/sbin/nologin shabit
install -d -m 755 -o root -g root /srv/shabit-avisos /srv/shabit-avisos/app
install -d -m 700 -o shabit -g shabit /srv/shabit-avisos/datos
rsync -a --delete --exclude '__pycache__' --exclude 'prueba_*.py' --exclude 'servir_pruebas.py' \
  --chown=root:root --chmod=D755,F644 "$ORIGEN/servidor/" /srv/shabit-avisos/app/
# La primera vez crea la base «shabit» en el SBD de producción y su clave (no hace nada si ya está)
bash "$ORIGEN/despliegue/integrar-sbd.sh"
install -m 644 "$ORIGEN/despliegue/shabit-avisos.service" /etc/systemd/system/shabit-avisos.service
systemctl daemon-reload
systemctl enable -q shabit-avisos
systemctl restart shabit-avisos

# 2. Apache en el puerto 80 (redirección a HTTPS y verificación de Let's Encrypt)
install -m 644 "$ORIGEN/despliegue/shabit.conf" /etc/apache2/sites-available/shabit.conf
a2ensite -q shabit.conf
apache2ctl -t 2>&1 | tail -1
systemctl reload apache2

# 3. HTTPS, solo cuando el DNS público apunte a este servidor
IP_DOMINIO=$(dig +short A "$DOMINIO" @1.1.1.1 | tail -1)
IPV6_DOMINIO=$(dig +short AAAA "$DOMINIO" @1.1.1.1 | tail -1)
if [ "$IP_DOMINIO" != "$IP_SERVIDOR" ] || [ -n "$IPV6_DOMINIO" ]; then
  echo "FALTA EL DNS: $DOMINIO tiene que tener un registro A con $IP_SERVIDOR y ningún AAAA."
  exit 0
fi
if [ ! -e "/etc/letsencrypt/live/$DOMINIO/fullchain.pem" ]; then
  certbot certonly --webroot -w /var/www/acme -d "$DOMINIO" --non-interactive --keep-until-expiring \
    --deploy-hook "systemctl reload apache2"
fi
install -m 644 "$ORIGEN/despliegue/shabit-ssl.conf" /etc/apache2/sites-available/shabit-ssl.conf
a2ensite -q shabit-ssl.conf
apache2ctl -t 2>&1 | tail -1
systemctl reload apache2
sleep 1
echo "Publicado: https://$DOMINIO → $(curl -s -o /dev/null -m 10 --resolve "$DOMINIO:443:$IP_SERVIDOR" -w '%{http_code}' "https://$DOMINIO/")"
