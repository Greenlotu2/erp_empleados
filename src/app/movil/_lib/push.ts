"use client";

import { apiMovil } from "./api";

// Notificaciones push del lado del teléfono: registra el service worker
// (/movil-sw.js, scope /movil/), pide permiso y guarda la suscripción en el
// servidor. En iPhone solo funcionan con la app agregada a la pantalla de
// inicio (iOS 16.4+); en Android y escritorio basta el navegador.

const SW = "/movil-sw.js";
const SCOPE = "/movil/";

export type EstadoPush =
  | "no-soportado"
  | "ios-sin-instalar"
  | "bloqueado"
  | "activo"
  | "inactivo";

export function registrarServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(SW, { scope: SCOPE }).catch(() => {});
}

function esIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function instalada() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

async function suscripcionActual() {
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  return (await reg?.pushManager.getSubscription()) || null;
}

export async function estadoPush(): Promise<EstadoPush> {
  const soporta =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!soporta) return esIOS() && !instalada() ? "ios-sin-instalar" : "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  return (await suscripcionActual()) ? "activo" : "inactivo";
}

// La llave pública VAPID viene en base64url; pushManager la quiere en bytes.
function llaveEnBytes(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function activarPush() {
  const llave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!llave) throw new Error("Las notificaciones no están configuradas en el servidor.");

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    throw new Error("No se dio permiso para mostrar notificaciones.");
  }
  const reg = await navigator.serviceWorker.register(SW, { scope: SCOPE });
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: llaveEnBytes(llave),
    }));

  await apiMovil("/api/movil/push", {
    method: "POST",
    body: JSON.stringify({ subscription: sub.toJSON(), prueba: true }),
  });
}

// Deja de recibir en ESTE teléfono (también se usa al cerrar sesión, para que
// el siguiente usuario del teléfono no reciba los avisos del anterior).
export async function desactivarPush() {
  const sub = await suscripcionActual().catch(() => null);
  if (!sub) return;
  await apiMovil("/api/movil/push", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
