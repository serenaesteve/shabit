// Pantallas de shabit. La rutina se ordena por momentos del día; cada hábito se marca con
// su botón redondo y al tocar la tarjeta se abren todas sus opciones. Sin gestos escondidos.
import { fechaDe, fechaLarga, inicial, inicialDeIndice, inicioSemana, miles, nombreDia, nombreMes, diaDe, diaSemana } from "./fecha.js";
import { tipoDe, tocaDia, conDiasConcretos, enPausa, reto as retoDe } from "./progreso.js";
import { bloqueEstadisticas, mapaAño, mejorDiaGlobal, qr } from "./extras.js";
import { COLORES, anillo, colorDisco, varsColor } from "./dibujo.js";
import { ICONOS_HABITO, icono } from "./iconos.js";
import { RUTINAS } from "./rutinas.js";

export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mayus = (t) => t.replace(/^./, (x) => x.toUpperCase());

const dias = (n) => (n === 1 ? "1 día" : `${n} días`);
const semanas = (n) => (n === 1 ? "1 semana" : `${n} semanas`);
const racha = (n, enDias) => (enDias ? dias(n) : semanas(n));
const rachaTxt = (f, n) => (f.enMeses ? (n === 1 ? "1 mes" : `${n} meses`) : f.evitar ? `${dias(n)} sin` : racha(n, f.rachaEnDias));
const estadoTexto = (t) => (t === "H" ? "hecho" : t === "D" ? "descanso" : "sin marcar");
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ABREV_DIA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function frecuencia(h, primer = 1) {
  if (h.tipo === "evitar") return "cada día sin hacerlo";
  if (h.porMes) return h.porMes === 1 ? "1 vez al mes" : `${h.porMes} veces al mes`;
  if (conDiasConcretos(h)) {
    const orden = [...h.dias].sort((a, b) => ((a - primer + 7) % 7) - ((b - primer + 7) % 7));
    return orden.length === 1 ? `los ${NOMBRES_DIA[orden[0]]}` : orden.map((d) => ABREV_DIA[d]).join(", ");
  }
  const n = h.objetivo;
  return n >= 7 ? "todos los días" : n === 1 ? "1 día a la semana" : `${n} días a la semana`;
}
const medida = (h) => (h.tipo === "tiempo" ? `${h.cantidad} min` : h.tipo === "cantidad" ? `${h.cantidad} ${h.unidad || "veces"}` : "");
export const ETIQUETAS = [["salud", "Salud"], ["mente", "Mente"], ["ejercicio", "Ejercicio"], ["casa", "Casa"], ["trabajo", "Trabajo"], ["aprender", "Aprender"], ["social", "Social"]];
const nombreEtiqueta = (k) => ETIQUETAS.find((e) => e[0] === k)?.[1] ?? "";
const unidadRacha = (f) => (f.enMeses ? (f.racha === 1 ? "mes" : "meses") : f.rachaEnDias ? (f.racha === 1 ? "día" : "días") : f.racha === 1 ? "semana" : "semanas");

/** Fila de filtros por etiqueta (solo si algún hábito tiene etiqueta). */
function filtros(fichas, actual) {
  const usadas = ETIQUETAS.filter(([k]) => fichas.some((f) => f.habito.etiqueta === k));
  if (!usadas.length) return "";
  return `<div class="filtros" role="group" aria-label="Filtrar por etiqueta">
    <button class="chip" data-accion="filtro" data-valor="" aria-pressed="${!actual}">Todos</button>
    ${usadas.map(([k, n]) => `<button class="chip" data-accion="filtro" data-valor="${k}" aria-pressed="${actual === k}">${n}</button>`).join("")}
  </div>`;
}
export const filtrar = (fichas, filtro) => (filtro ? fichas.filter((f) => f.habito.etiqueta === filtro) : fichas);

export const MOMENTOS = [
  ["manana", "Mañana", "amanecer"], ["tarde", "Tarde", "sol"], ["noche", "Noche", "luna"], ["cualquiera", "Cuando sea", "ui-reloj"],
];
export const SUGERENCIAS = [
  { nombre: "Beber agua", icono: "agua", momento: "cualquiera", color: 7, tipo: "cantidad", cantidad: 8, unidad: "vasos" },
  { nombre: "Caminar", icono: "pasos", momento: "tarde", color: 3, pasos: 8000 },
  { nombre: "Leer", icono: "libro", momento: "noche", color: 1, tipo: "tiempo", cantidad: 20 },
  { nombre: "Estirar", icono: "estirar", momento: "manana", color: 4 },
  { nombre: "Meditar", icono: "mente", momento: "manana", color: 6, tipo: "tiempo", cantidad: 5 },
  { nombre: "Dormir sin móvil", icono: "sin-movil", momento: "noche", color: 8 },
];
export const METAS = [21, 30, 66, 100, 365];
export const OBJETIVOS_PASOS = [4000, 6000, 8000, 10000, 12000];
export const MINUTOS = [5, 10, 15, 20, 30, 45, 60];

export const ANIMOS = [
  [1, "Fatal", "#EF6351"], [2, "Regular", "#F28C38"], [3, "Normal", "#F2B830"], [4, "Bien", "#7CC36E"], [5, "Genial", "#3FB06A"],
];
export function cara(nivel, tamano = "") {
  const [, , color] = ANIMOS[nivel - 1];
  const boca = { 1: "M8.5 17 Q12 13.2 15.5 17", 2: "M8.5 16.4 Q12 14.6 15.5 16.4", 3: "M8.5 15.6 H15.5", 4: "M8.5 14.8 Q12 17.6 15.5 14.8", 5: "M8 14.2 Q12 19.2 16 14.2" }[nivel];
  return `<svg class="cara ${tamano}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${color}"/>
    <circle cx="8.6" cy="9.6" r="1.35" fill="#1c1d21"/><circle cx="15.4" cy="9.6" r="1.35" fill="#1c1d21"/>
    <path d="${boca}" fill="none" stroke="#1c1d21" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

const insignia = (h, clase = "") => `<span class="insignia ${clase}" style="${varsColor(h.color)}">${icono(h.icono)}</span>`;

const horaActual = () => { const f = new Date(); return `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`; };

export function tituloDia(dia, hoy) {
  if (dia === hoy) return "Hoy";
  if (dia === hoy - 1) return "Ayer";
  return `${mayus(nombreDia(dia))} ${fechaDe(dia).getDate()}`;
}

/* ------------------------------------------------------------------ Hoy */
export function vistaHoy(c) {
  const { hoy, dia, datos } = c;
  const fichas = filtrar(c.fichas, c.filtro);
  const pausados = fichas.filter((f) => enPausa(f.habito, dia) && !tipoDe(f, dia));
  const tocan = fichas.filter((f) => !pausados.includes(f) && (tocaDia(f.habito, dia) || tipoDe(f, dia)));
  const noTocan = fichas.filter((f) => !tocan.includes(f) && !pausados.includes(f));
  const hechos = tocan.filter((f) => tipoDe(f, dia) === "H").length;
  const descansos = tocan.filter((f) => tipoDe(f, dia) === "D").length;
  const cuentan = tocan.length - descansos;
  const f = fechaDe(dia);

  let h = `<header class="cabecera">
    <div>
      <p class="fecha">${mayus(nombreDia(dia))}, ${f.getDate()} de ${nombreMes(f.getMonth())}</p>
      <h1>${tituloDia(dia, hoy)}</h1>
    </div>
    <div class="cabecera__lado">
      ${tocan.length ? `<div class="progreso-dia" role="img" aria-label="${hechos} de ${cuentan} hábitos hechos">${anillo(cuentan ? hechos / cuentan : 1)}<span><b>${hechos}/${cuentan}</b><small>hechos</small></span></div>` : ""}
      ${fichas.length ? `<a class="boton-nuevo" href="#/plan/nuevo" aria-label="Nuevo hábito">${icono("ui-mas")}</a>` : ""}
    </div>
  </header>`;

  h += tiraSemana(c);
  h += filtros(c.fichas, c.filtro);

  if (c.avisoInstalar) {
    h += `<aside class="tarjeta aviso">
      <p><b>Instálala en tu iPhone.</b> Toca <span class="icono-compartir" aria-label="Compartir"></span> y después «Añadir a pantalla de inicio». Así se abre como una app, puede avisarte y tus datos quedan a salvo.</p>
      <button class="enlace" data-accion="ocultar-instalar">Entendido</button>
    </aside>`;
  }

  if (!c.fichas.length) return h + vacio();

  if (!datos.ajustes.consejoVisto && dia === hoy && c.fichas.reduce((n, x) => n + x.total, 0) < 5) {
    h += `<aside class="tarjeta consejo">
      <p><b>Así se usa:</b> cuando hagas un hábito, toca su <b>círculo</b> de la derecha. Toca el <b>nombre</b> para más opciones: descanso, una nota o pausarlo.</p>
      <button class="enlace" data-accion="ocultar-consejo">Entendido</button>
    </aside>`;
  }

  if (c.completoHoy && dia === hoy) {
    h += `<section class="tarjeta enhorabuena">${icono("ui-brillo")}<div><b>¡Día completo!</b><span>${c.rachaCompletos > 1 ? `Llevas ${c.rachaCompletos} días completos seguidos.` : "Has cumplido todo lo de hoy."}</span></div></section>`;
  }
  if (c.avisos === "pendiente" && fichas.some((x) => x.habito.avisos?.length)) {
    h += `<aside class="tarjeta aviso-campana">${icono("ui-campana")}<div><b>Activa los recordatorios</b><span>Tienes hábitos con hora de aviso.</span></div><button class="boton boton--principal boton--peque" data-accion="activar-avisos">Activar</button></aside>`;
  }
  // La cuenta de pasos ya sale en el propio hábito; la tarjeta solo hace falta para pedir permiso o explicar un problema.
  if (dia === hoy && fichas.some((x) => x.habito.pasos) && !["activo", "apagado"].includes(c.movimiento)) h += tarjetaPasos(c);

  if (!tocan.length) h += `<p class="tarjeta nota">Hoy no toca ningún hábito. ¡Disfruta del día!</p>`;
  for (const [clave, nombre, ico] of MOMENTOS) {
    const grupo = tocan.filter((x) => (x.habito.momento || "cualquiera") === clave);
    if (!grupo.length) continue;
    h += `<section class="momento" aria-labelledby="m-${clave}">
      <h2 id="m-${clave}">${icono(ico)}${nombre}</h2>
      <ul class="lista">${grupo.map((x) => tarjetaHabito(x, c)).join("")}</ul>
    </section>`;
  }
  if (noTocan.length) {
    h += `<details class="no-tocan"><summary>${noTocan.length === 1 ? "1 hábito no toca" : `${noTocan.length} hábitos no tocan`} ${dia === hoy ? "hoy" : "este día"}</summary>
      <ul class="lista">${noTocan.map((x) => tarjetaHabito(x, c)).join("")}</ul></details>`;
  }
  if (pausados.length) {
    h += `<details class="no-tocan"><summary>${icono("ui-pausa", "ico--mini")} En pausa (${pausados.length})</summary>
      <ul class="lista">${pausados.map((x) => tarjetaHabito(x, c)).join("")}</ul></details>`;
  }

  h += tarjetaAnimo(datos.animo?.[dia], dia === hoy);

  h += `<div class="pie-hoy">`;
  if (cuentan > hechos && dia === hoy) h += `<button class="boton boton--suave" data-accion="descanso-hoy">${icono("luna")}Día de descanso</button>`;
  h += `<a class="boton boton--suave" href="#/ordenar">${icono("ui-ordenar")}Ordenar</a></div>`;
  return h;
}

function tiraSemana({ hoy, dia, completo }) {
  let s = "";
  for (let atras = 6; atras >= 0; atras--) {
    const d = hoy - atras;
    const lleno = completo(d);
    s += `<li><button class="dia${d === dia ? " dia--activo" : ""}${d === hoy ? " dia--hoy" : ""}" data-accion="dia" data-valor="${d}"
      aria-pressed="${d === dia}" aria-label="${esc(fechaLarga(d))}${lleno ? ", día completo" : ""}">
      <span class="dia__letra">${inicial(d)}</span><span class="dia__num">${fechaDe(d).getDate()}</span>
      <i class="dia__punto${lleno ? " dia__punto--lleno" : ""}"></i></button></li>`;
  }
  return `<ol class="tira" aria-label="Elige el día">${s}</ol>`;
}

function tarjetaPasos(c) {
  const meta = Math.max(...c.fichas.filter((f) => f.habito.pasos).map((f) => f.habito.pasos));
  let cuerpo;
  if (c.movimiento === "no-disponible") cuerpo = `<p class="nota">Este navegador no permite contar pasos.</p>`;
  else if (c.movimiento === "denegado") cuerpo = `<p class="nota">Sin permiso de movimiento no se pueden contar. Puedes darlo en Ajustes del iPhone › Safari › Movimiento y orientación.</p>`;
  else if (c.movimiento === "pendiente") cuerpo = `<p class="nota">Cuento tus pasos con el movimiento del móvil mientras la app está abierta.</p><button class="boton boton--principal boton--peque" data-accion="activar-pasos">Empezar a contar</button>`;
  else cuerpo = `<p class="pasos__cifra"><b data-pasos>${miles(c.pasosHoy)}</b> de ${miles(meta)} pasos</p>
      <span class="barra-fina"><span data-pasos-barra style="width:${Math.min(100, (c.pasosHoy / meta) * 100).toFixed(1)}%"></span></span>`;
  return `<section class="tarjeta pasos">${icono("pasos", "pasos__ico")}<div>${cuerpo}</div></section>`;
}

/** Botón redondo de la tarjeta: marcar, sumar uno o el temporizador, según el tipo de hábito. */
function botonAccion(f, c, t) {
  const h = f.habito;
  const nuevo = c.ultimoCambio && c.ultimoCambio.id === h.id;
  const pendiente = t === null;
  if (h.tipo === "evitar") {
    const recaida = t === "R";
    return `<button class="check check--evitar${recaida ? " check--recaida" : ""}" data-accion="abrir" data-valor="${h.id}" aria-pressed="${!recaida}"
      aria-label="${esc(h.nombre)}: ${recaida ? "recaída" : "sin recaer"}. Cambiar">${icono(recaida ? "ui-cerrar" : "ui-check")}</button>`;
  }
  if (pendiente && h.tipo === "cantidad") {
    const n = c.progreso(h.id, c.dia);
    return `<button class="check check--anillo${nuevo ? " check--pop" : ""}" data-accion="sumar" data-valor="${h.id}"
      aria-label="Sumar uno a ${esc(h.nombre)}: ${n} de ${h.cantidad} ${esc(h.unidad || "veces")}">${anillo(n / h.cantidad)}<span class="check__num">${n || icono("ui-mas")}</span></button>`;
  }
  if (pendiente && h.tipo === "tiempo" && c.dia === c.hoy) {
    const enMarcha = c.crono && c.crono.id === h.id;
    const seg = c.segundos(h.id);
    return `<button class="check check--anillo${enMarcha ? " check--marcha" : ""}" data-accion="crono" data-valor="${h.id}"
      aria-label="${enMarcha ? "Pausar" : "Empezar"} el temporizador de ${esc(h.nombre)}">${anillo(seg / (h.cantidad * 60))}<span class="check__num">${icono(enMarcha ? "ui-pausa" : "ui-play")}</span></button>`;
  }
  return `<button class="check${nuevo && t === "H" ? " check--pop" : ""}" data-accion="check" data-valor="${h.id}" aria-pressed="${t === "H"}"
    aria-label="${t === "H" ? "Desmarcar" : "Marcar como hecho"}: ${esc(h.nombre)}">${t === "D" ? icono("luna") : icono("ui-check")}</button>`;
}

function tarjetaHabito(f, c) {
  const { dia } = c;
  const h = f.habito;
  const t = tipoDe(f, dia);
  let sub;
  const r = retoDe(f, c.hoy);
  if (enPausa(h, dia)) sub = `En pausa${h.pausas?.at(-1)?.[1] != null ? ` hasta el ${fechaDe(h.pausas.at(-1)[1] + 1).getDate()}` : ""}`;
  else if (h.tipo === "evitar") sub = t === "R" ? "Recaída · vuelves a empezar" : `${f.racha} ${f.racha === 1 ? "día" : "días"} sin`;
  else if (t === "D") sub = "Descanso · no rompe la racha";
  else if (h.tipo === "cantidad") sub = `${c.progreso(h.id, dia)} de ${h.cantidad} ${esc(h.unidad || "veces")}`;
  else if (h.tipo === "tiempo") {
    const seg = c.segundos(h.id, dia);
    sub = c.crono && c.crono.id === h.id && dia === c.hoy
      ? `<span data-crono-sub>${mmss(Math.max(0, h.cantidad * 60 - seg))}</span> para terminar`
      : t === "H" ? `${h.cantidad} min` : `${Math.floor(seg / 60)} de ${h.cantidad} min`;
  } else if (h.pasos && dia === c.hoy) sub = `<span data-pasos-sub>${miles(c.pasosHoy)}</span> de ${miles(h.pasos)} pasos`;
  else if (h.porMes) sub = `${f.periodo.n} de ${f.periodo.de} este mes`;
  else sub = conDiasConcretos(h) ? mayus(frecuencia(h, c.datos.ajustes.primer)) : `${f.estaSemana} de ${f.objetivoSemana ?? f.objetivo} esta semana`;
  if (r && !r.terminado) sub = `Reto: día ${r.dia} de ${r.dias} · ${sub}`;
  if (r && r.terminado) sub = `${r.superado ? "¡Reto superado!" : "Reto terminado"} · ${sub}`;
  if (c.datos.notas?.[h.id]?.[dia]) sub += ` · ${icono("ui-nota", "ico--mini")}`;
  const proximo = (h.avisos || []).find((a) => a >= horaActual()) ?? null;
  if (proximo && t === null && dia === c.hoy && h.tipo !== "evitar") sub += ` · ${icono("ui-campana", "ico--mini")}${proximo}`;
  const unidad = f.enMeses ? (f.racha === 1 ? "mes" : "meses") : f.rachaEnDias ? "días" : (f.racha === 1 ? "semana" : "semanas");
  const llama = f.racha > 1 && h.tipo !== "evitar"
    ? `<span class="racha" title="Racha: ${f.racha} ${unidad} seguidos">${icono("llama")}<b>${f.racha}</b><small>${unidad}</small></span>` : "";
  return `<li class="habito${t === "H" ? " habito--hecho" : t === "D" ? " habito--descanso" : ""}" style="${varsColor(h.color)}">
    <button class="habito__abrir" data-accion="abrir" data-valor="${h.id}" aria-label="${esc(h.nombre)}: ${estadoTexto(t)}. Más opciones">
      ${insignia(h)}
      <span class="habito__textos"><span class="habito__nombre">${esc(h.nombre)}</span><span class="habito__sub">${sub}</span></span>
      ${llama}
    </button>
    ${botonAccion(f, c, t)}
  </li>`;
}

function tarjetaAnimo(a, esHoy) {
  return `<section class="tarjeta animo" aria-labelledby="animo-t">
    <h2 class="tarjeta__titulo" id="animo-t">${esHoy ? "¿Cómo te sientes hoy?" : "¿Cómo te sentiste?"}</h2>
    <div class="caras" role="radiogroup" aria-labelledby="animo-t">${ANIMOS.map(([n, nombre]) =>
      `<button role="radio" aria-checked="${a?.nivel === n}" data-accion="animo" data-valor="${n}">${cara(n)}<span>${nombre}</span></button>`).join("")}</div>
    ${a?.nota ? `<p class="animo__nota">${esc(a.nota)}</p>` : ""}
    <button class="enlace" data-accion="nota">${icono("ui-nota")}${a?.nota ? "Editar la nota" : "Añadir una nota del día"}</button>
  </section>`;
}

function vacio() {
  return `<section class="vacio">
    <span class="vacio__ico">${icono("ui-brillo")}</span>
    <h2>Crea tu rutina</h2>
    <p class="nota">Añade los hábitos que quieres cumplir. Cada día que hagas uno, márcalo con su botón redondo y verás cómo crecen tus rachas.</p>
    <h3>Rutinas listas para empezar</h3>
    <div class="rutinas-mini">${RUTINAS.map((r) => `<a class="rutina-mini" href="#/rutinas" style="${varsColor(r.color)}"><span class="insignia">${icono(r.icono)}</span><span>${esc(r.nombre)}</span></a>`).join("")}</div>
    <h3>O elige un hábito</h3>
    <ul class="sugerencias">${SUGERENCIAS.map((s, i) =>
      `<li><a class="sugerencia" href="#/plan/nuevo?s=${i}" style="${varsColor(s.color)}"><span class="insignia">${icono(s.icono)}</span><span>${esc(s.nombre)}${s.cantidad ? `<small>${s.tipo === "tiempo" ? `${s.cantidad} min` : `${s.cantidad} ${s.unidad}`}</small>` : s.pasos ? `<small>${miles(s.pasos)} pasos</small>` : ""}</span>${icono("ui-mas", "sugerencia__mas")}</a></li>`).join("")}</ul>
    <a class="boton boton--principal ancho" href="#/plan/nuevo">Crear un hábito a mi manera</a>
  </section>`;
}

/** Hoja de opciones de un hábito para un día. */
export function hojaHabito(f, dia, c) {
  const h = f.habito;
  const t = tipoDe(f, dia);
  const tSel = h.tipo === "evitar" ? (t === "R" ? "R" : null) : t;
  const op = (valor, ico, texto, detalle) =>
    `<button class="opcion${tSel === (valor || null) ? " opcion--activa" : ""}" value="${valor}">${icono(ico)}<span><b>${texto}</b>${detalle ? `<small>${detalle}</small>` : ""}</span>${tSel === (valor || null) ? icono("ui-check", "opcion__check") : ""}</button>`;
  let extra = "";
  if (h.tipo === "cantidad") {
    const n = c.progreso(h.id, dia);
    extra = `<div class="contador"><button class="boton-icono" value="menos" aria-label="Quitar uno">${icono("ui-menos")}</button>
      <p><b>${n}</b> de ${h.cantidad} ${esc(h.unidad || "veces")}</p>
      <button class="boton-icono boton-icono--lleno" value="mas" aria-label="Sumar uno">${icono("ui-mas")}</button></div>`;
  } else if (h.tipo === "tiempo" && dia === c.hoy && t !== "H") {
    const enMarcha = c.crono && c.crono.id === h.id;
    const seg = c.segundos(h.id);
    extra = `<button class="boton boton--principal ancho-hoja" value="crono">${icono(enMarcha ? "ui-pausa" : "ui-play")}${enMarcha ? "Pausar" : seg ? `Seguir (${Math.floor(seg / 60)} de ${h.cantidad} min)` : `Empezar ${h.cantidad} min`}</button>`;
  }
  return `<div class="hoja__cab" style="${varsColor(h.color)}" tabindex="-1" autofocus>${insignia(h, "insignia--grande")}<div><h2>${esc(h.nombre)}</h2><p class="nota">${mayus(fechaLarga(dia))}${dia === c.hoy ? " · hoy" : ""}</p></div></div>
    ${extra}
    <div class="opciones">
      ${h.tipo === "evitar"
        ? `${op("", "ui-check", "Sin recaída", "Cada día sin hacerlo suma")}${op("R", "ui-cerrar", "He recaído", "Vuelves a empezar a contar; no pasa nada")}`
        : `${op("H", "ui-check", "Hecho")}${op("D", "luna", "Descanso", "No cuenta como hecho, pero no rompe la racha")}${t ? `<button class="opcion opcion--quitar" value="">${icono("ui-cerrar")}<span><b>Quitar la marca</b></span></button>` : ""}`}
    </div>
    <details class="hoja__nota"${c.notaDia ? " open" : ""}>
      <summary>${icono("ui-nota")}${c.notaDia ? "Nota de este día" : "Añadir una nota a este día"}</summary>
      <label class="oculto" for="nota-habito">Nota</label>
      <textarea id="nota-habito" rows="3" maxlength="600" placeholder="${h.tipo === "cantidad" ? "Por ejemplo: con limón" : h.tipo === "tiempo" ? "Por ejemplo: 30 páginas" : "¿Cómo ha ido?"}">${esc(c.notaDia)}</textarea>
      <button class="boton boton--suave boton--peque" value="nota">Guardar nota</button>
    </details>
    <div class="hoja__enlaces hoja__enlaces--3">
      <a class="boton boton--suave" href="#/ficha/${h.id}" value="ir">${icono("ui-progreso")}Progreso</a>
      <a class="boton boton--suave" href="#/plan/${h.id}" value="ir">${icono("escribir")}Editar</a>
      ${enPausa(h, c.hoy) ? `<button class="boton boton--suave" value="reanudar">${icono("ui-play")}Reanudar</button>`
        : `<button class="boton boton--suave" value="pausar">${icono("ui-pausa")}Pausar</button>`}
    </div>`;
}

/** Hoja para elegir cuánto tiempo pausar un hábito. */
export function hojaPausa(h) {
  const op = (v, t, d) => `<button class="opcion" value="${v}">${icono("ui-pausa")}<span><b>${t}</b>${d ? `<small>${d}</small>` : ""}</span></button>`;
  return `<h2>Pausar «${esc(h.nombre)}»</h2>
    <p class="nota">Mientras esté en pausa no aparece en Hoy, no te avisa y no pierdes la racha.</p>
    <div class="opciones">${op("7", "1 semana")}${op("14", "2 semanas")}${op("30", "1 mes")}${op("0", "Hasta que la reanude")}</div>
    <button class="enlace" value="cancelar">Cancelar</button>`;
}

export function hojaNota(dia, a) {
  return `<h2>Nota del día</h2><p class="nota">${mayus(fechaLarga(dia))}</p>
    <label class="oculto" for="texto-nota">Nota</label>
    <textarea id="texto-nota" rows="5" maxlength="600" placeholder="¿Qué ha pasado hoy? ¿Qué te ha ayudado?">${esc(a?.nota ?? "")}</textarea>
    <div class="fila-botones"><button class="boton boton--suave" value="cancelar">Cancelar</button><button class="boton boton--principal" value="guardar">Guardar</button></div>`;
}

/* ------------------------------------------------------------------ Progreso */
export function vistaProgreso(c) {
  const { hoy, datos } = c;
  const fichas = filtrar(c.fichas, c.filtro);
  let h = `<header class="cabecera"><div><p class="fecha">Últimas semanas</p><h1>Progreso</h1></div>
    <a class="boton boton--suave boton--peque" href="#/informe">${icono("ui-nota")}Informe</a></header>`;
  h += filtros(c.fichas, c.filtro);
  if (!fichas.length) return h + `<p class="tarjeta nota">Cuando marques tus primeros días, aquí verás tus rachas, tus logros y cómo va cada hábito.</p>`;

  let barras = "";
  for (let atras = 6; atras >= 0; atras--) {
    const d = hoy - atras;
    const tocan = fichas.filter((f) => d >= f.habito.creado && (tocaDia(f.habito, d) || tipoDe(f, d)) && tipoDe(f, d) !== "D");
    const hechos = tocan.filter((f) => tipoDe(f, d) === "H").length;
    const fr = tocan.length ? hechos / tocan.length : 0;
    barras += `<li><span class="barra-dia" title="${hechos} de ${tocan.length}"><span style="height:${Math.round(fr * 100)}%"></span></span><span class="dia__letra${d === hoy ? " es-hoy" : ""}">${inicial(d)}</span></li>`;
  }
  const total = fichas.reduce((s, f) => s + f.total, 0);
  h += `<section class="tarjeta">
    <h2 class="tarjeta__titulo">Esta semana</h2>
    <ol class="barras" aria-label="Porcentaje de hábitos hechos cada día">${barras}</ol>
    <div class="cifras">
      <div><b>${icono("ui-brillo")}${c.rachaCompletos}</b><span>días completos seguidos</span></div>
      <div><b>${fichas.filter((f) => f.semanaCumplida).length}/${fichas.length}</b><span>objetivos de la semana cumplidos</span></div>
      <div><b>${miles(total)}</b><span>días hechos en total</span></div>
    </div>
  </section>`;

  h += `<section class="seccion-habitos" aria-labelledby="cada-t"><h2 class="seccion__titulo" id="cada-t">Cada hábito <span>toca uno para ver su calendario</span></h2>`;
  for (const f of fichas) {
    const hb = f.habito;
    const fr = Math.min(1, f.total / hb.meta);
    h += `<a class="tarjeta tarjeta--enlace habito-resumen" href="#/ficha/${hb.id}" style="${varsColor(hb.color)}">
      <div class="tarjeta__cab">${insignia(hb)}<span class="habito__textos"><span class="habito__nombre">${esc(hb.nombre)}</span><span class="habito__sub">${mayus(frecuencia(hb, datos.ajustes.primer))}</span></span>${icono("ui-derecha", "flecha")}</div>
      <div class="cifras cifras--habito">
        <div><b>${icono("llama")}${rachaTxt(f, f.racha)}</b><span>racha</span></div>
        ${f.evitar ? `<div><b>${f.recaidas.size}</b><span>${f.recaidas.size === 1 ? "recaída" : "recaídas"}</span></div>`
          : `<div><b>${f.periodo.n}/${f.periodo.de}</b><span>${f.periodo.texto}</span></div>`}
        <div><b>${f.total}/${hb.meta}</b><span>meta${f.metaCumplida ? " ✓" : ""}</span></div>
      </div>
      <span class="barra-fina" role="progressbar" aria-label="Meta de ${hb.meta} días" aria-valuemin="0" aria-valuemax="${hb.meta}" aria-valuenow="${f.total}"><span style="width:${(fr * 100).toFixed(1)}%"></span></span>
    </a>`;
  }
  h += `</section>`;

  const mejorDia = mejorDiaGlobal(fichas, hoy);
  h += `<section class="tarjeta">
    <h2 class="tarjeta__titulo">Tu año</h2>
    ${mapaAño(fichas, hoy, datos.ajustes.primer)}
    <p class="nota">Cada cuadrito es un día: cuanto más verde, más hábitos cumpliste.${mejorDia ? ` Tu mejor día: <b>los ${mejorDia.nombre}</b> (${Math.round(mejorDia.p * 100)} %).` : ""}</p>
    <button class="boton boton--suave boton--peque espacio" data-accion="compartir-progreso">${icono("ui-brillo")}Compartir mi progreso</button>
  </section>`;

  h += seccionAnimo(c);

  const conseguidos = c.logros.filter((l) => l.ok);
  const siguiente = c.logros.find((l) => !l.ok);
  h += `<details class="tarjeta logros-plegable">
    <summary><span class="logros__resumen"><b>Logros</b><span>${conseguidos.length} de ${c.logros.length}${siguiente ? ` · el siguiente: ${siguiente.titulo.toLowerCase()}` : " · ¡todos!"}</span></span>
      <span class="logros__mini" aria-hidden="true">${conseguidos.slice(-4).map((l) => `<i>${icono(l.icono)}</i>`).join("")}</span></summary>
    <ul class="logros">${c.logros.map((l) => `<li class="logro${l.ok ? " logro--ok" : ""}"><span class="logro__ico">${icono(l.icono)}</span><b>${l.titulo}</b><span>${l.texto}</span><span class="oculto">${l.ok ? "conseguido" : "pendiente"}</span></li>`).join("")}</ul>
  </details>`;
  return h;
}

function seccionAnimo({ datos, hoy, fichas }) {
  const animo = datos.animo || {};
  const registrados = Object.keys(animo).length;
  let fila = "";
  for (let atras = 13; atras >= 0; atras--) {
    const d = hoy - atras;
    const n = animo[d]?.nivel;
    fila += `<li title="${esc(fechaLarga(d))}">${n ? cara(n, "cara--mini") : `<i class="sin-animo"></i>`}<span class="dia__letra${d === hoy ? " es-hoy" : ""}">${inicial(d)}</span></li>`;
  }
  // ¿Te sientes mejor los días que cumples más? Solo con datos suficientes.
  const buenos = [], flojos = [];
  for (const [dia, a] of Object.entries(animo)) {
    if (!a.nivel) continue;
    const d = Number(dia);
    const tocan = fichas.filter((f) => d >= f.habito.creado && tocaDia(f.habito, d) && tipoDe(f, d) !== "D");
    if (!tocan.length) continue;
    const fr = tocan.filter((f) => tipoDe(f, d) === "H").length / tocan.length;
    (fr >= 0.75 ? buenos : fr < 0.5 ? flojos : []).push(a.nivel);
  }
  const media = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  let idea = registrados ? "Sigue apuntando cómo te sientes: con unos días más te diré si cumplir tus hábitos te sienta bien." : "Apunta cada día cómo te sientes desde la pantalla Hoy.";
  if (buenos.length >= 3 && flojos.length >= 3) {
    const a = media(buenos), b = media(flojos);
    const nombre = (v) => ANIMOS[Math.round(v) - 1][1].toLowerCase();
    idea = a > b + 0.3 ? `Los días que cumples casi todo te sientes <b>${nombre(a)}</b>; los que cumples poco, <b>${nombre(b)}</b>.`
      : "De momento tu ánimo es parecido cumplas mucho o poco.";
  }
  return `<section class="tarjeta">
    <h2 class="tarjeta__titulo">Cómo te has sentido</h2>
    <ol class="fila-animo" aria-label="Ánimo de los últimos 14 días">${fila}</ol>
    <p class="nota">${idea}</p>
  </section>`;
}

function meta(f) {
  const fr = Math.min(1, f.total / f.habito.meta);
  return `<div class="meta"><p><span>Meta de ${f.habito.meta} días</span><b>${f.metaCumplida ? "¡Conseguida! · " : ""}${f.total}/${f.habito.meta}</b></p>
    <span class="barra-fina" role="progressbar" aria-label="Meta" aria-valuemin="0" aria-valuemax="${f.habito.meta}" aria-valuenow="${f.total}"><span style="width:${(fr * 100).toFixed(1)}%"></span></span></div>`;
}

/* ------------------------------------------------------------------ Ficha */
export function vistaFicha(c, f, mes) {
  const { hoy, datos } = c;
  const h = f.habito;
  const hoyF = fechaDe(hoy);
  const esMesActual = mes.y === hoyF.getFullYear() && mes.m === hoyF.getMonth();
  const momento = MOMENTOS.find((m) => m[0] === (h.momento || "cualquiera"))[1];
  const partes = [mayus(frecuencia(h, datos.ajustes.primer)), momento === "Cuando sea" ? "a cualquier hora" : `por la ${momento.toLowerCase()}`];
  if (medida(h)) partes.push(medida(h));
  if (h.pasos) partes.push(`se marca solo a los ${miles(h.pasos)} pasos`);
  if (h.avisos?.length) partes.push(`aviso${h.avisos.length > 1 ? "s" : ""} a las ${h.avisos.join(" y ")}`);
  if (h.etiqueta) partes.push(ETIQUETAS.find((e) => e[0] === h.etiqueta)?.[1] ?? "");
  return `<a class="volver" href="#/progreso" data-accion="atras">${icono("ui-izquierda")}<span>Volver</span></a>
    <header class="cabecera cabecera--ficha" style="${varsColor(h.color)}">${insignia(h, "insignia--grande")}<div><h1>${esc(h.nombre)}</h1><p class="fecha">${partes.join(" · ")}</p></div></header>
    <section class="tarjeta" style="${varsColor(h.color)}">
      <div class="cifras cifras--2">
        <div><b>${icono("llama")}${rachaTxt(f, f.racha)}</b><span>racha actual</span></div>
        <div><b>${rachaTxt(f, f.mejorRacha)}</b><span>mejor racha</span></div>
        ${f.evitar
          ? `<div><b>${f.recaidas.size}</b><span>${f.recaidas.size === 1 ? "recaída en total" : "recaídas en total"}</span></div>
             <div><b>${f.total}</b><span>días sin hacerlo</span></div>`
          : `<div><b>${f.periodo.n}/${f.periodo.de}</b><span>${f.periodo.texto}</span></div>
             <div><b>${f.constancia === null ? "—" : `${Math.round(f.constancia * 100)} %`}</b><span>${f.enMeses ? "meses cumplidos (últimos 12)" : "semanas cumplidas (últimas 12)"}</span></div>`}
      </div>
      ${meta(f)}
    </section>
    <section class="tarjeta" style="${varsColor(h.color)}">
      <div class="mes">
        <button class="boton-icono" data-accion="mes-anterior" aria-label="Mes anterior">${icono("ui-izquierda")}</button>
        <h2>${mayus(nombreMes(mes.m))} ${mes.y}</h2>
        <button class="boton-icono" data-accion="mes-siguiente" aria-label="Mes siguiente" ${esMesActual ? "disabled" : ""}>${icono("ui-derecha")}</button>
      </div>
      ${calendario(f, mes, hoy, datos.ajustes.primer)}
      <p class="nota">Toca un día para cambiarlo.</p>
    </section>
    ${tarjetaReto(f, c.hoy)}
    ${notasDelMes(f, mes, c.datos)}
    ${bloqueEstadisticas(f, hoy, datos)}
    <section class="tarjeta" style="${varsColor(h.color)}">
      <h2 class="tarjeta__titulo">Tu año</h2>
      ${mapaAño([f], hoy, datos.ajustes.primer, colorDisco(h.color))}
    </section>
    <section class="tarjeta">
      <h2 class="tarjeta__titulo">${icono("ui-brillo")}Marcarlo desde Atajos o Siri</h2>
      ${c.atajo?.id === h.id && c.atajo.url
        ? `<p class="nota">Copia este enlace. En la app Atajos: <b>Nuevo atajo › Obtener contenido de URL</b>, pega el enlace y en «Método» elige <b>POST</b>. Ponle un nombre como «${esc(h.nombre)} hecho» y díselo a Siri.</p>
           <div class="codigo"><code>${esc(c.atajo.url)}</code><button class="boton boton--suave boton--peque" data-accion="copiar-atajo">Copiar</button></div>`
        : `<p class="nota">Crea un enlace que solo sirve para marcar este hábito como hecho hoy, sin abrir la app.</p>
           <button class="boton boton--suave boton--peque" data-accion="crear-atajo" data-valor="${h.id}">${c.nube.activa ? "Crear enlace" : "Necesita guardar en SBD (Ajustes)"}</button>`}
      ${c.atajo?.error ? `<p class="error">${esc(c.atajo.error)}</p>` : ""}
    </section>
    <div class="fila-botones">
      <button class="boton boton--suave" data-accion="compartir-habito" data-valor="${h.id}">${icono("ui-brillo")}Compartir</button>
      <a class="boton boton--suave" href="#/plan/${h.id}">${icono("escribir")}Editar</a>
    </div>`;
}

function tarjetaReto(f, hoy) {
  const r = retoDe(f, hoy);
  if (!r) return "";
  const texto = r.terminado ? (r.superado ? "¡Reto superado! Enhorabuena." : `Reto terminado: ${r.hechos} de ${r.dias} días.`)
    : `Día ${r.dia} de ${r.dias}. ${f.evitar ? "Sigue así." : `Llevas ${r.hechos} hechos.`}`;
  return `<section class="tarjeta reto-estado${r.superado ? " reto-estado--ok" : ""}" style="${varsColor(f.habito.color)}">
    <h2 class="tarjeta__titulo">${icono(r.superado ? "trofeo" : "estrella")}Reto de ${r.dias} días</h2>
    <p>${texto}</p>
    <span class="barra-fina"><span style="width:${Math.round((Math.min(r.dia, r.dias) / r.dias) * 100)}%"></span></span>
  </section>`;
}

function notasDelMes(f, { y, m }, datos) {
  const notas = Object.entries(datos.notas?.[f.habito.id] || {})
    .map(([d, t]) => [Number(d), t]).filter(([d]) => { const x = fechaDe(d); return x.getFullYear() === y && x.getMonth() === m; })
    .sort((a, b) => b[0] - a[0]);
  if (!notas.length) return "";
  return `<section class="tarjeta"><h2 class="tarjeta__titulo">${icono("ui-nota")}Notas de ${nombreMes(m)}</h2>
    <ul class="notas">${notas.map(([d, t]) => `<li><b>${fechaDe(d).getDate()}</b><span>${esc(t)}</span></li>`).join("")}</ul></section>`;
}

function calendario(f, { y, m }, hoy, primer) {
  const primero = diaDe(new Date(y, m, 1));
  const total = new Date(y, m + 1, 0).getDate();
  const hueco = (((new Date(y, m, 1).getDay() - primer) % 7) + 7) % 7;
  let s = `<div class="cal">`;
  for (let i = 0; i < 7; i++) s += `<span class="cal__cab" aria-hidden="true">${inicialDeIndice((primer + i) % 7)}</span>`;
  for (let i = 0; i < hueco; i++) s += `<span></span>`;
  for (let i = 0; i < total; i++) {
    const dia = primero + i;
    const t = tipoDe(f, dia);
    const libre = t === null && !tocaDia(f.habito, dia);
    s += `<button class="cal__dia${dia === hoy ? " cal__dia--hoy" : ""}${t === "H" ? " cal__dia--h" : t === "D" ? " cal__dia--d" : libre ? " cal__dia--libre" : ""}"
      data-accion="elegir-dia" data-valor="${dia}" ${dia > hoy ? "disabled" : ""} aria-label="${esc(fechaLarga(dia))}: ${libre ? "no toca" : estadoTexto(t)}">${i + 1}</button>`;
  }
  return s + `</div>`;
}

/* ------------------------------------------------------------------ Crear y editar */
export function vistaPlan(c, b) {
  const existente = !!b.id;
  const v = varsColor(b.color);
  const sel = (cond) => `aria-pressed="${cond}"`;
  const primer = c.datos.ajustes.primer;
  const concretos = Array.isArray(b.dias);
  const ordenDias = [0, 1, 2, 3, 4, 5, 6].map((i) => (primer + i) % 7);
  const tipo = b.tipo || "simple";
  return `<a class="volver" href="#/hoy" data-accion="atras">${icono("ui-izquierda")}<span>Volver</span></a>
    <h1 class="titulo-pantalla">${existente ? "Editar hábito" : "Nuevo hábito"}</h1>
    ${existente ? "" : `<a class="enlace-rutinas" href="#/rutinas">${icono("ui-brillo")}<span>¿Prefieres una <b>rutina ya hecha</b>? Añade varios hábitos de golpe.</span>${icono("ui-derecha")}</a>`}
    <div class="vista-previa" style="${v}">${insignia(b, "insignia--grande")}<span>${esc(b.nombre) || "Tu hábito"}</span></div>

    <div class="campo">
      <label for="nombre">Nombre</label>
      <input id="nombre" type="text" maxlength="40" value="${esc(b.nombre)}" placeholder="Por ejemplo: leer" autocomplete="off" enterkeyhint="done" autocapitalize="sentences" aria-describedby="error-nombre">
      <p class="error" id="error-nombre" hidden>Escribe un nombre para el hábito.</p>
    </div>

    <fieldset class="campo">
      <legend>¿Cómo lo cuentas?</legend>
      <div class="segmentos segmentos--4" style="${v}">
        <button data-accion="tipo" data-valor="simple" ${sel(tipo === "simple")}>${icono("ui-check")}<span>Marcar</span></button>
        <button data-accion="tipo" data-valor="cantidad" ${sel(tipo === "cantidad")}>${icono("ui-mas")}<span>Cantidad</span></button>
        <button data-accion="tipo" data-valor="tiempo" ${sel(tipo === "tiempo")}>${icono("ui-reloj")}<span>Tiempo</span></button>
        <button data-accion="tipo" data-valor="evitar" ${sel(tipo === "evitar")}>${icono("ui-cerrar")}<span>Dejar algo</span></button>
      </div>
      ${tipo === "simple" ? `<p class="nota">Lo marcas con un toque cuando lo haces.</p>` : ""}
      ${tipo === "cantidad" ? `<div class="fila-campos">
          <label>Cuántos al día<input type="number" inputmode="numeric" min="1" max="99" id="cantidad" value="${b.cantidad ?? 8}"></label>
          <label>De qué<input type="text" id="unidad" maxlength="15" value="${esc(b.unidad ?? "vasos")}" placeholder="vasos, páginas…"></label>
        </div><p class="nota">Se marca como hecho al llegar. Cada toque en el botón redondo suma uno.</p>` : ""}
      ${tipo === "tiempo" ? `<div class="chips" style="${v}">${MINUTOS.map((m) => `<button class="chip" data-accion="minutos" data-valor="${m}" ${sel(b.cantidad === m)}>${m} min</button>`).join("")}</div>
        <p class="nota">Toca el botón redondo para empezar el temporizador. Se marca como hecho al terminar.</p>` : ""}
      ${tipo === "evitar" ? `<p class="nota">Para dejar algo, como fumar o el azúcar: cada día sin hacerlo cuenta solo. Si recaes, lo apuntas y vuelves a empezar a contar.</p>` : ""}
    </fieldset>

    ${tipo === "evitar" ? "" : `<fieldset class="campo">
      <legend>¿Con qué frecuencia?</legend>
      <div class="segmentos segmentos--3" style="${v}">
        <button data-accion="modo-dias" data-valor="libre" ${sel(!concretos && !b.porMes)}><span>Por semana</span></button>
        <button data-accion="modo-dias" data-valor="concretos" ${sel(concretos)}><span>Días fijos</span></button>
        <button data-accion="modo-dias" data-valor="mes" ${sel(!!b.porMes)}><span>Por mes</span></button>
      </div>
      ${concretos
        ? `<div class="segmentos" style="${v}">${ordenDias.map((d) => `<button data-accion="dia-semana" data-valor="${d}" ${sel(b.dias.includes(d))} aria-label="${NOMBRES_DIA[d]}">${inicialDeIndice(d)}</button>`).join("")}</div>
           <p class="nota">${b.dias.length ? `Solo aparecerá ${b.dias.length === 7 ? "todos los días" : `los días elegidos (${frecuencia({ ...b, porMes: null, tipo: "simple" }, primer)})`}. Los demás no rompen la racha.` : "Elige al menos un día."}</p>`
        : b.porMes
        ? `<div class="chips" style="${v}">${[1, 2, 3, 4, 6, 8, 10, 15].map((n) => `<button class="chip" data-accion="por-mes" data-valor="${n}" ${sel(b.porMes === n)}>${n}</button>`).join("")}</div>
           <p class="nota">${b.porMes === 1 ? "1 vez" : `${b.porMes} veces`} al mes, cuando quieras. La racha se cuenta en meses.</p>`
        : `<div class="segmentos" style="${v}">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button data-accion="objetivo" data-valor="${n}" ${sel(n === b.objetivo)} aria-label="${n} ${n === 1 ? "día" : "días"} a la semana">${n}</button>`).join("")}</div>
           <p class="nota">${b.objetivo === 7 ? "Todos los días." : `${b.objetivo} ${b.objetivo === 1 ? "día" : "días"} a la semana, los que tú quieras.`}</p>`}
    </fieldset>`}

    <fieldset class="campo">
      <legend>¿En qué momento del día?</legend>
      <div class="segmentos segmentos--4" style="${v}">${MOMENTOS.map(([k, n, ico]) => `<button data-accion="momento" data-valor="${k}" ${sel((b.momento || "cualquiera") === k)}>${icono(ico)}<span>${n}</span></button>`).join("")}</div>
    </fieldset>

    <fieldset class="campo">
      <legend>Recordatorios <span class="opcional">opcional</span></legend>
      ${(b.avisos || []).map((a, i) => `<div class="fila-aviso">
        <label class="oculto" for="hora-aviso-${i}">Hora del aviso ${i + 1}</label>
        <input type="time" id="hora-aviso-${i}" data-aviso="${i}" value="${a}">
        <button class="boton-icono" data-accion="quitar-aviso" data-valor="${i}" aria-label="Quitar el aviso de las ${a}">${icono("ui-cerrar")}</button>
      </div>`).join("")}
      ${(b.avisos || []).length < 3 ? `<button class="boton boton--suave boton--peque" data-accion="anadir-aviso">${icono("ui-campana")}${(b.avisos || []).length ? "Añadir otra hora" : "Añadir un recordatorio"}</button>` : ""}
      <p class="nota">${c.avisos === "no-instalada" ? "En iPhone, los avisos funcionan con shabit añadida a la pantalla de inicio."
        : c.avisos === "no-compatible" ? "Este navegador no permite avisos."
        : c.avisos === "denegado" ? "Las notificaciones están bloqueadas. Puedes permitirlas en los ajustes del móvil."
        : "Solo te avisa si a esa hora aún no lo has hecho. Hasta 3 avisos al día."}</p>
    </fieldset>

    <details class="campo mas mas--aspecto">
      <summary>Icono y color <span class="muestra-aspecto" style="${v}">${insignia(b)}</span></summary>
    <fieldset class="campo">
      <legend>Icono</legend>
      <div class="iconos" style="${v}">${ICONOS_HABITO.map((k) => `<button data-accion="icono" data-valor="${k}" ${sel(k === b.icono)} aria-label="${k.replace("-", " ")}">${icono(k)}</button>`).join("")}</div>
    </fieldset>

    <fieldset class="campo">
      <legend>Color</legend>
      <div class="colores">${COLORES.map((col, i) => `<button class="color" style="${varsColor(i)}" data-accion="color" data-valor="${i}" ${sel(i === b.color)} aria-label="${col.nombre}">${i === b.color ? icono("ui-check") : ""}</button>`).join("")}</div>
    </fieldset>

    </details>
    <details class="campo mas"${b.pasos || b.reto || b.etiqueta || (b.meta && b.meta !== 66) ? " open" : ""}>
      <summary>Más opciones <span class="opcional">reto, etiqueta, meta y pasos</span></summary>
    <fieldset class="campo">
      <legend>Etiqueta</legend>
      <div class="chips" style="${v}">
        <button class="chip" data-accion="etiqueta" data-valor="" ${sel(!b.etiqueta)}>Ninguna</button>
        ${ETIQUETAS.map(([k, n]) => `<button class="chip" data-accion="etiqueta" data-valor="${k}" ${sel(b.etiqueta === k)}>${n}</button>`).join("")}
      </div>
      <p class="nota">Sirve para filtrar en Hoy y en Progreso.</p>
    </fieldset>
      <fieldset class="campo">
        <legend>¿Es un reto?</legend>
        <div class="chips" style="${v}">
          <button class="chip" data-accion="reto" data-valor="" ${sel(!b.reto)}>No</button>
          ${[7, 21, 30, 66, 100].map((n) => `<button class="chip" data-accion="reto" data-valor="${n}" ${sel(b.reto === n)}>${n} días</button>`).join("")}
        </div>
        <p class="nota">Un reto tiene fecha de fin: ${b.reto ? `${b.reto} días desde que lo eliges.` : "por ejemplo, 30 días sin azúcar."} Al terminar verás si lo has superado.</p>
      </fieldset>
      <fieldset class="campo">
        <legend>Meta</legend>
        <div class="chips" style="${v}">${METAS.map((m) => `<button class="chip" data-accion="meta" data-valor="${m}" ${sel(m === b.meta)}>${m} días</button>`).join("")}</div>
        <p class="nota">Cuántos días hechos quieres sumar en total.</p>
      </fieldset>
      <fieldset class="campo">
        <legend>Marcar solo con pasos</legend>
        <div class="chips" style="${v}">
          <button class="chip" data-accion="pasos" data-valor="" ${sel(b.pasos == null)}>No</button>
          ${OBJETIVOS_PASOS.map((p) => `<button class="chip" data-accion="pasos" data-valor="${p}" ${sel(b.pasos === p)}>${miles(p)}</button>`).join("")}
        </div>
        <p class="nota">Para hábitos como caminar: se marca solo al llegar a los pasos, contados con el móvil mientras la app está abierta.</p>
      </fieldset>
    </details>

    <button class="boton boton--principal ancho" data-accion="guardar">${existente ? "Guardar cambios" : "Crear hábito"}</button>
    ${existente ? `<div class="fila-botones">
      <button class="boton boton--suave" data-accion="archivar">Archivar</button>
      <button class="boton boton--peligro" data-accion="borrar">Borrar</button>
    </div>
    <p class="nota">Archivar lo quita de tu rutina pero guarda su historial; puedes recuperarlo en Ajustes.</p>` : ""}`;
}

/* ------------------------------------------------------------------ Rutinas */
export function vistaRutinas(c) {
  const nombres = new Set(c.datos.habitos.filter((h) => !h.archivado).map((h) => h.nombre.toLowerCase()));
  return `<a class="volver" href="#/hoy" data-accion="atras">${icono("ui-izquierda")}<span>Volver</span></a>
    <h1 class="titulo-pantalla">Rutinas</h1>
    <p class="nota">Añade varios hábitos de una vez. Luego puedes cambiar o quitar los que quieras.</p>
    ${RUTINAS.map((r) => {
      const todos = r.habitos.every((h) => nombres.has(h.nombre.toLowerCase()));
      return `<section class="tarjeta rutina" style="${varsColor(r.color)}">
        <div class="tarjeta__cab"><span class="insignia insignia--grande">${icono(r.icono)}</span><div><h2>${esc(r.nombre)}</h2><p class="nota">${esc(r.texto)}</p></div></div>
        <ul class="rutina__lista">${r.habitos.map((h) => `<li style="${varsColor(h.color)}"><span class="insignia">${icono(h.icono)}</span><span><b>${esc(h.nombre)}</b><small>${[
          MOMENTOS.find((m) => m[0] === (h.momento === "cuando" ? "cualquiera" : h.momento))[1],
          h.dias ? frecuencia({ dias: h.dias }, c.datos.ajustes.primer) : null,
          h.tipo === "tiempo" ? `${h.cantidad} min` : h.tipo === "cantidad" ? `${h.cantidad} ${h.unidad}` : null,
          h.pasos ? `${miles(h.pasos)} pasos` : null, h.avisos?.length ? `aviso ${h.avisos.join(", ")}` : null,
        ].filter(Boolean).join(" · ")}</small></span></li>`).join("")}</ul>
        <button class="boton boton--principal ancho-hoja" data-accion="rutina" data-valor="${r.id}" ${todos ? "disabled" : ""}>${todos ? "Ya la tienes" : `Añadir estos ${r.habitos.length} hábitos`}</button>
      </section>`;
    }).join("")}`;
}

/* ------------------------------------------------------------------ Ordenar */
export function vistaOrdenar(c) {
  const activos = c.datos.habitos.filter((h) => !h.archivado).sort((a, b) => a.orden - b.orden || a.id - b.id);
  let lista = "";
  for (const [k, n, ico] of MOMENTOS) {
    lista += `<li class="ordenar__grupo" data-momento="${k}">${icono(ico)}${n}</li>`;
    for (const h of activos.filter((x) => (x.momento || "cualquiera") === k)) {
      lista += `<li class="ordenar__item" data-id="${h.id}" style="${varsColor(h.color)}">
        <span class="ordenar__asa" aria-hidden="true">${icono("ui-ordenar")}</span>${insignia(h)}<span class="ordenar__nombre">${esc(h.nombre)}</span>
        <button class="boton-icono boton-icono--peque" data-accion="subir" data-valor="${h.id}" aria-label="Subir ${esc(h.nombre)}"><span class="girar-arriba">${icono("ui-derecha")}</span></button>
        <button class="boton-icono boton-icono--peque" data-accion="bajar" data-valor="${h.id}" aria-label="Bajar ${esc(h.nombre)}"><span class="girar-abajo">${icono("ui-derecha")}</span></button>
      </li>`;
    }
  }
  return `<a class="volver" href="#/hoy" data-accion="atras">${icono("ui-izquierda")}<span>Volver</span></a>
    <h1 class="titulo-pantalla">Ordenar</h1>
    <p class="nota">Arrastra un hábito desde ${icono("ui-ordenar", "ico--mini")} para cambiar su orden o llevarlo a otro momento del día. También puedes usar las flechas.</p>
    <ul class="ordenar" id="ordenar">${lista}</ul>`;
}

/* ------------------------------------------------------------------ Ajustes */
export function vistaAjustes(c) {
  const a = c.datos.ajustes;
  const archivados = c.datos.habitos.filter((h) => h.archivado);
  const opcion = (texto, activa, accion, valor) =>
    `<button class="fila-opcion" role="radio" aria-checked="${activa}" data-accion="${accion}" data-valor="${valor}"><span>${texto}</span><i class="radio"></i></button>`;
  const avisos = {
    activos: [`Activados. Te avisaré a la hora de cada hábito si aún no lo has hecho.`, `<button class="boton boton--suave boton--peque" data-accion="desactivar-avisos">Desactivar</button>`],
    pendiente: [`Desactivados.`, `<button class="boton boton--principal boton--peque" data-accion="activar-avisos">Activar recordatorios</button>`],
    "no-instalada": [`En iPhone, los recordatorios solo funcionan con shabit añadida a la pantalla de inicio (Compartir › Añadir a pantalla de inicio).`, ""],
    "no-compatible": [`Este navegador no permite recordatorios.`, ""],
    denegado: [`Las notificaciones están bloqueadas para shabit. Puedes permitirlas en los ajustes del móvil.`, ""],
    "sin-nube": [`Los recordatorios necesitan que tus datos se guarden en SBD (arriba).`, ""],
    cargando: [`Comprobando…`, ""],
  }[c.avisos] ?? ["", ""];
  return `<header class="cabecera"><div><h1>Ajustes</h1></div></header>
    <section class="tarjeta">
      <h2 class="tarjeta__titulo">Recordatorios</h2>
      <p class="nota">${avisos[0]}</p>${avisos[1] ? `<div class="espacio">${avisos[1]}</div>` : ""}
      <p class="nota">La hora de cada aviso se elige al crear o editar el hábito.</p>
      <div class="fila-opcion fila-opcion--interruptor">
        <span>Resumen de la mañana<small>Qué te toca hoy, a la hora que elijas</small></span>
        ${a.resumen ? `<input type="time" id="hora-resumen" value="${a.resumen}" aria-label="Hora del resumen">` : ""}
        <label class="interruptor"><input type="checkbox" data-accion="resumen" ${a.resumen ? "checked" : ""}><span class="oculto">Resumen de la mañana</span></label>
      </div>
      <div class="fila-opcion fila-opcion--interruptor">
        <span>Informe del domingo<small>Cómo ha ido tu semana, a las 20:00</small></span>
        <label class="interruptor"><input type="checkbox" data-accion="informe" ${a.informe !== false ? "checked" : ""}><span class="oculto">Informe del domingo</span></label>
      </div>
    </section>
    <section class="tarjeta">
      <h2 class="tarjeta__titulo">Apariencia</h2>
      <div class="temas" role="radiogroup" aria-label="Colores">
        ${[["claro", "Clara"], ["arena", "Arena"], ["menta", "Menta"], ["lavanda", "Lavanda"], ["oscuro", "Oscura"], ["sistema", "Como el sistema"]].map(([k, n]) =>
          `<button class="tema-muestra tema-muestra--${k}" role="radio" aria-checked="${a.tema === k}" data-accion="tema" data-valor="${k}"><i></i><span>${n}</span></button>`).join("")}
      </div>
      <h3 class="subtitulo">Tamaño de la letra</h3>
      <div class="segmentos segmentos--3">
        ${[["normal", "Normal"], ["grande", "Grande"], ["enorme", "Muy grande"]].map(([k, n]) => `<button data-accion="texto" data-valor="${k}" aria-pressed="${(a.texto || "normal") === k}" class="tamano-${k}">${n}</button>`).join("")}
      </div>
      <h3 class="subtitulo">La semana empieza el</h3>
      <div class="segmentos segmentos--2" role="radiogroup" aria-label="Primer día de la semana">
        <button role="radio" aria-checked="${a.primer === 1}" aria-pressed="${a.primer === 1}" data-accion="primer" data-valor="1">Lunes</button>
        <button role="radio" aria-checked="${a.primer === 0}" aria-pressed="${a.primer === 0}" data-accion="primer" data-valor="0">Domingo</button>
      </div>
    </section>
    <section class="tarjeta">
      <h2 class="tarjeta__titulo">Tus hábitos</h2>
      <div class="fila-botones">
        <a class="boton boton--suave" href="#/ordenar">${icono("ui-ordenar")}Ordenar</a>
        <a class="boton boton--suave" href="#/rutinas">${icono("ui-brillo")}Rutinas</a>
      </div>
      ${archivados.length ? `<h3 class="subtitulo">Archivados</h3>${archivados.map((h) => `<div class="archivado">${insignia(h)}<span>${esc(h.nombre)}</span><button class="boton boton--suave boton--peque" data-accion="recuperar" data-valor="${h.id}">Recuperar</button></div>`).join("")}` : ""}
    </section>
    <section class="tarjeta">
      <h2 class="tarjeta__titulo">${icono("corazon")}Un compañero</h2>
      <p class="nota">Comparte un enlace para que alguien vea cómo van tus hábitos y te anime. Solo ve tus hábitos y tus días: ni notas ni ánimo. Puedes quitarlo cuando quieras.</p>
      ${c.compartir?.url
        ? `<div class="codigo"><code>${esc(c.compartir.url)}</code><button class="boton boton--suave boton--peque" data-accion="copiar-enlace">Copiar</button></div>
           <button class="enlace enlace--peligro" data-accion="quitar-enlace">Dejar de compartir</button>`
        : `<button class="boton boton--suave boton--peque espacio" data-accion="crear-enlace" ${c.nube.activa ? "" : "disabled"}>${c.nube.activa ? "Crear enlace" : "Necesita guardar tus datos (abajo)"}</button>`}
    </section>
    ${seccionNube(c.nube)}
    <p class="nota acerca">shabit · sin cuentas con nombre ni email: tus datos van ligados a un código anónimo.</p>`;
}

function hace(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

const COPIA = `<details class="plegable">
      <summary>Copia en un archivo</summary>
      <p class="nota">Un archivo con todos tus hábitos, por si quieres guardarlo tú en Archivos o iCloud Drive.</p>
      <div class="fila-botones">
        <button class="boton boton--suave" data-accion="exportar">Guardar copia</button>
        <label class="boton boton--suave">Recuperar copia<input type="file" accept="application/json,.json" data-accion="importar" class="oculto"></label>
      </div>
      <p class="nota" id="estado-copia" role="status"></p>
    </details>`;

function seccionNube(n) {
  if (!n.activa) {
    return `<section class="tarjeta nube">
      <h2 class="tarjeta__titulo">${icono("ui-nube")}Tus datos</h2>
      <p class="nube__estado nube__estado--aviso">Solo en este móvil</p>
      <p class="nota">Si los guardas en SBD, la base de datos de shabit, no los perderás si cambias de móvil y podrás recibir recordatorios.</p>
      <button class="boton boton--principal ancho-hoja espacio" data-accion="reactivar-nube">Guardar en SBD</button>
      ${COPIA}
    </section>`;
  }
  const estado = n.error === "sin-conexion" || !n.enLinea ? ["aviso", "Sin conexión: se guardará al volver."]
    : n.error ? ["aviso", "El servidor no responde; se volverá a intentar."]
    : n.codigo && n.ultimo ? ["ok", `A salvo · guardado ${hace(n.ultimo)}`]
    : ["aviso", "Guardando…"];
  const codigo = n.codigo ?? "";
  return `<section class="tarjeta nube">
    <h2 class="tarjeta__titulo">${icono("ui-nube")}Tus datos</h2>
    <p class="nube__estado nube__estado--${estado[0]}" role="status">${estado[1]} <button class="enlace" data-accion="sincronizar-ahora">Guardar ahora</button></p>
    <p class="nota">Se guardan solos en SBD, la base de datos de shabit, con un código anónimo: sin nombre ni email.</p>
    <details class="plegable"${n.ver || n.qr || n.errorCodigo ? " open" : ""}>
      <summary>Pasar a otro móvil</summary>
      ${codigo ? `<ol class="pasos-lista">
        <li>En el otro móvil, abre shabit.</li>
        <li>Enfoca este QR con su cámara, o copia el código y pégalo allí en Ajustes › Tus datos.</li>
      </ol>
      <button class="boton boton--suave boton--peque" data-accion="mostrar-qr">${n.qr ? "Ocultar el QR" : "Mostrar el QR"}</button>
      ${n.qr ? `<div class="qr">${qr(`${location.origin}/app/#/vincular/${codigo}`)}</div>` : ""}
      <div class="codigo"><code>${n.ver ? esc(codigo) : "•".repeat(12) + esc(codigo.slice(-4))}</code>
        <button class="boton boton--suave boton--peque" data-accion="mostrar-codigo">${n.ver ? "Ocultar" : "Ver"}</button>
        <button class="boton boton--suave boton--peque" data-accion="copiar-codigo">Copiar</button></div>
      <p class="nota">Guárdalo en un sitio seguro: quien lo tenga puede ver tus hábitos.</p>` : `<p class="nota">En cuanto se guarden tus hábitos aparecerá aquí el código.</p>`}
      <h3 class="nube__sub">¿Vienes de otro móvil?</h3>
      <div class="fila-campos fila-campos--codigo">
        <label class="oculto" for="codigo-otro">Código del otro móvil</label>
        <input id="codigo-otro" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Pega aquí su código">
        <button class="boton boton--principal boton--peque" data-accion="vincular">Usar</button>
      </div>
      ${n.errorCodigo ? `<p class="error">${esc(n.errorCodigo)}</p>` : ""}
    </details>
    ${COPIA}
    <button class="enlace enlace--peligro" data-accion="borrar-nube">Borrar mis datos del servidor</button>
  </section>`;
}

export const mesDe = (dia) => { const f = fechaDe(dia); return { y: f.getFullYear(), m: f.getMonth() }; };
export { diaSemana };
