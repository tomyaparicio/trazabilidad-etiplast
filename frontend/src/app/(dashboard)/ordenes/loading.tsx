import { Skeleton } from "@/components/ui/skeleton"

export default function OrdenesLoading() {
  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-brand/20" />
          <div>
            <Skeleton className="h-5 w-44 bg-muted" />
            <Skeleton className="h-3.5 w-32 bg-muted mt-1.5" />
          </div>
        </div>
        <Skeleton className="h-10 w-36 rounded-xl bg-muted" />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Skeleton className="h-9 flex-1 min-w-[200px] rounded-lg bg-muted" />
        <div className="flex gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-lg bg-muted" />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card/80 border border-border rounded-2xl overflow-hidden">
        {/* Thead */}
        <div className="flex items-center gap-5 px-5 py-3.5 border-b border-border bg-muted/30">
          {[28, 48, 20, 20, 20, 32].map((w, i) => (
            <Skeleton key={i} className="h-2.5 rounded-full bg-muted" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-5 px-5 py-4 border-b border-border/50 last:border-0">
            <Skeleton className="h-3 w-[112px] rounded-full bg-muted font-mono" />
            <Skeleton className="h-3 flex-1 rounded-full bg-muted" />
            <Skeleton className="h-3 w-20 rounded-full bg-muted" />
            <Skeleton className="h-5 w-20 rounded-full bg-muted" />
            <Skeleton className="h-3 w-16 rounded-full bg-muted" />
            <Skeleton className="h-3 w-24 rounded-full bg-muted ml-auto" />
          </div>
        ))}
      </div>

    </div>
  )
}
