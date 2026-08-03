import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Resume from '../models/Resume.js';
import User from '../models/User.js';
import { updateLastActive } from '../services/gdprRetentionScheduler.js';
import { uploadResumeToS3, uploadTalentResumeToS3 } from '../services/s3Service.js';
import pdfTextExtractor from '../services/pdfTextExtractor.js';

// Skill keyword dictionary — mirrors frontend SKILL_GRAPH with full global domain coverage
const SKILL_KEYWORDS = [
  // ── Frontend ──
  'javascript','typescript','react','angular','vue','html','css','redux','ui/ux','figma','sketch','adobe xd',
  // ── Backend ──
  'node.js','python','java','c#','php','ruby','go','rust','kotlin','scala','c++',
  // ── Database ──
  'sql','nosql','mongodb','redis','elasticsearch',
  // ── Cloud / DevOps ──
  'aws','amazon web services','ec2','s3','lambda','cloudfront','rds','azure','microsoft azure',
  'gcp','google cloud','google cloud platform','bigquery','docker','containerization','kubernetes','k8s',
  'devops','ci/cd','jenkins','github actions','gitlab ci','terraform','ansible',
  'git','github','gitlab','bitbucket','version control','linux','unix','bash','shell scripting',
  // ── AI / ML / Data ──
  'machine learning','ml','deep learning','ai','artificial intelligence','tensorflow','pytorch','keras','neural networks',
  'data science','data engineering','big data','data scientist','data engineer',
  'data analysis','data analytics','tableau','power bi','excel','data visualization','reporting','business analytics',
  'spark','apache spark','pyspark','hadoop','apache hadoop','hdfs','mapreduce','hive',
  // ── Mobile ──
  'swift','ios','xcode','objective-c','ios development','flutter','dart','flutter development',
  // ── QA / Testing ──
  'manual testing','manual test','functional testing','exploratory testing','black box testing','white box testing',
  'regression testing','smoke testing','sanity testing','uat','user acceptance testing','system testing',
  'automation testing','selenium','cypress','playwright','test automation','automated testing','appium','testng','junit','pytest','robot framework',
  'sdlc','software development life cycle','software development lifecycle','development lifecycle',
  'stlc','software testing life cycle','software testing lifecycle','testing lifecycle',
  'bug tracking','defect tracking','bug reporting','jira','bugzilla','mantis','defect management','issue tracking',
  'api testing','rest api testing','postman','soap testing','rest assured','api automation',
  'performance testing','load testing','stress testing','jmeter','gatling','k6','test cases','test case writing',
  'test case design','test planning','test plan','test scripts','quality assurance','qa','qc','quality control',
  // ── Design ──
  'ui/ux','figma','sketch','adobe xd','user interface','user experience','design','ux design','ui design',
  // ── Project Management / Soft Skills ──
  'agile','scrum','kanban','jira','sprint','agile methodology','agile scrum','project management','pmp',
  'project planning','project coordination','project delivery','communication','verbal communication',
  'written communication','interpersonal skills','presentation skills','leadership','team lead','team leadership',
  'people management','mentoring','coaching','problem solving','analytical thinking','critical thinking','troubleshooting',
  'decision making','microsoft office','ms office','word','powerpoint','outlook','office 365','ms word','ms excel',
  'time management','multitasking','prioritization','deadline management','organizational skills','teamwork','team player',
  'collaboration','cross functional','coordination',
  // ── Finance / Accounting ──
  'accounting','bookkeeping','accounts payable','accounts receivable','financial accounting','tally','tally erp',
  'general ledger','ledger','financial analysis','financial modeling','financial reporting','budgeting','forecasting',
  'mis reporting','mis','variance analysis','taxation','gst','income tax','tax filing','indirect tax','direct tax',
  'tds','vat','tax compliance','auditing','internal audit','external audit','statutory audit','audit report',
  'audit compliance','banking','retail banking','corporate banking','investment banking','trade finance','treasury',
  'loans','credit analysis','insurance','life insurance','general insurance','underwriting','claims','actuarial',
  'finance','financial management','corporate finance','working capital','cash flow','fund management',
  // ── Marketing / Sales ──
  'digital marketing','seo','sem','social media marketing','content marketing','email marketing','online marketing',
  'performance marketing','search engine optimization','on-page seo','off-page seo','technical seo','keyword research',
  'link building','social media','social media management','instagram','facebook marketing','linkedin marketing',
  'youtube marketing','content writing','copywriting','blog writing','technical writing','content creation','article writing',
  'sales','business development','lead generation','crm','b2b sales','b2c sales','inside sales','field sales',
  'direct sales','retail sales','telesales','cold calling','marketing','brand management','product marketing',
  'market research','campaign management','btl','atl','customer service','customer support','client servicing',
  'customer care','customer success','after sales service','helpdesk','retail','store management','merchandising',
  'visual merchandising','inventory management','pos',
  // ── HR / Operations ──
  'human resources','hr','recruitment','talent acquisition','payroll','hrms','hris','hr operations','hr generalist',
  'recruitment','talent acquisition','sourcing','hiring','staffing','headhunting','campus recruitment',
  'payroll processing','salary processing','payroll management','pf','esi','statutory compliance','operations',
  'operations management','process improvement','supply chain','logistics','warehouse management','inventory control',
  'supply chain','logistics','procurement','vendor management','sourcing','import export','freight','shipping',
  'logistics','freight forwarding','warehouse','dispatch','delivery management','fleet management','transportation',
  // ── Gulf / Middle East ──
  'gulf experience','gcc experience','middle east experience','uae experience','saudi experience',
  'qatar experience','kuwait experience','oman experience','bahrain experience','driving license',
  'uae driving license','gcc driving license','light motor vehicle','lmv','heavy vehicle license',
  // ── Civil / Construction ──
  'civil engineering','structural engineering','construction management','site engineering','civil works','rcc','autocad','auto cad','cad design','drafting','2d drafting','3d modeling','revit','staad pro','etabs',
  'construction','site supervision','project execution','building construction','infrastructure','road construction',
  'quantity surveying','qs','bill of quantities','boq','cost estimation','tendering','rate analysis','project planning','primavera','ms project',
  'project scheduling','gantt chart','wbs','project control','mep','mechanical electrical plumbing','hvac','electrical works','plumbing','fire fighting',
  'surveying','land surveying','total station','gps survey','leveling','topographic survey',
  // ── Mechanical / Manufacturing ──
  'mechanical engineering','machine design','product design','manufacturing engineering','industrial engineering','cad design','solidworks','catia','pro-e','creo','nx cad','unigraphics','ansys','production','production planning',
  'production management','manufacturing','shop floor','assembly line','lean manufacturing','quality control','qc','quality inspection','incoming quality','in-process quality',
  'final inspection','iqc','maintenance','preventive maintenance','predictive maintenance','breakdown maintenance','tpm','cmms','welding','tig welding','mig welding','arc welding',
  'fabrication','structural fabrication','cnc','cnc machining','cnc programming','cnc operator','lathe','milling','turning',
  // ── Electrical / Electronics ──
  'electrical engineering','power systems','electrical design','panel design','switchgear','hv','lv','mv','plc','plc programming','scada','dcs','automation','industrial automation','hmi','embedded systems',
  'embedded c','microcontroller','arduino','raspberry pi','rtos','firmware','vlsi','vhdl','verilog','fpga','asic','chip design','semiconductor',
  // ── Healthcare / Medical ──
  'nursing','staff nurse','registered nurse','rn','icu nursing','ot nursing','critical care nursing','patient care','doctor','mbbs','md','ms','physician','general practitioner','gp','specialist','consultant','pharmacy','pharmacist','clinical pharmacy',
  'drug dispensing','pharmaceutical','pharma','medical laboratory','lab technician','medical lab','pathology','microbiology','hematology','biochemistry','radiology','x-ray','mri','ct scan','ultrasound','radiographer','imaging',
  'physiotherapy','physical therapy','physiotherapist','rehabilitation','sports therapy','healthcare management','hospital administration','health informatics','clinical management','medical coding','icd coding',
  // ── Education / Teaching ──
  'teaching','teacher','faculty','lecturer','instructor','trainer','tutor','educator','curriculum development','lesson planning','course design','instructional design','e-learning','lms','training','corporate training','soft skills training','technical training','learning and development','l&d',
  // ── Hospitality / Hotel ──
  'hospitality','hotel management','front office','housekeeping','food and beverage','f&b','banquet','concierge','food service','restaurant management','kitchen management','chef','catering','barista','bartender','travel','travel management','ticketing','gds','amadeus','galileo','tour operations','travel consultant',
  // ── Media / Creative ──
  'video editing','premiere pro','final cut pro','davinci resolve','after effects','motion graphics','graphic design','photoshop','illustrator','indesign','canva','visual design','branding','photography','photo editing','lightroom','product photography','event photography','journalism','news writing','reporting','editing','media','broadcast','print media',
  // ── Legal ──
  'legal','lawyer','advocate','attorney','legal counsel','corporate law','litigation','contract drafting','compliance','regulatory compliance','legal compliance','risk management','governance','grc',
  // ── Real Estate ──
  'real estate','property management','real estate sales','leasing','property valuation','facility management',
];

function extractSkillsFromText(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return SKILL_KEYWORDS.filter(skill => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(lower);
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

console.log('☁️ S3 storage enabled for resume uploads (bucket: zyncjobs.com)');

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.doc', '.docx', '.rtf'];
  const ext = path.extname(file.originalname).toLowerCase();
  allowedTypes.includes(ext) ? cb(null, true) : cb(new Error('Only PDF, DOC, DOCX, RTF files are allowed'));
};

const imageFilter = (req, file, cb) => {
  file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed'));
};

// Local disk storage for profile photos
const photosDir = path.join(__dirname, '../uploads/photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, photosDir),
  filename: (req, file, cb) => cb(null, `photo_${Date.now()}${path.extname(file.originalname)}`)
});

const uploadPhoto = multer({ storage: photoStorage, fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// POST /api/upload/resume — candidate resume upload → S3 resumes/ folder
router.post('/resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = await uploadResumeToS3(req.file.buffer, req.file.originalname);
    console.log('☁️ Resume uploaded to S3:', fileUrl);

    // Resolve userId and email from token or body
    let resolvedUserId = req.body.userId || null;
    let resolvedEmail = req.body.userEmail || null;

    if (req.headers.authorization) {
      try {
        const { verifyToken } = await import('../utils/jwt.js');
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = verifyToken(token);
        if (!resolvedUserId) resolvedUserId = decoded?.userId || decoded?.id || null;
        if (!resolvedEmail && resolvedUserId) {
          const user = await User.findByPk(resolvedUserId, { attributes: ['email'] });
          resolvedEmail = user?.email || null;
        }
      } catch (_) {}
    }

    const resumeData = {
      fileName: req.file.originalname,
      fileUrl,
      fileSize: req.file.size,
      isActive: true,
      status: 'approved'
    };

    if (resolvedUserId || resolvedEmail) {
      try {
        if (resolvedUserId) {
          await Resume.update({ isActive: false }, { where: { userId: resolvedUserId } });
        } else if (resolvedEmail) {
          await Resume.update({ isActive: false }, { where: { email: resolvedEmail } });
        }
        await Resume.create({ userId: resolvedUserId || null, email: resolvedEmail, ...resumeData });
        if (resolvedUserId) {
          await User.update({ resumeUrl: fileUrl }, { where: { id: resolvedUserId } });
          updateLastActive(resolvedUserId).catch(() => {});

          // Extract skills from resume and save to user profile
          try {
            const resumeText = await pdfTextExtractor.extractTextFromBuffer(
              req.file.buffer, req.file.originalname
            );
            const extractedSkills = extractSkillsFromText(resumeText);
            if (extractedSkills.length > 0) {
              const user = await User.findByPk(resolvedUserId, { attributes: ['skills'] });
              const existing = Array.isArray(user?.skills) ? user.skills : [];
              const merged = [...new Set([...existing, ...extractedSkills])];
              await User.update({ skills: merged }, { where: { id: resolvedUserId } });
              console.log(`✅ Extracted ${extractedSkills.length} skills from resume for ${resolvedUserId}`);
            }
          } catch (skillErr) {
            console.warn('⚠️ Skill extraction failed (non-critical):', skillErr.message);
          }
        }
        if (resolvedEmail && !resolvedUserId) {
          await User.update({ resumeUrl: fileUrl }, { where: { email: resolvedEmail } });
        }
        console.log(`✅ Resume saved to DB for ${resolvedUserId || resolvedEmail}`);
      } catch (dbErr) {
        console.warn('⚠️ Resume DB save failed (non-critical):', dbErr.message);
      }
    }

    // Also persist resumeUrl to Profile table (covers Google OAuth users with email only)
    if (resolvedEmail) {
      try {
        const Profile = (await import('../models/Profile.js')).default;
        const profile = await Profile.findOne({ where: { email: resolvedEmail } });
        if (profile) {
          await profile.update({ resumeUrl: fileUrl });
        } else {
          await Profile.create({ email: resolvedEmail, resumeUrl: fileUrl });
        }
      } catch (profileErr) {
        console.warn('⚠️ Profile resumeUrl update skipped:', profileErr.message);
      }
    }

    res.json({
      success: true,
      fileUrl,
      file: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        url: fileUrl,
        uploadDate: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Resume upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/upload/profile-photo
router.post('/profile-photo', uploadPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
    const photoUrl = `/uploads/photos/${req.file.filename}`;
    console.log('📸 Profile photo saved:', photoUrl);
    res.json({ success: true, photoUrl });
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/upload/talent-resume — talent pool bulk upload → S3 talent-resumes/ folder
router.post('/talent-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileHash = req.headers['x-file-hash'] || null;
    const { fileUrl, alreadyExists } = await uploadTalentResumeToS3(req.file.buffer, req.file.originalname, fileHash);
    console.log(`☁️ Talent resume ${alreadyExists ? 'already existed' : 'uploaded'} on S3:`, fileUrl);

    res.json({
      success: true,
      fileUrl,
      alreadyExists,
      file: {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        url: fileUrl,
        uploadDate: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Talent resume upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/upload/resume — clear resume from User, Profile, and Resume table
router.delete('/resume', async (req, res) => {
  try {
    let resolvedUserId = null;
    let resolvedEmail = null;

    if (req.headers.authorization) {
      try {
        const { verifyToken } = await import('../utils/jwt.js');
        const decoded = verifyToken(req.headers.authorization.replace('Bearer ', ''));
        resolvedUserId = decoded?.userId || decoded?.id || null;
        if (resolvedUserId) {
          const user = await User.findByPk(resolvedUserId, { attributes: ['email'] });
          resolvedEmail = user?.email || null;
        }
      } catch (_) {}
    }

    if (!resolvedUserId && !resolvedEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Deactivate all resume records
    if (resolvedUserId) {
      await Resume.update({ isActive: false }, { where: { userId: resolvedUserId } });
      await User.update({ resumeUrl: null }, { where: { id: resolvedUserId } });
    }
    if (resolvedEmail) {
      await Resume.update({ isActive: false }, { where: { email: resolvedEmail } });
      if (!resolvedUserId) await User.update({ resumeUrl: null }, { where: { email: resolvedEmail } });
    }

    // Clear from Profile table
    if (resolvedEmail) {
      try {
        const Profile = (await import('../models/Profile.js')).default;
        await Profile.update({ resumeUrl: null, resume: null }, {
          where: { email: resolvedEmail }
        });
      } catch (profileErr) {
        console.warn('⚠️ Profile resume clear skipped:', profileErr.message);
      }
    }

    console.log(`✅ Resume deleted for ${resolvedUserId || resolvedEmail}`);
    res.json({ success: true, message: 'Resume deleted successfully' });
  } catch (error) {
    console.error('Resume delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
