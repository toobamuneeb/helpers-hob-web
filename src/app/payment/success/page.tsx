'use client';

import { useSearchParams } from 'next/navigation';

export default function PaymentSuccess() {
  const searchParams = useSearchParams();
  const offerId = searchParams.get('offer_id');
  const paymentId = searchParams.get('payment_id');

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
            <strong>What's next?</strong><br/>
            You can now close this page and return to the app to see your completed booking.
          </p>
        </div>

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
