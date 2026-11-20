import { useQuery } from '@tanstack/react-query'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import { accountQuery, likedQuery, useSetLiked } from '@/lib/queries'
import { cn } from '@/lib/utils'

/** Like on YouTube, with the connected account. Hidden when no account is connected. */
export function LikeButton({ videoId }: { videoId: string }) {
  const account = useQuery(accountQuery)
  const connected = !!account.data?.connected
  const liked = useQuery({ ...likedQuery(videoId), enabled: connected })
  const setLiked = useSetLiked(videoId)
  if (!connected) return null

  const isLiked = !!liked.data?.liked
  return (
    <Button
      variant="outline"
      aria-pressed={isLiked}
      disabled={liked.isPending || liked.isError}
      title={liked.isError ? liked.error.message : undefined}
      onClick={() => setLiked.mutate(!isLiked)}
      className={cn(isLiked && 'bg-secondary text-secondary-foreground')}
    >
      <PixelIcon name={isLiked ? 'heart' : 'heartOutline'} />
      {isLiked ? 'Liked' : 'Like'}
    </Button>
  )
}
