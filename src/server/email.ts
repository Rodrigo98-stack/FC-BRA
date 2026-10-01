/**
 * Envio de e-mail opcional (convites e redefinição de senha).
 * Usa a API HTTP da Resend quando RESEND_API_KEY e EMAIL_FROM estão
 * configurados. Sem configuração, o painel mostra o link para envio manual
 * (§35.6) — nunca fingimos que o e-mail foi enviado.
 */
export function isEmailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailConfigured()) return { sent: false, error: "E-mail não configurado" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { sent: false, error: `HTTP ${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}
