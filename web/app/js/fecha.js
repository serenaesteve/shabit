// Los días se guardan como "día de época" (días desde el 1-1-1970), igual que en la app Android
// (LocalDate.toEpochDay), para que los cálculos sean idénticos.

export const diaDe = (fecha = new Date()) =>
  Math.floor(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) / 86400000);

export const fechaDe = (dia) => {
  const d = new Date(dia * 86400000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** 0 = domingo … 6 = sábado. El 1-1-1970 fue jueves. */
export const diaSemana = (dia) => (((dia + 4) % 7) + 7) % 7;

/** Primer día de la semana de `dia`. `primer` es 1 (lunes) o 0 (domingo). */
export const inicioSemana = (dia, primer) => dia - ((diaSemana(dia) - primer + 7) % 7);

const INICIALES = ["D", "L", "M", "X", "J", "V", "S"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const inicial = (dia) => INICIALES[diaSemana(dia)];
export const inicialDeIndice = (i) => INICIALES[i];
export const nombreDia = (dia) => DIAS[diaSemana(dia)];
export const nombreMes = (m) => MESES[m];
export const fechaLarga = (dia) => {
  const f = fechaDe(dia);
  return `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
};
export const fechaCorta = (dia) => {
  const f = fechaDe(dia);
  return `${DIAS[f.getDay()]} ${f.getDate()} ${MESES[f.getMonth()].slice(0, 3)}`;
};
/** 6240 → "6.240". Se hace a mano porque en español los números de 4 cifras no siempre se agrupan. */
export const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
