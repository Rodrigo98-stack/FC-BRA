import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES, PRODUCT_STATUS_LABELS, USER_STATUS_LABELS, type OrderStatus } from "@/lib/domain";
import { Badge } from "./ui";

export function OrderStatusBadge({ status }: { status: string }) {
  const s = status as OrderStatus;
  return <Badge tone={ORDER_STATUS_TONES[s] ?? "neutral"}>{ORDER_STATUS_LABELS[s] ?? status}</Badge>;
}

export function ProductStatusBadge({ status }: { status: string }) {
  return <Badge tone={status === "ativo" ? "success" : status === "rascunho" ? "warning" : "neutral"}>{PRODUCT_STATUS_LABELS[status] ?? status}</Badge>;
}

export function UserStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={status === "ativo" ? "success" : status === "suspenso" ? "danger" : status === "pendente" ? "warning" : "neutral"}>
      {USER_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function StockBadge({ stock, min }: { stock: number; min: number }) {
  if (stock <= 0) return <Badge tone="danger">Esgotado</Badge>;
  if (stock <= min) return <Badge tone="warning">Baixo · {stock}</Badge>;
  return <span className="tabular-nums">{stock}</span>;
}
