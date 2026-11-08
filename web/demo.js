// Demo de la portada: tres hábitos que se marcan con el botón redondo, como en la app.
(() => {
  const botones = [...document.querySelectorAll(".demo .check")];
  const valor = document.querySelector(".demo .anillo__valor");
  const cuenta = document.getElementById("demo-cuenta");
  const nota = document.getElementById("demo-nota");
  const confeti = document.querySelector(".demo .confeti");
  const fecha = document.getElementById("demo-fecha");
  if (!botones.length) return;
  const movimiento = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const hoy = new Date();
  fecha.textContent = `${dias[hoy.getDay()][0].toUpperCase()}${dias[hoy.getDay()].slice(1)}, ${hoy.getDate()} de ${meses[hoy.getMonth()]}`;

  function pintar() {
    const hechos = botones.filter((b) => b.getAttribute("aria-pressed") === "true").length;
    valor.style.strokeDasharray = `${(163.4 * hechos) / botones.length} 164`;
    cuenta.textContent = `${hechos}/${botones.length}`;
    return hechos;
  }

  function celebrar() {
    nota.textContent = "¡Día completo! Así se ve en la app.";
    if (!movimiento) return;
    const colores = ["#EF6351", "#3D7FF2", "#F2B830", "#3FB06A", "#2FB9A7", "#9B6BE6", "#EC5C93"];
    confeti.innerHTML = Array.from({ length: 34 }, (_, i) =>
      `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${colores[i % colores.length]};animation-delay:${(Math.random() * 0.4).toFixed(2)}s;--giro:${Math.round(Math.random() * 600 - 300)}deg;--x:${Math.round(Math.random() * 60 - 30)}px"></i>`).join("");
    setTimeout(() => (confeti.innerHTML = ""), 2600);
  }

  botones.forEach((b) => b.addEventListener("click", () => {
    const hecho = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(hecho));
    b.classList.remove("pop");
    if (hecho && movimiento) { void b.offsetWidth; b.classList.add("pop"); }
    navigator.vibrate?.(10);
    const n = pintar();
    if (n === botones.length) celebrar();
    else nota.textContent = hecho ? `¡Bien! Te ${botones.length - n === 1 ? "queda 1" : `quedan ${botones.length - n}`}.` : "Desmarcado. En la app también puedes deshacer.";
  }));
  pintar();
})();
