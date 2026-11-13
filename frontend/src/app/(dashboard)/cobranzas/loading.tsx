import { PageContainer } from "@/components/ui/page-container"
import { Skeleton } from "@/components/ui/skeleton"

export default function CobranzasLoading() {
  return (
    <PageContainer>
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-brand/20" />
        <div>
          <Skeleton className="h-5 w-44 bg-muted" />
          <Skeleton className="mt-1.5 h-3.5 w-56 bg-muted" />
        </div>
      </div>
      <Skeleton className="h-28 w-full rounded-2xl bg-muted" />
      <Skeleton className="h-48 w-full rounded-2xl bg-muted" />
    </PageContainer>
  )
}
