import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setMode, setTheme, THEMES, useTheme, type Mode, type ThemeId } from '@/lib/theme'
import { PixelIcon, type PixelIconName } from './pixel-icon'

const MODES: { id: Mode; label: string; icon: PixelIconName }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' },
]

export function ThemeMenu() {
  const { theme, mode } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Theme">
          <PixelIcon name="palette" className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-60">
        <DropdownMenuLabel className="font-heading text-[10px]">PALETTE</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeId)}>
          {THEMES.map((t) => (
            <DropdownMenuRadioItem key={t.id} value={t.id} className="gap-3">
              <span aria-hidden="true" className="flex">
                {t.swatches.map((c) => (
                  <span key={c} className="size-3.5" style={{ background: c }} />
                ))}
              </span>
              {t.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-heading text-[10px]">MODE</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
          {MODES.map((m) => (
            <DropdownMenuRadioItem key={m.id} value={m.id} className="gap-3">
              <PixelIcon name={m.icon} />
              {m.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
