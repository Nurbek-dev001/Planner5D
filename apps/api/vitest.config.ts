import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://spaceplan:spaceplan@localhost:5432/spaceplan_test',
    },
    fileParallelism: false,
  },
});
