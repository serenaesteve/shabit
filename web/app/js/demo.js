// Datos de ejemplo para probar la app (se cargan con ?demo solo si no hay ningún hábito).
// Generador pseudoaleatorio con semilla para que la demo salga siempre igual.
function azar(semilla) {
  let s = semilla >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function cargarDemo(A, hoy) {
  const r = azar(7);
  const plantilla = [
    { nombre: "Beber agua", icono: "agua", momento: "cualquiera", color: 7, objetivo: 7, meta: 66, semanas: 6, p: 0.9, tipo: "cantidad", cantidad: 8, unidad: "vasos" },
    { nombre: "Estirar", icono: "estirar", momento: "manana", color: 4, objetivo: 4, meta: 66, semanas: 8, p: 0.6 },
    { nombre: "Ir al gimnasio", icono: "pesa", momento: "tarde", color: 0, objetivo: 3, dias: [1, 3, 5], meta: 66, semanas: 6, p: 0.85 },
    { nombre: "Caminar", icono: "pasos", momento: "tarde", color: 3, objetivo: 7, meta: 100, semanas: 10, p: 0.86, pasos: 8000 },
    { nombre: "Leer", icono: "libro", momento: "noche", color: 1, objetivo: 5, meta: 100, semanas: 14, p: 0.74, tipo: "tiempo", cantidad: 20, aviso: "22:00" },
    { nombre: "Dormir sin móvil", icono: "sin-movil", momento: "noche", color: 8, objetivo: 4, meta: 30, semanas: 5, p: 0.55 },
  ];
  const habitos = [], registros = {};
  plantilla.forEach((d, i) => {
    const id = i + 1, creado = hoy - d.semanas * 7;
    habitos.push({ id, nombre: d.nombre, icono: d.icono, momento: d.momento, color: d.color, tipo: d.tipo ?? "simple", cantidad: d.cantidad ?? null, unidad: d.unidad ?? null, dias: d.dias ?? null, avisos: d.aviso ? [d.aviso] : [], pausas: [], objetivo: d.objetivo, meta: d.meta, pasos: d.pasos ?? null, creado, archivado: false, orden: i });
    const reg = (registros[id] = {});
    for (let dia = creado; dia < hoy; dia++) {
      if (d.dias && !d.dias.includes((((dia + 4) % 7) + 7) % 7)) continue;
      const x = r();
      if (x < d.p) reg[dia] = "H"; else if (x < d.p + 0.06) reg[dia] = "D";
    }
  });
  // Ánimo de las últimas dos semanas, algo mejor los días con más hábitos hechos.
  const animo = {};
  for (let dia = hoy - 13; dia < hoy; dia++) {
    const hechos = habitos.filter((h) => registros[h.id][dia] === "H").length;
    animo[dia] = { nivel: Math.max(1, Math.min(5, Math.round(1.5 + (hechos / habitos.length) * 3.5 + (r() - 0.5)))) };
  }
  A.reemplazar({ ...A.leer(), habitos, registros, animo, siguienteId: habitos.length + 1 });
}
