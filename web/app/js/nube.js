// Copia de los datos en SBD, la base de datos de shabit.
// La app sigue funcionando sin conexión con lo que hay en el dispositivo; cuando cambia algo,
// un momento después se guarda en el servidor. La cuenta es anónima: solo un código secreto.
import * as A from "./almacen.js";

const API = "/api";
let temporizador = null;
let enCurso = null;

export const activa = () => !A.leer().ajustes.sinNube;
const zona = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Madrid"; } };

/** Lo que se guarda en SBD: hábitos, días, cantidades, ánimo y dos ajustes. */
export function instantanea() {
  const d = A.leer();
  return {
    habitos: d.habitos.map(({ id, nombre, icono, momento, color, tipo, cantidad, unidad, objetivo, dias, porMes, meta, pasos, avisos, pausas, etiqueta, reto, inicioReto, creado, archivado, orden }) =>
      ({ id, nombre, icono, momento, color, tipo, cantidad, unidad, objetivo, dias, porMes, meta, pasos, avisos, pausas, etiqueta, reto, inicioReto, creado, archivado, orden })),
    registros: d.registros, progreso: d.progreso || {}, animo: d.animo || {}, notas: d.notas || {}, horas: d.horas || {},
    ajustes: { tema: d.ajustes.tema, primer: d.ajustes.primer, texto: d.ajustes.texto, resumen: d.ajustes.resumen ?? null, informe: d.ajustes.informe !== false },
    zona: zona(),
  };
}

/** Huella corta de la instantánea, para no mandar nada si no ha cambiado. */
function huella(obj) {
  const t = JSON.stringify(obj, (k, v) => (k === "zona" ? undefined : v));
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + t.length.toString(36);
}

const json = (codigo) => ({ "Content-Type": "application/json", ...(codigo ? { Authorization: `Bearer ${codigo}` } : {}) });

/** Llamada tras cada cambio local: guarda en SBD un momento después. */
export function programar(ms = 1500) {
  if (!activa()) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => sincronizar().catch(() => {}), ms);
}

/** Pone en los datos locales lo que hay en SBD (al abrir en otro móvil o si otro móvil guardó antes). */
function aplicarRemoto(r) {
  const d = A.leer();
  const habitos = (r.habitos || []).map((h) => ({ ...h, dias: h.dias ?? null, tipo: h.tipo || "simple", avisos: h.avisos || [], pausas: h.pausas || [] }));
  A.aplicarDeLaNube({
    habitos, registros: r.registros || {}, progreso: r.progreso || {}, animo: r.animo || {}, notas: r.notas || {}, horas: r.horas || {},
    ajustes: { ...d.ajustes, ...(r.ajustes || {}) },
    siguienteId: Math.max(d.siguienteId, ...habitos.map((h) => h.id + 1)),
  });
}

/** Mezcla lo de SBD con lo local: se juntan los hábitos y los días; si ambos tienen el mismo día, gana lo local. */
function mezclar(r) {
  const d = A.leer();
  const habitos = [...d.habitos];
  for (const h of r.habitos || []) if (!habitos.some((x) => x.id === h.id)) habitos.push({ ...h, dias: h.dias ?? null });
  const juntar = (local, remoto) => {
    const out = structuredClone(local || {});
    for (const [id, dias] of Object.entries(remoto || {})) out[id] = { ...dias, ...(out[id] || {}) };
    return out;
  };
  A.aplicarDeLaNube({
    habitos, registros: juntar(d.registros, r.registros), progreso: juntar(d.progreso, r.progreso),
    notas: juntar(d.notas, r.notas), horas: juntar(d.horas, r.horas),
    animo: { ...(r.animo || {}), ...(d.animo || {}) },
    siguienteId: Math.max(d.siguienteId, ...habitos.map((h) => h.id + 1)),
  });
}

const nube = () => A.leer().nube || {};
const actualizar = (cambio) => A.ponerNube({ ...nube(), ...cambio });

/** Sincroniza ahora: crea la cuenta si hace falta, sube los cambios o baja los de otro móvil. */
export function sincronizar() {
  if (!activa()) return Promise.resolve();
  // Sin hábitos no hace falta cuenta (p. ej. quien solo abre el enlace de un compañero).
  if (!nube().codigo && !A.leer().habitos.length) return Promise.resolve();
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      let n = nube();
      if (!n.codigo) {
        const r = await fetch(`${API}/cuenta`, { method: "POST", headers: json(), body: JSON.stringify({ datos: instantanea(), zona: zona() }) });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        A.ponerNube({ codigo: j.codigo, version: j.version, huella: huella(instantanea()), ultimo: Date.now(), error: null });
        return;
      }
      const datos = instantanea();
      if (huella(datos) === n.huella) {
        // Nada nuevo aquí: ¿ha guardado algo otro móvil?
        const r = await fetch(`${API}/datos`, { headers: json(n.codigo) });
        if (r.status === 401) { A.ponerNube(null); programar(0); return; }   // la cuenta ya no existe: se crea otra
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (j.version !== n.version) { aplicarRemoto(j.datos); n = nube(); }
        actualizar({ version: j.version, huella: huella(instantanea()), ultimo: Date.now(), error: null });
        return;
      }
      let version = n.version;
      for (let intento = 0; intento < 3; intento++) {
        const r = await fetch(`${API}/datos`, { method: "PUT", headers: json(n.codigo), body: JSON.stringify({ version, datos: instantanea() }) });
        if (r.status === 409) { const j = await r.json(); mezclar(j.datos); version = j.version; continue; }
        if (r.status === 401) { A.ponerNube(null); programar(0); return; }
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        actualizar({ version: j.version, huella: huella(instantanea()), ultimo: Date.now(), error: null });
        return;
      }
    } catch {
      actualizar({ error: navigator.onLine ? "servidor" : "sin-conexion" });
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

/** Usa en este dispositivo la cuenta de otro (su código). Sustituye lo que hay aquí. */
export async function vincular(codigo) {
  codigo = codigo.trim().replace(/\s+/g, "");
  const r = await fetch(`${API}/datos`, { headers: json(codigo) }).catch(() => null);
  if (!r) throw new Error("No hay conexión. Inténtalo de nuevo.");
  if (r.status === 401) throw new Error("Ese código no es válido. Cópialo entero desde el otro móvil.");
  if (!r.ok) throw new Error("El servidor no responde. Inténtalo en un rato.");
  const j = await r.json();
  A.cambiarAjustes({ sinNube: false });
  aplicarRemoto(j.datos);
  A.ponerNube({ codigo, version: j.version, huella: huella(instantanea()), ultimo: Date.now(), error: null });
}

/** Borra la cuenta y todos sus datos de SBD, y deja de guardar ahí. Lo de este dispositivo se queda. */
export async function borrarDelServidor() {
  const n = nube();
  if (n.codigo) {
    const r = await fetch(`${API}/cuenta`, { method: "DELETE", headers: json(n.codigo) }).catch(() => null);
    if (!r || (!r.ok && r.status !== 401)) throw new Error("No se ha podido borrar: comprueba la conexión.");
  }
  A.cambiarAjustes({ sinNube: true });
  A.ponerNube(null);
}

export function reactivar() {
  A.cambiarAjustes({ sinNube: false });
  return sincronizar();
}

/** Para los recordatorios: asegura que hay cuenta en SBD y devuelve su código. */
export async function codigo() {
  if (!nube().codigo) await sincronizar();
  return nube().codigo || null;
}
