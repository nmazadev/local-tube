import { useId, useState, type ComponentProps, type FormEvent } from 'react'
import { PixelIcon } from '@/components/pixel-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Account } from '@/lib/api'
import { useRemovePassword, useSetPassword, useUnlockAccount } from '@/lib/queries'

const MIN_LENGTH = 8

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-center gap-2 text-destructive-foreground">
      <PixelIcon name="alert" className="text-destructive" />
      {message}
    </p>
  )
}

/** A labelled password field. */
function PasswordField({ label, ...props }: { label: string } & ComponentProps<typeof Input>) {
  const id = useId()
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-bold">
        {label}
      </label>
      <Input id={id} type="password" required {...props} />
    </div>
  )
}

/** Shown after a restart while the cookies are protected. */
export function UnlockForm() {
  const unlock = useUnlockAccount()
  const [password, setPassword] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    unlock.mutate(password, { onSettled: () => setPassword('') })
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <PasswordField label="Password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      <ErrorLine message={unlock.error?.message ?? null} />
      <Button type="submit" disabled={!password || unlock.isPending}>
        {unlock.isPending ? <PixelIcon name="loader" /> : <PixelIcon name="lock" />}
        Unlock
      </Button>
    </form>
  )
}

/** Set a password on the saved cookies, or remove it. */
export function PasswordSection({ account }: { account: Account }) {
  return account.protected ? <RemovePassword /> : <SetPassword />
}

function SetPassword() {
  const save = useSetPassword()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm.length > 0 && confirm !== password
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (password.length < MIN_LENGTH || mismatch) return
    save.mutate(password)
  }

  return (
    <div className="space-y-3">
      <p className="font-bold">Protect the cookies with a password</p>
      <p className="text-muted-foreground">
        The cookies file is stored encrypted, and you type the password here once after each restart of LocalTube. Until then,
        likes and watched marks are paused.
      </p>
      {open ? (
        <form onSubmit={submit} className="space-y-4 pt-2">
          <PasswordField
            label="New password"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordField
            label="Type it again"
            autoComplete="new-password"
            aria-invalid={mismatch}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <p className="text-muted-foreground">At least {MIN_LENGTH} characters. There’s no way to recover it; if you forget it, connect again with a new cookies file.</p>
          <ErrorLine message={mismatch ? 'The passwords don’t match.' : (save.error?.message ?? null)} />
          <div className="flex gap-4">
            <Button type="submit" disabled={password.length < MIN_LENGTH || confirm !== password || save.isPending}>
              <PixelIcon name={save.isPending ? 'loader' : 'lock'} /> Set password
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <PixelIcon name="lock" /> Set a password
        </Button>
      )}
    </div>
  )
}

function RemovePassword() {
  const remove = useRemovePassword()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    remove.mutate(password, { onSettled: () => setPassword('') })
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 font-bold">
        <PixelIcon name="lock" /> Protected with a password
      </p>
      <p className="text-muted-foreground">The cookies file is encrypted. You’ll be asked for the password after each restart.</p>
      {open ? (
        <form onSubmit={submit} className="space-y-4 pt-2">
          <PasswordField label="Current password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          <ErrorLine message={remove.error?.message ?? null} />
          <div className="flex gap-4">
            <Button type="submit" variant="destructive" disabled={!password || remove.isPending}>
              Remove password
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Remove password
        </Button>
      )}
    </div>
  )
}
