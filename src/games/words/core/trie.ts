/** A letter tree for fast "is this a word / could a word start like this" questions. */
export interface TrieNode {
  next: Map<string, TrieNode>;
  word: boolean;
}

export function buildTrie(words: Iterable<string>): TrieNode {
  const root: TrieNode = { next: new Map(), word: false };
  for (const w of words) {
    let node = root;
    for (const ch of w) {
      let n = node.next.get(ch);
      if (!n) {
        n = { next: new Map(), word: false };
        node.next.set(ch, n);
      }
      node = n;
    }
    node.word = true;
  }
  return root;
}

/** Squares beside square i (all eight directions) on a size x size grid. */
export function neighbours(size: number, i: number): number[] {
  const x = i % size;
  const y = (i / size) | 0;
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.push(ny * size + nx);
    }
  }
  return out;
}

/**
 * Every word (3 letters or more) that can be traced on the grid: start anywhere, step to
 * a neighbouring square each letter, never using a square twice in one word. A
 * depth-first search that follows the trie, so it stops as soon as no word starts that way.
 */
export function findWords(size: number, letters: string[], trie: TrieNode): string[] {
  const found = new Set<string>();
  const used = new Uint8Array(letters.length);
  const near = letters.map((_, i) => neighbours(size, i));
  const go = (i: number, node: TrieNode, word: string) => {
    const n = node.next.get(letters[i]);
    if (!n) return;
    const w = word + letters[i];
    if (n.word && w.length >= 3) found.add(w);
    used[i] = 1;
    for (const j of near[i]) if (!used[j]) go(j, n, w);
    used[i] = 0;
  };
  for (let i = 0; i < letters.length; i++) go(i, trie, '');
  return [...found].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}

/** A way to trace a word on the grid, as squares in order, or null if there is none. */
export function pathOf(size: number, letters: string[], word: string): number[] | null {
  const used = new Uint8Array(letters.length);
  const path: number[] = [];
  const go = (i: number, k: number): boolean => {
    if (letters[i] !== word[k]) return false;
    used[i] = 1;
    path.push(i);
    if (k === word.length - 1) return true;
    for (const j of neighbours(size, i)) if (!used[j] && go(j, k + 1)) return true;
    used[i] = 0;
    path.pop();
    return false;
  };
  for (let i = 0; i < letters.length; i++) if (go(i, 0)) return path;
  return null;
}

/** Points for a word by its length: longer words are worth much more. */
export function pointsFor(word: string): number {
  const n = word.length;
  return n <= 4 ? 1 : n === 5 ? 2 : n === 6 ? 3 : n === 7 ? 5 : 11;
}
