export const metadata = {
  title: 'Privacy Policy — Wizard Arena Plus',
};

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px', fontFamily: 'sans-serif', color: '#ddd', background: '#111', minHeight: '100vh' }}>
      <h1 style={{ color: '#fff', marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#888', marginBottom: 32 }}>Last updated: June 9, 2025</p>

      <p>Wizard Arena Plus (&quot;the game&quot;, &quot;we&quot;, &quot;us&quot;) is a free browser-based and mobile multiplayer game. This policy explains what data we collect and how we use it.</p>

      <h2 style={{ color: '#fff', marginTop: 32 }}>1. Information We Collect</h2>
      <ul>
        <li><strong>Guest play:</strong> No personal data is collected. You choose a nickname that exists only for the duration of your session.</li>
        <li><strong>Google Sign-In:</strong> We receive your Google display name and profile photo URL via OAuth. We store these in our database (Supabase) to identify you on the leaderboard.</li>
        <li><strong>Game data:</strong> We store your score, wave reached, and character choice for the public leaderboard.</li>
      </ul>

      <h2 style={{ color: '#fff', marginTop: 32 }}>2. How We Use Your Information</h2>
      <ul>
        <li>Display your name and avatar on the in-game leaderboard.</li>
        <li>Improve game balance and performance (aggregated, non-personal analytics).</li>
      </ul>

      <h2 style={{ color: '#fff', marginTop: 32 }}>3. Third-Party Services</h2>
      <ul>
        <li><strong>Supabase</strong> — authentication and profile storage (<a href="https://supabase.com/privacy" style={{ color: '#7af' }}>privacy policy</a>).</li>
        <li><strong>PartyKit / Cloudflare</strong> — real-time multiplayer server (<a href="https://www.cloudflare.com/privacypolicy/" style={{ color: '#7af' }}>privacy policy</a>).</li>
        <li><strong>Google AdSense</strong> — ads may be shown; Google may use cookies for ad personalisation (<a href="https://policies.google.com/privacy" style={{ color: '#7af' }}>privacy policy</a>).</li>
        <li><strong>Umami Analytics</strong> — privacy-focused, cookie-free analytics to understand page visits. No personal data is stored.</li>
      </ul>

      <h2 style={{ color: '#fff', marginTop: 32 }}>4. Data Retention</h2>
      <p>Leaderboard entries and profile data are kept while the service is active. You can request deletion of your data at any time by contacting us.</p>

      <h2 style={{ color: '#fff', marginTop: 32 }}>5. Children</h2>
      <p>The game is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us personal data, please contact us so we can remove it.</p>

      <h2 style={{ color: '#fff', marginTop: 32 }}>6. Contact</h2>
      <p>Questions or deletion requests: <a href="mailto:andre@tos.world" style={{ color: '#7af' }}>andre@tos.world</a></p>
    </div>
  );
}
