'use client';
import Link from 'next/link';

const KOFI_URL = 'https://ko-fi.com/wizardarenaplus';

export default function DonatePage() {
  return (
    <div className="menu-root">
      <div className="scanlines" />
      <div className="menu-card" style={{ maxWidth: 700 }}>
        <img src="/wizard_arena_plus_logo.png" alt="Wizard Arena Plus" className="menu-logo" />

        <h1 className="lb-page-title" style={{ marginBottom: 4 }}>Support the Arena</h1>
        <p className="sub" style={{ marginBottom: 28 }}>
          Keep the game free & evolving — every donation goes straight into development
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20, marginBottom: 32 }}>

          {/* PIX */}
          <div style={cardStyle}>
            <div style={cardBadge('#1a6b2a')}>🇧🇷 PIX</div>
            <p style={cardDesc}>Qualquer banco · instantâneo · sem taxas</p>
            <img
              src="/QRcode.jpeg"
              alt="PIX QR Code"
              style={{ width: 150, height: 150, imageRendering: 'auto', border: '2px solid var(--gold)', borderRadius: 4, margin: '8px auto', display: 'block' }}
            />
            <p style={{ fontSize: 13, color: 'var(--cream-dim)', textAlign: 'center', margin: 0 }}>
              Escaneie com qualquer app bancário
            </p>
          </div>

          {/* Wise */}
          <div style={cardStyle}>
            <div style={cardBadge('#163300')}>💚 Wise</div>
            <p style={cardDesc}>Internacional · transferência bancária · baixa taxa</p>
            <img
              src="/wise_qr.jpeg"
              alt="Wise QR Code"
              style={{ width: 150, height: 150, border: '2px solid var(--gold)', borderRadius: 4, margin: '8px auto', display: 'block' }}
            />
            <p style={{ fontSize: 13, color: 'var(--cream-dim)', textAlign: 'center', margin: 0 }}>
              @alyssong10
            </p>
          </div>

          {/* Ko-fi */}
          <div style={cardStyle}>
            <div style={cardBadge('#c04b00')}>☕ Ko-fi</div>
            <p style={cardDesc}>Internacional · cartão ou PayPal · sem taxa de plataforma</p>
            <a
              href={KOFI_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={kofiBtn}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#e05a00')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#ff6b35')}
            >
              ☕ Buy me a coffee
            </a>
            <p style={{ fontSize: 13, color: 'var(--cream-dim)', textAlign: 'center', margin: '8px 0 0' }}>
              ko-fi.com/wizardarenaplus
            </p>
          </div>

        </div>

        <p style={{ fontSize: 13, color: 'var(--cream-dim)', textAlign: 'center', marginBottom: 20 }}>
          All support goes directly into Wizard Arena Plus development. Thank you! ✨
        </p>

        <Link href="/" className="start-btn lb-back" style={{ display: 'inline-block' }}>
          ← Back to Arena
        </Link>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-deep)',
  border: '2px solid var(--gold-dim)',
  borderRadius: 6,
  padding: '20px 16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
};

function cardBadge(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#fff',
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 10,
    padding: '4px 12px',
    borderRadius: 4,
    letterSpacing: 1,
  };
}

const cardDesc: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--cream-dim)',
  textAlign: 'center',
  margin: 0,
  lineHeight: 1.4,
};

const kofiBtn: React.CSSProperties = {
  display: 'block',
  background: '#ff6b35',
  color: '#fff',
  fontFamily: "'Cinzel', serif",
  fontWeight: 700,
  fontSize: 13,
  textDecoration: 'none',
  padding: '10px 18px',
  borderRadius: 4,
  textAlign: 'center',
  transition: 'background 0.15s',
  width: '100%',
};

