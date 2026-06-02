import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export type UserProfile = {
  id: string;
  nickname: string;
  photo_url: string | null;
  created_at: string;
};

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data ?? null;
}

export async function upsertProfile(userId: string, nickname: string, photoUrl: string | null) {
  await supabase.from('user_profiles').upsert({
    id: userId,
    nickname,
    photo_url: photoUrl,
  });
}
