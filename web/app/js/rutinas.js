// Rutinas ya preparadas para añadir varios hábitos de una vez.
export const RUTINAS = [
  {
    id: "manana", nombre: "Mañana con energía", icono: "amanecer", color: 2,
    texto: "Tres gestos sencillos para empezar el día con buen pie.",
    habitos: [
      { nombre: "Beber un vaso de agua", icono: "agua", momento: "manana", color: 7 },
      { nombre: "Estirar", icono: "estirar", momento: "manana", color: 4, tipo: "tiempo", cantidad: 5 },
      { nombre: "Desayunar sin prisa", icono: "cafe", momento: "manana", color: 5 },
    ],
  },
  {
    id: "dormir", nombre: "Dormir mejor", icono: "luna", color: 6,
    texto: "Desconectar antes de dormir para descansar de verdad.",
    habitos: [
      { nombre: "Dejar el móvil a las 23:00", icono: "sin-movil", momento: "noche", color: 8, aviso: "22:55" },
      { nombre: "Leer", icono: "libro", momento: "noche", color: 1, tipo: "tiempo", cantidad: 20 },
      { nombre: "Acostarme antes de las 24:00", icono: "cama", momento: "noche", color: 6 },
    ],
  },
  {
    id: "mover", nombre: "Moverme más", icono: "pasos", color: 3,
    texto: "Más movimiento y más agua durante el día.",
    habitos: [
      { nombre: "Caminar", icono: "pasos", momento: "tarde", color: 3, pasos: 8000, objetivo: 7 },
      { nombre: "Beber agua", icono: "agua", momento: "cuando", color: 7, tipo: "cantidad", cantidad: 8, unidad: "vasos" },
      { nombre: "Hacer ejercicio", icono: "pesa", momento: "tarde", color: 0, dias: [1, 3, 5] },
    ],
  },
  {
    id: "mente", nombre: "Mente tranquila", icono: "mente", color: 4,
    texto: "Unos minutos al día para ti.",
    habitos: [
      { nombre: "Meditar", icono: "mente", momento: "manana", color: 4, tipo: "tiempo", cantidad: 10 },
      { nombre: "Escribir en el diario", icono: "diario", momento: "noche", color: 9 },
      { nombre: "Apuntar 3 cosas buenas del día", icono: "corazon", momento: "noche", color: 8 },
    ],
  },
];

/** Completa un hábito de rutina con los valores por defecto. */
export const desdePlantilla = (p, hoy) => ({
  id: 0, nombre: p.nombre, icono: p.icono, momento: p.momento === "cuando" ? "cualquiera" : p.momento, color: p.color,
  objetivo: p.objetivo ?? (p.dias ? p.dias.length : 5), dias: p.dias ?? null,
  tipo: p.tipo ?? "simple", cantidad: p.cantidad ?? null, unidad: p.unidad ?? null,
  meta: 66, pasos: p.pasos ?? null, avisos: p.aviso ? [p.aviso] : [], pausas: [], creado: hoy, archivado: false,
});
