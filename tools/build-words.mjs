// Builds src/games/words/data/words.txt, the word list for Word Grid, from the 12dicts
// word lists (version 6.0.2) by Alan Beale, which are in the public domain.
//
//   1. Download http://downloads.sourceforge.net/wordlist/12dicts-6.0.2.zip
//   2. Unzip it, then run:
//      node tools/build-words.mjs path/to/International/3of6game.txt
//
// 3of6game is the 12dicts list meant for word games, balanced between American and
// British spellings, with plurals and other inflected forms. This script keeps plain
// lower-case words of 3 to 10 letters, strips the list's annotation marks, and drops a
// short list of offensive words.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-words.mjs path/to/3of6game.txt');
  process.exit(1);
}

// Words a family game shouldn't accept or show, even though they are real words. Kept
// short and obvious on purpose; the list isn't meant to be complete.
const BLOCKED = new Set(
  [
    'arse', 'arses', 'arsehole', 'arseholes', 'ass', 'asses', 'asshole', 'assholes', 'bastard', 'bastards',
    'bitch', 'bitches', 'bitchy', 'bollocks', 'boob', 'boobs', 'bugger', 'buggers', 'bullshit', 'crap',
    'crappy', 'cock', 'cocks', 'cunt', 'cunts', 'damn', 'damned', 'dick', 'dicks', 'dildo', 'dildos',
    'dyke', 'dykes', 'fag', 'fags', 'faggot', 'faggots', 'fuck', 'fucked', 'fucker', 'fuckers', 'fucking',
    'fucks', 'hooker', 'hookers', 'horny', 'jerkoff', 'kike', 'kikes', 'nigga', 'niggas', 'nigger',
    'niggers', 'orgasm', 'orgasms', 'piss', 'pissed', 'pisses', 'pissing', 'porn', 'porno', 'prick',
    'pricks', 'pussy', 'queer', 'queers', 'rape', 'raped', 'rapes', 'raping', 'rapist', 'rapists',
    'retard', 'retarded', 'retards', 'shag', 'shagged', 'shagging', 'shags', 'shit', 'shits', 'shitty',
    'slut', 'sluts', 'slutty', 'spastic', 'spaz', 'tits', 'titty', 'twat', 'twats', 'wank', 'wanked',
    'wanker', 'wankers', 'wanking', 'wanks', 'whore', 'whores', 'wog', 'wogs', 'chink', 'chinks', 'gook',
    'gooks', 'spic', 'spics', 'tranny', 'nazi', 'nazis', 'negro', 'negroes', 'coon', 'coons', 'paki',
    'pakis', 'jizz', 'semen', 'sperm', 'penis', 'penises', 'vagina', 'vaginas', 'anal', 'anus', 'clit',
    'erection', 'erections', 'scrotum', 'testicle', 'testicles', 'masturbate', 'masturbated',
    'masturbates', 'masturbating', 'masturbation', 'nude', 'nudes', 'sexy', 'boner', 'boners',
  ],
);

const words = new Set();
for (const raw of readFileSync(src, 'utf8').split(/\r?\n/)) {
  // Annotations in 12dicts lists: $ & + ! ^ and similar marks after a word.
  const w = raw.trim().replace(/[^A-Za-z]+$/, '');
  if (!/^[a-z]{3,10}$/.test(w)) continue;
  if (BLOCKED.has(w)) continue;
  words.add(w);
}
const out = [...words].sort();
writeFileSync(new URL('../src/games/words/data/words.txt', import.meta.url), out.join('\n') + '\n');
console.log(`wrote ${out.length} words`);
