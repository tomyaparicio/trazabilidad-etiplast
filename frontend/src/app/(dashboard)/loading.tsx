import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1280px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-[#f5eb4a]/20" />
          <div>
            <Skeleton className="h-5 w-44 bg-white/[0.06]" />
            <Skeleton className="h-3.5 w-60 bg-white/[0.04] mt-1.5" />
          </div>
        </div>
        <Skeleton className="h-8 w-28 rounded-lg bg-white/[0.04]" />
      </div>

      {/* Hero + side stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-[#0f0f1a]/80 border border-white/[0.06] rounded-2xl p-8 min-h-[220px] flex flex-col justify-between">
          <div>
            <Skeleton className="h-4 w-32 bg-white/[0.06] mb-5" />
            <Skeleton className="h-16 w-48 bg-white/[0.08] mb-3" />
            <Skeleton className="h-3.5 w-56 bg-white/[0.04]" />
          </div>
          <div className="flex gap-2.5 mt-6">
            <Skeleton className="h-8 w-44 rounded-xl bg-white/[0.04]" />
            <Skeleton className="h-8 w-36 rounded-xl bg-white/[0.04]" />
          </div>
        </div>
        <div className="flex flex-col gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="bg-[#0f0f1a]/80 border border-white/[0.06] rounded-2xl p-6 flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Skeleton className="h-3 w-24 bg-white/[0.04] mb-3" />
                  <Skeleton className="h-10 w-16 bg-white/[0.08]" />
                  <Skeleton className="h-3 w-32 bg-white/[0.04] mt-2.5" />
                </div>
                <Skeleton className="w-11 h-11 rounded-xl bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-2 bg-[#0f0f1a]/80 border border-white/[0.06] rounded-2xl p-6">
          <Skeleton className="h-5 w-44 mb-6 bg-white/[0.06]" />
          <Skeleton className="h-[300px] w-full rounded-xl bg-white/[0.03]" />
        </div>
        <div className="xl:col-span-3 bg-[#0f0f1a]/80 border border-white/[0.06] rounded-2xl p-6">
          <Skeleton className="h-5 w-36 mb-6 bg-white/[0.06]" />
          <Skeleton className="h-[300px] w-full rounded-xl bg-white/[0.03]" />
        </div>
      </div>

      {/* Rubros breakdown */}
      <div className="bg-[#0f0f1a]/80 border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Skeleton className="h-5 w-48 bg-white/[0.06]" />
            <Skeleton className="h-3 w-56 bg-white/[0.04] mt-1.5" />
          </div>
          <Skeleton className="h-10 w-16 bg-white/[0.06] rounded-lg" />
        </div>
        <div className="space-y-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                  <Skeleton className="h-4 w-24 bg-white/[0.06]" />
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-3 w-20 bg-white/[0.04] hidden sm:block" />
                  <Skeleton className="h-4 w-10 bg-white/[0.06]" />
                </div>
              </div>
              <Skeleton className="h-2 w-full rounded-full bg-white/[0.04]" style={{ width: `${85 - i * 12}%` }} />
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
