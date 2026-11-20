import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import { useUploadCookies } from '@/lib/queries'
import { storage } from '@/lib/storage'
import { cn } from '@/lib/utils'

const CHROME_URL = 'https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc'
const FIREFOX_URL = 'https://addons.mozilla.org/firefox/addon/get-cookies-txt-locally/'
const STEP_KEY = 'cookie-guide-step'

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-2 underline-offset-4 hover:text-primary-foreground hover:bg-primary">
      {children}
    </a>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="bg-muted px-1.5 py-0.5 font-mono text-lg leading-none pixel-box">{children}</kbd>
}

function Why({ children }: { children: ReactNode }) {
  return <p className="mt-3 border-l-3 border-muted-foreground/40 pl-3 text-muted-foreground">{children}</p>
}

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: 'Install a cookies exporter',
    body: (
      <>
        <p>
          Add <b>Get cookies.txt LOCALLY</b> to your browser: <Ext href={CHROME_URL}>Chrome or Edge</Ext>, or{' '}
          <Ext href={FIREFOX_URL}>Firefox</Ext>.
        </p>
        <Why>It saves your cookies to a file on your computer and doesn’t send them anywhere.</Why>
      </>
    ),
  },
  {
    title: 'Allow it in private windows',
    body: (
      <ul className="space-y-2">
        <li>
          <b>Chrome or Edge:</b> open the extension’s <i>Details</i> and turn on <i>Allow in Incognito</i> (Edge: <i>Allow in InPrivate</i>).
        </li>
        <li>
          <b>Firefox:</b> in <i>Manage Extension</i>, set <i>Run in Private Windows</i> to <i>Allow</i>.
        </li>
      </ul>
    ),
  },
  {
    title: 'Sign in to YouTube in a private window',
    body: (
      <>
        <p>
          Open a private window (<Kbd>Ctrl</Kbd> <Kbd>Shift</Kbd> <Kbd>N</Kbd> in Chrome and Edge, <Kbd>Ctrl</Kbd> <Kbd>Shift</Kbd>{' '}
          <Kbd>P</Kbd> in Firefox), go to youtube.com and sign in.
        </p>
        <Why>
          In a normal window YouTube keeps replacing your cookies while you browse, so a copy stops working within hours. A private
          window’s session stays as it is once you close it.
        </Why>
      </>
    ),
  },
  {
    title: 'Export the cookies',
    body: (
      <p>
        Still on youtube.com, click the extension’s icon, keep the format on <i>Netscape</i> and press <i>Export</i>. Your browser saves a
        file named like <span className="font-mono text-lg">www.youtube.com_cookies.txt</span>.
      </p>
    ),
  },
  {
    title: 'Close the private window',
    body: (
      <>
        <p>Close it right away, without signing out.</p>
        <Why>Signing out ends the session those cookies belong to, and they’d stop working.</Why>
      </>
    ),
  },
  { title: 'Upload the file', body: <CartridgeSlot /> },
]

/** Step-by-step: export YouTube cookies from a private window and upload them. */
export function CookieGuide() {
  const [current, setCurrentState] = useState(() => Math.min(storage.get(STEP_KEY, 0), STEPS.length - 1))
  const setCurrent = (i: number) => {
    storage.set(STEP_KEY, i)
    setCurrentState(i)
  }

  return (
    <ol>
      {STEPS.map((step, i) => {
        const done = i < current
        const open = i === current
        const last = i === STEPS.length - 1
        return (
          <li key={step.title} className="grid grid-cols-[2.75rem_1fr] gap-x-5">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'grid size-11 shrink-0 place-items-center font-heading text-xs pixel-box',
                  done && 'bg-primary text-primary-foreground',
                  open && 'bg-accent text-accent-foreground',
                  !done && !open && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <PixelIcon name="check" className="size-5" /> : i + 1}
              </span>
              {/* The path between steps: solid where it's been walked, dashed ahead. */}
              {!last && <span aria-hidden="true" className={cn('my-1.5 w-0 flex-1 border-l-3', done ? 'border-primary-foreground/70' : 'border-dashed border-muted-foreground/50')} />}
            </div>
            <div className={cn('min-w-0 pt-2.5', !last && 'pb-8')}>
              <h3>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setCurrent(i)}
                  className={cn('text-left text-lg font-bold', !open && 'text-muted-foreground hover:text-foreground')}
                >
                  {step.title}
                </button>
              </h3>
              {open && (
                <div className="mt-3 max-w-[62ch]">
                  {step.body}
                  {!last && (
                    <Button className="mt-5" onClick={() => setCurrent(i + 1)}>
                      Done, next step
                    </Button>
                  )}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Drop zone for cookies.txt, drawn as a cartridge going into a slot. */
function CartridgeSlot() {
  const upload = useUploadCookies()
  const inputId = useId()
  const [over, setOver] = useState(false)
  const depth = useRef(0)

  const send = async (file: File | undefined) => {
    if (!file) return
    upload.mutate(await file.text(), { onSuccess: () => storage.remove(STEP_KEY) })
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    depth.current = 0
    setOver(false)
    void send(e.dataTransfer.files[0])
  }
  const busy = upload.isPending

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragEnter={(e) => {
          e.preventDefault()
          depth.current++
          setOver(true)
        }}
        onDragLeave={() => {
          if (--depth.current <= 0) setOver(false)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-5 px-6 pt-5 pb-6 text-center transition-colors pixel-box has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-ring',
          over ? 'bg-accent text-accent-foreground' : 'bg-card hover:bg-muted',
          busy && 'pointer-events-none',
        )}
      >
        {/* The cartridge sinks into the slot while a file is dragged over. */}
        <div className="relative h-16 w-40" aria-hidden="true">
          <div
            className={cn(
              'absolute inset-x-4 top-0 flex h-14 flex-col items-center justify-center bg-secondary text-secondary-foreground pixel-box transition-transform duration-200 ease-[steps(4)] motion-reduce:transition-none',
              (over || busy) && 'translate-y-5',
            )}
          >
            <span className="h-1.5 w-14 bg-secondary-foreground/25" />
            <span className="mt-1.5 font-mono text-lg leading-none">cookies.txt</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-4 bg-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-bold">
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <PixelIcon name="loader" /> Checking it with YouTube…
              </span>
            ) : over ? (
              'Drop to connect'
            ) : (
              'Drop the cookies file here'
            )}
          </p>
          {!busy && !over && <p className="text-muted-foreground">or click to choose it</p>}
        </div>
        <input
          id={inputId}
          type="file"
          accept=".txt,text/plain"
          className="sr-only"
          onChange={(e) => {
            void send(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      {upload.isError && (
        <p role="alert" className="mt-4 flex items-start gap-3 bg-destructive px-4 py-3 text-destructive-foreground pixel-box">
          <PixelIcon name="alert" className="mt-1" />
          {upload.error.message}
        </p>
      )}
    </div>
  )
}
