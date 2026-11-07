import WORDS_TXT from '../data/words.txt?raw';
import { buildTrie, TrieNode } from './trie';

/*
 * The word list: 12dicts 3of6game (v6.0.2) by Alan Beale, public domain, cleaned by
 * tools/build-words.mjs. It is about 440 KB, so only the level builder (which runs in a
 * worker) imports this module; the game screens never load it.
 */
export const WORDS: string[] = WORDS_TXT.split('\n').filter(Boolean);

let trie: TrieNode | null = null;
export function dictionaryTrie(): TrieNode {
  trie ??= buildTrie(WORDS);
  return trie;
}
