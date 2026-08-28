'use client';

import { useSearchParams } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { Suspense, useEffect, useState } from 'react';


/**
 * The signed-in role, read directly because these pages sit outside the (web)
 * group and so have no SessionProvider above them.
 *
 * It matters here: a provider pays the monthly token through this same flow,
 * and "your bookings" is the customer's side of the app — sending them there
 * drops them somewhere they have no business being.
 */
function useRole(): { role: 'customer' | 'service_provider' | null; signedIn: boolean | null } {
  const [role, setRole] = useState<'customer' | 'service_provider' | null>(null);
  // null while it is still being worked out, so nothing flashes the wrong way.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        setSignedIn(Boolean(user));
        if (!user) return;
        const { data } = await supabase
          .from('profiles').select('role').eq('user_id', user.id).maybeSingle();
        if (!cancelled) setRole(data?.role ?? null);
      } catch {
        // Leave it null — the customer destination is the safe default.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { role, signedIn };
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const offerId = searchParams.get('offer_id');
  const paymentId = searchParams.get('payment_id');
  const { role, signedIn } = useRole();
  const isProvider = role === 'service_provider';

  // Stripe returns to NEXT_PUBLIC_APP_URL, which need not be the origin the
  // payment started from — pay on localhost and you come back to the deployed
  // site, where that browser has no session. Sending someone into the app from
  // there just bounces them to the login screen, which reads as being signed
  // out by pressing the button. Say what is actually needed instead.
  const needsSignIn = signedIn === false;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '40px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          backgroundColor: '#4CAF50',
          borderRadius: '50%',
          margin: '0 auto 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '48px',
          color: 'white',
          boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)'
        }}>
          ✓
        </div>
        
        <h1 style={{ 
          fontSize: '28px', 
          marginBottom: '16px', 
          color: '#4CAF50',
          fontWeight: '600'
        }}>
          Payment Successful!
        </h1>
        
        <p style={{ 
          fontSize: '16px', 
          color: '#666', 
          lineHeight: '1.6',
          marginBottom: '24px'
        }}>
          Your payment has been completed successfully. The job has been marked as completed.
        </p>

        <div style={{
          backgroundColor: '#f0f9f4',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          border: '1px solid #c8e6c9'
        }}>
          <p style={{ 
            fontSize: '14px', 
            color: '#2e7d32',
            margin: 0
          }}>
            <strong>What&apos;s next?</strong><br/>
            Head back to your booking to leave a review. If you started this from the app,
            you can close this page instead.
          </p>
        </div>

        {/* Stripe returns web customers to this page in a normal tab, where
            nothing closes on its own. The mobile WebView intercepts the URL
            before this renders, so the link only ever matters in a browser. */}
        <a
          href={
            needsSignIn
              ? '/login'
              : offerId
                ? `/jobs/${offerId}?from=${isProvider ? 'jobs' : 'bookings'}`
                : isProvider ? '/provider/jobs' : '/bookings'
          }
          style={{
            display: 'inline-block',
            backgroundColor: '#2e7d32',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: 600,
            textDecoration: 'none',
            padding: '12px 28px',
            borderRadius: '8px',
          }}
        >
          {needsSignIn
            ? 'Sign in to see your booking'
            : isProvider
              ? (offerId ? 'Back to the job' : 'Back to your jobs')
              : (offerId ? 'Back to your booking' : 'Back to your bookings')}
        </a>

        {offerId && (
          <p style={{ 
            fontSize: '12px', 
            color: '#999', 
            marginTop: '20px',
            fontFamily: 'monospace'
          }}>
            Order ID: {offerId.substring(0, 8)}...
          </p>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccess() {
  return (
    <Suspense fallback={null}>
      <PaymentSuccessContent />
    </Suspense>
  );
}
