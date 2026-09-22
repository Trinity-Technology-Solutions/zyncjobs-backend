import bcrypt from 'bcryptjs';
import pg from 'pg';

const client = new pg.Client({
  host: 'localhost', port: 5432,
  database: 'zyncjobs', user: 'postgres', password: 'Muthees@1412'
});
await client.connect();

const { rows } = await client.query(
  `SELECT password, role, "failedLoginAttempts", "accountLockedUntil" FROM users WHERE email ILIKE 'muthees@trinitetech.com'`
);

const hash = rows[0].password;
console.log('Hash in DB :', hash);
console.log('Role       :', rows[0].role);
console.log('Attempts   :', rows[0].failedLoginAttempts);
console.log('LockedUntil:', rows[0].accountLockedUntil);

const match = await bcrypt.compare('Muthees@1412', hash);
console.log('Password match:', match);

// Also reset attempts and lock just in case
await client.query(
  `UPDATE users SET "failedLoginAttempts"=0, "accountLockedUntil"=NULL WHERE email ILIKE 'muthees@trinitetech.com'`
);
console.log('Attempts reset to 0, lock cleared');

await client.end();
