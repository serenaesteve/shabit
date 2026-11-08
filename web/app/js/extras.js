// Estadísticas, mapa del año, informe imprimible, exportar a CSV, imagen para compartir,
// QR del código y la pantalla de solo lectura del compañero.
import { diaSemana, fechaDe, fechaLarga, inicial, inicialDeIndice, inicioSemana, miles, nombreMes } from "./fecha.js";
import { ficha, limitesMes, mesDeDia, tipoDe, tocaDia } from "./progreso.js";
import { colorDisco, mezclar, varsColor } from "./dibujo.js";
import { icono } from "./iconos.js";
import qrcode from "./qrcode.js";

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mayus = (t) => t.replace(/^./, (x) => x.toUpperCase());
const DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

/* ------------------------------------------------------------------ estadísticas */
/** Días que tocaban y días hechos de un hábito entre dos fechas (sin contar descansos ni pausas). */
function cuenta(f, desde, hasta) {
  let tocan = 0, hechos = 0;
  for (let d = Math.max(desde, f.habito.creado); d <= hasta; d++) {
    const t = tipoDe(f, d);
    if (t === "D" || f.libres.has(d)) continue;
    if (!tocaDia(f.habito, d) && t !== "H") continue;
    tocan++;
    if (t === "H") hechos++;
  }
  return { tocan, hechos };
}

export function estadisticas(f, hoy, datos) {
  const h = f.habito;
  const desde = Math.max(h.creado, hoy - 180);
  // Mejor día de la semana (los últimos 6 meses)
  const porDia = Array.from({ length: 7 }, () => ({ tocan: 0, hechos: 0 }));
  for (let d = desde; d <= hoy; d++) {
    const t = tipoDe(f, d);
    if (t === "D" || f.libres.has(d) || (!tocaDia(h, d) && t !== "H")) continue;
    const x = porDia[diaSemana(d)];
    x.tocan++; if (t === "H") x.hechos++;
  }
  const candidatos = porDia.map((x, i) => ({ i, ...x, p: x.tocan >= 3 ? x.hechos / x.tocan : -1 })).filter((x) => x.p >= 0);
  const mejor = candidatos.sort((a, b) => b.p - a.p)[0];
  // Hora habitual (mediana de las horas a las que se marcó)
  const horas = Object.values(datos.horas?.[h.id] || {}).map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))).sort((a, b) => a - b);
  const mediana = horas.length >= 3 ? horas[Math.floor(horas.length / 2)] : null;
  // Últimos 6 meses
  const meses = [];
  const actual = mesDeDia(hoy);
  for (let m = actual - 5; m <= actual; m++) {
    const [a, b] = limitesMes(m);
    if (b < h.creado) continue;
    const c = cuenta(f, a, Math.min(b, hoy));
    meses.push({ m, nombre: nombreMes(m % 12).slice(0, 3), p: c.tocan ? c.hechos / c.tocan : 0, ...c });
  }
  return {
    mejorDia: mejor && mejor.p > 0 ? { nombre: DIAS[mejor.i], p: mejor.p } : null,
    hora: mediana === null ? null : `${String(Math.floor(mediana / 60)).padStart(2, "0")}:${String(mediana % 60).padStart(2, "0")}`,
    meses,
  };
}

export function bloqueEstadisticas(f, hoy, datos) {
  const e = estadisticas(f, hoy, datos);
  const filas = [];
  if (e.mejorDia) filas.push(`<div><dt>Tu mejor día</dt><dd>Los ${e.mejorDia.nombre} (${Math.round(e.mejorDia.p * 100)} %)</dd></div>`);
  if (e.hora) filas.push(`<div><dt>Sueles hacerlo</dt><dd>Hacia las ${e.hora}</dd></div>`);
  const barras = e.meses.map((m) => `<li><span class="barra-dia" title="${m.hechos} de ${m.tocan}"><span style="height:${Math.round(m.p * 100)}%;background:var(--c)"></span></span><span class="dia__letra">${m.nombre}</span></li>`).join("");
  return `<section class="tarjeta" style="${varsColor(f.habito.color)}">
    <h2 class="tarjeta__titulo">Estadísticas</h2>
    ${filas.length ? `<dl class="estadisticas">${filas.join("")}</dl>` : `<p class="nota">Con unas semanas más de datos verás tu mejor día y a qué hora sueles hacerlo.</p>`}
    ${e.meses.length > 1 ? `<h3 class="subtitulo">Por meses</h3><ol class="barras barras--meses" aria-label="Porcentaje cumplido cada mes">${barras}</ol>` : ""}
  </section>`;
}

/** Mejor día de la semana sumando todos los hábitos. */
export function mejorDiaGlobal(fichas, hoy) {
  const porDia = Array.from({ length: 7 }, () => ({ tocan: 0, hechos: 0 }));
  for (const f of fichas) {
    if (f.habito.porMes) continue;
    for (let d = Math.max(f.habito.creado, hoy - 120); d <= hoy; d++) {
      const t = tipoDe(f, d);
      if (t === "D" || f.libres.has(d) || (!tocaDia(f.habito, d) && t !== "H")) continue;
      porDia[diaSemana(d)].tocan++;
      if (t === "H") porDia[diaSemana(d)].hechos++;
    }
  }
  const m = porDia.map((x, i) => ({ i, p: x.tocan >= 5 ? x.hechos / x.tocan : -1 })).sort((a, b) => b.p - a.p)[0];
  return m && m.p > 0 ? { nombre: DIAS[m.i], p: m.p } : null;
}

/* ------------------------------------------------------------------ mapa del año */
/** Un cuadrito por día de las últimas 53 semanas. Con varios hábitos, el color dice cuánto se cumplió. */
export function mapaAño(fichas, hoy, primer, color = "#3FB06A") {
  const fin = inicioSemana(hoy, primer) + 6;
  const inicio = fin - 53 * 7 + 1;
  const tam = 11, hueco = 2;
  let s = `<svg class="mapa" viewBox="0 0 ${53 * (tam + hueco)} ${7 * (tam + hueco) + 14}" role="img" aria-label="Último año">`;
  let mesAnterior = -1;
  for (let col = 0; col < 53; col++) {
    const lunes = inicio + col * 7;
    const m = fechaDe(lunes).getMonth();
    if (m !== mesAnterior) { s += `<text x="${col * (tam + hueco)}" y="9" class="mapa__mes">${nombreMes(m).slice(0, 3)}</text>`; mesAnterior = m; }
    for (let fila = 0; fila < 7; fila++) {
      const d = lunes + fila;
      const x = col * (tam + hueco), y = 14 + fila * (tam + hueco);
      if (d > hoy) continue;
      let tocan = 0, hechos = 0;
      for (const f of fichas) {
        if (d < f.habito.creado) continue;
        const t = tipoDe(f, d);
        if (t === "D" || f.libres.has(d) || (!tocaDia(f.habito, d) && t !== "H")) continue;
        tocan++; if (t === "H") hechos++;
      }
      const p = tocan ? hechos / tocan : -1;
      const relleno = p < 0 ? "var(--superficie-2)" : p === 0 ? "var(--borde)" : mezclar(color, "#ffffff", 0.75 - p * 0.75);
      s += `<rect x="${x}" y="${y}" width="${tam}" height="${tam}" rx="2.5" fill="${relleno}"><title>${esc(fechaLarga(d))}${tocan ? `: ${hechos} de ${tocan}` : ""}</title></rect>`;
    }
  }
  return s + `</svg>`;
}

/* ------------------------------------------------------------------ informe imprimible y CSV */
export function vistaInforme(c) {
  const { fichas, hoy, datos } = c;
  const f = fechaDe(hoy);
  const filas = fichas.map((x) => {
    const u = x.enMeses ? "meses" : x.rachaEnDias ? "días" : "semanas";
    return `<tr><th scope="row">${esc(x.habito.nombre)}</th><td>${x.racha} ${u}</td><td>${x.mejorRacha} ${u}</td><td>${x.total}</td><td>${x.constancia === null ? "—" : `${Math.round(x.constancia * 100)} %`}</td></tr>`;
  }).join("");
  return `<div class="no-imprimir"><a class="volver" href="#/progreso" data-accion="atras">${icono("ui-izquierda")}<span>Volver</span></a></div>
    <h1 class="titulo-pantalla">Informe</h1>
    <p class="nota">${mayus(fechaLarga(hoy))} de ${f.getFullYear()}</p>
    <div class="fila-botones no-imprimir">
      <button class="boton boton--principal" data-accion="imprimir">${icono("escribir")}Guardar en PDF</button>
      <button class="boton boton--suave" data-accion="exportar-csv">Exportar CSV</button>
    </div>
    <p class="nota no-imprimir">«Guardar en PDF» abre la impresión: elige «Guardar como PDF». El CSV se abre con Excel o Numbers.</p>
    <section class="tarjeta">
      <h2 class="tarjeta__titulo">Tu año</h2>
      ${mapaAño(fichas, hoy, datos.ajustes.primer)}
    </section>
    <section class="tarjeta">
      <h2 class="tarjeta__titulo">Tus hábitos</h2>
      <table class="tabla-informe"><thead><tr><th scope="col">Hábito</th><th scope="col">Racha</th><th scope="col">Mejor</th><th scope="col">Días hechos</th><th scope="col">Constancia</th></tr></thead><tbody>${filas}</tbody></table>
    </section>`;
}

export function csv(datos) {
  const filas = [["fecha", "habito", "estado", "cantidad", "hora", "nota"]];
  const estado = { H: "hecho", D: "descanso", R: "recaída" };
  for (const h of datos.habitos) {
    const dias = new Set([...Object.keys(datos.registros[h.id] || {}), ...Object.keys(datos.progreso?.[h.id] || {}), ...Object.keys(datos.notas?.[h.id] || {})]);
    for (const d of [...dias].map(Number).sort((a, b) => a - b)) {
      const f = fechaDe(d);
      const p = datos.progreso?.[h.id]?.[d];
      filas.push([`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`, h.nombre,
        estado[datos.registros[h.id]?.[d]] ?? "", p == null ? "" : h.tipo === "tiempo" ? `${Math.round(p / 60)} min` : String(p),
        datos.horas?.[h.id]?.[d] ?? "", datos.notas?.[h.id]?.[d] ?? ""]);
    }
  }
  return "﻿" + filas.map((r) => r.map((v) => (/[";\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(";")).join("\r\n");
}

/* ------------------------------------------------------------------ imagen para compartir */
export async function imagenProgreso({ titulo, cifra, unidad, detalle, color, semana }) {
  await document.fonts?.ready;
  const W = 1080, H = 1350;
  const cv = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const g = cv.getContext("2d");
  g.fillStyle = "#F6F5F2"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#FFFFFF";
  const tarjeta = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  tarjeta(80, 200, W - 160, 900, 60);
  g.fillStyle = color; g.beginPath(); g.arc(W / 2, 360, 90, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#fff"; g.lineWidth = 22; g.lineCap = g.lineJoin = "round";
  g.beginPath(); g.moveTo(W / 2 - 42, 362); g.lineTo(W / 2 - 10, 394); g.lineTo(W / 2 + 46, 330); g.stroke();
  g.fillStyle = "#1C1D21"; g.textAlign = "center";
  g.font = "900 64px Nunito, system-ui, sans-serif"; g.fillText(titulo, W / 2, 560, W - 240);
  g.font = "900 220px Nunito, system-ui, sans-serif"; g.fillStyle = color; g.fillText(cifra, W / 2, 790);
  g.font = "800 52px Nunito, system-ui, sans-serif"; g.fillStyle = "#1C1D21"; g.fillText(unidad, W / 2, 870);
  g.font = "600 40px Nunito, system-ui, sans-serif"; g.fillStyle = "#5D616B"; g.fillText(detalle, W / 2, 940, W - 240);
  if (semana) {
    semana.forEach((hecho, i) => {
      const x = W / 2 - 3 * 92 + i * 92;
      g.beginPath(); g.arc(x, 1030, 30, 0, Math.PI * 2);
      g.fillStyle = hecho ? color : "#EFEDE8"; g.fill();
    });
  }
  g.font = "900 56px Nunito, system-ui, sans-serif"; g.fillStyle = "#1C1D21"; g.fillText("shabit", W / 2, 1210);
  g.font = "600 34px Nunito, system-ui, sans-serif"; g.fillStyle = "#5D616B"; g.fillText("shabit.serenaesteve.com", W / 2, 1262);
  return new Promise((r) => cv.toBlob(r, "image/png"));
}

/** Comparte una imagen (o la descarga si el navegador no puede compartir archivos). */
export async function compartirImagen(blob, nombre) {
  const archivo = new File([blob], nombre, { type: "image/png" });
  if (navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: "Mi progreso en shabit" }); return "compartida"; } catch { return "cancelada"; }
  }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "descargada";
}

/* ------------------------------------------------------------------ QR */
export function qr(texto) {
  const q = qrcode(0, "M");
  q.addData(texto);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

/* ------------------------------------------------------------------ compañero (solo lectura) */
export function vistaVer(datos, hoy) {
  if (!datos) return `<h1 class="titulo-pantalla">Progreso compartido</h1><p class="tarjeta nota">Cargando…</p>`;
  if (datos.error) return `<h1 class="titulo-pantalla">Progreso compartido</h1><p class="tarjeta nota">${esc(datos.error)}</p>
    <a class="boton boton--principal ancho" href="#/hoy">Crear mi propia rutina</a>`;
  const primer = datos.primer ?? 1;
  const fichas = datos.habitos.map((h) => ficha({ ...h, avisos: [], pausas: h.pausas || [] }, datos.registros[h.id], hoy, primer));
  const tarjetas = fichas.map((f) => {
    const h = f.habito;
    let semana = "";
    for (let atras = 6; atras >= 0; atras--) {
      const d = hoy - atras, t = tipoDe(f, d);
      semana += `<li><span class="semana__letra">${inicial(d)}</span><i class="p${t === "H" ? " p--h" : t === "D" ? " p--d" : t === "R" ? " p--r" : ""}"></i></li>`;
    }
    const u = f.enMeses ? "meses" : f.rachaEnDias ? (f.evitar ? "días sin" : "días") : "semanas";
    return `<li class="tarjeta" style="${varsColor(h.color)}">
      <div class="tarjeta__cab"><span class="insignia">${icono(h.icono)}</span><span class="habito__textos"><span class="habito__nombre">${esc(h.nombre)}</span>
      <span class="habito__sub">${icono("llama", "ico--mini")}${f.racha} ${u} · ${f.periodo.n} de ${f.periodo.de} ${f.periodo.texto}</span></span></div>
      <ol class="semana-mini">${semana}</ol></li>`;
  }).join("");
  return `<header class="cabecera"><div><p class="fecha">Solo lectura</p><h1>Progreso compartido</h1></div></header>
    <p class="nota">Alguien te ha enseñado cómo van sus hábitos. ¡Anímale!</p>
    <ul class="lista lista--ver">${tarjetas || `<li class="tarjeta nota">Aún no tiene hábitos.</li>`}</ul>
    <a class="boton boton--suave ancho" href="#/hoy">Crear mi propia rutina</a>`;
}

export { inicialDeIndice, miles, colorDisco };
