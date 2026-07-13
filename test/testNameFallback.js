import dotenv from 'dotenv';
dotenv.config();
import { resumeParser } from '../utils/resumeParserAI.js';

// Resume starting with email (no name) — like the user's case
const resumeText = `vinuaravind@gmail.com
Chennai

Skills in programming, content creation, celebrity management, and public relations.

PROFESSIONAL EXPERIENCE
Programming Head - Events Team, Behindwoods (2022 - Present)
Special Correspondent & Video Team Chief, FilmiBeat Tamil (2019 - 2022)
Senior Program Producer, Sun Music & Adithya TV (2012 - 2019)

EDUCATION
M.A. Mass Communication, Alagappa University (2005-2007)
B.Sc. Visual Communication, C.S.I. Bishop Appasamy College (2000-2003)`;

console.log('Testing resume without clear name...');
const start = Date.now();
const result = await resumeParser.parseResumeToProfile(resumeText);
const elapsed = Date.now() - start;

console.log(`Done in ${elapsed}ms`);
console.log('Name:', `"${result.name}"`);
console.log('Email:', result.email);
console.log('Phone:', `"${result.phone}"`);
console.log('Title:', `"${result.title}"`);
console.log('Skills:', result.skills);
console.log('Work Exp:', result.workExperiences.length, 'entries');
console.log('Education:', result.educations.length, 'entries');

const ok = result.email === 'vinuaravind@gmail.com' && result.name !== '';
console.log(`\n${ok ? 'PASS' : 'FAIL'} — Name is ${result.name ? `"${result.name}"` : 'EMPTY!'}`);
process.exit(ok ? 0 : 1);
