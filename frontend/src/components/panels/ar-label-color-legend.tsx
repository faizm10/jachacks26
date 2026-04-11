import { AR_LABEL_LEGEND_PIPELINE_ROWS, AR_LABEL_LEGEND_ROWS } from "@/lib/ar-label-activity-colors";

export function ArLabelColorLegend() {
  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 sm:px-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Label color key</p>
      <p className="mt-1 text-[10px] leading-snug text-white/35">
        Box, badge, and pill colors follow the activity text from the model (best-effort). Use this key
        to read each hue at a glance.
      </p>
      <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {AR_LABEL_LEGEND_ROWS.map((row) => (
          <li key={row.id} className="flex gap-2.5">
            <span
              className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ring-1 ring-white/20 ${row.swatchClass}`}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/80">{row.title}</p>
              <p className="text-[10px] leading-snug text-white/45">{row.description}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-white/40">
        Before a label exists
      </p>
      <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {AR_LABEL_LEGEND_PIPELINE_ROWS.map((row) => (
          <li key={row.id} className="flex gap-2.5">
            <span
              className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ring-1 ring-white/20 ${row.swatchClass}`}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/80">{row.title}</p>
              <p className="text-[10px] leading-snug text-white/45">{row.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
