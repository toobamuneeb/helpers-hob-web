'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/web/ui'

export default function JobPostedPage() {
  const t = useT()

  return (
    <div data-role="customer" className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <Image src="/auth/congratulations.png" alt="" width={200} height={200}
        className="h-auto w-40" priority />
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">{t('jobs.congratulations')}</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-70">
        {t('jobs.yourJobHasBeenPostedProviders')}
      </p>
      <div className="mt-7 flex w-full max-w-xs flex-col gap-3">
        <Link href="/my-jobs"><Button size="lg" fullWidth>{t('jobs.viewMyJobs')}</Button></Link>
        <Link href="/home"><Button size="lg" variant="outline" fullWidth>{t('jobs.backToHome')}</Button></Link>
      </div>
    </div>
  )
}
