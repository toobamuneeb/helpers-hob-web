'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { api } from '@/lib/web/api';

/**
 * Stripe Connect callback page for React Native WebView
 * 
 * This page is loaded in the RN WebView after Stripe onboarding completes.
 * The WebView intercepts URLs containing '/bank-details' and closes itself,
 * then the app re-checks the Stripe status via API.
 *
 * A browser is the other caller, and nothing closes for it — Stripe sends web
 * providers here too. So the page also re-checks the status itself (that route
 * reads the live account from Stripe and writes the fresh flags back), and
 * offers a way back into the app rather than telling someone in a normal tab
 * to wait for a window that will never close.
 * 
 * Query params:
 * - status: 'success' | 'return' | 'refresh' | 'error' | 'cancelled'
 * - provider: 'stripe'
 * - account_id: Stripe account ID
 * - message: Optional error/success message
 */

function BankDetailsContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status') || 'unknown';
  const provider = searchParams.get('provider') || 'stripe';
  const accountId = searchParams.get('account_id');
  const message = searchParams.get('message');

  // Ask the server to reconcile with Stripe, so whatever the provider sees when
  // they land back on the payouts screen is the real state of the account. The
  // WebView closes this page before it renders, so in practice this only ever
  // runs in a browser — and a redundant GET would be harmless anyway.
  useEffect(() => {
    if (status !== 'return' && status !== 'success') return;
    void api.get('/providers/stripe-status');
  }, [status]);

  useEffect(() => {
    console.log('🔵 Bank details callback page loaded:', {
      status,
      provider,
      accountId,
      message,
    });

    // Send message to parent window (if embedded)
    if (typeof window !== 'undefined' && window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'stripe_callback',
          status,
          provider,
          accountId,
          message,
        },
        '*'
      );
    }
  }, [status, provider, accountId, message]);

  const getStatusInfo = () => {
    switch (status) {
      case 'success':
      case 'return':
        return {
          icon: '✅',
          title: 'Successfully Connected!',
          description: 'Your Stripe account has been connected. You can now receive payouts.',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
        };
      case 'refresh':
        return {
          icon: '🔄',
          title: 'Session Expired',
          description: 'Your session expired. Please try connecting again.',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
        };
      case 'error':
        return {
          icon: '❌',
          title: 'Connection Failed',
          description: message || 'Failed to connect your Stripe account. Please try again.',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
        };
      case 'cancelled':
        return {
          icon: '⚠️',
          title: 'Connection Cancelled',
          description: message || 'Stripe connection was cancelled.',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
        };
      default:
        return {
          icon: 'ℹ️',
          title: 'Processing...',
          description: 'Completing your Stripe connection...',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className={`max-w-md w-full ${statusInfo.bgColor} rounded-lg shadow-lg p-8`}>
        <div className="text-center">
          <div className="text-6xl mb-4">{statusInfo.icon}</div>
          <h1 className={`text-2xl font-bold mb-4 ${statusInfo.color}`}>
            {statusInfo.title}
          </h1>
          <p className="text-gray-700 mb-6">
            {statusInfo.description}
          </p>

          {accountId && (
            <div className="text-sm text-gray-500 mb-4">
              <p>Account ID: {accountId}</p>
            </div>
          )}

          <a
            href="/provider/payouts"
            className="mt-2 inline-block rounded-lg bg-[#2E7D32] px-6 py-2.5 text-sm font-semibold text-white"
          >
            Go to your payment account
          </a>

          <div className="text-sm text-gray-500 mt-8">
            <p>If you started this from the app, this window closes on its own.</p>
          </div>
        </div>
      </div>

      {/* Auto-close script for native WebView */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // Try to close the window after a short delay
            setTimeout(() => {
              if (window.ReactNativeWebView) {
                // React Native WebView
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'close',
                  status: '${status}',
                }));
              } else if (window.parent !== window) {
                // Embedded iframe
                window.parent.postMessage({ type: 'close', status: '${status}' }, '*');
              }
            }, 2000);
          `,
        }}
      />
    </div>
  );
}

export default function BankDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="text-6xl mb-4">⏳</div>
            <h1 className="text-2xl font-bold mb-4">Processing...</h1>
          </div>
        </div>
      }
    >
      <BankDetailsContent />
    </Suspense>
  );
}
