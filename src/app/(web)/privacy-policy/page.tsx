'use client'

import PolicyBackLink from '@/components/web/PolicyBackLink'
import { useT } from '@/lib/i18n'

export default function PrivacyPolicyPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PolicyBackLink />
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">{t('legal.privacyPolicy')}</h1>

      <div className="mt-6 space-y-5 text-sm leading-relaxed text-ink-70">
        <p>
          {t('legal.intro')}
        </p>

        <section>
          <h2 className="text-base font-bold text-ink">{t('legal.whatWeCollect')}</h2>
          <p className="mt-1">
            {t('legal.whatWeCollectBody')}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-ink">{t('legal.howWeUseIt')}</h2>
          <p className="mt-1">
            {t('legal.howWeUseItBody')}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-ink">{t('legal.payments')}</h2>
          <p className="mt-1">
            {t('legal.paymentsBody')}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-ink">{t('legal.yourRights')}</h2>
          <p className="mt-1">
            {t('legal.yourRightsBody')}{' '}
            <a href="mailto:support@helpershob.com" className="font-semibold text-accent-role underline">
              support@helpershob.com
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-ink">{t('legal.contact')}</h2>
          <p className="mt-1">{t('legal.emailLabel')}: support@helpershob.com</p>
        </section>
      </div>
    </div>
  )
}
