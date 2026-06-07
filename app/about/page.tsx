import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Wizard Arena Plus — Free Multiplayer Survivors Game',
  description: 'Wizard Arena Plus is a free browser & Android multiplayer arena survivors game. Choose from 12 unique wizard characters, battle endless enemy waves, collect powerups, and climb the global leaderboard.',
};

export default function AboutPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at center, #1a0a2e 0%, #0a050f 100%)',
      color: '#e0d8c0',
      fontFamily: "'Georgia', serif",
    }}>
      {/* Nav */}
      <nav style={{
        borderBottom: '1px solid rgba(200,16,46,0.3)',
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'rgba(10,5,15,0.8)',
      }}>
        <Link href="/" style={{ color: '#c8102e', textDecoration: 'none', fontFamily: "'Press Start 2P', monospace", fontSize: 9 }}>
          ← Play Now
        </Link>
        <span style={{ color: '#5a4858', fontSize: 12 }}>|</span>
        <Link href="/leaderboard" style={{ color: '#c8a46e', textDecoration: 'none', fontSize: 12 }}>Leaderboard</Link>
      </nav>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <img
            src="/wizard_arena_plus_logo.png"
            alt="Wizard Arena Plus"
            style={{ width: 300, maxWidth: '90vw', imageRendering: 'pixelated' }}
          />
          <h1 style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 14, color: '#c8a46e',
            marginTop: 24, marginBottom: 12, lineHeight: 1.8,
          }}>
            Wizard Arena Plus
          </h1>
          <p style={{ color: '#9a8a8a', fontSize: 15, lineHeight: 1.7, maxWidth: 600, margin: '0 auto' }}>
            A free-to-play multiplayer arena survivors game. Battle endless waves of monsters,
            collect powerful upgrades, and compete for the top spot on the global leaderboard.
            Play in your browser or download the Android app — completely free.
          </p>
        </div>

        {/* Ad slot — content-adjacent, AdSense compliant */}
        <div style={{ textAlign: 'center', margin: '32px 0', minHeight: 90 }}>
          <ins
            className="adsbygoogle"
            style={{ display: 'block' }}
            data-ad-client="ca-pub-2926713394150469"
            data-ad-slot="auto"
            data-ad-format="horizontal"
            data-full-width-responsive="true"
          />
        </div>

        {/* How to Play */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: '#c8102e', marginBottom: 20, lineHeight: 1.8 }}>
            How to Play
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            {[
              { step: '1', title: 'Choose Your Wizard', desc: 'Pick from 12 unique gladiator-wizards, each with different stats, weapons, and playstyles ranging from tanky bruisers to fragile glass cannons.' },
              { step: '2', title: 'Enter the Arena', desc: 'Join an existing room or create your own with a custom name and optional password. Up to 8 players can share a room simultaneously.' },
              { step: '3', title: 'Survive the Waves', desc: 'Enemy hordes grow stronger every wave. Move, dodge, and attack automatically while collecting XP orbs to level up and choose powerups.' },
              { step: '4', title: 'Stack Powerups', desc: 'Unlock dozens of passive upgrades — faster projectiles, area explosions, piercing bolts, shields and more. Build synergies to dominate the arena.' },
            ].map(({ step, title, desc }) => (
              <div key={step} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(200,164,110,0.2)',
                borderRadius: 8, padding: 20,
              }}>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 18, color: '#c8102e', marginBottom: 10 }}>{step}</div>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#c8a46e', marginBottom: 10, lineHeight: 1.8 }}>{title}</div>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: '#9a8a8a', margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Characters */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: '#c8102e', marginBottom: 20, lineHeight: 1.8 }}>
            12 Unique Gladiators
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: '#9a8a8a', marginBottom: 24 }}>
            Each gladiator-wizard brings a different combat style to the arena. Beginners will find
            Kael the Blue Wizard forgiving and well-rounded, while veterans may prefer the high-risk
            high-reward Ignis the Fire Wizard or the precision-demanding Shade the Shadow Wizard.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { name: 'Kael', title: 'Blue Wizard', weapon: 'Arcane Blade', role: 'Balanced — great starting pick' },
              { name: 'Ignis', title: 'Fire Wizard', weapon: 'Fire Lash', role: 'High damage, low defense' },
              { name: 'Brazok', title: 'Salamander', weapon: 'Fire Lash', role: 'Tanky fire specialist' },
              { name: 'Zarak', title: 'Lightning Wizard', weapon: 'Storm Spear', role: 'Fast multi-hit attacks' },
              { name: 'Stonehide', title: 'Earth Wizard', weapon: 'Earth Slam', role: 'Slow but devastating hits' },
              { name: 'Thornback', title: 'Forest Wizard', weapon: 'Thorn Blade', role: 'Balanced with nature power' },
              { name: 'Shade', title: 'Shadow Wizard', weapon: 'Shadow Strike', role: 'Agile and elusive' },
              { name: 'Runt', title: 'Mouse Apprentice', weapon: 'Quick Jab', role: 'Tiny but very fast' },
              { name: 'Murkus', title: 'Frog Wizard', weapon: 'Swamp Blade', role: 'Resilient and sturdy' },
              { name: 'Elder Rex', title: 'Old Man Wizard', weapon: 'Ancient Force', role: 'Wise — powerful late-game' },
              { name: 'Kestrel', title: 'Owl Wizard', weapon: 'Talon Strike', role: 'Homing projectile expert' },
              { name: 'Velox', title: 'Cat Wizard', weapon: 'Swift Claw', role: 'Scatter shot specialist' },
            ].map(({ name, title, weapon, role }) => (
              <div key={name} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(200,16,46,0.15)',
                borderRadius: 6, padding: '12px 14px',
              }}>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: '#c8a46e' }}>{name}</div>
                <div style={{ fontSize: 11, color: '#c8102e', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 11, color: '#7a6a7a' }}>{weapon}</div>
                <div style={{ fontSize: 10, color: '#5a4858', marginTop: 4, lineHeight: 1.5 }}>{role}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: '#c8102e', marginBottom: 20, lineHeight: 1.8 }}>
            Game Features
          </h2>
          <ul style={{ fontSize: 14, lineHeight: 2, color: '#9a8a8a', paddingLeft: 20 }}>
            <li><strong style={{ color: '#c8a46e' }}>Real-time multiplayer</strong> — up to 8 players sharing the same arena via WebSockets</li>
            <li><strong style={{ color: '#c8a46e' }}>Cross-platform</strong> — play on any browser or install the free Android app</li>
            <li><strong style={{ color: '#c8a46e' }}>Survivors-style progression</strong> — choose from 3 powerups every level-up</li>
            <li><strong style={{ color: '#c8a46e' }}>30+ powerup types</strong> — pierce, chain, explosive, homing, shield, and more</li>
            <li><strong style={{ color: '#c8a46e' }}>Boss waves</strong> — escalating challenge with named boss enemies every few waves</li>
            <li><strong style={{ color: '#c8a46e' }}>Global leaderboard</strong> — compete for the highest wave reached</li>
            <li><strong style={{ color: '#c8a46e' }}>Password-protected rooms</strong> — play privately with friends</li>
            <li><strong style={{ color: '#c8a46e' }}>Google Sign-In</strong> — save your nickname and photo across sessions</li>
            <li><strong style={{ color: '#c8a46e' }}>Free to play</strong> — no pay-to-win mechanics</li>
          </ul>
        </section>

        {/* Ad slot 2 */}
        <div style={{ textAlign: 'center', margin: '32px 0', minHeight: 90 }}>
          <ins
            className="adsbygoogle"
            style={{ display: 'block' }}
            data-ad-client="ca-pub-2926713394150469"
            data-ad-slot="auto"
            data-ad-format="rectangle"
            data-full-width-responsive="true"
          />
        </div>

        {/* Controls */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: '#c8102e', marginBottom: 20, lineHeight: 1.8 }}>
            Controls
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[
              { input: 'WASD / Arrow Keys', action: 'Move your wizard around the arena' },
              { input: 'Auto-attack', action: 'Your wizard attacks the nearest enemy automatically' },
              { input: 'Level Up Screen', action: 'Choose 1 of 3 powerup upgrades' },
              { input: 'Mobile / Android', action: 'On-screen joystick and tap controls' },
            ].map(({ input, action }) => (
              <div key={input} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(200,164,110,0.15)',
                borderRadius: 6, padding: '12px 14px',
              }}>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#c8a46e', marginBottom: 6, lineHeight: 1.8 }}>{input}</div>
                <div style={{ fontSize: 12, color: '#9a8a8a', lineHeight: 1.6 }}>{action}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Link href="/" style={{
            display: 'inline-block',
            background: '#c8102e', color: '#fff',
            padding: '14px 32px', borderRadius: 6,
            fontFamily: "'Press Start 2P', monospace", fontSize: 10,
            textDecoration: 'none', letterSpacing: 1,
          }}>
            Play Free Now →
          </Link>
        </div>
      </main>

      <footer style={{
        borderTop: '1px solid rgba(200,16,46,0.2)',
        padding: '20px 24px', textAlign: 'center',
        color: '#5a4858', fontSize: 12, lineHeight: 1.8,
      }}>
        <p>Wizard Arena Plus — Free multiplayer arena survivors game</p>
        <p style={{ marginTop: 4 }}>
          <Link href="/" style={{ color: '#7a6a7a', marginRight: 16, textDecoration: 'none' }}>Play</Link>
          <Link href="/leaderboard" style={{ color: '#7a6a7a', marginRight: 16, textDecoration: 'none' }}>Leaderboard</Link>
          <Link href="/about" style={{ color: '#7a6a7a', textDecoration: 'none' }}>About</Link>
        </p>
      </footer>
    </div>
  );
}
