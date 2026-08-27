'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/web/ui'

export default function JobPostedPage() {
  return (
    <div data-role="customer" className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <Image src="/auth/congratulations.png" alt="" width={200} height={200}
        className="h-auto w-40" priority />
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">Congratulations</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-70">
        Your job has been posted. Providers near you can now see it and send you offers.
      </p>
      <div className="mt-7 flex w-full max-w-xs flex-col gap-3">
        <Link href="/my-jobs"><Button size="lg" fullWidth>View my jobs</Button></Link>
        <Link href="/home"><Button size="lg" variant="outline" fullWidth>Back to home</Button></Link>
      </div>
    </div>
  )
}
