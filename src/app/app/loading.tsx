/** Shown instantly while a staff page loads: the app never looks frozen on a slow network. */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-5xl animate-pulse flex-col gap-4 motion-reduce:animate-none" aria-busy="true" aria-live="polite">
      <div className="h-8 w-2/3 rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-40 rounded-2xl bg-muted" />
      <div className="h-40 rounded-2xl bg-muted" />
    </div>
  );
}
