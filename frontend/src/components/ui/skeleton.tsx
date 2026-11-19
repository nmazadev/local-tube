import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-[pulse_1.2s_steps(3)_infinite] bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
