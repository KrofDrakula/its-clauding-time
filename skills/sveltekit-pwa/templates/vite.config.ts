import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    // Hosts that may reach the dev server; add the LAN name of your dev machine.
    allowedHosts: ['0.0.0.0', 'localhost']
  },
  plugins: [
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true
      },

      // adapter-node produces a standalone server bundle (build/index.js) that
      // the Dockerfile runs under Node.
      // See https://svelte.dev/docs/kit/adapters for more information about adapters.
      adapter: adapter()
    })
  ],
  test: {
    // Plain modules (service worker routing, range parsing, engines) run in
    // Node. Add a browser project when a test needs real layout or pointer events.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    expect: { requireAssertions: true }
  }
});
