import Link from 'next/link'

export const metadata = { title: 'Privacy policy · HelpersHob' }

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm font-semibold text-ink-50 hover:text-ink">← Back</Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Privacy policy</h1>

      <div className="mt-6 space-y-5 text-sm leading-relaxed text-ink-70">
        <p>
          HelpersHob connects customers with local service providers. This policy
          explains what we collect, why, and what you can do about it.
        </p>

        <section>
          <h2 className="text-base font-bold text-ink">What we collect</h2>
          <p className="mt-1">
            Account details (name, email, phone, address), profile information,
            job and booking history, messages sent through the platform, and
            payment records. Providers also submit identity documents for
            verification.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-ink">How we use it</h2>
          <p className="mt-1">
            To match customers with providers, process bookings and payments,
            verify provider identities, support you when something goes wrong,
            and keep the platform safe.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-ink">Payments</h2>
          <p className="mt-1">
            Payments are processed by Stripe. We do not store your full card
            details — Stripe holds them and we keep only a reference.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-ink">Your rights</h2>
          <p className="mt-1">
            You can access, correct, or delete your data, and object to how we
            use it. To exercise these rights, contact us at{' '}
            <a href="mailto:support@helpershob.com" className="font-semibold text-accent-role underline">
              support@helpershob.com
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-ink">Contact</h2>
          <p className="mt-1">Email: support@helpershob.com</p>
        </section>
      </div>
    </div>
  )
}
