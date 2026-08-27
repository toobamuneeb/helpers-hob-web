'use client'

import Image from 'next/image'
import { useSession } from '@/lib/web/session'
import { Button } from '@/components/web/ui'

export default function SuspendedPage() {
  const { profile, signOut } = useSession()

  return (
    <div data-role={profile?.role} className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md text-center">
        <Image src="/logo.png" alt="HelpersHob" width={90} height={82} priority className="mx-auto h-auto" />

        <span className="mt-5 inline-flex rounded-full bg-[#fdecec] px-3.5 py-1 text-xs font-semibold text-danger">
          Account suspended
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
          Your account has been suspended
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-70">
          You cannot book or take on work while your account is suspended. If you
          think this is a mistake, please get in touch and we will look into it.
        </p>

        <div className="mt-7 space-y-3">
          <a href="mailto:support@helpershob.com" className="block">
            <Button size="lg" fullWidth>Contact support</Button>
          </a>
          <Button size="lg" variant="outline" fullWidth onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </div>
  )
}
