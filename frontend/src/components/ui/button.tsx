import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Pixel buttons: a notched outline plus a hard drop shadow; pressing moves them into it.
const raised =
  "pixel-lift hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:pixel-press aria-expanded:translate-x-0.5 aria-expanded:translate-y-0.5 aria-expanded:pixel-press disabled:pixel-box disabled:translate-0"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border-0 font-sans text-base font-semibold whitespace-nowrap transition-transform duration-75 outline-none select-none focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: `bg-primary text-primary-foreground ${raised}`,
        secondary: `bg-secondary text-secondary-foreground ${raised}`,
        outline: `bg-card text-card-foreground ${raised}`,
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive: `bg-destructive text-destructive-foreground ${raised}`,
        link: "text-foreground underline decoration-2 underline-offset-4 hover:decoration-primary",
      },
      size: {
        default: "h-10 gap-2 px-4",
        xs: "h-7 gap-1 px-2 text-sm [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[0.95rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
