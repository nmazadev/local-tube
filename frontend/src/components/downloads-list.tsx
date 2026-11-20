import { useQuery } from '@tanstack/react-query'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { DownloadJob } from '@/lib/api'
import { downloadsQuery, useCancelDownload, useClearDownloads, useRetryDownload } from '@/lib/queries'
import { cn } from '@/lib/utils'

function statusText(job: DownloadJob): string {
  const pct = job.progress != null ? `${Math.round(job.progress * 100)}%` : ''
  switch (job.status) {
    case 'queued':
      return 'Queued'
    case 'retrying':
      return 'Failed, retrying…'
    case 'downloading':
      return [job.attempt > 1 && 'retry', job.stage, pct, job.speed && `${(job.speed / 1048576).toFixed(1)} MB/s`]
        .filter(Boolean)
        .join(' · ')
    case 'processing':
      return 'Merging…'
    case 'done':
      return 'Done'
    case 'error':
      return job.error || 'Failed'
    case 'cancelled':
      return 'Cancelled'
  }
}

const CANCELLABLE = new Set(['queued', 'downloading', 'retrying'])

function JobAction({ job }: { job: DownloadJob }) {
  const cancel = useCancelDownload()
  const retry = useRetryDownload()
  if (CANCELLABLE.has(job.status)) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Cancel download" disabled={cancel.isPending} onClick={() => cancel.mutate(job.job_id)}>
        <PixelIcon name="close" />
      </Button>
    )
  }
  if (job.status === 'error' || job.status === 'cancelled') {
    return (
      <Button variant="outline" size="sm" disabled={retry.isPending} onClick={() => retry.mutate(job.job_id)}>
        <PixelIcon name="retry" /> Retry
      </Button>
    )
  }
  return null
}

export function DownloadsList() {
  const { data: jobs = [] } = useQuery(downloadsQuery)
  const clear = useClearDownloads()
  if (!jobs.length) return null

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading text-sm">DOWNLOADS</h2>
        <Button variant="ghost" size="sm" onClick={() => clear.mutate()}>
          Clear finished
        </Button>
      </div>
      <ul className="space-y-5">
        {jobs.map((job) => (
          <li key={job.job_id}>
            <Card className="gap-3 px-5 py-4">
              <div className="flex justify-between gap-4">
                <span className="truncate">{job.title || job.url}</span>
                <div className={cn('flex min-w-0 items-center gap-3', job.status === 'error' ? 'shrink' : 'shrink-0')}>
                  <span className={cn('flex items-center gap-2 font-mono text-lg text-muted-foreground', job.status === 'error' && 'shrink font-sans text-base text-foreground')}>
                    {job.status === 'done' && <PixelIcon name="check" className="text-primary" />}
                    {job.status === 'error' && <PixelIcon name="alert" className="text-destructive" />}
                    {statusText(job)}
                  </span>
                  <JobAction job={job} />
                </div>
              </div>
              {job.status !== 'error' && job.status !== 'cancelled' && (
                <Progress value={job.status === 'done' ? 100 : (job.progress ?? 0) * 100} />
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
