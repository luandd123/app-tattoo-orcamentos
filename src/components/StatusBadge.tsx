import { BudgetStatus, STATUS_LIST } from "@/lib/types";

export default function StatusBadge({ status }: { status: BudgetStatus }) {
  const s = STATUS_LIST.find((x) => x.key === status) || STATUS_LIST[0];
  return (
    <span className="badge" style={{ color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}
