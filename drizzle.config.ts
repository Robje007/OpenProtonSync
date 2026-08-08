import { defineConfig } from 'drizzle-kit';
import { join } from 'path';
import { xdgState } from 'xdg-basedir';

if (!xdgState) {
  throw new Error('XDG_STATE_HOME is not defined');
}
const STATE_DIR = join(xdgState, 'openprotonsync');
const DB_PATH = join(STATE_DIR, 'state.db');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: DB_PATH,
  },
});
