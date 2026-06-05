'use client';
import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function AuthCallback() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const next = url.searchParams.get('next') ?? '/';
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        window.location.href = error ? '/?auth_error=1' : next;
      });
    } else {
      window.location.href = '/?auth_error=1';
    }
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0e0818', color: '#c8a46e', fontFamily: "'Press Start 2P', monospace", fontSize: 12 }}>
      Autenticando...
    </div>
  );
}
