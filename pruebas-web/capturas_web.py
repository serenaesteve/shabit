"""Capturas de la app para la página de presentación (WebKit, iPhone 13).

    /root/life-dashboard/.venv/bin/python pruebas-web/capturas_web.py
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
import pruebas

# Las PNG se guardan aquí; después: python3 pruebas-web/a_webp.py las pasa a WebP en web/img
CRUDAS = sys.argv[1] if len(sys.argv) > 1 else "/tmp/shabit-capturas"
os.makedirs(CRUDAS, exist_ok=True)

async def main():
    srv = pruebas.servidor()
    U = "http://127.0.0.1:8778/app/"
    async with async_playwright() as p:
        nav = await p.webkit.launch()
        ctx = await nav.new_context(**p.devices["iPhone 13"], color_scheme="light")
        pg = await ctx.new_page()
        await pg.goto(U + "#/hoy"); await pg.evaluate("localStorage.clear()")
        await pg.goto(U + "?demo#/hoy"); await pg.wait_for_selector(".habito")
        await pg.evaluate("localStorage.setItem('shabit', JSON.stringify({...JSON.parse(localStorage.getItem('shabit')), ajustes:{tema:'claro',primer:1,vibracion:true,instalarVisto:true,logrosVistos:['primero','rutina','completo','racha7','semana','animo','racha30','cien','meta']}}))")
        await pg.reload(); await pg.wait_for_selector(".habito"); await pg.wait_for_timeout(500)
        oculta = "document.querySelectorAll('#deshacer,#logro,#fiesta').forEach(e => e.hidden = true)"

        async def foto(nombre):
            await pg.evaluate(oculta); await pg.wait_for_timeout(250)
            await pg.screenshot(path=os.path.join(CRUDAS, f"{nombre}.png"))

        await pg.locator(".momento", has_text="Mañana").locator(".check").first.tap(); await pg.wait_for_timeout(500)
        for _ in range(3): await pg.locator(".habito", has_text="Beber agua").locator(".check").tap()
        await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(300)
        await foto("app-hoy")
        await pg.locator(".habito", has_text="Leer").locator(".check").tap(); await pg.wait_for_timeout(300)
        await pg.evaluate("window.shabitAdelantarCrono(437)"); await pg.wait_for_timeout(700)
        await pg.evaluate("document.querySelector('.momento:nth-of-type(3)')?.scrollIntoView({block:'center'})")
        await pg.locator(".habito", has_text="Leer").scroll_into_view_if_needed()
        await foto("app-crono")
        await pg.locator("#crono [data-c=pausa]").click(); await pg.wait_for_timeout(300)
        await pg.evaluate("window.scrollTo(0,0)")
        await pg.locator(".habito__abrir", has_text="Beber agua").click(); await pg.wait_for_selector("dialog.hoja"); await pg.wait_for_timeout(500)
        await foto("app-hoja"); await pg.keyboard.press("Escape")
        await pg.goto(U + "#/progreso"); await pg.wait_for_selector(".logros")
        await pg.locator(".logros").scroll_into_view_if_needed(); await pg.evaluate("window.scrollBy(0, -260)")
        await foto("app-progreso")
        await pg.goto(U + "#/rutinas"); await pg.wait_for_selector(".rutina")
        await foto("app-rutinas")
        await nav.close()
    srv.shutdown()

asyncio.run(main())
