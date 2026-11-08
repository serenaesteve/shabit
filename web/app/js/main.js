import * as A from "./almacen.js";
import * as Avisos from "./avisos.js";
import * as Nube from "./nube.js";
import { diaDe, miles } from "./fecha.js";
import { diaCompleto, ficha, rachaDiasCompletos, tipoDe } from "./progreso.js";
import { DetectorPasos, pasosDeHoy, sumarPasos } from "./pasos.js";
import { COLORES, colorDisco } from "./dibujo.js";
import { icono, iconoPorNombre } from "./iconos.js";
import { logros } from "./logros.js";
import { RUTINAS, desdePlantilla } from "./rutinas.js";
import { compartirImagen, csv, imagenProgreso, vistaInforme, vistaVer } from "./extras.js";
import {
  SUGERENCIAS, esc, hojaHabito, hojaNota, hojaPausa, mesDe, mmss, tituloDia,
  vistaAjustes, vistaFicha, vistaHoy, vistaOrdenar, vistaPlan, vistaProgreso, vistaRutinas,
} from "./vistas.js";
import { cargarDemo } from "./demo.js";

const app = document.getElementById("app");
const nav = document.getElementById("nav");
const aviso = document.getElementById("deshacer");
const barraCrono = document.getElementById("crono");
const fiesta = document.getElementById("fiesta");
const avisoLogro = document.getElementById("logro");

const sesion = {
  hoy: diaDe(),
  dia: diaDe(),          // día elegido en la tira de la semana
  ultimoCambio: null,
  borrador: null,
  mes: null,
  movimiento: "apagado", // apagado | pendiente | activo | denegado | no-disponible
  pendientesPasos: 0,
  deshacer: null,
  avisos: "cargando",
  completoHoy: null,
  filtro: null,
  compartir: null,       // { url } del enlace para un compañero
  atajo: null,           // { id, url, error } del enlace para Atajos
  ver: null,             // datos de la pantalla de solo lectura
};

/* ------------------------------------------------------------------ datos antiguos */
(function migrar() {
  const d = A.leer();
  let cambios = false;
  for (const h of d.habitos) {
    if (!h.icono) { h.icono = iconoPorNombre(h.nombre); cambios = true; }
    if (!h.momento) { h.momento = "cualquiera"; cambios = true; }
    if (!h.tipo) { h.tipo = "simple"; cambios = true; }
    if (!Array.isArray(h.avisos)) { h.avisos = h.aviso ? [h.aviso] : []; delete h.aviso; cambios = true; }
    if (!Array.isArray(h.pausas)) { h.pausas = []; cambios = true; }
  }
  const temas = { magnesio: "claro", goma: "oscuro" };
  if (temas[d.ajustes.tema]) { d.ajustes.tema = temas[d.ajustes.tema]; cambios = true; }
  if (cambios) A.reemplazar(d);
})();

/* ------------------------------------------------------------------ utilidades */
const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalada = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const vibrar = (ms = 10) => navigator.vibrate?.(ms);
const activos = (d = A.leer()) => d.habitos.filter((h) => !h.archivado);

function ruta() {
  const [camino, consulta = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [nombre = "hoy", arg] = camino.split("/");
  return { nombre: nombre || "hoy", arg, params: new URLSearchParams(consulta) };
}

const fichas = (datos) => activos(datos)
  .sort((a, b) => a.orden - b.orden || a.id - b.id)
  .map((h) => ficha(h, datos.registros[h.id], sesion.hoy, datos.ajustes.primer));

/** Segundos de un hábito con tiempo, contando el temporizador si está en marcha. */
function segundos(id, dia = sesion.hoy) {
  const c = A.leer().crono;
  if (c && c.id === id && c.dia === dia) return c.base + (Date.now() - c.inicio) / 1000;
  return A.progreso(id, dia);
}

function contexto() {
  const datos = A.leer();
  const fs = fichas(datos);
  const lista = activos(datos);
  return {
    datos, hoy: sesion.hoy, dia: sesion.dia, fichas: fs, filtro: sesion.filtro, compartir: sesion.compartir, atajo: sesion.atajo,
    ultimoCambio: sesion.ultimoCambio,
    pasosHoy: pasosDeHoy(datos.pasos, sesion.hoy),
    movimiento: sesion.movimiento,
    avisoInstalar: esIOS && !instalada() && !datos.ajustes.instalarVisto,
    avisos: sesion.avisos,
    nube: { activa: !datos.ajustes.sinNube, ...(datos.nube || {}), ver: sesion.verCodigo, qr: sesion.qr, errorCodigo: sesion.errorCodigo, enLinea: navigator.onLine },
    crono: datos.crono,
    progreso: A.progreso,
    segundos,
    completo: (d) => diaCompleto(lista, datos.registros, d),
    completoHoy: diaCompleto(lista, datos.registros, sesion.hoy),
    rachaCompletos: rachaDiasCompletos(lista, datos.registros, sesion.hoy),
    logros: logros(datos, fs, sesion.hoy),
  };
}

/* ------------------------------------------------------------------ pintar */
function pintar() {
  const r = ruta();
  const c = contexto();
  document.documentElement.dataset.tema = c.datos.ajustes.tema;
  document.documentElement.dataset.texto = c.datos.ajustes.texto || "normal";
  let html, titulo;
  switch (r.nombre) {
    case "progreso": html = vistaProgreso(c); titulo = "Progreso"; break;
    case "ficha": {
      const f = c.fichas.find((x) => x.habito.id === Number(r.arg));
      if (!f) { location.replace("#/hoy"); return; }
      sesion.mes ??= mesDe(sesion.hoy);
      html = vistaFicha(c, f, sesion.mes); titulo = f.habito.nombre;
      break;
    }
    case "plan": {
      if (!sesion.borrador) {
        const h = c.datos.habitos.find((x) => x.id === Number(r.arg));
        const s = r.params.has("s") ? SUGERENCIAS[Number(r.params.get("s"))] : null;
        sesion.borrador = h ? { tipo: "simple", dias: null, ...h }
          : desdePlantilla(s ?? { nombre: "", icono: "brote", momento: "cualquiera", color: Math.floor(Math.random() * COLORES.length) }, sesion.hoy);
      }
      html = vistaPlan(c, sesion.borrador); titulo = sesion.borrador.id ? "Editar hábito" : "Nuevo hábito";
      break;
    }
    case "rutinas": html = vistaRutinas(c); titulo = "Rutinas"; break;
    case "informe": html = vistaInforme(c); titulo = "Informe"; break;
    case "ver": html = vistaVer(sesion.ver, sesion.hoy); titulo = "Progreso compartido"; break;
    case "vincular":
      html = `<h1 class="titulo-pantalla">Usar tu rutina aquí</h1>
        <p class="tarjeta nota">Vas a usar en este dispositivo los hábitos de la cuenta del código que has escaneado.${c.datos.habitos.length ? " Los hábitos que hay ahora aquí se sustituirán." : ""}</p>
        <button class="boton boton--principal ancho" data-accion="vincular-qr" data-valor="${esc(r.arg || "")}">Usar estos hábitos</button>
        <a class="boton boton--suave ancho" href="#/hoy">Cancelar</a>
        ${sesion.errorCodigo ? `<p class="error">${esc(sesion.errorCodigo)}</p>` : ""}`;
      titulo = "Usar tu rutina aquí";
      break;
    case "ordenar": html = vistaOrdenar(c); titulo = "Ordenar"; break;
    case "ajustes": html = vistaAjustes(c); titulo = "Ajustes"; break;
    default: html = vistaHoy(c); titulo = tituloDia(sesion.dia, sesion.hoy);
  }
  app.innerHTML = html;
  document.title = `${titulo} · shabit`;
  const pestana = { hoy: "hoy", progreso: "progreso", ajustes: "ajustes" }[r.nombre] ?? (["ficha", "plan", "rutinas", "ordenar", "informe", "ver", "vincular"].includes(r.nombre) ? null : "hoy");
  nav.hidden = !pestana;
  nav.querySelectorAll("a").forEach((a) => a.setAttribute("aria-current", a.dataset.ruta === pestana ? "page" : "false"));
  if (r.nombre === "ordenar") prepararArrastre();
  pintarCrono();
  sesion.ultimoCambio = null;
}

window.addEventListener("hashchange", () => {
  const r = ruta();
  if (r.nombre !== "plan") sesion.borrador = null;
  if (r.nombre !== "ficha") { sesion.mes = null; sesion.atajo = null; }
  if (r.nombre === "ver") cargarVer(r.arg);
  if (r.nombre === "ajustes") cargarCompartir();
  cerrarHoja();
  aviso.hidden = true;
  fiesta.hidden = true;
  pintar();
  window.scrollTo(0, 0);
});

A.alCambiar((_, origen) => {
  pintar();
  revisarLogrosYFiesta();
  if (origen !== "nube") Nube.programar();   // un cambio de quien usa la app: se guarda en SBD
});

/* ------------------------------------------------------------------ celebración y logros */
function revisarLogrosYFiesta() {
  const c = contexto();
  if (sesion.completoHoy === false && c.completoHoy) celebrar(c.rachaCompletos);
  sesion.completoHoy = c.completoHoy;

  const vistos = c.datos.ajustes.logrosVistos;
  const ok = c.logros.filter((l) => l.ok).map((l) => l.id);
  if (!vistos) return;
  const nuevos = c.logros.filter((l) => l.ok && !vistos.includes(l.id));
  if (nuevos.length) {
    mostrarLogro(nuevos[0]);
    A.cambiarAjustes({ logrosVistos: ok });
  }
}

function celebrar(racha) {
  const colores = COLORES.map((c) => c.hex);
  fiesta.querySelector(".fiesta__confeti").innerHTML = Array.from({ length: 42 }, (_, i) =>
    `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${colores[i % colores.length]};animation-delay:${(Math.random() * 0.5).toFixed(2)}s;--giro:${Math.round(Math.random() * 720 - 360)}deg;--x:${Math.round(Math.random() * 80 - 40)}px"></i>`).join("");
  fiesta.querySelector("p").textContent = racha > 1 ? `Llevas ${racha} días completos seguidos.` : "Has cumplido todo lo de hoy.";
  fiesta.hidden = false;
  vibrar([20, 60, 20]);
  clearTimeout(fiesta._t);
  fiesta._t = setTimeout(() => (fiesta.hidden = true), 4200);
}
fiesta.addEventListener("click", () => (fiesta.hidden = true));

function mostrarLogro(l) {
  avisoLogro.querySelector("b").textContent = `Logro: ${l.titulo}`;
  avisoLogro.querySelector("span").textContent = l.texto;
  avisoLogro.hidden = false;
  clearTimeout(avisoLogro._t);
  avisoLogro._t = setTimeout(() => (avisoLogro.hidden = true), 4500);
}
avisoLogro.addEventListener("click", () => { avisoLogro.hidden = true; location.hash = "#/progreso"; });

/* ------------------------------------------------------------------ marcar y deshacer */
const habito = (id) => A.leer().habitos.find((h) => h.id === id);

/** Pone un día en un estado (H, D o null) y ofrece deshacerlo. */
function poner(id, dia, tipo, { progreso } = {}) {
  const antes = A.tipo(id, dia);
  const progresoAntes = A.progreso(id, dia);
  if (antes === tipo && progreso === undefined) return;
  sesion.ultimoCambio = { id, dia };
  if (progreso !== undefined) A.ponerProgreso(id, dia, progreso);
  sesion.ultimoCambio = { id, dia };
  if (tipo) A.marcar(id, dia, tipo); else A.quitar(id, dia);
  if (tipo === "H") vibrar();
  const que = tipo === "H" ? "hecho" : tipo === "D" ? "descanso" : "sin marcar";
  mostrarDeshacer(`${habito(id)?.nombre ?? ""}: ${que}`, () => {
    A.ponerProgreso(id, dia, progresoAntes);
    if (antes) A.marcar(id, dia, antes); else A.quitar(id, dia);
  });
}

let temporizadorAviso = null;
function mostrarDeshacer(texto, accion) {
  sesion.deshacer = accion;
  aviso.querySelector("span").textContent = texto;
  aviso.querySelector("button").hidden = !accion;   // sin acción es solo un aviso
  aviso.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { aviso.hidden = true; sesion.deshacer = null; }, 4500);
}
aviso.querySelector("button").addEventListener("click", () => {
  sesion.deshacer?.();
  sesion.deshacer = null;
  aviso.hidden = true;
});

/** Suma (o resta) uno a un hábito con cantidad; al llegar al objetivo queda hecho. */
function sumar(id, dia, delta) {
  const h = habito(id);
  const n = Math.max(0, A.progreso(id, dia) + delta);
  const t = A.tipo(id, dia);
  if (n >= h.cantidad && t !== "H") { poner(id, dia, "H", { progreso: n }); return; }
  if (n < h.cantidad && t === "H") { poner(id, dia, null, { progreso: n }); return; }
  if (delta > 0) vibrar(6);
  sesion.ultimoCambio = { id, dia };
  A.ponerProgreso(id, dia, n);
}

/* ------------------------------------------------------------------ temporizador */
function pausarCrono() {
  const c = A.leer().crono;
  if (!c) return;
  const seg = Math.floor(segundos(c.id, c.dia));
  A.leer().crono = null;
  A.ponerProgreso(c.id, c.dia, seg);
}
function alternarCrono(id) {
  const c = A.leer().crono;
  if (c && c.id === id) { pausarCrono(); return; }
  if (c) pausarCrono();
  A.ponerCrono({ id, dia: sesion.hoy, inicio: Date.now(), base: A.progreso(id, sesion.hoy) });
}
function terminarCrono() {
  const c = A.leer().crono;
  if (!c) return;
  const h = habito(c.id);
  A.leer().crono = null;
  poner(c.id, c.dia, "H", { progreso: h ? h.cantidad * 60 : Math.floor(segundos(c.id, c.dia)) });
  vibrar([30, 80, 30]);
}

function pintarCrono() {
  const c = A.leer().crono;
  const h = c && habito(c.id);
  if (!h) { barraCrono.hidden = true; return; }
  const resta = Math.max(0, h.cantidad * 60 - segundos(c.id, c.dia));
  barraCrono.hidden = false;
  barraCrono.querySelector(".crono__nombre").textContent = h.nombre;
  barraCrono.querySelector(".crono__tiempo").textContent = mmss(resta);
}

setInterval(() => {
  const c = A.leer().crono;
  if (!c) return;
  const h = habito(c.id);
  if (!h) { A.ponerCrono(null); return; }
  const seg = segundos(c.id, c.dia);
  if (seg >= h.cantidad * 60) { terminarCrono(); return; }
  const resta = mmss(Math.max(0, h.cantidad * 60 - seg));
  barraCrono.querySelector(".crono__tiempo").textContent = resta;
  document.querySelectorAll("[data-crono-sub]").forEach((el) => (el.textContent = resta));
}, 500);

barraCrono.addEventListener("click", (e) => {
  const boton = e.target.closest("button");
  if (!boton) return;
  if (boton.dataset.c === "pausa") pausarCrono();
  if (boton.dataset.c === "fin") terminarCrono();
});

/** Solo para pruebas: adelanta el temporizador en marcha. */
window.shabitAdelantarCrono = (s) => { const c = A.leer().crono; if (c) c.inicio -= s * 1000; };

/* ------------------------------------------------------------------ hojas */
let hoja = null;
function abrirHoja(html, alElegir, clase = "hoja") {
  cerrarHoja();
  hoja = document.createElement("dialog");
  hoja.className = clase;
  hoja.innerHTML = html;
  hoja.addEventListener("click", (e) => {
    if (e.target === hoja) { cerrarHoja(); return; }
    const boton = e.target.closest("[value]");
    if (!boton) return;
    if (boton.getAttribute("value") === "ir") { e.preventDefault(); const destino = boton.getAttribute("href"); cerrarHoja(); location.hash = destino; return; }
    alElegir(boton.getAttribute("value"), hoja);
  });
  hoja.addEventListener("cancel", () => cerrarHoja());
  document.body.append(hoja);
  hoja.showModal();
}
function cerrarHoja() {
  if (hoja) { hoja.close(); hoja.remove(); hoja = null; }
}

function hojaDeHabito(id, dia) {
  const c = contexto();
  const f = c.fichas.find((x) => x.habito.id === id);
  if (!f) return;
  abrirHoja(hojaHabito(f, dia, { ...c, notaDia: A.nota(id, dia) }), (valor, d) => {
    const h = f.habito;
    if (valor === "mas" || valor === "menos") { sumar(id, dia, valor === "mas" ? 1 : -1); hojaDeHabito(id, dia); return; }
    if (valor === "nota") { A.ponerNota(id, dia, d.querySelector("#nota-habito").value); cerrarHoja(); mostrarDeshacer("Nota guardada", null); return; }
    if (valor === "pausar") { elegirPausa(h); return; }
    if (valor === "reanudar") { cerrarHoja(); reanudar(h); return; }
    if (valor === "crono") { cerrarHoja(); alternarCrono(id); return; }
    cerrarHoja();
    const extra = valor === "H" && h.tipo !== "simple" ? { progreso: h.tipo === "tiempo" ? h.cantidad * 60 : h.cantidad }
      : valor === "" && h.tipo !== "simple" ? { progreso: 0 } : {};
    poner(id, dia, valor || null, extra);
  });
}

/* ------------------------------------------------------------------ pausas */
function elegirPausa(h) {
  abrirHoja(hojaPausa(h), (valor) => {
    cerrarHoja();
    if (valor === "cancelar") return;
    const n = Number(valor);
    const hoy = sesion.hoy;
    A.guardarHabito({ ...h, pausas: [...(h.pausas || []), [hoy, n ? hoy + n - 1 : null]] });
    mostrarDeshacer(`${h.nombre}: en pausa${n ? ` ${n} días` : ""}`, () => A.guardarHabito({ ...h }));
  });
}
function reanudar(h) {
  const hoy = sesion.hoy;
  const pausas = (h.pausas || []).map(([a, b]) => (a <= hoy && (b == null || b >= hoy) ? [a, hoy - 1] : [a, b])).filter(([a, b]) => b == null || b >= a);
  A.guardarHabito({ ...h, pausas });
  mostrarDeshacer(`${h.nombre}: reanudado`, () => A.guardarHabito({ ...h }));
}

/* ------------------------------------------------------------------ compañero, atajos y compartir */
const conCodigo = async () => {
  const codigo = await Nube.codigo();
  if (!codigo) throw new Error("Necesita guardar en SBD y conexión.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${codigo}` };
};
async function cargarCompartir() {
  if (!Nube.activa() || !A.leer().nube?.codigo) return;
  try {
    const r = await fetch("/api/compartir", { headers: await conCodigo() });
    const j = await r.json();
    sesion.compartir = j.token ? { url: `${location.origin}/app/#/ver/${j.token}` } : null;
    if (ruta().nombre === "ajustes") pintar();
  } catch { /* sin conexión: se verá al volver */ }
}
async function cargarVer(token) {
  sesion.ver = null;
  try {
    const r = await fetch(`/api/ver/${encodeURIComponent(token || "")}`);
    sesion.ver = r.ok ? await r.json() : { error: "Este enlace ya no existe: puede que lo hayan dejado de compartir." };
  } catch { sesion.ver = { error: "No hay conexión. Inténtalo de nuevo." }; }
  if (ruta().nombre === "ver") pintar();
}
async function copiar(texto, aviso) {
  try { await navigator.clipboard.writeText(texto); mostrarDeshacer(aviso, null); }
  catch { mostrarDeshacer("Mantén pulsado el texto para copiarlo", null); }
}

/* ------------------------------------------------------------------ acciones */
const b = () => sesion.borrador;
function leerCampos() {
  const br = sesion.borrador;
  if (!br) return;
  const v = (id) => document.getElementById(id);
  if (v("nombre")) br.nombre = v("nombre").value;
  if (v("cantidad")) br.cantidad = Math.max(1, Math.min(99, parseInt(v("cantidad").value, 10) || 1));
  if (v("unidad")) br.unidad = v("unidad").value.trim() || "veces";
  const avisos = [...document.querySelectorAll("[data-aviso]")];
  if (avisos.length) br.avisos = avisos.map((i) => i.value || "20:00");
}
const editar = (cambio) => { leerCampos(); cambio(b()); pintar(); };

const acciones = {
  atras(_, e) { if (history.length > 1) { e.preventDefault(); history.back(); } },
  "ocultar-instalar"() { A.cambiarAjustes({ instalarVisto: true }); },
  "ocultar-consejo"() { A.cambiarAjustes({ consejoVisto: true }); },
  dia(v) { sesion.dia = Number(v); pintar(); },
  check(v) {
    const id = Number(v);
    poner(id, sesion.dia, A.tipo(id, sesion.dia) === "H" ? null : "H");
  },
  sumar(v) { sumar(Number(v), sesion.dia, 1); },
  crono(v) { alternarCrono(Number(v)); },
  abrir(v) { hojaDeHabito(Number(v), sesion.dia); },
  "elegir-dia"(v) { hojaDeHabito(Number(ruta().arg), Number(v)); },
  animo(v) {
    const n = Number(v);
    A.ponerAnimo(sesion.dia, { nivel: A.animo(sesion.dia)?.nivel === n ? null : n });
  },
  nota() {
    abrirHoja(hojaNota(sesion.dia, A.animo(sesion.dia)), (valor, d) => {
      const texto = d.querySelector("textarea").value.trim();
      cerrarHoja();
      if (valor === "guardar") A.ponerAnimo(sesion.dia, { nota: texto || null });
    }, "hoja hoja--nota");
    setTimeout(() => hoja?.querySelector("textarea")?.focus(), 50);
  },
  "descanso-hoy"() {
    const c = contexto();
    const pendientes = c.fichas.filter((f) => tipoDe(f, c.hoy) === null && f.habito.tipo !== "evitar");
    pendientes.forEach((f) => A.marcar(f.habito.id, c.hoy, "D"));
    mostrarDeshacer(`${pendientes.length} ${pendientes.length === 1 ? "hábito" : "hábitos"} en descanso`, () => pendientes.forEach((f) => A.quitar(f.habito.id, c.hoy)));
  },
  "activar-pasos"() { pedirMovimiento(); },
  "mes-anterior"() { const m = sesion.mes; sesion.mes = m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 }; pintar(); },
  "mes-siguiente"() { const m = sesion.mes; sesion.mes = m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 }; pintar(); },
  color: (v) => editar((x) => (x.color = Number(v))),
  icono: (v) => editar((x) => { x.icono = v; x.iconoElegido = true; }),
  momento: (v) => editar((x) => (x.momento = v)),
  objetivo: (v) => editar((x) => (x.objetivo = Number(v))),
  meta: (v) => editar((x) => (x.meta = Number(v))),
  minutos: (v) => editar((x) => (x.cantidad = Number(v))),
  tipo: (v) => editar((x) => {
    x.tipo = v;
    if (v === "tiempo") x.cantidad = [5, 10, 15, 20, 30, 45, 60].includes(x.cantidad) ? x.cantidad : 10;
    if (v === "evitar") { x.dias = null; x.porMes = null; x.objetivo = 7; }
    if (v === "cantidad") { x.cantidad = x.cantidad && x.cantidad <= 99 ? x.cantidad : 8; x.unidad ??= "vasos"; }
  }),
  "modo-dias": (v) => editar((x) => {
    x.dias = v === "concretos" ? x.dias ?? [1, 3, 5] : null;
    x.porMes = v === "mes" ? x.porMes || 4 : null;
  }),
  "por-mes": (v) => editar((x) => (x.porMes = Number(v))),
  etiqueta: (v) => editar((x) => (x.etiqueta = v || null)),
  reto: (v) => editar((x) => { x.reto = v ? Number(v) : null; x.inicioReto = v ? sesion.hoy : null; }),
  "anadir-aviso": () => editar((x) => { x.avisos = [...(x.avisos || []), (x.avisos || []).length ? "21:00" : "20:00"].slice(0, 3); }),
  "quitar-aviso": (v) => editar((x) => { x.avisos = (x.avisos || []).filter((_, i) => i !== Number(v)); }),
  filtro(v) { sesion.filtro = v || null; pintar(); },
  texto(v) { A.cambiarAjustes({ texto: v }); },
  "mostrar-qr"() { sesion.qr = !sesion.qr; pintar(); },
  async "crear-enlace"() {
    try {
      const r = await fetch("/api/compartir", { method: "POST", headers: await conCodigo() });
      const j = await r.json();
      sesion.compartir = { url: `${location.origin}/app/#/ver/${j.token}` };
      pintar();
    } catch (e) { mostrarDeshacer(e.message || "No se ha podido crear el enlace", null); }
  },
  "copiar-enlace"() { copiar(sesion.compartir?.url ?? "", "Enlace copiado"); },
  async "quitar-enlace"() {
    try { await fetch("/api/compartir", { method: "DELETE", headers: await conCodigo() }); sesion.compartir = null; pintar(); mostrarDeshacer("Ya no se comparte", null); }
    catch { mostrarDeshacer("No hay conexión", null); }
  },
  async "crear-atajo"(v) {
    const id = Number(v);
    try {
      await Nube.sincronizar();
      const r = await fetch("/api/atajo", { method: "POST", headers: await conCodigo(), body: JSON.stringify({ habito: id }) });
      const j = await r.json();
      sesion.atajo = r.ok ? { id, url: `${location.origin}/api/atajo/${j.token}` } : { id, error: j.error || "No se ha podido crear" };
    } catch (e) { sesion.atajo = { id, error: e.message || "No hay conexión" }; }
    pintar();
  },
  "copiar-atajo"() { copiar(sesion.atajo?.url ?? "", "Enlace copiado: pégalo en Atajos"); },
  async "compartir-habito"(v) {
    const f = contexto().fichas.find((x) => x.habito.id === Number(v));
    if (!f) return;
    const u = f.enMeses ? "meses" : f.evitar ? "días sin" : f.rachaEnDias ? "días seguidos" : "semanas seguidas";
    const semana = Array.from({ length: 7 }, (_, i) => tipoDe(f, sesion.hoy - 6 + i) === "H");
    const blob = await imagenProgreso({ titulo: f.habito.nombre, cifra: String(f.racha), unidad: u, detalle: `${f.total} días hechos en total`, color: colorDisco(f.habito.color), semana });
    const r = await compartirImagen(blob, `shabit-${f.habito.nombre}.png`);
    if (r === "descargada") mostrarDeshacer("Imagen guardada en Descargas", null);
  },
  async "compartir-progreso"() {
    const c = contexto();
    const blob = await imagenProgreso({ titulo: "Mi rutina", cifra: String(c.rachaCompletos), unidad: c.rachaCompletos === 1 ? "día completo" : "días completos seguidos",
      detalle: `${c.fichas.reduce((n, f) => n + f.total, 0)} días hechos · ${c.fichas.length} hábitos`, color: "#3FB06A",
      semana: Array.from({ length: 7 }, (_, i) => c.completo(sesion.hoy - 6 + i)) });
    const r = await compartirImagen(blob, "shabit-progreso.png");
    if (r === "descargada") mostrarDeshacer("Imagen guardada en Descargas", null);
  },
  imprimir() { window.print(); },
  "exportar-csv"() {
    const blob = new Blob([csv(A.leer())], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `shabit-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  async "vincular-qr"(v) {
    try { await Nube.vincular(v); sesion.errorCodigo = null; location.hash = "#/hoy"; mostrarDeshacer("Listo: ya tienes aquí tus hábitos", null); Avisos.asegurar(); }
    catch (e) { sesion.errorCodigo = e.message; pintar(); }
  },
  "dia-semana": (v) => editar((x) => {
    const d = Number(v);
    x.dias = x.dias.includes(d) ? x.dias.filter((y) => y !== d) : [...x.dias, d];
  }),
  pasos(v) {
    editar((x) => (x.pasos = v ? Number(v) : null));
    if (b().pasos && esIOS) pedirMovimiento();
    document.querySelector("details.mas")?.setAttribute("open", "");
  },
  guardar() {
    leerCampos();
    const h = b();
    if (!h.nombre.trim()) {
      document.getElementById("error-nombre").hidden = false;
      document.getElementById("nombre").focus();
      return;
    }
    if (Array.isArray(h.dias) && !h.dias.length) return;
    h.nombre = h.nombre.trim();
    delete h.iconoElegido;
    if (Array.isArray(h.dias)) { if (h.dias.length === 7) { h.dias = null; h.objetivo = 7; } else h.objetivo = h.dias.length; }
    if (h.tipo === "simple" || h.tipo === "evitar") { h.cantidad = null; h.unidad = null; }
    if (h.porMes) { h.dias = null; }
    h.avisos = [...new Set(h.avisos || [])].sort();
    const esNuevo = !h.id;
    // El toque en «Guardar» sirve para pedir el permiso de notificaciones si hace falta.
    if (h.avisos.length && sesion.avisos === "pendiente") Avisos.activar().then((e) => { sesion.avisos = e; pintar(); }).catch(() => {});
    const id = A.guardarHabito({ ...h });
    sesion.borrador = null;
    aplicarPasos();
    prepararMovimiento();
    location.hash = esNuevo ? "#/hoy" : `#/ficha/${id}`;
  },
  archivar() {
    A.guardarHabito({ ...b(), archivado: true });
    sesion.borrador = null;
    location.hash = "#/hoy";
  },
  async borrar() {
    if (await confirmar(`¿Borrar «${b().nombre}»?`, "Se borrarán el hábito y todo su historial. No se puede deshacer.", "Borrar")) {
      A.borrarHabito(b().id);
      sesion.borrador = null;
      location.hash = "#/hoy";
    }
  },
  rutina(v) {
    const r = RUTINAS.find((x) => x.id === v);
    const nombres = new Set(activos().map((h) => h.nombre.toLowerCase()));
    const nuevos = r.habitos.filter((p) => !nombres.has(p.nombre.toLowerCase())).map((p) => desdePlantilla(p, sesion.hoy));
    const ids = A.guardarVarios(nuevos);
    prepararMovimiento();
    location.hash = "#/hoy";
    setTimeout(() => mostrarDeshacer(`Rutina «${r.nombre}» añadida`, () => ids.forEach((id) => A.borrarHabito(id))), 60);
  },
  subir(v) { moverEnLista(Number(v), -1); },
  bajar(v) { moverEnLista(Number(v), 1); },
  tema(v) { A.cambiarAjustes({ tema: v }); },
  primer(v) { A.cambiarAjustes({ primer: Number(v) }); },
  recuperar(v) {
    const h = A.leer().habitos.find((x) => x.id === Number(v));
    if (h) A.guardarHabito({ ...h, archivado: false });
  },
  async "activar-avisos"() {
    try { sesion.avisos = await Avisos.activar(); } catch { sesion.avisos = "pendiente"; mostrarDeshacer("No se han podido activar. Comprueba la conexión.", null); }
    pintar();
  },
  async "desactivar-avisos"() { sesion.avisos = await Avisos.desactivar(); pintar(); },
  "sincronizar-ahora"() { Nube.sincronizar().then(pintar); },
  "mostrar-codigo"() { sesion.verCodigo = !sesion.verCodigo; pintar(); },
  async "copiar-codigo"() {
    try { await navigator.clipboard.writeText(A.leer().nube?.codigo ?? ""); mostrarDeshacer("Código copiado", null); }
    catch { sesion.verCodigo = true; pintar(); }
  },
  async vincular() {
    const campo = document.getElementById("codigo-otro");
    const codigo = campo?.value.trim();
    if (!codigo) { campo?.focus(); return; }
    if (A.leer().habitos.length && !(await confirmar("¿Usar los hábitos del otro móvil?", "Los hábitos que hay ahora en este dispositivo se sustituirán por los de esa cuenta.", "Usarlos"))) return;
    try { await Nube.vincular(codigo); sesion.errorCodigo = null; mostrarDeshacer("Listo: ya tienes aquí tus hábitos", null); Avisos.asegurar(); }
    catch (e) { sesion.errorCodigo = e.message; }
    pintar();
  },
  async "borrar-nube"() {
    if (!(await confirmar("¿Borrar tus datos del servidor?", "Se borrarán de SBD tus hábitos, días y notas, y dejarán de guardarse allí (y de llegar los recordatorios). En este dispositivo se quedan.", "Borrar del servidor"))) return;
    try { await Avisos.desactivar().catch(() => {}); await Nube.borrarDelServidor(); sesion.avisos = await Avisos.estado(); mostrarDeshacer("Borrado del servidor", null); }
    catch (e) { mostrarDeshacer(e.message, null); }
    pintar();
  },
  async "reactivar-nube"() { await Nube.reactivar(); sesion.avisos = await Avisos.estado(); pintar(); },
  exportar() {
    const blob = new Blob([A.exportar()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shabit-copia-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    estadoCopia("Copia preparada. Guárdala en Archivos o iCloud Drive.");
  },
};

app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-accion]");
  if (!el || el.tagName === "INPUT") return;
  acciones[el.dataset.accion]?.(el.dataset.valor, e);
});
app.addEventListener("input", (e) => {
  if (e.target.id !== "nombre" || !sesion.borrador) return;
  sesion.borrador.nombre = e.target.value;
  document.getElementById("error-nombre").hidden = true;
  const vista = document.querySelector(".vista-previa span:last-child");
  if (vista) vista.textContent = e.target.value || "Tu hábito";
  // Mientras no elija uno a mano, el icono se adivina por el nombre («Leer» → libro).
  const br = sesion.borrador;
  if (!br.id && !br.iconoElegido) {
    const ico = iconoPorNombre(e.target.value);
    if (ico !== br.icono && (ico !== "brote" || e.target.value.length < 3)) {
      br.icono = ico;
      document.querySelectorAll(".vista-previa .insignia, .muestra-aspecto .insignia").forEach((el) => (el.innerHTML = icono(ico)));
      document.querySelectorAll('[data-accion="icono"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.valor === ico)));
    }
  }
});
app.addEventListener("keydown", (e) => { if (e.target.id === "nombre" && e.key === "Enter") e.target.blur(); });
app.addEventListener("change", async (e) => {
  const accion = e.target.dataset.accion;
  if (accion === "resumen") { A.cambiarAjustes({ resumen: e.target.checked ? "08:30" : null }); return; }
  if (accion === "informe") { A.cambiarAjustes({ informe: e.target.checked }); return; }
  if (e.target.id === "hora-resumen") { A.cambiarAjustes({ resumen: e.target.value || "08:30" }); return; }
  if (accion !== "importar") return;
  const archivo = e.target.files?.[0];
  if (!archivo) return;
  if (!(await confirmar("¿Recuperar esta copia?", "Sustituirá todos los hábitos que hay ahora en este dispositivo.", "Recuperar"))) return;
  try {
    A.importar(await archivo.text());
    estadoCopia("Copia recuperada.");
  } catch (err) {
    estadoCopia(err instanceof SyntaxError ? "El archivo está dañado o no es una copia de shabit." : err.message);
  }
});

function estadoCopia(texto) {
  const p = document.getElementById("estado-copia");
  if (p) p.textContent = texto;
}

function confirmar(titulo, texto, si) {
  return new Promise((resolver) => {
    const d = document.createElement("dialog");
    d.className = "dialogo";
    d.innerHTML = `<h2>${esc(titulo)}</h2><p>${esc(texto)}</p><div class="fila-botones"><button class="boton boton--suave" value="no">Cancelar</button><button class="boton boton--peligro-lleno" value="si">${esc(si)}</button></div>`;
    d.addEventListener("click", (e) => {
      const v = e.target.closest("button")?.value;
      if (v) { d.close(); d.remove(); resolver(v === "si"); }
    });
    d.addEventListener("cancel", () => { d.remove(); resolver(false); });
    document.body.append(d);
    d.showModal();
  });
}

/* ------------------------------------------------------------------ ordenar */
/** Guarda el orden y el momento del día tal como están en la lista de la pantalla. */
function guardarOrdenDeLaLista() {
  const lista = [];
  let momento = "cualquiera";
  for (const li of document.querySelectorAll("#ordenar > li")) {
    if (li.classList.contains("ordenar__grupo")) momento = li.dataset.momento;
    else if (li.dataset.id) lista.push({ id: Number(li.dataset.id), momento });
  }
  A.reordenar(lista);
}

/** Flechas: sube o baja un hábito; al pasar la cabecera de un grupo cambia de momento. */
function moverEnLista(id, dir) {
  const li = document.querySelector(`#ordenar li[data-id="${id}"]`);
  if (!li) return;
  const otro = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
  if (!otro) return;
  if (dir < 0) otro.before(li); else otro.after(li);
  if (li === li.parentElement.firstElementChild) li.parentElement.firstElementChild.nextElementSibling.after(li);
  guardarOrdenDeLaLista();
  document.querySelector(`#ordenar li[data-id="${id}"] [data-accion="${dir < 0 ? "subir" : "bajar"}"]`)?.focus();
}

function prepararArrastre() {
  const lista = document.getElementById("ordenar");
  if (!lista) return;
  lista.addEventListener("pointerdown", (e) => {
    const asa = e.target.closest(".ordenar__asa");
    if (!asa) return;
    e.preventDefault();
    const li = asa.closest("li");
    const caja = li.getBoundingClientRect();
    const estilo = li.getAttribute("style") || "";
    const hueco = document.createElement("li");
    hueco.className = "ordenar__hueco";
    hueco.style.height = `${caja.height}px`;
    const inicioY = e.clientY;
    li.after(hueco);
    li.classList.add("ordenar__item--arrastrando");
    li.setAttribute("style", `${estilo};width:${caja.width}px;top:${caja.top}px;left:${caja.left}px`);
    document.body.append(li);
    const mover = (ev) => {
      li.style.transform = `translateY(${ev.clientY - inicioY}px)`;
      let antesDe = null;
      for (const x of lista.children) {
        if (x === hueco) continue;
        const r = x.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { antesDe = x; break; }
      }
      if (antesDe === lista.firstElementChild) antesDe = antesDe.nextElementSibling;
      if (antesDe) lista.insertBefore(hueco, antesDe); else lista.append(hueco);
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      li.classList.remove("ordenar__item--arrastrando");
      li.setAttribute("style", estilo);
      hueco.replaceWith(li);
      guardarOrdenDeLaLista();
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  });
}

/* ------------------------------------------------------------------ pasos */
const detector = new DetectorPasos();
const hayHabitosDePasos = () => activos().some((h) => h.pasos);

function alMoverse(e) {
  const g = e.accelerationIncludingGravity;
  if (!g || g.x == null) return;
  if (detector.muestra(g.x, g.y, g.z, e.timeStamp)) sesion.pendientesPasos++;
}

function escucharMovimiento() {
  if (sesion.movimiento === "activo") return;
  window.addEventListener("devicemotion", alMoverse);
  sesion.movimiento = "activo";
  A.cambiarAjustes({ movimiento: true });
}

async function pedirMovimiento() {
  if (typeof DeviceMotionEvent === "undefined") { sesion.movimiento = "no-disponible"; pintar(); return; }
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== "granted") { sesion.movimiento = "denegado"; pintar(); return; }
    } catch { sesion.movimiento = "pendiente"; pintar(); return; }
  }
  escucharMovimiento();
  pintar();
}

function prepararMovimiento() {
  if (!hayHabitosDePasos() || sesion.movimiento === "activo") return;
  if (typeof DeviceMotionEvent === "undefined") { sesion.movimiento = "no-disponible"; return; }
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    sesion.movimiento = "pendiente";
    if (A.leer().ajustes.movimiento) {
      document.addEventListener("pointerup", () => { if (sesion.movimiento === "pendiente") pedirMovimiento(); }, { once: true });
    }
  } else {
    escucharMovimiento();
  }
}

/** Marca como hechos los hábitos de pasos que llegan a su objetivo, una vez al día. */
function aplicarPasos() {
  const d = A.leer();
  const pasos = pasosDeHoy(d.pasos, sesion.hoy);
  const ya = d.auto && d.auto.dia === sesion.hoy ? d.auto.ids : [];
  const nuevos = activos(d).filter((h) => h.pasos && pasos >= h.pasos && !ya.includes(h.id));
  if (!nuevos.length) return;
  for (const h of nuevos) if (A.tipo(h.id, sesion.hoy) === null) A.marcar(h.id, sesion.hoy, "H");
  A.guardarAuto({ dia: sesion.hoy, ids: [...ya, ...nuevos.map((h) => h.id)] });
}

setInterval(() => {
  if (!sesion.pendientesPasos) return;
  const n = sesion.pendientesPasos;
  sesion.pendientesPasos = 0;
  const d = A.leer();
  d.pasos = sumarPasos(d.pasos, n, sesion.hoy);
  try { localStorage.setItem("shabit", JSON.stringify(d)); } catch { /* sin espacio */ }
  const pasos = pasosDeHoy(d.pasos, sesion.hoy);
  document.querySelectorAll("[data-pasos], [data-pasos-sub]").forEach((el) => (el.textContent = miles(pasos)));
  const metas = activos(d).filter((h) => h.pasos).map((h) => h.pasos);
  document.querySelectorAll("[data-pasos-barra]").forEach((el) => (el.style.width = `${Math.min(100, (pasos / Math.max(...metas)) * 100)}%`));
  aplicarPasos();
}, 1500);

/** Solo para pruebas: suma pasos como si los hubiera detectado el acelerómetro. */
window.shabitSumarPasos = (n) => { sesion.pendientesPasos += n; };

/* ------------------------------------------------------------------ día y arranque */
function revisarDia() {
  const d = diaDe();
  if (d === sesion.hoy) return;
  if (sesion.dia === sesion.hoy) sesion.dia = d;
  sesion.hoy = d;
  sesion.completoHoy = null;
  pintar();
}
setInterval(revisarDia, 30_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) revisarDia(); });

if (new URLSearchParams(location.search).has("demo") && A.leer().habitos.length === 0) cargarDemo(A, sesion.hoy);
if (!localStorage.getItem("shabit")) A.cambiarAjustes({ tema: "claro" });
{
  const c = contexto();
  sesion.completoHoy = c.completoHoy;
  if (!c.datos.ajustes.logrosVistos) A.cambiarAjustes({ logrosVistos: c.logros.filter((l) => l.ok).map((l) => l.id) });
}
A.pedirPersistencia();
prepararMovimiento();
pintar();
{
  const r = ruta();
  if (r.nombre === "ver") cargarVer(r.arg);
  if (r.nombre === "ajustes") cargarCompartir();
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
Avisos.estado().then((e) => {
  sesion.avisos = e;
  if (e === "activos") Avisos.asegurar();
  pintar();
});

// Guardar en SBD (o traer lo que haya guardado otro móvil) al abrir, al volver a la app y al recuperar la conexión.
Nube.sincronizar();
window.addEventListener("online", () => Nube.sincronizar());
document.addEventListener("visibilitychange", () => { if (!document.hidden) Nube.sincronizar(); });
/** Solo para pruebas. */
window.shabitNube = Nube;
