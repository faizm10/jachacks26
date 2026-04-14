import { AR_LABEL_LEGEND_PIPELINE_ROWS, AR_LABEL_LEGEND_ROWS } from "@/lib/ar-label-activity-colors";

export function ArLabelColorLegend() {
  return (
    <div className="mt-3 rounded-xl border border-border/80 bg-muted/40 px-3 py-3 sm:px-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Label color key
      </p>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground/90">
        Overlay colors map to activity text from the model (approximate).
      </p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {AR_LABEL_LEGEND_ROWS.map((row) => (
          <li key={row.id} className="flex gap-2.5">
            <span
              className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ring-1 ring-border ${row.swatchClass}`}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-foreground">{row.title}</p>
              <p className="text-[10px] leading-snug text-muted-foreground">{row.description}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Pending / error
      </p>
      <ul className="mt-1.5 flex flex-col gap-2">
        {AR_LABEL_LEGEND_PIPELINE_ROWS.map((row) => (
          <li key={row.id} className="flex gap-2.5">
            <span
              className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ring-1 ring-border ${row.swatchClass}`}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-foreground">{row.title}</p>
              <p className="text-[10px] leading-snug text-muted-foreground">{row.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
