// Recordatorios con notificaciones push. Las horas de aviso y lo hecho cada día ya están en
// SBD (los guarda nube.js); aquí solo se da de alta la suscripción del navegador en la cuenta.
import * as Nube from "./nube.js";

const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalada = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const compatible = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function suscripcion() {
  if (!compatible()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** activos | pendiente | denegado | sin-nube | no-instalada | no-compatible */
export async function estado() {
  if (!compatible()) return esIOS && !instalada() ? "no-instalada" : "no-compatible";
  if (Notification.permission === "denied") return "denegado";
  if (!Nube.activa()) return "sin-nube";
  try { return (await suscripcion()) ? "activos" : "pendiente"; } catch { return "pendiente"; }
}

const base64url = (s) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function darDeAlta(sub) {
  const codigo = await Nube.codigo();
  if (!codigo) throw new Error("sin cuenta");
  const r = await fetch("/api/suscripcion", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${codigo}` },
    body: JSON.stringify({ suscripcion: sub.toJSON() }),
  });
  if (!r.ok) throw new Error(String(r.status));
}

/** Pide permiso (desde un toque) y se suscribe. */
export async function activar() {
  if (!compatible()) return estado();
  if (!Nube.activa()) return "sin-nube";
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return permiso === "denied" ? "denegado" : "pendiente";
  const reg = await navigator.serviceWorker.ready;
  const clave = await fetch("/api/clave").then((r) => { if (!r.ok) throw new Error("sin servidor"); return r.text(); });
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64url(clave.trim()) }));
  await darDeAlta(sub);
  return "activos";
}

export async function desactivar() {
  const sub = await suscripcion();
  const codigo = await Nube.codigo().catch(() => null);
  if (sub && codigo) {
    await fetch("/api/suscripcion", {
      method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${codigo}` },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
  }
  await sub?.unsubscribe();
  return "pendiente";
}

/** Al abrir la app: vuelve a dar de alta la suscripción (por si cambió de cuenta o caducó). */
export async function asegurar() {
  const sub = await suscripcion().catch(() => null);
  if (sub && Nube.activa()) await darDeAlta(sub).catch(() => {});
}
