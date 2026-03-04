import { Skeleton } from "@/components/ui/skeleton"

export default function ClientesLoading() {
  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 rounded-full bg-[#f5eb4a]/20" />
        <div>
          <Skeleton className="h-5 w-28 bg-white/[0.06]" />
          <Skeleton className="h-3.5 w-44 bg-white/[0.04] mt-1.5" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-11 flex-1 min-w-[260px] rounded-xl bg-white/[0.04]" />
        <Skeleton className="h-11 w-[160px] rounded-xl bg-white/[0.04]" />
        <Skeleton className="h-11 w-[160px] rounded-xl bg-white/[0.04]" />
      </div>

      {/* Table */}
      <div className="bg-[#0f0f1a]/80 border border-white/[0.06] rounded-2xl overflow-hidden">
        {/* Thead */}
        <div className="flex items-center gap-5 px-5 py-3.5 border-b border-white/[0.05] bg-white/[0.01]">
          {[8, 28, 20, 36, 20, 20, 28, 4].map((w, i) => (
            <Skeleton key={i} className={`h-2.5 rounded-full bg-white/[0.05]`} style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-5 px-5 py-4 border-b border-white/[0.03] last:border-0">
            <Skeleton className="h-3 w-8 rounded-full bg-white/[0.05]" />
            <div className="flex items-center gap-3 w-[112px]">
              <Skeleton className="w-8 h-8 rounded-lg bg-white/[0.07] shrink-0" />
              <Skeleton className="h-3.5 flex-1 rounded-full bg-white/[0.06]" />
            </div>
            <Skeleton className="h-6 w-20 rounded-lg bg-white/[0.05]" />
            <Skeleton className="h-3 w-36 rounded-full bg-white/[0.04]" />
            <Skeleton className="h-3 w-24 rounded-full bg-white/[0.04]" />
            <Skeleton className="h-3 w-24 rounded-full bg-white/[0.04]" />
            <Skeleton className="h-3 w-28 rounded-full bg-white/[0.04]" />
            <Skeleton className="h-4 w-4 rounded bg-white/[0.04] ml-auto" />
          </div>
        ))}
      </div>

    </div>
  )
}
