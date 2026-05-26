export function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="w-full bg-white/5" style={{ aspectRatio: '16/9' }} />
    </div>
  )
}

interface SkeletonGridProps {
  count?: number
  columns?: string
}

export function SkeletonGrid({ count = 8, columns = 'repeat(auto-fill, minmax(320px, 1fr))' }: SkeletonGridProps) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: columns }}>
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}
