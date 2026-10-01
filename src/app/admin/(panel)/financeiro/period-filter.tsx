import { PERIOD_KEYS, PERIOD_LABELS, type ResolvedPeriod } from "@/lib/period";
import { FilterBar, FilterSelect } from "@/components/admin/ui";

export function PeriodFilter({
  period,
  brands,
  brandId,
  extra,
}: {
  period: ResolvedPeriod;
  brands: { id: string; name: string }[];
  brandId: string | null;
  extra?: React.ReactNode;
}) {
  return (
    <FilterBar>
      <FilterSelect
        name="periodo"
        label="Período"
        value={period.key}
        allLabel="Este mês"
        options={PERIOD_KEYS.map((k) => ({ value: k, label: PERIOD_LABELS[k] }))}
      />
      <label className="flex flex-col gap-1 text-xs text-stone-500">
        De (personalizado)
        <input type="date" name="de" defaultValue={period.key === "personalizado" ? period.fromDate : ""} className="admin-input py-1.5" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-stone-500">
        Até
        <input type="date" name="ate" defaultValue={period.key === "personalizado" ? period.toDate : ""} className="admin-input py-1.5" />
      </label>
      {brands.length > 1 && (
        <FilterSelect name="marca" label="Marca" value={brandId} allLabel="Todas (inclui gerais)" options={brands.map((b) => ({ value: b.id, label: b.name }))} />
      )}
      {extra}
    </FilterBar>
  );
}
