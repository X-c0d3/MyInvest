export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-12 w-64 rounded-2xl bg-subtle" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-subtle" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-subtle" />
    </div>
  );
}
