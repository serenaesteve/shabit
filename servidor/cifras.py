#!/usr/bin/env python3
"""Panel de cifras de shabit: cuántas cuentas hay, cuántas se usan y qué hábitos son los más comunes.

Lo saca todo de los procedimientos almacenados de SBD (cifras, habitos_populares, habitos_por_tipo),
así que no lee los datos de nadie: solo totales.

    python3 cifras.py --sbd /srv/shabit-avisos/datos/sbd.json
    python3 cifras.py --sbd … --json      # para usarlo desde otro programa
"""
import argparse
import json
import sys

from bd import Base

TIPOS = {"simple": "Simple", "cantidad": "Cantidad", "tiempo": "Tiempo", "evitar": "Dejar algo"}


def barra(n, maximo, ancho=24):
    return "█" * max(1 if n else 0, round(n / maximo * ancho)) if maximo else ""


def pintar(c, salida=sys.stdout):
    cu = c["cuentas"]
    w = salida.write
    w("shabit · cifras\n\n")
    w(f"  Cuentas          {cu['cuentas'] or 0:>6}\n")
    w(f"  Activas 7 días   {cu['activas_7_dias'] or 0:>6}\n")
    w(f"  Nuevas 7 días    {cu['nuevas_7_dias'] or 0:>6}\n")
    w(f"  Con avisos       {c['suscripciones']:>6}\n\n")
    if c["por_tipo"]:
        w("Hábitos por tipo\n")
        m = max(x["habitos"] for x in c["por_tipo"])
        for x in c["por_tipo"]:
            w(f"  {TIPOS.get(x['tipo'], x['tipo']):<16} {x['habitos']:>5}  {barra(x['habitos'], m)}\n")
        w("\n")
    if c["habitos_populares"]:
        w("Los más comunes\n")
        m = c["habitos_populares"][0]["cuentas"]
        for x in c["habitos_populares"]:
            w(f"  {x['habito'][:16]:<16} {x['cuentas']:>5}  {barra(x['cuentas'], m)}\n")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--sbd", default="datos/sbd.json", help="JSON con url, clave y base de SBD")
    p.add_argument("--json", action="store_true", help="sacar las cifras en JSON")
    a = p.parse_args(argv)
    with open(a.sbd, encoding="utf-8") as f:
        conf = json.load(f)
    c = Base(conf["url"], conf["clave"], conf.get("base", "shabit")).cifras()
    if a.json:
        print(json.dumps(c, ensure_ascii=False, indent=2, default=str))
    else:
        pintar(c)


if __name__ == "__main__":
    main()
