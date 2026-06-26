import bcrypt from 'bcryptjs';
import pg from 'pg';
const { Pool } = pg;

const hash = bcrypt.hashSync('TestAdmin@123', 8);
console.log('Hash:', hash);

const pool = new Pool({
  host: 'localhost', port: 5432, database: 'zyncjobs',
  user: 'postgres', password: 'Muthees@1412'
});

pool.query('UPDATE users SET password = $1, "failedLoginAttempts" = 0, "accountLockedUntil" = NULL WHERE email = $2', [hash, 'admin@zyncjobs.com'])
  .then(() => { console.log('Password updated!'); return pool.end(); })
  .catch(e => { console.error(e.message); return pool.end(); });
