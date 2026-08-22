'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/web/ui'

export default function Landing() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-soft via-canvas to-warm"
      />
      <div className="relative w-full max-w-md text-center">
        <Image src="/logo.png" alt="HelpersHob" width={140} height={128} priority className="mx-auto h-auto" />

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink">
          Find help you can trust
        </h1>
        <p className="mt-2 text-ink-70">
          Book verified local professionals for anything around the house — or offer
          your own skills and get paid.
        </p>

        <div className="mt-8 space-y-3">
          <Link href="/role?next=signup" className="block">
            <Button size="lg" fullWidth>Get started</Button>
          </Link>
          <Link href="/role?next=login" className="block">
            <Button size="lg" variant="outline" fullWidth>I already have an account</Button>
          </Link>
        </div>

        <p className="mt-8 text-xs text-ink-50">Helping hands, caring hearts</p>
      </div>
    </div>
  )
}
