import { useQuery } from '@tanstack/react-query'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { DownloadJob } from '@/lib/api'
import { downloadsQuery, useClearDownloads } from '@/lib/queries'
import { cn } from '@/lib/utils'

function statusText(job: DownloadJob): string {
  const pct = job.progress != null ? `${Math.round(job.progress * 100)}%` : ''
  switch (job.status) {
    case 'queued':
      return job.stage === 'retrying' ? 'Retrying…' : 'Queued'
    case 'downloading':
      return [job.stage, pct, job.speed && `${(job.speed / 1048576).toFixed(1)} MB/s`].filter(Boolean).join(' · ')
    case 'processing':
      return 'Merging…'
    case 'done':
      return 'Done'
    case 'error':
      return job.error || 'Failed'
  }
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
                <span className={cn('flex shrink-0 items-center gap-2 font-mono text-lg text-muted-foreground', job.status === 'error' && 'shrink font-sans text-base text-foreground')}>
                  {job.status === 'done' && <PixelIcon name="check" className="text-primary" />}
                  {job.status === 'error' && <PixelIcon name="alert" className="text-destructive" />}
                  {statusText(job)}
                </span>
              </div>
              {job.status !== 'error' && <Progress value={job.status === 'done' ? 100 : (job.progress ?? 0) * 100} />}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
