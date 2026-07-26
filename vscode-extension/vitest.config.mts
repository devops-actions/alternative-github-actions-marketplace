import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the pure modules are unit tested here. Anything importing `vscode`
    // needs the extension host, which is out of scope for these tests.
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/data/**/*.ts', 'src/tools/format.ts'],
      reporter: ['text', 'lcov']
    }
  }
});
