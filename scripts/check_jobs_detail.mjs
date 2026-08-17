import { sequelize } from '../config/postgresql.js';
import { Op } from 'sequelize';
import Job from '../models/Job.js';

const email = 'muthees@trinitetech.com';

try {
  await sequelize.authenticate();
  console.log('DB connected\n');

  // 1. Status breakdown
  const rows = await Job.findAll({
    where: { employerEmail: email },
    attributes: ['isActive', 'status', 'id', 'jobTitle', 'positionId', 'company', 'createdAt', 'applicationDeadline'],
    raw: true,
  });
  console.log('TOTAL jobs:', rows.length);

  const byActive = {};
  rows.forEach(r => { const k = `${r.isActive ? 'isActive=true' : 'isActive=false'} / status=${r.status || 'null'}`; byActive[k] = (byActive[k] || 0) + 1; });
  console.log('\nBy active/status:');
  Object.entries(byActive).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  -', k, '=>', v));

  // 2. By company
  const byCompany = {};
  rows.forEach(r => { byCompany[r.company || '(empty)'] = (byCompany[r.company || '(empty)'] || 0) + 1; });
  console.log('\nBy company:');
  Object.entries(byCompany).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  -', k, '=>', v));

  // 3. Sample of non-active jobs (why 70 aren't visible)
  const inactive = rows.filter(r => !r.isActive);
  console.log(`\nSample of inactive jobs (${inactive.length}):`);
  inactive.slice(0, 10).forEach(r => console.log('  -', r.positionId, '|', r.jobTitle, '|', r.company, '| status:', r.status, '| created:', r.createdAt.toISOString().slice(0, 10)));

  // 4. Monthly creation pattern
  const byMonth = {};
  rows.forEach(r => { const m = r.createdAt.toISOString().slice(0, 7); byMonth[m] = (byMonth[m] || 0) + 1; });
  console.log('\nCreated per month:');
  Object.entries(byMonth).sort().forEach(([k, v]) => console.log('  -', k, '=>', v));

  // 5. Duplicate positionIds
  const posMap = {};
  rows.forEach(r => { posMap[r.positionId] = (posMap[r.positionId] || 0) + 1; });
  const dups = Object.entries(posMap).filter(([, v]) => v > 1);
  console.log('\nDuplicate positionId count:', dups.length);
  dups.slice(0, 10).forEach(([k, v]) => console.log('  -', k, '=>', v, 'times'));
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await sequelize.close();
}