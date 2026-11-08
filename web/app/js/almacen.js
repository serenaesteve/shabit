// Todo se guarda en el propio iPhone (localStorage). No hay servidor ni cuentas.
const CLAVE = "shabit";

const vacio = () => ({
  version: 1,
  siguienteId: 1,
  habitos: [],
  registros: {},          // { idHabito: { dia: "H" | "D" } }
  ajustes: { tema: "sistema", primer: 1, vibracion: true },
  pasos: null,            // { dia, pasos }
  auto: null,             // { dia, ids: [] } hábitos marcados solos por pasos hoy
  progreso: {},           // { idHabito: { dia: cantidad o segundos } } de los hábitos con cantidad o tiempo
  notas: {},              // { idHabito: { dia: "nota" } }
  horas: {},              // { idHabito: { dia: "21:04" } }: a qué hora se marcó como hecho
  animo: {},              // { dia: { nivel: 1-5, nota } }
  crono: null,            // temporizador en marcha: { id, dia, inicio (ms), base (s) }
  nube: null,             // { codigo, version, pendiente, ultimo, error }: copia en SBD
});

let datos = cargar();
const oyentes = new Set();

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return vacio();
    return { ...vacio(), ...JSON.parse(crudo) };
  } catch {
    return vacio();
  }
}

/** Guarda y avisa a los oyentes. «origen» es "local" (un cambio de quien usa la app) o "nube". */
function guardar(origen = "local") {
  try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* sin espacio: se mantiene en memoria */ }
  oyentes.forEach((f) => f(datos, origen));
}

/** Id de hábito único aunque se creen hábitos a la vez en dos móviles de la misma cuenta. */
function nuevoId() {
  let id = Math.max(Date.now(), datos.siguienteId);
  while (datos.habitos.some((h) => h.id === id)) id++;
  datos.siguienteId = id + 1;
  return id;
}

export const leer = () => datos;
export const alCambiar = (f) => { oyentes.add(f); return () => oyentes.delete(f); };

/** Pide al navegador que no borre los datos aunque falte espacio. */
export const pedirPersistencia = () => navigator.storage?.persist?.().catch(() => false);

export function guardarHabito(h) {
  if (!h.id) {
    h = { ...h, id: nuevoId(), orden: datos.habitos.length };
    datos.habitos.push(h);
  } else {
    datos.habitos = datos.habitos.map((x) => (x.id === h.id ? { ...x, ...h } : x));
  }
  guardar();
  return h.id;
}

export function borrarHabito(id) {
  datos.habitos = datos.habitos.filter((h) => h.id !== id);
  delete datos.registros[id];
  delete datos.progreso?.[id];
  delete datos.notas?.[id];
  delete datos.horas?.[id];
  guardar();
}

export const tipo = (id, dia) => datos.registros[id]?.[dia] ?? null;

/** Si el día ya tiene ese tipo lo deja vacío; si no, lo pone. Devuelve el tipo final. */
export function alternar(id, dia, t) {
  const r = (datos.registros[id] ??= {});
  if (r[dia] === t) delete r[dia]; else r[dia] = t;
  if (r[dia] === "H" && dia === diaHoy()) (((datos.horas ??= {})[id] ??= {})[dia] = horaAhora());
  guardar();
  return r[dia] ?? null;
}

const horaAhora = () => { const f = new Date(); return `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`; };
const diaHoy = () => { const f = new Date(); return Math.floor(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()) / 86400000); };

export function marcar(id, dia, t) {
  (datos.registros[id] ??= {})[dia] = t;
  if (t === "H" && dia === diaHoy()) (((datos.horas ??= {})[id] ??= {})[dia] = horaAhora());
  guardar();
}

export const nota = (id, dia) => datos.notas?.[id]?.[dia] ?? "";
export function ponerNota(id, dia, texto) {
  const n = ((datos.notas ??= {})[id] ??= {});
  if (texto && texto.trim()) n[dia] = texto.trim().slice(0, 600); else delete n[dia];
  guardar();
}

export function quitar(id, dia) {
  if (datos.registros[id]) delete datos.registros[id][dia];
  guardar();
}

/** Cantidad o segundos acumulados de un hábito un día. */
export const progreso = (id, dia) => datos.progreso?.[id]?.[dia] ?? 0;
export function ponerProgreso(id, dia, n) {
  const p = ((datos.progreso ??= {})[id] ??= {});
  if (n > 0) p[dia] = n; else delete p[dia];
  guardar();
}

export const animo = (dia) => datos.animo?.[dia] ?? null;
export function ponerAnimo(dia, cambio) {
  const a = { ...(datos.animo?.[dia] ?? {}), ...cambio };
  (datos.animo ??= {})[dia] = a;
  if (!a.nivel && !a.nota) delete datos.animo[dia];
  guardar();
}

export function ponerCrono(c) { datos.crono = c; guardar(); }

/** Guarda varios hábitos nuevos de una vez (rutinas). */
export function guardarVarios(lista) {
  const ids = [];
  for (const h of lista) { const id = nuevoId(); ids.push(id); datos.habitos.push({ ...h, id, orden: datos.habitos.length }); }
  guardar();
  return ids;
}

/** Nuevo orden y momento del día: [{ id, momento }] en el orden en que deben quedar. */
export function reordenar(lista) {
  lista.forEach(({ id, momento }, i) => {
    const h = datos.habitos.find((x) => x.id === id);
    if (h) { h.orden = i; h.momento = momento; }
  });
  guardar();
}

/** Estado de la copia en SBD. No cuenta como cambio de datos (no vuelve a sincronizar). */
export function ponerNube(n) { datos.nube = n; guardar("nube"); }

/** Cambia los datos con lo que llega de SBD. */
export function aplicarDeLaNube(cambio) { datos = { ...datos, ...cambio }; guardar("nube"); }

export function cambiarAjustes(cambio) {
  datos.ajustes = { ...datos.ajustes, ...cambio };
  guardar();
}

export function guardarPasos(estado) { datos.pasos = estado; guardar(); }
export function guardarAuto(auto) { datos.auto = auto; guardar(); }

export function exportar() {
  const { nube, ...resto } = datos;   // el código de la cuenta no va en la copia
  return JSON.stringify({ app: "shabit", exportado: new Date().toISOString(), ...resto }, null, 1);
}

/** Sustituye todos los datos por una copia. Lanza un error si el archivo no es de shabit. */
export function importar(texto) {
  const d = JSON.parse(texto);
  if (d.app !== "shabit" || !Array.isArray(d.habitos) || typeof d.registros !== "object") {
    throw new Error("El archivo no es una copia de shabit.");
  }
  delete d.app; delete d.exportado;
  datos = { ...vacio(), ...d, nube: datos.nube ? { ...datos.nube, pendiente: true } : null };
  guardar();
}

/** Solo para las pruebas y los datos de demostración. */
export function reemplazar(nuevos, origen = "local") { datos = { ...vacio(), ...nuevos }; guardar(origen); }
