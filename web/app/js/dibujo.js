// Colores de los hábitos y pequeños dibujos (anillo de progreso, puntos del calendario).

export const COLORES = [
  ["Coral", "#EF6351"], ["Azul", "#3D7FF2"], ["Amarillo", "#F2B830"], ["Verde", "#3FB06A"], ["Menta", "#2FB9A7"],
  ["Naranja", "#F28C38"], ["Lila", "#9B6BE6"], ["Cielo", "#36A9E1"], ["Rosa", "#EC5C93"], ["Gris", "#7D838C"],
].map(([nombre, hex]) => ({ nombre, hex }));

export const colorDisco = (i) => COLORES[((i % COLORES.length) + COLORES.length) % COLORES.length].hex;

export function mezclar(hex, otro, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(otro.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Texto legible sobre un color: oscuro sobre amarillo o colores claros. */
export function tintaSobre(hex) {
  const v = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.66 ? "#1C1D21" : "#FFFFFF";
}

/** Variables CSS de un hábito: su color, el fondo suave del icono y el texto sobre el color. */
export const varsColor = (i) => {
  const c = colorDisco(i);
  return `--c:${c};--c-suave:${mezclar(c, "#ffffff", 0.82)};--c-oscuro:${mezclar(c, "#000000", 0.25)};--c-tinta:${tintaSobre(c)}`;
};

/** Anillo de progreso del día (0 a 1). */
export function anillo(fraccion) {
  const r = 26, l = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraccion));
  return `<svg class="anillo" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="${r}" class="anillo__fondo"/>
    ${f > 0 ? `<circle cx="32" cy="32" r="${r}" class="anillo__valor" stroke-dasharray="${(l * f).toFixed(2)} ${l.toFixed(2)}" transform="rotate(-90 32 32)"/>` : ""}
  </svg>`;
}
