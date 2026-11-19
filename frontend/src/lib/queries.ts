import { useEffect, useRef } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, isActiveJob } from './api'

export const libraryQuery = queryOptions({
  queryKey: ['library'],
  queryFn: api.library,
})

export const downloadsQuery = queryOptions({
  queryKey: ['downloads'],
  queryFn: api.downloads,
  // Poll only while something is downloading.
  refetchInterval: (q) => (q.state.data?.some(isActiveJob) ? 1000 : false),
})

export const resolveQuery = (url: string) =>
  queryOptions({
    queryKey: ['resolve', url],
    queryFn: () => api.resolve(url),
    // Stream URLs are good for hours and the backend re-extracts them when needed.
    staleTime: 3 * 60 * 60 * 1000,
    retry: false,
  })

export function useStartDownload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ url, q }: { url: string; q: number }) => api.startDownload(url, q),
    onSuccess: () => qc.invalidateQueries({ queryKey: downloadsQuery.queryKey }),
    onError: (e) => toast.error(`Download failed to start: ${e.message}`),
  })
}

export function useDeleteVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteVideo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: libraryQuery.queryKey })
      // A resolved video may point at the file that's now gone.
      qc.invalidateQueries({ queryKey: ['resolve'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useClearDownloads() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.clearDownloads,
    onSuccess: () => qc.invalidateQueries({ queryKey: downloadsQuery.queryKey }),
  })
}

/** Refresh the library whenever a download finishes (mounted once, in the root layout). */
export function useLibraryRefreshOnDownload() {
  const qc = useQueryClient()
  const { data } = useQuery(downloadsQuery)
  const done = data?.filter((j) => j.status === 'done').length ?? 0
  const previous = useRef(done)
  useEffect(() => {
    if (done > previous.current) qc.invalidateQueries({ queryKey: libraryQuery.queryKey })
    previous.current = done
  }, [done, qc])
}
