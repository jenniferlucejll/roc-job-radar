import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { config } from '../config.js';

const sql = postgres({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  username: config.db.user,
  password: config.db.password,
  max: 1,
});

const db = drizzle(sql);

await migrate(db, { migrationsFolder: './src/db/migrations' });
console.log('Migrations applied.');
await sql.end();
