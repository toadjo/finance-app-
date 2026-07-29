import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // The main process is plain CJS, but its path containment rule guards the
    // filesystem, so it is tested alongside the renderer's maths.
    include: ['src/**/*.test.ts', 'electron/**/*.test.mjs'],
  },
})
