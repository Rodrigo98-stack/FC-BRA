/**
 * Períodos de filtro (§16): hoje, ontem, semana, mês, trimestre, semestre,
 * ano e personalizado — no fuso de São Paulo (UTC−3, sem horário de verão).
 */
export const PERIOD_KEYS = ["hoje", "ontem", "7d", "semana", "30d", "mes", "trimestre", "semestre", "ano", "personalizado"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  semana: "Esta semana",
  mes: "Este mês",
  trimestre: "Este trimestre",
  semestre: "Este semestre",
  ano: "Este ano",
  personalizado: "Personalizado",
};

const OFFSET_MS = 3 * 3600 * 1000; // America/Sao_Paulo = UTC-3

/** Meia-noite (horário de SP) do dia y-m-d, como Date UTC. */
function spMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) + OFFSET_MS);
}

function spParts(now: Date) {
  const local = new Date(now.getTime() - OFFSET_MS);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), dow: local.getUTCDay() };
}

export type ResolvedPeriod = { key: PeriodKey; from: Date; to: Date; label: string; fromDate: string; toDate: string };

const iso = (d: Date) => new Date(d.getTime() - OFFSET_MS).toISOString().slice(0, 10);

export function resolvePeriod(key: string | null | undefined, from?: string | null, to?: string | null, now = new Date()): ResolvedPeriod {
  const k = (PERIOD_KEYS as readonly string[]).includes(key ?? "") ? (key as PeriodKey) : "mes";
  const { y, m, d, dow } = spParts(now);
  let start: Date;
  let end: Date;
  switch (k) {
    case "hoje":
      start = spMidnight(y, m, d);
      end = spMidnight(y, m, d + 1);
      break;
    case "ontem":
      start = spMidnight(y, m, d - 1);
      end = spMidnight(y, m, d);
      break;
    case "7d":
      start = spMidnight(y, m, d - 6);
      end = spMidnight(y, m, d + 1);
      break;
    case "30d":
      start = spMidnight(y, m, d - 29);
      end = spMidnight(y, m, d + 1);
      break;
    case "semana": {
      const mondayOffset = (dow + 6) % 7;
      start = spMidnight(y, m, d - mondayOffset);
      end = spMidnight(y, m, d - mondayOffset + 7);
      break;
    }
    case "trimestre": {
      const q = Math.floor(m / 3) * 3;
      start = spMidnight(y, q, 1);
      end = spMidnight(y, q + 3, 1);
      break;
    }
    case "semestre": {
      const s = m < 6 ? 0 : 6;
      start = spMidnight(y, s, 1);
      end = spMidnight(y, s + 6, 1);
      break;
    }
    case "ano":
      start = spMidnight(y, 0, 1);
      end = spMidnight(y + 1, 0, 1);
      break;
    case "personalizado": {
      const valid = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
      if (valid(from) && valid(to)) {
        const [fy, fm, fd] = from!.split("-").map(Number);
        const [ty, tm, td] = to!.split("-").map(Number);
        start = spMidnight(fy, fm - 1, fd);
        end = spMidnight(ty, tm - 1, td + 1);
        if (end <= start) end = spMidnight(fy, fm - 1, fd + 1);
      } else {
        start = spMidnight(y, m, 1);
        end = spMidnight(y, m + 1, 1);
      }
      break;
    }
    default:
      start = spMidnight(y, m, 1);
      end = spMidnight(y, m + 1, 1);
  }
  const lastDay = new Date(end.getTime() - 1);
  const label =
    k === "personalizado" ? `${iso(start).split("-").reverse().join("/")} a ${iso(lastDay).split("-").reverse().join("/")}` : PERIOD_LABELS[k];
  return { key: k, from: start, to: end, label, fromDate: iso(start), toDate: iso(lastDay) };
}

/** Data (YYYY-MM-DD) de hoje em São Paulo. */
export function todaySP(now = new Date()): string {
  return iso(now);
}
