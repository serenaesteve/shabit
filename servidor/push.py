"""Notificaciones push: cifrado RFC 8291 («aes128gcm») y firma VAPID (RFC 8292).

Solo usa la librería estándar y «cryptography».
"""
import base64
import json
import os
import struct
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

CONTACTO = "https://shabit.serenaesteve.com"

# Solo se envía a los servicios de push de los navegadores (evita usar el servidor contra otras webs).
SERVICIOS = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com",
             "web.push.apple.com", ".notify.windows.com", ".push.apple.com")


def b64u(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def deb64u(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def servicio_permitido(endpoint: str, permitir_local=False) -> bool:
    partes = urlsplit(endpoint)
    if permitir_local and partes.scheme == "http" and partes.hostname == "127.0.0.1":
        return True
    if partes.scheme != "https" or not partes.hostname:
        return False
    h = partes.hostname.lower()
    return any(h == s or (s.startswith(".") and h.endswith(s)) for s in SERVICIOS)


def _hkdf(sal, ikm, info, largo):
    return HKDF(algorithm=hashes.SHA256(), length=largo, salt=sal, info=info).derive(ikm)


def _bruta(publica) -> bytes:
    return publica.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def cifrar(p256dh: str, auth: str, mensaje: bytes) -> bytes:
    """Cifra un mensaje para una suscripción push (RFC 8291, un solo registro)."""
    ua_publica = deb64u(p256dh)
    secreto = deb64u(auth)
    clave_ua = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_publica)
    efimera = ec.generate_private_key(ec.SECP256R1())
    as_publica = _bruta(efimera.public_key())
    compartido = efimera.exchange(ec.ECDH(), clave_ua)
    ikm = _hkdf(secreto, compartido, b"WebPush: info\x00" + ua_publica + as_publica, 32)
    sal = os.urandom(16)
    cek = _hkdf(sal, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(sal, ikm, b"Content-Encoding: nonce\x00", 12)
    cifrado = AESGCM(cek).encrypt(nonce, mensaje + b"\x02", None)
    return sal + struct.pack("!I", 4096) + bytes([len(as_publica)]) + as_publica + cifrado


class Vapid:
    """Par de claves del servidor para firmar los envíos (se crea la primera vez)."""

    def __init__(self, carpeta):
        ruta = os.path.join(carpeta, "vapid.pem")
        if not os.path.exists(ruta):
            clave = ec.generate_private_key(ec.SECP256R1())
            pem = clave.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
            fd = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(pem)
        with open(ruta, "rb") as f:
            self.privada = serialization.load_pem_private_key(f.read(), None)
        self.publica = b64u(_bruta(self.privada.public_key()))

    def cabecera(self, endpoint, ahora=None):
        p = urlsplit(endpoint)
        ahora = int(ahora or time.time())
        cab = b64u(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
        cuerpo = b64u(json.dumps({"aud": f"{p.scheme}://{p.netloc}", "exp": ahora + 12 * 3600, "sub": CONTACTO}, separators=(",", ":")).encode())
        firma_der = self.privada.sign(f"{cab}.{cuerpo}".encode(), ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(firma_der)
        firma = b64u(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
        return f"vapid t={cab}.{cuerpo}.{firma}, k={self.publica}"


def enviar(vapid, suscripcion, datos):
    cuerpo = cifrar(suscripcion["keys"]["p256dh"], suscripcion["keys"]["auth"], json.dumps(datos).encode())
    pet = urllib.request.Request(suscripcion["endpoint"], data=cuerpo, method="POST", headers={
        "TTL": "3600", "Urgency": "normal", "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream", "Authorization": vapid.cabecera(suscripcion["endpoint"]),
    })
    try:
        with urllib.request.urlopen(pet, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0
