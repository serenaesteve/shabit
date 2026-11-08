// Rachas, objetivo semanal y constancia. Es la misma lógica que dominio/Progreso.kt de la
// app Android: los días de descanso no cuentan como cumplidos, pero tampoco rompen la racha,
// y rebajan el objetivo de su semana.
import { diaSemana, inicioSemana } from "./fecha.js";

/** ¿Le toca a este hábito ese día? Los de «días concretos» solo esos días; los pausados, ninguno. */
export const conDiasConcretos = (h) => Array.isArray(h.dias) && h.dias.length > 0 && h.dias.length < 7;
export const enPausa = (h, dia) => (h.pausas || []).some(([desde, hasta]) => dia >= desde && (hasta == null || dia <= hasta));
export const tocaDia = (h, dia) => !enPausa(h, dia) && (!conDiasConcretos(h) || h.dias.includes(diaSemana(dia)));
export const porMes = (h) => Number.isInteger(h.porMes) && h.porMes > 0;

/** Mes (año*12+mes) de un día de época, y su primer y último día. */
export const mesDeDia = (dia) => { const f = new Date(dia * 86400000); return f.getUTCFullYear() * 12 + f.getUTCMonth(); };
export const limitesMes = (m) => {
  const desde = Math.floor(Date.UTC(Math.floor(m / 12), m % 12, 1) / 86400000);
  return [desde, Math.floor(Date.UTC(Math.floor(m / 12), m % 12 + 1, 1) / 86400000) - 1];
};

export const contarEntre = (dias, desde, hasta) => {
  let n = 0;
  for (const d of dias) if (d >= desde && d <= hasta) n++;
  return n;
};

export const hechasEstaSemana = (hechos, hoy, primer) => {
  const ini = inicioSemana(hoy, primer);
  return contarEntre(hechos, ini, ini + 6);
};

/** Días seguidos hasta hoy. Si hoy aún no está marcado, se cuenta desde ayer. */
export function rachaDias(hechos, descansos, hoy) {
  let d = hoy;
  if (!hechos.has(d) && !descansos.has(d)) d -= 1;
  let n = 0;
  for (;;) {
    if (hechos.has(d)) n++;
    else if (!descansos.has(d)) return n;
    d--;
  }
}

export function mejorRachaDias(hechos, descansos) {
  let mejor = 0, actual = 0, anterior = -Infinity;
  for (const d of [...new Set([...hechos, ...descansos])].sort((a, b) => a - b)) {
    if (d !== anterior + 1) actual = 0;
    if (hechos.has(d)) actual++;
    if (actual > mejor) mejor = actual;
    anterior = d;
  }
  return mejor;
}

export const inicioEfectivo = (hechos, descansos, creado) =>
  Math.min(creado, ...hechos, ...descansos);

/** Objetivo exigible en la semana que empieza en `ini`; null si no tenía ningún día disponible. */
export function objetivoDeSemana(ini, inicio, objetivo, descansos) {
  const desde = Math.max(ini, inicio);
  const hasta = ini + 6;
  if (desde > hasta) return null;
  const disponibles = hasta - desde + 1 - contarEntre(descansos, desde, hasta);
  return disponibles <= 0 ? null : Math.min(objetivo, disponibles);
}

function cumplida(ini, hechos, descansos, inicio, objetivo) {
  const meta = objetivoDeSemana(ini, inicio, objetivo, descansos);
  if (meta === null) return null;
  return contarEntre(hechos, ini, ini + 6) >= meta;
}

export function rachaSemanas(hechos, descansos, hoy, objetivo, primer, creado) {
  const inicio = inicioEfectivo(hechos, descansos, creado);
  let ini = inicioSemana(hoy, primer);
  let n = 0;
  if (cumplida(ini, hechos, descansos, inicio, objetivo) === true) n++;
  ini -= 7;
  while (ini + 6 >= inicio) {
    const c = cumplida(ini, hechos, descansos, inicio, objetivo);
    if (c === true) n++;
    else if (c === false) return n;
    ini -= 7;
  }
  return n;
}

export function mejorRachaSemanas(hechos, descansos, hoy, objetivo, primer, creado) {
  const inicio = inicioEfectivo(hechos, descansos, creado);
  let ini = inicioSemana(inicio, primer);
  const ultima = inicioSemana(hoy, primer);
  let mejor = 0, actual = 0;
  while (ini <= ultima) {
    const c = cumplida(ini, hechos, descansos, inicio, objetivo);
    if (c === true) { actual++; if (actual > mejor) mejor = actual; }
    else if (c === false && ini !== ultima) actual = 0;
    ini += 7;
  }
  return mejor;
}

/** Semanas cumplidas entre las últimas `semanas`; la actual solo cuenta si ya está cumplida. */
export function constancia(hechos, descansos, hoy, objetivo, primer, creado, semanas = 12) {
  const inicio = inicioEfectivo(hechos, descansos, creado);
  const actual = inicioSemana(hoy, primer);
  let cumplidas = 0, medidas = 0;
  for (let k = 0; k < semanas; k++) {
    const ini = actual - 7 * k;
    if (ini + 6 < inicio) break;
    const ok = cumplida(ini, hechos, descansos, inicio, objetivo);
    if (ok === null) continue;
    if (k === 0 && !ok) continue;
    medidas++;
    if (ok) cumplidas++;
  }
  return medidas === 0 ? null : cumplidas / medidas;
}

/**
 * Un hábito con todo su progreso calculado. Con «días concretos», los días que no tocan
 * se tratan como descansos: no cuentan, pero tampoco rompen la racha ni el objetivo.
 */
export function ficha(habito, registros, hoy, primer) {
  const hechos = new Set(), descansos = new Set(), recaidas = new Set();
  for (const [dia, tipo] of Object.entries(registros || {})) (tipo === "H" ? hechos : tipo === "R" ? recaidas : descansos).add(Number(dia));
  const evitar = habito.tipo === "evitar";
  const libres = new Set(descansos);
  const desde0 = inicioEfectivo(hechos, descansos, habito.creado);
  const finSemana = inicioSemana(hoy, primer) + 6;
  // Días en pausa: ni cuentan ni rompen nada.
  for (const [a, b] of habito.pausas || []) for (let d = Math.max(a, desde0); d <= Math.min(b ?? finSemana, finSemana); d++) if (!hechos.has(d)) libres.add(d);
  if (evitar) {
    // Dejar algo: cada día sin recaída cuenta como hecho (hoy también, mientras no recaigas).
    for (let d = habito.creado; d <= hoy; d++) if (!recaidas.has(d) && !libres.has(d)) hechos.add(d);
  }
  const concretos = conDiasConcretos(habito);
  const o = evitar ? 7 : concretos ? habito.dias.length : habito.objetivo;
  if (concretos) {
    for (let d = desde0; d <= finSemana; d++) if (!habito.dias.includes(diaSemana(d)) && !hechos.has(d)) libres.add(d);
  }
  const inicio = inicioEfectivo(hechos, descansos, habito.creado);
  const base = { habito, hechos, descansos, recaidas, libres, objetivo: o, total: hechos.size, metaCumplida: hechos.size >= habito.meta, inicio, evitar };

  if (porMes(habito)) {
    // N veces al mes: las rachas y la constancia se miden en meses.
    const actual = mesDeDia(hoy);
    const cumplido = (m) => { const [a, b] = limitesMes(m); return contarEntre(hechos, a, b) >= habito.porMes; };
    const primerMes = mesDeDia(inicio);
    let racha = cumplido(actual) ? 1 : 0;
    for (let m = actual - 1; m >= primerMes && cumplido(m); m--) racha++;
    let mejor = 0, seguidos = 0;
    for (let m = primerMes; m <= actual; m++) { if (cumplido(m)) { seguidos++; mejor = Math.max(mejor, seguidos); } else if (m !== actual) seguidos = 0; }
    let medidos = 0, ok = 0;
    for (let m = actual; m > actual - 6 && m >= primerMes; m--) { if (m === actual && !cumplido(m)) continue; medidos++; if (cumplido(m)) ok++; }
    const [a, b] = limitesMes(actual);
    const n = contarEntre(hechos, a, b);
    return { ...base, unidad: "mes", rachaEnDias: false, enMeses: true, racha, mejorRacha: mejor,
      constancia: medidos ? ok / medidos : null, estaSemana: n, objetivoSemana: habito.porMes, semanaCumplida: n >= habito.porMes,
      periodo: { n, de: habito.porMes, texto: "este mes" } };
  }

  const enDias = o >= 7 || concretos || evitar;
  const estaSemana = hechasEstaSemana(hechos, hoy, primer);
  const objetivoSemana = objetivoDeSemana(inicioSemana(hoy, primer), inicio, o, libres);
  return {
    ...base, estaSemana, objetivoSemana, rachaEnDias: enDias,
    racha: enDias ? rachaDias(hechos, libres, hoy) : rachaSemanas(hechos, libres, hoy, o, primer, habito.creado),
    mejorRacha: enDias ? mejorRachaDias(hechos, libres) : mejorRachaSemanas(hechos, libres, hoy, o, primer, habito.creado),
    constancia: constancia(hechos, libres, hoy, o, primer, habito.creado),
    semanaCumplida: objetivoSemana !== null && estaSemana >= objetivoSemana,
    periodo: { n: estaSemana, de: objetivoSemana ?? o, texto: "esta semana" },
  };
}

/** Estado de un reto (si el hábito lo es): día en que va, si ha terminado y si lo ha superado. */
export function reto(f, hoy) {
  const h = f.habito;
  if (!h.reto) return null;
  const inicio = h.inicioReto ?? h.creado;
  const fin = inicio + h.reto - 1;
  const dia = Math.min(h.reto, hoy - inicio + 1);
  const hechos = contarEntre(f.hechos, inicio, Math.min(fin, hoy));
  const necesarios = f.evitar ? h.reto : Math.ceil((h.reto * Math.min(f.objetivo, 7)) / 7);
  const libres = contarEntre(f.libres, inicio, fin);
  const superado = f.evitar ? hoy > fin && !contarEntre(f.recaidas, inicio, fin) : hechos >= Math.max(1, necesarios - libres);
  return { dia, dias: h.reto, fin, terminado: hoy > fin, hechos, superado };
}

/** Un día está completo si todos los hábitos que tocaban están hechos o en descanso, y al menos uno hecho. */
export function diaCompleto(habitos, registros, dia) {
  const tocan = habitos.filter((h) => !h.archivado && h.creado <= dia && tocaDia(h, dia) && !porMes(h));
  if (!tocan.length) return false;
  let alguno = false;
  for (const h of tocan) {
    const t = registros[h.id]?.[dia];
    if (h.tipo === "evitar") { if (t === "R") return false; alguno = true; continue; }
    if (!t || t === "R") return false;
    if (t === "H") alguno = true;
  }
  return alguno;
}

/** Días completos seguidos hasta hoy (si hoy aún no está completo, se cuenta desde ayer). */
export function rachaDiasCompletos(habitos, registros, hoy) {
  if (!habitos.length) return 0;
  const primero = Math.min(...habitos.map((h) => h.creado));
  let d = diaCompleto(habitos, registros, hoy) ? hoy : hoy - 1;
  let n = 0;
  while (d >= primero && diaCompleto(habitos, registros, d)) { n++; d--; }
  return n;
}

export const tipoDe = (f, dia) => (f.recaidas?.has(dia) ? "R" : f.hechos.has(dia) ? "H" : f.descansos.has(dia) ? "D" : null);
