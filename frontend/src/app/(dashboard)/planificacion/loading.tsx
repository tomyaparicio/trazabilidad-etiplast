import { Skeleton } from "@/components/ui/skeleton"

export default function PlanificacionLoading() {
  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 rounded-full bg-brand/20" />
        <div>
          <Skeleton className="h-5 w-44 bg-muted" />
          <Skeleton className="h-3.5 w-32 bg-muted mt-1.5" />
        </div>
      </div>
      <Skeleton className="h-48 w-full rounded-2xl bg-muted" />
    </div>
  )
}
