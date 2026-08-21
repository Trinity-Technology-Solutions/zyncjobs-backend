import Skill from '../models/Skill.js';

// Canonical skill name -> variant spellings/write-ups that should map to it.
// Lookup is case-insensitive and version-tolerant (e.g. "Java 8" -> Java).
const NORMALIZATION_MAP = {
  'Java': ['Core Java', 'CoreJava', 'Java SE', 'Java EE', 'Java J2EE', 'J2EE', 'JEE', 'Java 1.8', 'Java 8', 'Java 11', 'Java 17', 'Java 21', 'Java JDK', 'Advanced Java'],
  'React': ['React.js', 'ReactJS', 'React Js', 'ReactJs', 'React 18', 'React 17', 'React 16'],
  'React Native': ['ReactNative', 'React-Native'],
  'Node.js': ['Node', 'NodeJS', 'Node Js', 'Node.js/Express', 'NodeJs'],
  'JavaScript': ['Javascript', 'JS', 'ECMAScript', 'ES6', 'ES5', 'Vanilla JS'],
  'TypeScript': ['Typescript', 'TS'],
  'Python': ['Python3', 'Python 3', 'Python Programming'],
  'C++': ['CPP', 'Cpp', 'C Plus Plus', 'C/C++'],
  'C#': ['CSharp', 'C Sharp', 'C-Sharp'],
  '.NET': ['Dotnet', 'Dot Net', 'ASP.NET', 'Asp.Net', 'ASP.NET Core', '.NET Core'],
  'SQL': ['Structured Query Language', 'MySql', 'MySQL', 'MsSQL', 'MSSQL', 'Oracle SQL', 'SQL Server', 'T-SQL'],
  'PostgreSQL': ['Postgres', 'Postgresql', 'Postgres SQL'],
  'MongoDB': ['Mongo DB', 'MongoDb', 'Mongo'],
  'AWS': ['Amazon Web Services', 'Amazon AWS', 'AWS Cloud', 'Amazon S3', 'AWS EC2', 'AWS Lambda', 'S3', 'EC2', 'Lambda'],
  'Azure': ['Microsoft Azure', 'Azure Cloud', 'Azure DevOps'],
  'GCP': ['Google Cloud', 'Google Cloud Platform', 'Google Cloud Computing'],
  'Kubernetes': ['K8s', 'K8S', 'Kubernetes Cluster'],
  'Docker': ['Docker Container', 'Docker Containers', 'Docker/Kubernetes'],
  'Git': ['GitHub', 'GitLab', 'Github', 'Git/GitHub', 'Github Actions', 'Git Hub'],
  'Machine Learning': ['ML', 'Machine learning', 'Machine Learning (ML)', 'MachineLearning', 'Deep Learning'],
  'Deep Learning': ['DL', 'DeepLearning'],
  'Data Science': ['Data Science & Analytics', 'Data science'],
  'Data Analysis': ['Data analytics', 'Data Analytics', 'Data Analyst Tools'],
  'Pandas': ['Pandas Library'],
  'NumPy': ['Numpy', 'NumPy/Pandas'],
  'TensorFlow': ['Tensorflow', 'Tensor Flow'],
  'PyTorch': ['Pytorch', 'Torch'],
  'Spring Boot': ['SpringBoot', 'Spring Boot Framework', 'Spring-Boot'],
  'Spring': ['Spring Framework', 'Spring MVC', 'Spring Core', 'Spring Security', 'Spring Data JPA', 'Spring Boot/JPA'],
  'Hibernate': ['Hibernate ORM', 'Hibernate/JPA'],
  'JPA': ['Java Persistence API'],
  'Angular': ['AngularJS', 'Angular 2', 'Angular 8', 'Angular 9', 'Angular 10', 'Angular 12', 'Angular 13', 'Angular 14', 'Angular 15', 'Angular 16', 'Angular 17'],
  'Vue.js': ['Vue', 'VueJS', 'Vue Js', 'Vue3', 'Vue 3'],
  'Next.js': ['NextJS', 'Next Js', 'NextJs'],
  'Express.js': ['Express', 'ExpressJS', 'Express Js', 'Express.js/Node'],
  'Django': ['Django Framework'],
  'Flask': ['Flask Framework'],
  'PHP': ['PHP Development'],
  'Laravel': ['Laravel Framework'],
  'Ruby': ['Ruby on Rails', 'Rails'],
  'Go': ['Golang', 'GoLang'],
  'Rust': ['Rust Programming'],
  'Swift': ['Swift/iOS', 'SwiftUI'],
  'Kotlin': ['Kotlin/Android', 'Kotlin Development'],
  'Android': ['Android Development', 'Android Studio', 'Android SDK', 'Android App Development', 'Android Application Development'],
  'iOS': ['iOS Development', 'iOS App Development', 'iPhone Development'],
  'Flutter': ['Flutter Development', 'Flutter/Dart'],
  'Dart': ['Dart Programming'],
  'HTML': ['HTML5', 'HTML/CSS', 'HTML & CSS'],
  'CSS': ['CSS3', 'CSS/SCSS'],
  'Tailwind CSS': ['Tailwind', 'TailwindCss', 'Tailwind CSS Framework'],
  'Bootstrap': ['Bootstrap 4', 'Bootstrap 5', 'Bootstrap Framework'],
  'Redux': ['Redux Toolkit', 'Redux Thunk', 'Redux Saga'],
  'Selenium': ['Selenium WebDriver', 'Selenium Testing'],
  'Jenkins': ['Jenkins CI/CD', 'Jenkins Pipeline'],
  'Terraform': ['Terraform/IaC'],
  'Linux': ['Linux Administration', 'Linux/Unix', 'Unix'],
  'Shell Scripting': ['Shell', 'Bash', 'Bash Scripting', 'Shell Scripts'],
  'Power BI': ['PowerBI', 'Power Bi', 'PowerBI Desktop'],
  'Tableau': ['Tableau Desktop', 'Tableau Server'],
  'Excel': ['MS Excel', 'Microsoft Excel', 'Advanced Excel', 'Excel VBA'],
  'Kafka': ['Apache Kafka', 'Kafka Streaming'],
  'Spark': ['Apache Spark', 'PySpark'],
  'Hadoop': ['Apache Hadoop', 'Hadoop Ecosystem'],
  'Airflow': ['Apache Airflow'],
  'Snowflake': ['Snowflake Data Warehouse'],
  'Figma': ['Figma Design', 'Figma/XD'],
  'Adobe Photoshop': ['Photoshop', 'Adobe Photoshop CC'],
  'Adobe Illustrator': ['Illustrator', 'Adobe Illustrator CC'],
  'SAP': ['SAP ERP', 'SAP FICO', 'SAP SD', 'SAP MM', 'SAP ABAP', 'SAP HANA'],
  'Salesforce': ['Salesforce CRM', 'Salesforce Development', 'Salesforce Admin'],
  'R': ['R Programming', 'R Language'],
  'MATLAB': ['Matlab/Simulink'],
  'Solidity': ['Ethereum', 'Smart Contracts', 'Web3'],
  'Blockchain': ['Blockchain Technology', 'Blockchain Development'],
  'Microservices': ['Microservices Architecture', 'Micro-Services', 'Micro service'],
  'REST API': ['REST', 'RESTful API', 'Rest APIs', 'RESTful Web Services', 'REST API Development', 'Web API', 'RESTful APIs'],
  'GraphQL': ['GraphQL API', 'Apollo GraphQL'],
  'Agile': ['Agile Methodology', 'Agile/Scrum', 'Agile Methodologies'],
  'Scrum': ['Scrum Master', 'Scrum Methodology'],
  'CI/CD': ['CICD', 'CI CD', 'Continuous Integration', 'Continuous Deployment', 'Continuous Delivery'],
  'Jira': ['JIRA', 'Jira Software'],
  'Confluence': ['Confluence Documentation'],
  'WordPress': ['WordPress Development', 'WordPress/WooCommerce'],
  'Shopify': ['Shopify Development'],
  'Magento': ['Magento 2', 'Magento Development'],
  'UiPath': ['UiPath RPA', 'RPA'],
  'Automation Anywhere': ['Automation Anywhere RPA'],
  'ServiceNow': ['ServiceNow Developer', 'ServiceNow Platform'],
  'Networking': ['Computer Networks', 'CCNA', 'Network Security'],
  'Cybersecurity': ['Cyber Security', 'Information Security', 'InfoSec', 'Security Analysis'],
  'Ethical Hacking': ['Penetration Testing', 'PenTesting', 'Pen Testing', 'Kali Linux'],
  'Digital Marketing': ['SEO', 'SEM', 'Google Ads', 'Social Media Marketing', 'SMM', 'Content Marketing', 'Email Marketing', 'Google Analytics', 'PPC', 'Facebook Ads'],
  'Graphic Design': ['Graphic Designing', 'UI Design', 'UX Design', 'UI/UX Design', 'UI UX', 'UX/UI', 'Product Design', 'Visual Design', 'Adobe XD', 'Design Thinking'],
  'Video Editing': ['Premiere Pro', 'Adobe Premiere', 'Final Cut Pro', 'After Effects', 'DaVinci Resolve', 'Video Production'],
  'Content Writing': ['Copywriting', 'Technical Writing', 'Blog Writing', 'SEO Writing', 'Article Writing'],
  'Accounts Payable': ['AP', 'Accounts Payable Processing'],
  'Accounts Receivable': ['AR', 'Accounts Receivable Process'],
  'Tally': ['Tally ERP', 'Tally Prime', 'Tally 9'],
  'QuickBooks': ['QuickBooks Online', 'QuickBooks Desktop'],
  'Zoho Books': ['Zoho Books Accounting'],
  'GST': ['GST Filing', 'GST Returns', 'GST Compliance', 'Goods and Services Tax'],
  'Taxation': ['Direct Tax', 'Indirect Tax', 'Income Tax', 'Tax Compliance', 'Tax Preparation'],
  'TDS': ['TDS Filing', 'TDS Return', 'TDS Compliance'],
  'Payroll': ['Payroll Processing', 'Payroll Management', 'Payroll Administration', 'HR & Payroll'],
  'HR': ['Human Resources', 'HR Management', 'HR Operations', 'HRIS'],
  'Recruitment': ['Talent Acquisition', 'Recruiting', 'Staffing', 'Sourcing', 'Headhunting'],
  'Interviewing': ['Interview Scheduling', 'Technical Interview', 'Candidate Screening'],
  'Project Management': ['PMP', 'Project Planning', 'Project Coordination', 'Program Management', 'MS Project', 'Primavera'],
  'Product Management': ['Product Owner', 'Product Strategy', 'Product Roadmap'],
  'Business Analysis': ['Business Analyst Tools', 'Requirement Gathering', 'BRD', 'FRD', 'SRS', 'Use Cases'],
  'Data Entry': ['Data Entry Operator', 'Typing'],
  'Customer Support': ['Customer Service', 'Technical Support', 'Helpdesk', 'Help Desk', 'Call Center', 'Customer Care', 'CRM Support', 'Troubleshooting'],
  'Communication': ['Verbal Communication', 'Written Communication', 'Interpersonal Communication', 'Presentation Skills'],
  'Team Leadership': ['Team Management', 'Team Handling', 'People Management', 'Leadership Skills', 'Team Lead'],
  'Problem Solving': ['Analytical Skills', 'Critical Thinking', 'Logical Reasoning', 'Problem-solving'],
  'English': ['English Language', 'Spoken English', 'English Communication', 'English Proficiency'],
  'Hindi': ['Hindi Language', 'Hindi Communication'],
  'Tamil': ['Tamil Language', 'Tamil Communication'],
  'Telugu': ['Telugu Language'],
  'Kannada': ['Kannada Language'],
  'Malayalam': ['Malayalam Language'],
  'French': ['French Language', 'French Communication'],
  'German': ['German Language', 'German Communication'],
  'Arabic': ['Arabic Language'],
  'Spanish': ['Spanish Language'],
  'MS Office': ['Microsoft Office', 'MS Word', 'MS PowerPoint', 'Microsoft Word', 'Microsoft PowerPoint', 'Outlook'],
  'Google Suite': ['Google Workspace', 'Google Sheets', 'Google Docs', 'Google Drive', 'G-Suite'],
  'AutoCAD': ['AutoCAD 2D', 'AutoCAD 3D', 'AutoCAD Design', 'AutoCAD Drafting'],
  'SolidWorks': ['Solidworks', 'Solid Works'],
  'CATIA': ['Catia V5', 'Catia Design'],
  'Creo': ['PTC Creo', 'Creo Parametric'],
  'Revit': ['Revit Architecture', 'Revit MEP'],
  'Staad Pro': ['STAAD', 'StaadPro'],
  'ETABS': ['Etabs Software'],
};

const VERSION_SUFFIX_RE = /\s+\d+(\.\d+)*\s*$/;

function titleCase(str) {
  return str.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function normalizeSkillName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.trim().replace(/^[•·\-–*\d.)]+\s*/, '').replace(/\s+/g, ' ');
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();

  for (const [canonical, variants] of Object.entries(NORMALIZATION_MAP)) {
    if (canonical.toLowerCase() === lower) return canonical;
    if (variants.some(v => v.toLowerCase() === lower)) return canonical;
  }

  const stripped = cleaned.replace(VERSION_SUFFIX_RE, '');
  if (stripped !== cleaned && stripped.length >= 2) {
    const lowerStripped = stripped.toLowerCase();
    for (const [canonical, variants] of Object.entries(NORMALIZATION_MAP)) {
      if (canonical.toLowerCase() === lowerStripped) return canonical;
      if (variants.some(v => v.toLowerCase() === lowerStripped)) return canonical;
    }
    return titleCase(stripped);
  }

  return titleCase(cleaned);
}

export function getNormalizedSkillNames(skillsArray) {
  if (!Array.isArray(skillsArray)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of skillsArray) {
    const normalized = normalizeSkillName(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}

export function extractSkillsFromText(text) {
  if (!text) return [];
  const parts = text.split(/[,;|•·\n]+/).map(s => s.trim()).filter(Boolean);
  return getNormalizedSkillNames(parts);
}

export async function getOrCreateSkill(normalizedName) {
  const name = normalizeSkillName(normalizedName);
  if (!name) return null;
  const [skill] = await Skill.findOrCreate({
    where: { name },
    defaults: { name, normalizedName: name.toLowerCase() }
  });
  return skill;
}

export default { normalizeSkillName, getNormalizedSkillNames, extractSkillsFromText, getOrCreateSkill };