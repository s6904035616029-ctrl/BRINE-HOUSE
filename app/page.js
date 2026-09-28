import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>🍣 BRINE-HOUSE</h1>
      <p>ระบบสั่งอาหารร้าน BRINE-HOUSE</p>

      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link
          href="/generate-qr"
          style={{ padding: '0.75rem 1.5rem', background: '#e53e3e', color: 'white', borderRadius: '8px', textDecoration: 'none' }}
        >
          📱 หน้าสร้าง QR Code (พนักงาน)
        </Link>
        <Link
          href="/kitchen"
          style={{ padding: '0.75rem 1.5rem', background: '#319795', color: 'white', borderRadius: '8px', textDecoration: 'none' }}
        >
          🍳 หน้าจอห้องครัว (Kitchen Display)
        </Link>
      </div>
    </main>
  );
}
