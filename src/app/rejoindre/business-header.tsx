export function BusinessHeader({ name, logoUrl, accent, subtitle }: { name: string; logoUrl: string | null; accent: string | null; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- business logo
        <img src={logoUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold text-white" style={{ background: accent ?? "#0F6B3E" }} aria-hidden>
          {name.charAt(0)}
        </span>
      )}
      <div>
        <p className="font-display text-xl font-extrabold">{name}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
