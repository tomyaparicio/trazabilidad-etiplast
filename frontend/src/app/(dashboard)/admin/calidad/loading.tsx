import { Skeleton } from "@/components/ui/skeleton"
import { PageContainer } from "@/components/ui/page-container"

export default function CalidadLoading() {
  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 rounded-full bg-brand/20" />
        <div>
          <Skeleton className="h-5 w-44 bg-muted" />
          <Skeleton className="h-3.5 w-32 bg-muted mt-1.5" />
        </div>
      </div>
      <Skeleton className="h-48 w-full rounded-2xl bg-muted" />
    </PageContainer>
  )
}
