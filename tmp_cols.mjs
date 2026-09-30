import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position`);
console.log('Columns:', r.rows.map(x => x.column_name).join(', '));
await pool.end();
