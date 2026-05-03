// Tiny client+server-shared profanity filter for player names.
// Goal: block obvious slurs and worst-offender words while keeping the list short.
// Names are 1-16 chars so substring matching is fine — false positives are rare
// at that length and the gameplay impact is low.

// Normalize: lowercase, strip whitespace and non-letter chars, undo common
// leetspeak substitutions so "n1gg3r" / "n!gger" / "n  i  g  g  e  r" all
// collapse to "nigger".
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[8]/g, 'b')
    .replace(/[(<{]/g, 'c')
    .replace(/[3]/g, 'e')
    .replace(/[6]/g, 'g')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[2]/g, 'z')
    .replace(/[^a-z]/g, '');
}

// Substring blacklist after normalization. Aggressive list — better to false-
// positive on a 1-16 char display name than let a slur into a public arena.
const BLOCKED_SUBSTRINGS: readonly string[] = [
  // racial / ethnic slurs
  'nigger', 'nigga', 'niggah', 'niglet', 'niggr',
  'chink', 'chinky',
  'spic',
  'kike',
  'gook',
  'wetback',
  'paki',
  'towelhead',
  'sandnig',
  'redskin',
  'gypsy', 'gypo',
  'jap',
  'beaner',
  'coon',
  // hate ideologies / extremist
  'nazi', 'hitler', 'kkk', 'whitepower', 'blackpower',
  'heilhitler', 'sieghei', 'siegheil',
  'aryan', 'fourteenwords',
  'isis', 'taliban',
  // homophobic / transphobic slurs
  'faggot', 'fagg', 'fagit',
  'tranny', 'troon',
  'dyke', 'lesbo',
  'homo',
  'queerbait',
  // ableist
  'retard', 'retarded', 'tard',
  'spaz', 'sped',
  'mongol',
  'cripple',
  // misogynist
  'cunt', 'twat', 'whore', 'slut', 'thot', 'skank', 'hoe',
  // strong general profanity
  'fuck', 'fck', 'fuk', 'phuk', 'phuck',
  'shit', 'sht', 'shyt', 'bullshit', 'shitter', 'shithead',
  'piss', 'pisser', 'pissed',
  'bitch', 'biatch', 'btch',
  'asshole', 'asshat', 'arsehole',
  'bastard',
  'dick', 'dickhead', 'dickface', 'dik',
  'pussy', 'pussi',
  'cock', 'cocksucker', 'cawk',
  'wanker', 'wank',
  'prick',
  'bollocks', 'bollox',
  'douche', 'douchebag',
  'jackass',
  'motherfucker', 'mthrfckr',
  'goddamn',
  // sexual / explicit
  'penis', 'vagina', 'boobs', 'tits', 'titties', 'titty',
  'horny', 'orgasm', 'cumshot', 'jizz',
  'porn', 'pornography', 'xxx',
  'masturbat', 'jerkoff', 'jerkin', 'fap',
  'schlong', 'wiener', 'weiner',
  'bdsm',
  // sexual / illegal
  'rape', 'rapist',
  'pedo', 'pedophile', 'paedo', 'paedophile',
  'molest', 'molester',
  'incest', 'incestuous',
  'bestiality', 'zoophil',
  'cp',
  // self-harm / suicide encouragement
  'killyourself', 'kys',
];

export function isBlockedName(name: string): boolean {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  return BLOCKED_SUBSTRINGS.some((bad) => normalized.includes(bad));
}
