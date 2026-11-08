// Pruebas de la lógica de la web app: las mismas que ProgresoTest.kt y PasosTest de Android.
import * as P from "/app/js/progreso.js";
import { diaDe, inicioSemana, miles } from "/app/js/fecha.js";
import { DetectorPasos, sumarPasos, pasosDeHoy } from "/app/js/pasos.js";

const resultados = [];
const prueba = (nombre, f) => { try { f(); resultados.push([nombre, null]); } catch (e) { resultados.push([nombre, e.message]); } };
const igual = (a, b, m = "") => { if (a !== b) throw new Error(`${m} esperaba ${b} y salió ${a}`); };

const d = (y, m, dia) => diaDe(new Date(y, m - 1, dia));
const hoy = d(2026, 11, 6); // viernes
const S = (...xs) => new Set(xs);
const atras = (...n) => new Set(n.map((k) => hoy - k));
const nada = new Set();
const oct = (dia) => d(2026, 10, dia);

prueba("inicio de semana", () => {
  igual(inicioSemana(hoy, 1), d(2026, 11, 2), "lunes");
  igual(inicioSemana(hoy, 0), d(2026, 11, 1), "domingo");
});
prueba("racha de días desde hoy", () => igual(P.rachaDias(atras(0, 1, 2, 4), nada, hoy), 3));
prueba("racha viva si hoy aún no está", () => { igual(P.rachaDias(atras(1, 2), nada, hoy), 2); igual(P.rachaDias(atras(2, 3), nada, hoy), 0); });
prueba("descanso no rompe ni suma", () => { igual(P.rachaDias(atras(0, 2, 3), atras(1), hoy), 3); igual(P.rachaDias(atras(1, 2), atras(0), hoy), 2); });
prueba("mejor racha salta descansos", () => {
  igual(P.mejorRachaDias(atras(0, 2, 3, 4, 5, 9, 10), nada), 4);
  igual(P.mejorRachaDias(atras(0, 2, 3, 4, 5, 7), atras(1, 6)), 6);
  igual(P.mejorRachaDias(nada, nada), 0);
});
prueba("hechas esta semana", () => igual(P.hechasEstaSemana(atras(0, 2, 4, 5), hoy, 1), 3));
prueba("descansos rebajan el objetivo", () => {
  const lunes = d(2026, 10, 26), inicio = oct(1);
  igual(P.objetivoDeSemana(lunes, inicio, 5, nada), 5);
  igual(P.objetivoDeSemana(lunes, inicio, 5, S(oct(26), oct(27), oct(28))), 4);
  igual(P.objetivoDeSemana(lunes, inicio, 5, S(oct(26), oct(27), oct(28), oct(29), oct(30), oct(31), d(2026, 11, 1))), null);
});
prueba("vacaciones no rompen la racha de semanas", () => {
  const hechos = S(oct(12), oct(14), oct(16), d(2026, 11, 2), d(2026, 11, 4), d(2026, 11, 6), oct(26), oct(28), oct(30));
  const desc = S(...[19, 20, 21, 22, 23, 24, 25].map(oct));
  igual(P.rachaSemanas(hechos, desc, hoy, 3, 1, oct(12)), 3);
  igual(P.mejorRachaSemanas(hechos, desc, hoy, 3, 1, oct(12)), 3);
});
prueba("semana en curso no rompe la racha", () => {
  const h = S(...[12, 19, 26].flatMap((l) => [oct(l), oct(l + 2), oct(l + 4)]), d(2026, 11, 3));
  igual(P.rachaSemanas(h, nada, hoy, 3, 1, oct(12)), 3);
});
prueba("semana de creación incompleta", () => {
  const h = S(oct(31), d(2026, 11, 1));
  igual(P.rachaSemanas(h, nada, hoy, 5, 1, oct(31)), 1);
  igual(P.constancia(h, nada, hoy, 5, 1, oct(31)), 1);
});
prueba("constancia", () => {
  igual(P.constancia(S(oct(19), oct(20), oct(28)), nada, hoy, 2, 1, oct(19)), 0.5);
  igual(P.constancia(nada, nada, hoy, 3, 1, hoy), null);
});
prueba("pasos: cambio de día", () => {
  let e = sumarPasos(null, 10, hoy); e = sumarPasos(e, 5, hoy);
  igual(pasosDeHoy(e, hoy), 15); igual(pasosDeHoy(e, hoy + 1), 0); igual(pasosDeHoy(sumarPasos(e, 1, hoy + 1), hoy + 1), 1);
});
prueba("detector: 2 pasos/s durante 10 s", () => {
  const det = new DetectorPasos(); let n = 0;
  for (let i = 0; i < 500; i++) { const t = i * 20; if (det.muestra(0, 0, 9.81 + 3.2 * Math.sin(2 * Math.PI * 2 * t / 1000), t)) n++; }
  if (n < 19 || n > 21) throw new Error(`contados ${n}`);
});
prueba("detector: quieto", () => {
  const det = new DetectorPasos(); let n = 0;
  for (let i = 0; i < 500; i++) if (det.muestra(0.1, 0.2, 9.8 + (i % 3) * 0.05, i * 20)) n++;
  igual(n, 0);
});
prueba("miles", () => { igual(miles(8000), "8.000"); igual(miles(12345), "12.345"); igual(miles(950), "950"); });

window.resultados = resultados;

// Días concretos (p. ej. lunes, miércoles y viernes): los demás días no rompen la racha.
import { ficha as fichaDe, diaCompleto, rachaDiasCompletos } from "/app/js/progreso.js";
prueba("días concretos: la racha salta los días que no tocan", () => {
  const lun = d(2026, 11, 2), mie = d(2026, 11, 4), vie = hoy, lunAnt = d(2026, 10, 26), mieAnt = d(2026, 10, 28), vieAnt = d(2026, 10, 30);
  const h = { id: 1, objetivo: 3, dias: [1, 3, 5], creado: lunAnt, meta: 66 };
  const reg = Object.fromEntries([lunAnt, mieAnt, vieAnt, lun, mie, vie].map((x) => [x, "H"]));
  const f = fichaDe(h, reg, hoy, 1);
  igual(f.racha, 6, "racha");
  igual(f.objetivoSemana, 3, "objetivo de la semana");
  igual(f.semanaCumplida, true, "semana cumplida");
  const reg2 = { ...reg }; delete reg2[mie];
  igual(fichaDe(h, reg2, hoy, 1).racha, 1, "fallar un día que toca rompe la racha");
});
prueba("días completos seguidos", () => {
  const habitos = [{ id: 1, creado: hoy - 10 }, { id: 2, creado: hoy - 10, dias: [1, 3, 5] }];
  const registros = { 1: { [hoy]: "H", [hoy - 1]: "H", [hoy - 2]: "D" }, 2: { [hoy]: "H", [hoy - 2]: "H" } };
  // hoy viernes (toca 2), ayer jueves (no toca 2), anteayer miércoles (toca 2): 1 en descanso y 2 hecho
  igual(diaCompleto(habitos, registros, hoy), true, "hoy");
  igual(diaCompleto(habitos, registros, hoy - 1), true, "ayer");
  igual(rachaDiasCompletos(habitos, registros, hoy), 3, "racha");
});

// Dejar algo, pausas, veces al mes y retos
import { ficha as f2, reto as retoDe, tocaDia as toca2, diaCompleto as completo2 } from "/app/js/progreso.js";
prueba("dejar algo: cuenta los días sin recaer", () => {
  const h = { id: 1, tipo: "evitar", creado: hoy - 10, meta: 30, objetivo: 7 };
  const f = f2(h, { [hoy - 4]: "R" }, hoy, 1);
  igual(f.racha, 4, "racha desde la recaída");
  igual(f.mejorRacha, 6, "mejor racha");
  igual(f.total, 10, "días sin");
  igual(P.tipoDe(f, hoy - 4), "R", "recaída");
  igual(completo2([h], { 1: {} }, hoy), true, "un día sin recaída completa el día");
  igual(completo2([h], { 1: { [hoy]: "R" } }, hoy), false, "con recaída no");
});
prueba("pausa: no rompe la racha ni aparece en Hoy", () => {
  const h = { id: 1, objetivo: 7, creado: hoy - 20, meta: 66, pausas: [[hoy - 2, hoy - 1]] };
  const f = f2(h, { [hoy - 5]: "H", [hoy - 4]: "H", [hoy - 3]: "H", [hoy]: "H" }, hoy, 1);
  igual(f.racha, 4, "racha que salta la pausa");
  igual(toca2(h, hoy - 1), false, "en pausa no toca");
  igual(toca2({ ...h, pausas: [[hoy - 2, null]] }, hoy + 30), false, "pausa sin fin");
});
prueba("veces al mes: la racha va por meses", () => {
  const oct = (dia) => d(2026, 10, dia), nov = (dia) => d(2026, 11, dia);
  const h = { id: 1, porMes: 4, objetivo: 1, creado: oct(1), meta: 66 };
  const reg = Object.fromEntries([oct(3), oct(9), oct(15), oct(20), nov(2), nov(4)].map((x) => [x, "H"]));
  let f = f2(h, reg, hoy, 1);
  igual(f.racha, 1, "octubre cumplido; noviembre aún no");
  igual(f.periodo.n, 2, "2 este mes");
  f = f2(h, { ...reg, [nov(5)]: "H", [nov(6)]: "H" }, hoy, 1);
  igual(f.racha, 2, "con noviembre cumplido, 2 meses");
});
prueba("reto de 7 días", () => {
  const h = { id: 1, objetivo: 7, creado: hoy - 6, meta: 66, reto: 7 };
  const reg = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((k) => [hoy - k, "H"]));
  const r = retoDe(f2(h, reg, hoy, 1), hoy);
  igual(r.dia, 7); igual(r.terminado, false); igual(r.superado, true);
  const r2 = retoDe(f2(h, { [hoy]: "H" }, hoy + 1, 1), hoy + 1);
  igual(r2.terminado, true); igual(r2.superado, false);
});
