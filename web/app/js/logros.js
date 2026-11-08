// Logros: se calculan a partir de los datos, no se guardan. Solo se recuerda cuáles ya se
// han visto, para avisar una vez cuando se consigue uno nuevo.
import { diaCompleto, rachaDiasCompletos, reto } from "./progreso.js";

export function logros(datos, fichas, hoy) {
  const total = fichas.reduce((s, f) => s + f.total, 0);
  const mejor = Math.max(0, ...fichas.map((f) => (f.enMeses ? f.mejorRacha * 30 : f.rachaEnDias ? f.mejorRacha : f.mejorRacha * 7)));
  const libre = Math.max(0, ...fichas.filter((f) => f.evitar).map((f) => f.mejorRacha));
  const activos = datos.habitos.filter((h) => !h.archivado);
  let completos = 0, seguidos = 0, maxSeguidos = 0;
  if (activos.length) {
    const primero = Math.min(...activos.map((h) => h.creado));
    for (let d = primero; d <= hoy; d++) {
      if (diaCompleto(activos, datos.registros, d)) { completos++; seguidos++; maxSeguidos = Math.max(maxSeguidos, seguidos); }
      else if (d !== hoy) seguidos = 0;
    }
  }
  const animos = Object.keys(datos.animo || {}).length;
  return [
    { id: "primero", icono: "ui-check", titulo: "Primer paso", texto: "Marca un hábito como hecho", ok: total >= 1 },
    { id: "rutina", icono: "brote", titulo: "Tu rutina", texto: "Ten 3 hábitos en marcha", ok: activos.length >= 3 },
    { id: "completo", icono: "ui-brillo", titulo: "Día redondo", texto: "Completa todos los hábitos de un día", ok: completos >= 1 },
    { id: "racha7", icono: "llama", titulo: "Una semana seguida", texto: "Racha de 7 días en un hábito", ok: mejor >= 7 },
    { id: "semana", icono: "estrella", titulo: "Semana perfecta", texto: "7 días completos seguidos", ok: maxSeguidos >= 7 },
    { id: "animo", icono: "sonrisa", titulo: "Me escucho", texto: "Apunta cómo te sientes 7 días", ok: animos >= 7 },
    { id: "racha30", icono: "llama", titulo: "Un mes seguido", texto: "Racha de 30 días en un hábito", ok: mejor >= 30 },
    { id: "cien", icono: "corazon", titulo: "Cien veces", texto: "Suma 100 días hechos", ok: total >= 100 },
    { id: "meta", icono: "trofeo", titulo: "Meta cumplida", texto: "Llega a la meta de un hábito", ok: fichas.some((f) => f.metaCumplida) },
    { id: "reto", icono: "estrella", titulo: "Reto superado", texto: "Termina un reto sin fallar ningún día", ok: fichas.some((f) => reto(f, hoy)?.superado) },
    { id: "libre7", icono: "brote", titulo: "Una semana libre", texto: "7 días sin recaer en algo que dejas", ok: libre >= 7 },
    { id: "libre30", icono: "ui-brillo", titulo: "Un mes libre", texto: "30 días sin recaer en algo que dejas", ok: libre >= 30 },
    { id: "año", icono: "trofeo", titulo: "Un año de hábitos", texto: "Suma 365 días hechos", ok: total >= 365 },
  ];
}

export { rachaDiasCompletos };
