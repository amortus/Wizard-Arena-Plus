'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function AuthCallback() {
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const next = url.searchParams.get('next') ?? '/';

    if (!code) {
      // Sem code → talvez seja implicit flow com hash
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          window.location.href = next;
        } else {
          setErrMsg('no-code-no-session');
          setTimeout(() => { window.location.href = '/?auth_error=1'; }, 3000);
        }
      });
      return;
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setErrMsg(error.message);
        setTimeout(() => { window.location.href = '/?auth_error=1'; }, 3000);
      } else {
        window.location.href = next;
      }
    });
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#0e0818', color: '#c8a46e',
      fontFamily: "'Press Start 2P', monospace", fontSize: 11, gap: 16,
    }}>
      <div>Autenticando...</div>
      {errMsg && (
        <div style={{ color: '#ff6644', fontSize: 9, maxWidth: 400, textAlign: 'center', lineHeight: 1.8 }}>
          {errMsg}
        </div>
      )}
    </div>
  );
}
