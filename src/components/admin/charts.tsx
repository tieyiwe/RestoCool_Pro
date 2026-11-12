/** Small server-rendered SVG charts for the admin (no chart library, no client JS). */

export function Bars({ data, label, height = 120, color = "var(--rc-vert)", testId }: { data: Array<{ k: string; v: number; title: string }>; label: string; height?: number; color?: string; testId?: string }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  const w = 100 / Math.max(1, data.length);
  return (
    <figure className="flex flex-col gap-1" data-testid={testId}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-32 w-full" role="img" aria-label={label}>
        {data.map((d, i) => {
          const h = (d.v / max) * (height - 4);
          return (
            <rect key={d.k} x={i * w + w * 0.12} y={height - h} width={w * 0.76} height={Math.max(h, d.v ? 1 : 0)} rx={0.8} fill={color}>
              <title>{d.title}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.k}</span>
        <span>{data[data.length - 1]?.k}</span>
      </div>
    </figure>
  );
}

/** Conversion funnel: each step as a bar with its share of the first one. */
export function Funnel({ steps }: { steps: Array<{ label: string; n: number }> }) {
  const first = Math.max(1, steps[0]?.n ?? 1);
  return (
    <ol className="flex flex-col gap-2" data-testid="admin-funnel">
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-2 text-sm">
          <span className="truncate">{s.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((s.n / first) * 100)}%` }} />
          </span>
          <span className="text-right font-bold tabular-nums">{s.n}</span>
        </li>
      ))}
    </ol>
  );
}
