'use client'

import { useState } from 'react'
import { Button, Card, PageTitle } from '@/components/web/ui'

// Mirrors the mobile HelpSupport FAQ.
const FAQS = [
  { q: 'How do payments work?',
    a: 'Payments are securely processed through Stripe. Customers can pay via credit card, iDEAL, or other supported methods. Providers receive automatic payouts to their connected Stripe account.' },
  { q: 'What payment methods can I use?',
    a: 'We accept credit/debit cards, iDEAL, Bancontact, and other payment methods through Stripe. You can also choose cash payment for certain services.' },
  { q: 'How do recurring jobs work?',
    a: 'Pick how often the job repeats when you book it. Once a job is completed and paid, the next one is scheduled automatically. It continues until you or the provider request to cancel.' },
  { q: 'How do I stop a recurring job?',
    a: 'Open the booking and choose "Cancel recurring request". Our team reviews it, and once approved the upcoming jobs are canceled. A job already in progress still goes ahead.' },
  { q: 'When does a provider get paid?',
    a: 'After the customer confirms the job is complete and the payment succeeds, the payout goes to the provider’s connected account, minus the platform fee.' },
]

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="space-y-5">
      <PageTitle title="Help & support" sub="Answers to the questions we get most." />

      <Card bleed>
        <ul className="divide-y divide-line-soft">
          {FAQS.map((f, i) => (
            <li key={f.q}>
              <button onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                <span className="font-semibold text-ink">{f.q}</span>
                <span className="shrink-0 text-ink-50">{open === i ? '−' : '+'}</span>
              </button>
              {open === i && <p className="px-5 pb-4 text-sm leading-relaxed text-ink-70">{f.a}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Still need help?">
        <p className="text-sm text-ink-70">Our team usually replies within one working day.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="mailto:support@helpershob.com"><Button>Email support</Button></a>
          <a href="https://wa.me/" target="_blank" rel="noreferrer">
            <Button variant="outline">WhatsApp</Button>
          </a>
        </div>
      </Card>
    </div>
  )
}
