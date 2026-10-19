'use client'

import { useState } from 'react'
import { Button, Card, PageTitle } from '@/components/web/ui'
import { useT } from '@/lib/i18n'
import { SUPPORT_EMAIL_URL, SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_URL, SUPPORT_WHATSAPP_URL } from '@/lib/contact'

// Mirrors the mobile HelpSupport FAQ.
const FAQS = [
  { q: 'help.faq.paymentsQ',  a: 'help.faq.paymentsA' },
  { q: 'help.faq.methodsQ',   a: 'help.faq.methodsA' },
  { q: 'help.faq.recurringQ', a: 'help.faq.recurringA' },
  { q: 'help.faq.stopQ',      a: 'help.faq.stopA' },
  { q: 'help.faq.payoutQ',    a: 'help.faq.payoutA' },
]

export default function HelpPage() {
  const t = useT()
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="space-y-5">
      <PageTitle title={t('help.helpSupport')} sub={t('help.answersToTheQuestionsWeGet')} />

      <Card bleed>
        <ul className="divide-y divide-line-soft">
          {FAQS.map((f, i) => (
            <li key={f.q}>
              <button onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                <span className="font-semibold text-ink">{t(f.q)}</span>
                <span className="shrink-0 text-ink-50">{open === i ? '−' : '+'}</span>
              </button>
              {open === i && <p className="px-5 pb-4 text-sm leading-relaxed text-ink-70">{t(f.a)}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t('help.stillNeedHelp')}>
        <p className="text-sm text-ink-70">{t('help.ourTeamUsuallyRepliesWithinOne')}</p>
        <p className="mt-2 text-sm text-ink-70">
          {t('help.phoneLabel')}{' '}
          <a href={SUPPORT_PHONE_URL} className="font-semibold text-accent-role">{SUPPORT_PHONE_DISPLAY}</a>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={SUPPORT_EMAIL_URL}><Button>{t('help.emailSupport')}</Button></a>
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
            <Button variant="outline">{t('help.whatsapp')}</Button>
          </a>
          <a href={SUPPORT_PHONE_URL}>
            <Button variant="outline">{t('help.callUs')}</Button>
          </a>
        </div>
      </Card>
    </div>
  )
}
