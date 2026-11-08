"""Pasa las capturas PNG a WebP de 720 px para la web.   python3 pruebas-web/a_webp.py [carpeta]"""
import os, sys
from PIL import Image
origen = sys.argv[1] if len(sys.argv) > 1 else "/tmp/shabit-capturas"
destino = os.path.join(os.path.dirname(__file__), "..", "web", "img")
for n in sorted(os.listdir(origen)):
    if n.endswith(".png"):
        im = Image.open(os.path.join(origen, n)).convert("RGB")
        im.resize((720, int(im.height * 720 / im.width)), Image.LANCZOS).save(os.path.join(destino, n[:-4] + ".webp"), "WEBP", quality=84, method=6)
        print(n)
