import { defineConfig, Plugin } from 'vite';

// Every build gets an id. CI uses the commit SHA; local builds fall back to a timestamp.
const BUILD_ID = (process.env.GITHUB_SHA || `local-${Date.now()}`).slice(0, 12);

// Emits version.json next to index.html so a running copy of the game can ask the
// server which build is live and offer to reload when it is newer than its own.
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: BUILD_ID }),
      });
    },
  };
}

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [versionFile()],
  test: { environment: 'node' },
} as any);
