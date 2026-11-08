"""Pruebas de la web app de shabit en WebKit (el motor de Safari) con un iPhone emulado.

    /root/life-dashboard/.venv/bin/python pruebas-web/pruebas.py [carpeta-capturas]
"""
import asyncio, http.server, os, sys, threading, functools, subprocess, urllib.request, urllib.error
from playwright.async_api import async_playwright

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
PRUEBAS = os.path.dirname(os.path.abspath(__file__))
CAPTURAS = sys.argv[1] if len(sys.argv) > 1 else "/tmp"

API = 8779   # servidor de shabit con un SBD temporal (servidor/servir_pruebas.py)


class Manejador(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith("/pruebas/"):
            return os.path.join(PRUEBAS, path[len("/pruebas/"):].split("?")[0])
        return super().translate_path(path)

    def log_message(self, *a): pass

    def _api(self):
        """Pasa /api/ al servidor de shabit, como hace Apache en producción."""
        largo = int(self.headers.get("Content-Length") or 0)
        pet = urllib.request.Request(f"http://127.0.0.1:{API}{self.path}", data=self.rfile.read(largo) if largo else None, method=self.command,
                                     headers={k: v for k, v in self.headers.items() if k.lower() in ("content-type", "authorization")})
        try:
            r = urllib.request.urlopen(pet, timeout=20)
            codigo, cuerpo, tipo = r.status, r.read(), r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            codigo, cuerpo, tipo = e.code, e.read(), e.headers.get("Content-Type", "")
        self.send_response(codigo)
        if tipo: self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        if self.path.startswith("/api/"): return self._api()
        super().do_GET()

    def do_POST(self): self._api()
    def do_PUT(self): self._api()
    def do_DELETE(self): self._api()


def servidor():
    global _backend
    _backend = subprocess.Popen(["/usr/bin/python3", os.path.join(RAIZ, "..", "servidor", "servir_pruebas.py"), str(API)],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, cwd=os.path.join(RAIZ, "..", "servidor"))
    assert _backend.stdout.readline().strip() == "listo", "no arranca el servidor de pruebas"
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 8778), functools.partial(Manejador, directory=RAIZ))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    apagar = s.shutdown
    def shutdown():
        apagar(); _backend.terminate()
    s.shutdown = shutdown
    return s


fallos = []
def comprobar(cond, texto):
    print(("  ok   " if cond else "  FALLO ") + texto)
    if not cond: fallos.append(texto)

async def main():
    srv = servidor()
    async with async_playwright() as p:
        iphone = p.devices["iPhone 13"]
        nav = await p.webkit.launch()
        ctx = await nav.new_context(**iphone, color_scheme="dark")
        pg = await ctx.new_page()
        errores = []
        pg.on("pageerror", lambda e: errores.append(str(e)))
        pg.on("console", lambda m: errores.append(m.text) if m.type == "error" and "status of 40" not in m.text else None)

        print("Lógica (igual que en Android):")
        await pg.goto("http://127.0.0.1:8778/app/")
        await pg.add_script_tag(url="/pruebas/logica.js", type="module")
        await pg.wait_for_function("window.resultados")
        for nombre, error in await pg.evaluate("window.resultados"):
            comprobar(error is None, nombre + ("" if error is None else f": {error}"))

        print("Interfaz:")
        U = "http://127.0.0.1:8778/app/"
        datos = lambda: pg.evaluate("JSON.parse(localStorage.getItem('shabit'))")
        async def limpio(ruta="#/hoy"):
            await pg.evaluate("localStorage.clear()")
            await pg.goto(U + "#/ajustes"); await pg.goto(U + ruta)
            await pg.evaluate("localStorage.setItem('shabit', JSON.stringify({...JSON.parse(localStorage.getItem('shabit')||'{}'), ajustes:{tema:'claro',primer:1,vibracion:true,instalarVisto:true,logrosVistos:[]}}))")
            await pg.reload(); await pg.wait_for_timeout(300)

        await pg.evaluate("localStorage.clear()")
        await pg.goto(U + "#/hoy")
        await pg.wait_for_selector(".vacio")
        await pg.screenshot(path=f"{CAPTURAS}/ios-01-vacio.png", full_page=True)
        comprobar(await pg.locator(".aviso").count() == 1, "aviso de «Añadir a pantalla de inicio» en Safari")
        comprobar(await pg.evaluate("document.documentElement.dataset.tema") == "claro", "empieza en modo claro")

        # Hábito sencillo: marcar, deshacer, hoja, ayer
        await limpio()
        await pg.locator(".sugerencia", has_text="Estirar").click()
        await pg.wait_for_selector("#nombre")
        comprobar(await pg.input_value("#nombre") == "Estirar", "la sugerencia rellena el nombre")
        comprobar(await pg.get_by_role("button", name="Mañana").get_attribute("aria-pressed") == "true", "y el momento del día")
        await pg.get_by_role("button", name="Crear hábito").click()
        await pg.wait_for_selector(".habito")
        check = pg.locator(".habito .check")
        await check.tap(); await pg.wait_for_timeout(400)
        comprobar(await check.get_attribute("aria-pressed") == "true", "el botón redondo marca el hábito como hecho")
        comprobar(await pg.locator("#fiesta").is_visible(), "al completar el día sale la celebración")
        comprobar(await pg.locator("#logro").is_visible() and "Primer paso" in await pg.locator("#logro").inner_text(), "y el aviso del logro «Primer paso»")
        await pg.locator("#fiesta").click()
        await pg.get_by_role("button", name="Deshacer").click(); await pg.wait_for_timeout(200)
        comprobar(await check.get_attribute("aria-pressed") == "false", "«Deshacer» lo deja como estaba")
        await pg.locator(".habito__abrir").click()
        await pg.wait_for_selector("dialog.hoja"); await pg.wait_for_timeout(400)
        await pg.locator("dialog.hoja .opcion[value=\"D\"]").click(); await pg.wait_for_timeout(200)
        comprobar(await pg.locator(".habito--descanso").count() == 1, "la hoja de opciones marca descanso")
        await pg.locator(".tira .dia").nth(5).click(); await pg.wait_for_timeout(200)
        comprobar((await pg.locator("h1").inner_text()) == "Ayer", "la tira de la semana cambia al día anterior")
        await pg.locator(".habito .check").tap(); await pg.wait_for_timeout(200)
        ayer = await pg.evaluate("import('/app/js/fecha.js').then(F => F.diaDe() - 1)")
        d = await datos()
        comprobar(d["registros"][str(d["habitos"][0]["id"])].get(str(ayer)) == "H", "marcar ayer guarda el día de ayer")

        # Cantidad: 8 vasos de agua
        await limpio("#/plan/nuevo?s=0")
        await pg.wait_for_selector("#nombre")
        comprobar(await pg.input_value("#cantidad") == "8" and await pg.input_value("#unidad") == "vasos", "la sugerencia de agua viene con 8 vasos")
        await pg.get_by_role("button", name="Crear hábito").click(); await pg.wait_for_selector(".habito")
        for _ in range(7): await pg.locator(".habito .check").tap()
        await pg.wait_for_timeout(200)
        comprobar("7 de 8 vasos" in await pg.locator(".habito__sub").inner_text(), "cada toque suma un vaso")
        await pg.locator(".habito .check").tap(); await pg.wait_for_timeout(300)
        comprobar(await pg.locator(".habito--hecho").count() == 1, "al llegar a 8 queda hecho")
        await pg.locator("#fiesta").click(force=True)
        await pg.locator(".habito__abrir").click(); await pg.wait_for_selector("dialog.hoja .contador")
        await pg.locator("dialog.hoja [value=menos]").click(); await pg.wait_for_timeout(300)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        comprobar(await pg.locator(".habito--hecho").count() == 0 and "7 de 8" in await pg.locator(".habito__sub").inner_text(), "restar uno desde la hoja lo deja pendiente")

        # Temporizador: leer 20 minutos
        await limpio("#/plan/nuevo?s=2")
        await pg.wait_for_selector("#nombre")
        await pg.get_by_role("button", name="Crear hábito").click(); await pg.wait_for_selector(".habito")
        await pg.locator(".habito .check").tap(); await pg.wait_for_timeout(700)
        comprobar(await pg.locator("#crono").is_visible(), "el botón redondo arranca el temporizador")
        await pg.screenshot(path=f"{CAPTURAS}/ios-09-crono.png")
        await pg.evaluate("window.shabitAdelantarCrono(1199)"); await pg.wait_for_timeout(1500)
        comprobar(await pg.locator(".habito--hecho").count() == 1 and not await pg.locator("#crono").is_visible(), "al terminar los 20 minutos queda hecho")

        # Días concretos
        await limpio("#/plan/nuevo")
        hoy_sem = await pg.evaluate("new Date().getDay()")
        otro = (hoy_sem + 3) % 7
        await pg.fill("#nombre", "Gimnasio")
        await pg.get_by_role("button", name="Días fijos").click()
        for d in (1, 3, 5): await pg.locator(f'[data-accion="dia-semana"][data-valor="{d}"]').click()
        await pg.locator(f'[data-accion="dia-semana"][data-valor="{otro}"]').click()
        await pg.get_by_role("button", name="Crear hábito").click(); await pg.wait_for_selector(".no-tocan, .habito")
        comprobar(await pg.locator(".no-tocan").count() == 1, "un hábito de días concretos no aparece los días que no toca")
        h = (await datos())["habitos"][0]
        comprobar(h["dias"] == [otro] and h["objetivo"] == 1, "se guardan los días elegidos" + ("" if h["dias"] == [otro] and h["objetivo"] == 1 else f": {h}"))

        # Pasos: se marca solo al llegar
        await limpio("#/plan/nuevo?s=1")
        await pg.wait_for_selector("#nombre")
        await pg.get_by_role("button", name="Crear hábito").click()
        await pg.wait_for_selector(".habito")
        comprobar(await pg.locator(".tarjeta.pasos").count() == 0, "los pasos salen solo en el hábito, sin tarjeta repetida")
        await pg.evaluate("window.shabitSumarPasos(8100)")
        await pg.wait_for_timeout(2200)
        caminar = pg.locator(".habito", has_text="Caminar").locator(".check")
        comprobar(await caminar.get_attribute("aria-pressed") == "true", "Caminar se marca solo a los 8.000 pasos")
        await pg.locator("#fiesta").click(force=True)
        await caminar.tap(); await pg.wait_for_timeout(300)
        await pg.evaluate("window.shabitSumarPasos(50)"); await pg.wait_for_timeout(2200)
        comprobar(await caminar.get_attribute("aria-pressed") == "false", "si lo quitas a mano no se vuelve a marcar")

        # Ánimo y nota
        await pg.get_by_role("radio", name="Bien").click(); await pg.wait_for_timeout(200)
        comprobar(await pg.get_by_role("radio", name="Bien").get_attribute("aria-checked") == "true", "se apunta el ánimo del día")
        await pg.get_by_role("button", name="Añadir una nota del día").click(); await pg.wait_for_selector("dialog textarea")
        await pg.fill("dialog textarea", "Hoy he dormido bien")
        await pg.locator("dialog [value=guardar]").click(); await pg.wait_for_timeout(200)
        comprobar("dormido bien" in await pg.locator(".animo__nota").inner_text(), "y una nota del día")

        # Rutinas
        await limpio("#/rutinas")
        await pg.locator(".rutina").first.get_by_role("button").click(); await pg.wait_for_selector(".habito")
        comprobar(len((await datos())["habitos"]) == 3, "una rutina añade sus 3 hábitos")
        await pg.goto(U + "#/rutinas"); await pg.wait_for_selector(".rutina")
        comprobar(await pg.locator(".rutina").first.get_by_role("button").is_disabled(), "la rutina ya añadida sale como «Ya la tienes»")
        await pg.screenshot(path=f"{CAPTURAS}/ios-10-rutinas.png", full_page=True)

        # Ordenar: flechas y arrastrar
        await pg.goto(U + "#/ordenar"); await pg.wait_for_selector(".ordenar__item")
        primero = await pg.locator(".ordenar__item").first.get_attribute("data-id")
        await pg.locator(".ordenar__item").first.locator('[data-accion="bajar"]').click(); await pg.wait_for_timeout(200)
        comprobar(await pg.locator(".ordenar__item").nth(1).get_attribute("data-id") == primero, "la flecha baja un hábito")
        ultimo = pg.locator(".ordenar__item").last
        id_ultimo = int(await ultimo.get_attribute("data-id"))
        asa = await ultimo.locator(".ordenar__asa").bounding_box()
        destino = await pg.locator('.ordenar__grupo[data-momento="noche"]').bounding_box()
        await pg.mouse.move(asa["x"] + 10, asa["y"] + 10); await pg.mouse.down()
        for paso in range(1, 11):
            await pg.mouse.move(asa["x"] + 10, asa["y"] + 10 + (destino["y"] + destino["height"] + 10 - asa["y"] - 10) * paso / 10)
            await pg.wait_for_timeout(30)
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        h = [x for x in (await datos())["habitos"] if x["id"] == id_ultimo][0]
        comprobar(h["momento"] == "noche", "arrastrar un hábito lo pasa a otro momento del día")
        await pg.screenshot(path=f"{CAPTURAS}/ios-11-ordenar.png", full_page=True)

        # SBD: se guarda solo, se usa en otro móvil, se mezclan cambios y se borra
        print("SBD:")
        await limpio()
        await pg.locator(".sugerencia", has_text="Estirar").click(); await pg.wait_for_selector("#nombre")
        await pg.get_by_role("button", name="Crear hábito").click(); await pg.wait_for_selector(".habito")
        await pg.wait_for_function("JSON.parse(localStorage.getItem('shabit')).nube?.codigo && !JSON.parse(localStorage.getItem('shabit')).nube?.error", timeout=10000)
        await pg.evaluate("window.shabitNube.sincronizar()"); await pg.wait_for_timeout(600)
        codigo = (await datos())["nube"]["codigo"]
        remoto = await pg.evaluate("c => fetch('/api/datos', {headers: {Authorization: 'Bearer ' + c}}).then(r => r.json())", codigo)
        comprobar([h["nombre"] for h in remoto["datos"]["habitos"]] == ["Estirar"], "el hábito nuevo queda guardado en SBD")
        await pg.locator(".habito .check").tap(); await pg.wait_for_timeout(2500)
        remoto = await pg.evaluate("c => fetch('/api/datos', {headers: {Authorization: 'Bearer ' + c}}).then(r => r.json())", codigo)
        hoy_d = await pg.evaluate("import('/app/js/fecha.js').then(F => F.diaDe())")
        comprobar(list(remoto["datos"]["registros"].values())[0].get(str(hoy_d)) == "H", "marcar el hábito se guarda en SBD")
        await pg.goto(U + "#/ajustes"); await pg.wait_for_selector(".nube")
        comprobar("A salvo" in await pg.locator(".nube__estado").inner_text(), "Ajustes dice que tus datos están a salvo en SBD")
        await pg.screenshot(path=f"{CAPTURAS}/ios-12-sbd.png", full_page=True)

        ctx2 = await nav.new_context(**iphone, color_scheme="light")
        otro = await ctx2.new_page()
        otro.on("pageerror", lambda e: errores.append(str(e)))
        await otro.goto(U + "#/ajustes"); await otro.wait_for_selector(".nube")
        await otro.get_by_text("Pasar a otro móvil").click()
        await otro.fill("#codigo-otro", codigo)
        await otro.get_by_role("button", name="Usar", exact=True).click()
        await otro.wait_for_function("JSON.parse(localStorage.getItem('shabit')).habitos.length === 1", timeout=8000)
        await otro.goto(U + "#/hoy"); await otro.wait_for_selector(".habito")
        comprobar(await otro.locator(".habito .check").get_attribute("aria-pressed") == "true", "con el código, el otro móvil tiene los mismos hábitos y días")
        # Cambios en los dos a la vez: el segundo en guardar mezcla
        ayer_d = hoy_d - 1
        await otro.evaluate(f"import('/app/js/almacen.js').then(A => A.marcar(A.leer().habitos[0].id, {ayer_d}, 'H'))")
        await pg.goto(U + "#/hoy"); await pg.wait_for_selector(".habito")
        await pg.evaluate(f"import('/app/js/almacen.js').then(A => A.marcar(A.leer().habitos[0].id, {hoy_d - 2}, 'D'))")
        await otro.evaluate("window.shabitNube.sincronizar()"); await otro.wait_for_timeout(500)
        await pg.evaluate("window.shabitNube.sincronizar()"); await pg.wait_for_timeout(800)
        await otro.evaluate("window.shabitNube.sincronizar()"); await otro.wait_for_timeout(800)
        r1 = list((await datos())["registros"].values())[0]
        r2 = list((await otro.evaluate("JSON.parse(localStorage.getItem('shabit'))"))["registros"].values())[0]
        comprobar(r1 == r2 and r1.get(str(ayer_d)) == "H" and r1.get(str(hoy_d - 2)) == "D", "los cambios de los dos móviles se juntan sin perder ninguno")
        await ctx2.close()
        # Borrar del servidor
        await pg.goto(U + "#/ajustes"); await pg.wait_for_selector(".nube")
        await pg.get_by_role("button", name="Borrar mis datos del servidor").click()
        await pg.locator("dialog [value=si]").click(); await pg.wait_for_timeout(800)
        estado = await pg.evaluate("c => fetch('/api/datos', {headers: {Authorization: 'Bearer ' + c}}).then(r => r.status)", codigo)
        d = await datos()
        comprobar(estado == 401 and d["nube"] is None and d["ajustes"].get("sinNube") is True and len(d["habitos"]) == 1,
                  "«Borrar mis datos del servidor» los borra de SBD y los deja en el móvil")
        print("Interfaz (sigue):")

        # Datos de la versión anterior
        viejo = {"version": 1, "siguienteId": 2, "habitos": [{"id": 1, "nombre": "Leer antes de dormir", "color": 1, "objetivo": 5, "meta": 66, "creado": 20000, "pasos": None, "archivado": False, "orden": 0}],
                 "registros": {"1": {}}, "ajustes": {"tema": "goma", "primer": 1, "vibracion": True, "instalarVisto": True}}
        await pg.evaluate("v => localStorage.setItem('shabit', JSON.stringify(v))", viejo)
        await pg.goto(U + "#/hoy"); await pg.reload(); await pg.wait_for_selector(".habito")
        d = await datos()
        comprobar(d["habitos"][0].get("icono") == "libro" and d["habitos"][0].get("momento") == "cualquiera" and d["habitos"][0].get("tipo") == "simple", "los hábitos antiguos se adaptan solos")
        comprobar(d["ajustes"]["tema"] == "oscuro", "el tema antiguo «goma» pasa a «oscuro»")

        # Demo y capturas
        await pg.evaluate("localStorage.clear()")
        await pg.goto(U + "?demo#/hoy")
        await pg.wait_for_selector(".habito")
        await pg.evaluate("localStorage.setItem('shabit', JSON.stringify({...JSON.parse(localStorage.getItem('shabit')), ajustes:{tema:'claro',primer:1,vibracion:true,instalarVisto:true,logrosVistos:['primero','rutina','completo','racha7','semana','animo','racha30','cien','meta']}}))")
        await pg.reload(); await pg.wait_for_selector(".habito"); await pg.wait_for_timeout(400)
        await pg.locator(".momento", has_text="Mañana").locator(".check").first.tap(); await pg.wait_for_timeout(600)
        await pg.locator("#deshacer").evaluate("e => e.hidden = true")
        await pg.screenshot(path=f"{CAPTURAS}/ios-02-hoy.png")
        await pg.screenshot(path=f"{CAPTURAS}/ios-02b-hoy-completa.png", full_page=True)
        await pg.get_by_role("link", name="Progreso").click(); await pg.wait_for_selector(".habito-resumen")
        comprobar(await pg.locator(".logro").count() == 13, "Progreso muestra los logros")
        comprobar(await pg.locator(".fila-animo .cara").count() >= 10, "y el ánimo de los últimos días")
        await pg.screenshot(path=f"{CAPTURAS}/ios-03-progreso.png", full_page=True)
        await pg.locator(".tarjeta--enlace").nth(2).click(); await pg.wait_for_selector(".cal")
        await pg.locator(".cal__dia:not([disabled])").first.click(); await pg.wait_for_selector("dialog.hoja")
        await pg.locator("dialog.hoja .opcion[value=\"H\"]").click(); await pg.wait_for_timeout(200)
        comprobar("cal__dia--h" in (await pg.locator(".cal__dia:not([disabled])").first.get_attribute("class")), "en el calendario se cambia un día desde la hoja")
        await pg.screenshot(path=f"{CAPTURAS}/ios-04-ficha.png", full_page=True)
        await pg.goto(U + "#/plan/nuevo"); await pg.wait_for_selector("#nombre")
        await pg.get_by_role("button", name="Crear hábito").click()
        comprobar(await pg.locator("#error-nombre").is_visible(), "sin nombre avisa en vez de crear")
        await pg.screenshot(path=f"{CAPTURAS}/ios-05-plan.png", full_page=True)
        await pg.goto(U + "#/ajustes"); await pg.wait_for_selector(".fila-opcion")
        await pg.screenshot(path=f"{CAPTURAS}/ios-06-ajustes.png", full_page=True)
        await pg.get_by_role("radio", name="Oscura").click(); await pg.wait_for_timeout(200)
        comprobar(await pg.evaluate("document.documentElement.dataset.tema") == "oscuro", "cambiar a modo oscuro")
        await pg.goto(U + "#/hoy"); await pg.wait_for_selector(".habito"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f"{CAPTURAS}/ios-07-hoy-oscuro.png")

        copia = await pg.evaluate("import('/app/js/almacen.js').then(A => A.exportar())")
        await pg.evaluate("localStorage.clear()")
        await pg.evaluate("t => import('/app/js/almacen.js').then(A => A.importar(t))", copia)
        n = await pg.evaluate("import('/app/js/almacen.js').then(A => A.leer().habitos.length)")
        comprobar(n == 6, "exportar e importar la copia conserva los 6 hábitos")
        mal = await pg.evaluate("""import('/app/js/almacen.js').then(A => { try { A.importar('{"x":1}'); return 'aceptado' } catch (e) { return e.message } })""")
        comprobar("no es una copia" in mal, "un archivo que no es de shabit se rechaza")

        print("Más intuitiva:")
        await limpio("#/plan/nuevo")
        await pg.fill("#nombre", "Leer un rato")
        comprobar(await pg.locator('[data-accion="icono"][data-valor="libro"]').get_attribute("aria-pressed") == "true", "el icono se elige solo por el nombre («Leer» → libro)")
        await pg.get_by_role("button", name="Crear hábito").click(); await pg.wait_for_selector(".habito")
        comprobar(await pg.locator(".consejo").count() == 1, "la primera vez, Hoy explica cómo se usa")
        await pg.get_by_role("button", name="Entendido").click(); await pg.wait_for_timeout(200)
        comprobar(await pg.locator(".consejo").count() == 0, "y el consejo se puede cerrar")
        comprobar("hechos" in await pg.locator(".progreso-dia").inner_text(), "el anillo dice qué cuenta («hechos»)")
        await pg.locator(".habito__abrir").click(); await pg.wait_for_selector("dialog.hoja"); await pg.wait_for_timeout(300)
        comprobar(await pg.locator("dialog.hoja .opcion--quitar").count() == 0, "sin marcar, la hoja no ofrece «Quitar la marca»")
        await pg.locator('dialog.hoja .opcion[value="H"]').click(); await pg.wait_for_timeout(300)
        await pg.locator("#fiesta").click(force=True)
        await pg.locator(".habito__abrir").click(); await pg.wait_for_selector("dialog.hoja"); await pg.wait_for_timeout(300)
        comprobar(await pg.locator("dialog.hoja .opcion--quitar").count() == 1, "marcado, sí la ofrece")
        await pg.keyboard.press("Escape")

        print("Funciones nuevas:")
        hoy_d = await pg.evaluate("import('/app/js/fecha.js').then(F => F.diaDe())")
        hoja = lambda: pg.wait_for_selector("dialog.hoja")
        # Dejar algo: cuenta los días sin recaer
        await limpio("#/plan/nuevo")
        await pg.fill("#nombre", "Sin azúcar")
        await pg.get_by_role("button", name="Dejar algo").click()
        await pg.get_by_text("Más opciones").click()
        await pg.get_by_role("button", name="Salud").click()
        await pg.locator('[data-accion="reto"][data-valor="30"]').click()
        await pg.get_by_role("button", name="Crear hábito").click(); await pg.wait_for_selector(".habito")
        h = (await datos())["habitos"][0]
        comprobar(h["tipo"] == "evitar" and h["etiqueta"] == "salud" and h["reto"] == 30 and h["inicioReto"] == hoy_d, "se crea un hábito para dejar algo, con etiqueta y reto")
        comprobar(await pg.locator(".check--evitar[aria-pressed=true]").count() == 1, "dejar algo sale como día limpio sin tocar nada")
        await pg.locator(".check--evitar").click(); await hoja(); await pg.wait_for_timeout(300)
        await pg.locator('dialog.hoja .opcion[value="R"]').click(); await pg.wait_for_timeout(300)
        comprobar(await pg.locator(".check--recaida").count() == 1, "«He recaído» lo apunta")
        # Nota en el día
        await pg.locator(".habito__abrir").click(); await hoja(); await pg.wait_for_timeout(300)
        await pg.locator(".hoja__nota summary").click()
        await pg.fill("#nota-habito", "Un pastel en el cumple")
        await pg.locator('dialog.hoja [value="nota"]').click(); await pg.wait_for_timeout(200)
        d = await datos()
        comprobar(d["notas"][str(h["id"])][str(hoy_d)] == "Un pastel en el cumple", "se guarda una nota en el día del hábito")
        # La ficha: reto, notas, estadísticas y año
        await pg.goto(U + f"#/ficha/{h['id']}"); await pg.wait_for_selector(".reto-estado")
        comprobar("Reto de 30 días" in await pg.locator(".reto-estado").inner_text(), "la ficha enseña el reto")
        comprobar("Un pastel" in await pg.locator(".notas").inner_text(), "y las notas del mes")
        comprobar(await pg.locator(".mapa rect").count() > 300, "y el mapa del año")
        await pg.screenshot(path=f"{CAPTURAS}/ios-13-ficha-reto.png", full_page=True)

        # Pausa
        await pg.goto(U + "#/plan/nuevo"); await pg.fill("#nombre", "Correr")
        await pg.get_by_text("Más opciones").click()
        await pg.get_by_role("button", name="Ejercicio").click()
        await pg.get_by_role("button", name="Añadir un recordatorio").click()
        await pg.get_by_role("button", name="Añadir otra hora").click()
        await pg.fill("#hora-aviso-1", "07:15")
        await pg.get_by_role("button", name="Crear hábito").click(); await pg.wait_for_selector(".habito")
        correr = [x for x in (await datos())["habitos"] if x["nombre"] == "Correr"][0]
        comprobar(correr["avisos"] == ["07:15", "20:00"], f"un hábito puede tener varios recordatorios ({correr['avisos']})")
        comprobar(await pg.locator(".filtros .chip").count() == 3, "con etiquetas aparecen los filtros")
        await pg.locator(".filtros .chip", has_text="Ejercicio").click(); await pg.wait_for_timeout(200)
        comprobar(await pg.locator(".habito").count() == 1, "el filtro deja solo los de esa etiqueta")
        await pg.locator(".filtros .chip", has_text="Todos").click(); await pg.wait_for_timeout(200)
        await pg.locator(".habito__abrir", has_text="Correr").click(); await hoja(); await pg.wait_for_timeout(300)
        await pg.locator('dialog.hoja [value="pausar"]').click(); await pg.wait_for_timeout(300)
        await pg.locator('dialog.hoja [value="7"]').click(); await pg.wait_for_timeout(300)
        comprobar("En pausa (1)" in await pg.locator(".no-tocan").first.inner_text(), "pausar una semana lo aparta de Hoy")
        correr = [x for x in (await datos())["habitos"] if x["nombre"] == "Correr"][0]
        comprobar(correr["pausas"] == [[hoy_d, hoy_d + 6]], "y guarda la pausa")
        await pg.locator(".no-tocan summary", has_text="En pausa").click()
        await pg.locator(".no-tocan .habito__abrir", has_text="Correr").click(); await hoja(); await pg.wait_for_timeout(300)
        await pg.locator('dialog.hoja [value="reanudar"]').click(); await pg.wait_for_timeout(300)
        correr = [x for x in (await datos())["habitos"] if x["nombre"] == "Correr"][0]
        comprobar(correr["pausas"] == [], "reanudar quita la pausa de hoy")

        # Veces al mes
        await pg.goto(U + "#/plan/nuevo"); await pg.fill("#nombre", "Llamar a la abuela")
        await pg.get_by_role("button", name="Por mes").click()
        await pg.locator('[data-accion="por-mes"][data-valor="2"]').click()
        await pg.get_by_role("button", name="Crear hábito").click(); await pg.wait_for_selector(".habito")
        ab = [x for x in (await datos())["habitos"] if x["nombre"] == "Llamar a la abuela"][0]
        comprobar(ab["porMes"] == 2 and ab["dias"] is None, "un hábito puede ser de veces al mes")
        comprobar("este mes" in await pg.locator(".habito", has_text="Llamar").inner_text(), "y Hoy dice cuántas lleva este mes")

        # Progreso: mapa del año, informe y CSV
        await pg.goto(U + "#/progreso"); await pg.wait_for_selector(".mapa")
        comprobar(await pg.locator(".mapa").count() == 1, "Progreso tiene el mapa del año")
        await pg.goto(U + "#/informe"); await pg.wait_for_selector(".tabla-informe")
        comprobar(await pg.locator(".tabla-informe tbody tr").count() == 3, "el informe tiene una fila por hábito")
        async with pg.expect_download() as descarga:
            await pg.get_by_role("button", name="Exportar CSV").click()
        ruta_csv = await (await descarga.value).path()
        texto_csv = open(ruta_csv, encoding="utf-8-sig").read()
        comprobar("Sin azúcar" in texto_csv and ";" in texto_csv, "se exporta en CSV")

        # Ajustes: colores, letra, resumen, compañero y QR
        await pg.goto(U + "#/ajustes"); await pg.wait_for_selector(".temas")
        await pg.get_by_role("radio", name="Menta").click(); await pg.wait_for_timeout(200)
        comprobar(await pg.evaluate("document.documentElement.dataset.tema") == "menta", "hay más colores (menta)")
        await pg.get_by_role("button", name="Muy grande").click(); await pg.wait_for_timeout(200)
        tam = await pg.evaluate("parseFloat(getComputedStyle(document.documentElement).fontSize)")
        comprobar(tam >= 19.9, f"la letra se puede agrandar ({tam}px)")
        await pg.screenshot(path=f"{CAPTURAS}/ios-14-ajustes-grande.png", full_page=True)
        ancho = await pg.evaluate("document.documentElement.scrollWidth")
        comprobar(ancho <= 390, f"con letra muy grande tampoco hay scroll horizontal ({ancho}px)")
        await pg.get_by_role("button", name="Normal", exact=True).click()
        await pg.locator('label:has([data-accion="resumen"])').click(); await pg.wait_for_timeout(200)
        comprobar((await datos())["ajustes"].get("resumen") == "08:30", "se activa el resumen de la mañana")
        await pg.wait_for_function("JSON.parse(localStorage.getItem('shabit')).nube?.codigo", timeout=10000)
        await pg.evaluate("window.shabitNube.sincronizar()"); await pg.wait_for_timeout(500)
        await pg.goto(U + "#/ajustes"); await pg.wait_for_selector(".temas")
        await pg.get_by_role("button", name="Crear enlace").click()
        await pg.wait_for_selector(".codigo code:has-text('/ver/')")
        enlace = await pg.locator(".codigo code", has_text="/ver/").inner_text()
        await pg.get_by_text("Pasar a otro móvil").click()
        await pg.get_by_role("button", name="Mostrar el QR").click()
        comprobar(await pg.locator(".qr svg").count() == 1, "el código para otro móvil sale como QR")
        ctx3 = await nav.new_context(**iphone)
        comp = await ctx3.new_page()
        comp.on("pageerror", lambda e: errores.append(str(e)))
        await comp.goto(enlace); await comp.wait_for_selector(".lista--ver .tarjeta")
        txt = await comp.locator(".lista--ver").inner_text()
        comprobar("Sin azúcar" in txt and "Un pastel" not in txt, "el compañero ve los hábitos, sin las notas")
        await comp.screenshot(path=f"{CAPTURAS}/ios-15-companero.png", full_page=True)
        # Abrir el QR en otro móvil
        codigo = (await datos())["nube"]["codigo"]
        await comp.goto(U + f"#/vincular/{codigo}"); await comp.wait_for_selector("[data-accion=vincular-qr]")
        await comp.locator("[data-accion=vincular-qr]").click()
        await comp.wait_for_function("JSON.parse(localStorage.getItem('shabit')).habitos.length === 3", timeout=8000)
        comprobar(True, "escanear el QR trae los hábitos al otro móvil")
        await ctx3.close()
        await pg.get_by_role("button", name="Dejar de compartir").click(); await pg.wait_for_timeout(500)
        comprobar(await pg.evaluate("u => fetch('/api/ver/' + u.split('/ver/')[1]).then(r => r.status)", enlace) == 404, "«Dejar de compartir» apaga el enlace")

        # Atajos del iPhone: un enlace que marca el hábito sin abrir la app
        await pg.goto(U + f"#/ficha/{correr['id']}"); await pg.wait_for_selector("[data-accion=crear-atajo]")
        await pg.locator("[data-accion=crear-atajo]").click()
        await pg.wait_for_selector(".codigo code:has-text('/api/atajo/')")
        atajo = await pg.locator(".codigo code", has_text="/api/atajo/").inner_text()
        r = await pg.evaluate("u => fetch(u, {method: 'POST'}).then(r => r.text())", atajo)
        comprobar("Correr" in r, "el enlace de Atajos marca el hábito")
        await pg.evaluate("window.shabitNube.sincronizar()"); await pg.wait_for_timeout(800)
        d = await datos()
        comprobar(d["registros"].get(str(correr["id"]), {}).get(str(hoy_d)) == "H", "y la app lo ve al sincronizar")
        d = await datos()

        # Rendimiento: 20 hábitos con 5 años de días marcados
        print("Rendimiento:")
        await pg.evaluate("""() => import('/app/js/fecha.js').then(F => {
          const hoy = F.diaDe(), d = JSON.parse(localStorage.getItem('shabit'));
          d.habitos = []; d.registros = {}; d.notas = {}; d.nube = null; d.ajustes.sinNube = true;
          for (let i = 0; i < 20; i++) {
            const id = 1000 + i;
            d.habitos.push({ id, nombre: 'Hábito ' + i, icono: 'agua', momento: ['manana','tarde','noche','cualquiera'][i % 4], color: i % 10,
              objetivo: 5, dias: i % 5 === 0 ? [1, 3, 5] : null, porMes: i === 7 ? 4 : null, tipo: i === 3 ? 'evitar' : 'simple',
              meta: 66, creado: hoy - 5 * 365, archivado: false, orden: i, avisos: [], pausas: [], etiqueta: i % 2 ? 'salud' : null });
            const r = {};
            for (let x = hoy - 5 * 365; x < hoy; x++) { const v = (x * 7 + i * 13) % 10; if (i === 3 ? v === 0 : v < 7) r[x] = i === 3 ? 'R' : v === 6 ? 'D' : 'H'; }
            d.registros[id] = r;
          }
          localStorage.setItem('shabit', JSON.stringify(d));
        })""")
        await pg.goto(U + "#/ajustes"); await pg.reload(); await pg.wait_for_selector(".temas")
        comprobar(await pg.evaluate("JSON.parse(localStorage.getItem('shabit')).habitos.length") == 20, "se cargan 20 hábitos con 5 años de días")
        tamano = await pg.evaluate("localStorage.getItem('shabit').length")
        tiempos = {}
        errores_antes = len(errores)
        for nombre, ruta_, sel in (("Hoy", "#/hoy", ".habito"), ("Progreso", "#/progreso", ".mapa"), ("Ficha", "#/ficha/1001", ".mapa"), ("Informe", "#/informe", ".tabla-informe")):
            await pg.goto(U + "#/ajustes"); await pg.wait_for_selector(".temas")
            t = await pg.evaluate(f"""() => new Promise((ok, mal) => {{ const t0 = performance.now(); location.hash = '{ruta_}';
              const mirar = () => document.querySelector('{sel}') ? ok(performance.now() - t0) : performance.now() - t0 > 10000 ? mal(new Error('no sale {sel}: ' + document.querySelector('main, #app')?.innerText.slice(0, 300))) : setTimeout(mirar, 5);
              mirar(); }})""")
            tiempos[nombre] = round(t)
            if errores: print("ERRORES", nombre, errores[-3:])
        await pg.goto(U + "#/hoy"); await pg.wait_for_selector(".habito")
        marcar = await pg.evaluate("""() => { const t0 = performance.now(); document.querySelector('.habito .check').click(); return performance.now() - t0; }""")
        print(f"       datos: {tamano // 1024} KB · " + " · ".join(f"{k} {v} ms" for k, v in tiempos.items()) + f" · marcar {round(marcar)} ms")
        comprobar(max(tiempos.values()) < 800, "con 5 años y 20 hábitos cada pantalla sale en menos de 0,8 s")
        comprobar(marcar < 300, "y marcar un hábito responde en menos de 0,3 s")

        ancho = await pg.evaluate("document.documentElement.scrollWidth")
        comprobar(ancho <= 390, f"sin scroll horizontal ({ancho}px)")
        comprobar(not errores, "sin errores en la consola" + (f": {errores}" if errores else ""))
        await nav.close()

        # Sin conexión: el WebKit de Playwright no recarga sin red (error interno suyo),
        # así que el service worker se prueba con Chromium.
        nav = await p.chromium.launch()
        ctx = await nav.new_context(**p.devices["Pixel 7"])
        pg = await ctx.new_page()
        await pg.goto("http://127.0.0.1:8778/app/?demo#/hoy")
        await pg.wait_for_selector(".habito")
        await pg.evaluate("navigator.serviceWorker.ready")
        await pg.reload(); await pg.wait_for_timeout(800)
        await ctx.set_offline(True)
        await pg.reload()
        try:
            await pg.wait_for_selector(".habito", timeout=5000); sin_red = True
        except Exception:
            sin_red = False
        comprobar(sin_red, "funciona sin conexión (service worker)")
        await nav.close()
    srv.shutdown()
    print(f"\n{'TODO BIEN' if not fallos else f'{len(fallos)} FALLOS'}")
    sys.exit(1 if fallos else 0)

if __name__ == "__main__":
    asyncio.run(main())
