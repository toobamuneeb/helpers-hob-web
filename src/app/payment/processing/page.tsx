'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function PaymentProcessing() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('payment_id');
  const offerId = searchParams.get('offer_id');
  const [status, setStatus] = useState<'processing' | 'success' | 'failed'>('processing');
  const [checkCount, setCheckCount] = useState(0);

  useEffect(() => {
    if (!paymentId || !offerId) return;
    if (status !== 'processing') return;

    const checkPaymentStatus = async () => {
      try {
        console.log('🔍 Checking payment status...', { paymentId, attempt: checkCount + 1 });
        
        const response = await fetch('/api/payments/check-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ payment_id: paymentId }),
        });
        
        if (!response.ok) {
          console.error('Failed to check payment status:', response.status);
          return;
        }
        
        const data = await response.json();
        console.log('📊 Payment status:', data.status);
        
        // If payment is paid, redirect to success page
        if (data.status === 'paid' || data.status === 'completed') {
          console.log('✅ Payment completed! Redirecting to success...');
          setStatus('success');
          
          // For mobile WebView - send message to React Native
          if ((window as any).ReactNativeWebView) {
            (window as any).ReactNativeWebView.postMessage(JSON.stringify({
              type: 'PAYMENT_SUCCESS',
              paymentId,
              offerId
            }));
          }
          
          // Redirect to success page
          setTimeout(() => {
            window.location.href = `/payment/success?offer_id=${offerId}&payment_id=${paymentId}`;
          }, 1000);
          
        } else if (data.status === 'failed' || data.status === 'cancelled' || data.status === 'expired') {
          console.log('❌ Payment failed');
          setStatus('failed');
        } else {
          console.log('⏳ Still pending:', data.status);
        }
        
        setCheckCount(prev => prev + 1);
      } catch (error) {
        console.error('Error checking payment:', error);
      }
    };

    // Check immediately, then every 2 seconds
    checkPaymentStatus();
    const interval = setInterval(checkPaymentStatus, 2000);

    // Stop after 2 minutes
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (status === 'processing') {
        console.log('⏱️ Timeout - payment taking too long');
        setStatus('failed');
      }
    }, 120000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [paymentId, offerId, status, checkCount]);

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
        {status === 'processing' && (
          <>
            <div style={{
              width: '60px',
              height: '60px',
              border: '4px solid #4CAF50',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              margin: '0 auto 20px',
              animation: 'spin 1s linear infinite'
            }}></div>
            <h1 style={{ fontSize: '24px', marginBottom: '12px', color: '#333' }}>
              Payment Processing
            </h1>
            <p style={{ fontSize: '16px', color: '#666', lineHeight: '1.5' }}>
              Your payment is being confirmed. Please wait...
            </p>
            <p style={{ fontSize: '14px', color: '#999', marginTop: '20px' }}>
              This usually takes 5-10 seconds. Do not close this page.
            </p>
            {checkCount > 0 && (
              <p style={{ fontSize: '12px', color: '#ccc', marginTop: '10px' }}>
                Checking status... ({checkCount})
              </p>
            )}
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{
              width: '60px',
              height: '60px',
              backgroundColor: '#4CAF50',
              borderRadius: '50%',
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              color: 'white'
            }}>
              ✓
            </div>
            <h1 style={{ fontSize: '24px', marginBottom: '12px', color: '#4CAF50' }}>
              Payment Successful!
            </h1>
            <p style={{ fontSize: '16px', color: '#666', lineHeight: '1.5' }}>
              Redirecting to confirmation...
            </p>
          </>
        )}

        {status === 'failed' && (
          <>
            <div style={{
              width: '60px',
              height: '60px',
              backgroundColor: '#f44336',
              borderRadius: '50%',
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              color: 'white'
            }}>
              ✕
            </div>
            <h1 style={{ fontSize: '24px', marginBottom: '12px', color: '#f44336' }}>
              Payment Taking Too Long
            </h1>
            <p style={{ fontSize: '16px', color: '#666', lineHeight: '1.5' }}>
              Please check your bookings to see if payment completed, or contact support.
            </p>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
