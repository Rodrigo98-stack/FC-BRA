"use client";
/** Identificador anônimo do visitante (analytics próprio, sem terceiros). */
export function getVisitorId(): string {
  try {
    let id = localStorage.getItem("fcbra-vid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("fcbra-vid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function track(event: { brand: string; type: string; productId?: string; path?: string }) {
  try {
    const body = JSON.stringify({ ...event, visitorId: getVisitorId(), path: event.path ?? location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    else void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  } catch {
    /* analytics nunca quebra a navegação */
  }
}
