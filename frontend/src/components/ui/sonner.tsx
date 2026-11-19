"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { PixelIcon } from "@/components/pixel-icon"
import { useTheme } from "@/lib/theme"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolved } = useTheme()

  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      icons={{
        success: <PixelIcon name="check" className="size-4 text-primary" />,
        info: <PixelIcon name="alert" className="size-4" />,
        warning: <PixelIcon name="alert" className="size-4" />,
        error: <PixelIcon name="alert" className="size-4 text-destructive" />,
        loading: <PixelIcon name="loader" className="size-4" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "transparent",
          "--border-radius": "0px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Sonner's own styles are unlayered, so these need `!` to win.
          toast: "cn-toast pixel-lift! font-sans! text-base!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
