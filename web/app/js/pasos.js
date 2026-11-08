// Pasos en iPhone: Safari no da acceso a un contador de pasos, así que se detectan con el
// acelerómetro (DeviceMotion) mientras la app está abierta. El detector es el mismo que
// usa la app Android cuando el móvil no tiene contador.

export class DetectorPasos {
  constructor(alto = 11.2, bajo = 9.0, minimoMs = 260) {
    this.alto = alto; this.bajo = bajo; this.minimoMs = minimoMs;
    this.armado = true; this.ultimoPaso = -Infinity; this.suave = 9.81;
  }
  /** Devuelve true si la muestra completa un paso. Aceleración con gravedad, en m/s². */
  muestra(x, y, z, tiempoMs) {
    const m = Math.hypot(x, y, z);
    this.suave = this.suave * 0.4 + m * 0.6;
    if (this.armado && this.suave > this.alto && tiempoMs - this.ultimoPaso >= this.minimoMs) {
      this.armado = false;
      this.ultimoPaso = tiempoMs;
      return true;
    }
    if (this.suave < this.bajo) this.armado = true;
    return false;
  }
}

/** Pasos del día: si cambia el día, se empieza de cero. */
export const sumarPasos = (estado, nuevos, hoy) =>
  estado && estado.dia === hoy ? { dia: hoy, pasos: estado.pasos + nuevos } : { dia: hoy, pasos: nuevos };

export const pasosDeHoy = (estado, hoy) => (estado && estado.dia === hoy ? estado.pasos : 0);
