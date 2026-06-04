/**
 * Test script: verifies the AI resume parsing pipeline end-to-end
 * Run: node scripts/test-ai-parse.mjs
 */

import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.OPENROUTER_API_KEY;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

const SAMPLE_RESUME = `MARY MOFISHA R
Chennai, Tamil Nadu, 600050
mofisha0303@gmail.com | 9361793991

SUMMARY
Motivated IT student specializing in Data Science tools like Python, Excel, and Power BI. Actively seeking a 30-day internship to gain real-time industry exposure and apply analytical skills to meaningful projects.

EDUCATION
St. Joseph's Institute of Technology, Chennai
B.Tech in Information Technology, CGPA: 8.04/10
Chennai, Tamil Nadu                                    2028

Spartan Matric Hr. Sec. School
Class XII (Higher Secondary), 80%                      2024

Jessie Moses Matric Hr. Sec. School
Class X (Secondary), 92%                               2022

EXPERIENCE
HCL Technologies
• Completed a 15-day internship at HCL Technologies focused on Data Analysis.
• Gained hands-on experience in Excel, Power BI, and basic data analysis techniques.

CERTIFICATIONS
• A Quick Introduction to Machine Learning
• Deep Learning Fundamentals
• Hadoop 101
• SQL and Relational Databases 101
• Probability and Statistics Using Python

PROJECTS
Data Analysis Presentation – Analyzed sample datasets from online sources and created visual presentations using Power BI.
Mini Web Browser (MEDICON) – Developed a simple medical application to manage basic healthcare-related functions.

KEY SKILLS
Python, SQL, Power BI, Excel, Machine Learning (Basics), Critical Thinking, Communication, Creativity, Public Speaking, Hadoop, Leadership Skills`;

// ─── STEP 1: Check API Key ────────────────────────────────────────────────────
function checkApiKey() {
  console.log('\n[1/4] Checking OPENROUTER_API_KEY...');
  if (!API_KEY) {
    console.error('  ✗ OPENROUTER_API_KEY not set in .env');
    process.exit(1);
  }
  if (!API_KEY.startsWith('sk-or-v1-')) {
    console.warn('  ⚠ Key format looks unexpected (expected sk-or-v1-...)');
  } else {
    console.log('  ✓ API key present:', API_KEY.slice(0, 20) + '...');
  }
}

// ─── STEP 2: Direct OpenRouter call ──────────────────────────────────────────
async function testOpenRouterDirect() {
  console.log('\n[2/4] Testing direct OpenRouter API call...');
  const models = [
    'openai/gpt-oss-120b:free',
    'openai/gpt-oss-20b:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'moonshotai/kimi-k2.6:free',
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'nvidia/nemotron-nano-9b-v2:free',
    'meta-llama/llama-3.3-70b-instruct:free',
  ];

  for (const model of models) {
    try {
      process.stdout.write(`  Trying model: ${model} ... `);
      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages: [{ role: 'user', content: 'Reply with just the word: WORKING' }],
          max_tokens: 10,
          temperature: 0,
        },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:5173',
            'X-Title': 'ZyncJobs-Test',
          },
          timeout: 20000,
        }
      );
      const reply = res.data?.choices?.[0]?.message?.content?.trim();
      console.log(`✓ Response: "${reply}"`);
      return model; // return first working model
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message;
      console.log(`✗ ${status || 'ERR'}: ${msg}`);
    }
  }
  console.error('  ✗ All OpenRouter models failed');
  return null;
}

// ─── STEP 3: Full AI resume parse ─────────────────────────────────────────────
async function testAIResumeParse(workingModel) {
  console.log('\n[3/4] Testing AI resume parsing with sample resume...');
  if (!workingModel) {
    console.warn('  ⚠ Skipping — no working model found');
    return null;
  }

  const prompt = `You are an expert resume parser. Extract ALL information from the resume below and return ONLY valid JSON (no markdown, no explanation).

RESUME:
${SAMPLE_RESUME}

Return JSON:
{
  "name": "candidate full name",
  "email": "",
  "phone": "",
  "location": "city",
  "title": "job role or student",
  "summary": "2-3 line summary",
  "skills": ["skill1", "skill2"],
  "workExperiences": [{"jobTitle":"","company":"","date":"","descriptions":[]}],
  "educations": [{"degree":"","school":"","date":"","grade":""}],
  "projects": [{"name":"","description":""}],
  "certifications": [{"name":"","provider":"","date":""}]
}`;

  try {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: workingModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'ZyncJobs-Resume-Test',
        },
        timeout: 45000,
      }
    );

    const content = res.data?.choices?.[0]?.message?.content?.trim();
    if (!content) { console.error('  ✗ Empty AI response'); return null; }

    const jsonMatch = content.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) { console.error('  ✗ No JSON in response:\n', content.slice(0, 200)); return null; }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('  ✓ AI Parsed Result:');
    console.log('    Name      :', parsed.name);
    console.log('    Email     :', parsed.email);
    console.log('    Phone     :', parsed.phone);
    console.log('    Location  :', parsed.location);
    console.log('    Title     :', parsed.title);
    console.log('    Skills    :', (parsed.skills || []).slice(0, 6).join(', '));
    console.log('    Education :', (parsed.educations || []).map(e => e.school).join(' | '));
    console.log('    Experience:', (parsed.workExperiences || []).map(e => e.company).join(' | ') || '(none)');
    console.log('    Projects  :', (parsed.projects || []).map(p => p.name).join(' | '));

    const issues = [];
    if (!parsed.name || parsed.name.toLowerCase().includes('motivated') || parsed.name.toLowerCase().includes('student')) {
      issues.push(`Name is wrong: "${parsed.name}" — should be "Mary Mofisha R"`);
    }
    if ((parsed.skills || []).length < 3) issues.push(`Only ${(parsed.skills||[]).length} skills found — expected 8+`);
    if ((parsed.educations || []).length < 2) issues.push(`Only ${(parsed.educations||[]).length} education entries — expected 3`);

    if (issues.length === 0) {
      console.log('\n  ✅ AI parsing is WORKING CORRECTLY');
    } else {
      console.log('\n  ⚠ AI parsing has issues:');
      issues.forEach(i => console.log('    -', i));
    }
    return parsed;
  } catch (err) {
    console.error('  ✗ Parse test failed:', err.response?.data?.error?.message || err.message);
    return null;
  }
}

// ─── STEP 4: Test backend endpoint ───────────────────────────────────────────
async function testBackendEndpoint() {
  console.log('\n[4/4] Testing backend /api/resume/parse-profile endpoint...');
  try {
    const res = await axios.post(
      `${BACKEND_URL}/api/resume/parse-profile`,
      { resumeText: SAMPLE_RESUME },
      { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    const p = res.data?.profileData;
    if (!p) { console.error('  ✗ No profileData in response:', res.data); return; }
    console.log('  ✓ Backend endpoint responded successfully');
    console.log('    Name    :', p.name);
    console.log('    Email   :', p.email);
    console.log('    Skills  :', (p.skills || []).slice(0, 5).join(', '));
    console.log('    Edu     :', (p.educations || []).map(e => e.school).join(' | '));
    if (!p.name || (p.skills || []).length < 2) {
      console.log('  ⚠ Backend returned sparse data — AI may be using fallback');
    } else {
      console.log('  ✅ Backend AI parsing is WORKING CORRECTLY');
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.log('  ⚠ Backend not running at', BACKEND_URL, '— skipping endpoint test');
    } else {
      console.error('  ✗ Endpoint error:', err.response?.data || err.message);
    }
  }
}

// ─── Run all tests ────────────────────────────────────────────────────────────
(async () => {
  console.log('='.repeat(55));
  console.log('  ZyncJobs AI Resume Parse — Diagnostic Test');
  console.log('='.repeat(55));

  checkApiKey();
  const workingModel = await testOpenRouterDirect();
  await testAIResumeParse(workingModel);
  await testBackendEndpoint();

  console.log('\n' + '='.repeat(55));
  console.log('  Done.');
  console.log('='.repeat(55) + '\n');
})();
