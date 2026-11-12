import {
  ONDERZOEK_STATUS_KLEUR,
  PROJECT_STATUS_KLEUR,
  labelOnderzoekStatus,
  labelProjectStatus,
  type OnderzoekStatus,
  type ProjectStatus,
} from "@/lib/domein";

export function OnderzoekStatusBadge({ status }: { status: string }) {
  const kleur =
    ONDERZOEK_STATUS_KLEUR[status as OnderzoekStatus] ?? "bg-slate-100 text-slate-700 ring-slate-200";
  return <span className={`badge ${kleur}`}>{labelOnderzoekStatus(status)}</span>;
}

export function ProjectStatusBadge({ status }: { status: string }) {
  const kleur =
    PROJECT_STATUS_KLEUR[status as ProjectStatus] ?? "bg-slate-100 text-slate-700 ring-slate-200";
  return <span className={`badge ${kleur}`}>{labelProjectStatus(status)}</span>;
}
