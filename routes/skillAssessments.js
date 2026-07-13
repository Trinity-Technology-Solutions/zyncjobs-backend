import express from 'express';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { sequelize } from '../config/postgresql.js';
import { authenticateToken } from '../middleware/auth.js';
const router = express.Router();

import aiClient from '../services/aiClient.js';

const callAI = async (prompt) => {
  try {
    const result = await aiClient.suggest(prompt);
    return result.reply || null;
  } catch { return null; }
};

const parseQuestions = (content) => {
  let jsonMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/m) || content.match(/\[[\s\S]*\]/m);
  if (!jsonMatch) {
    const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonMatch = [codeBlock[1].trim()];
    else return null;
  }
  try {
    const questions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(questions)) return null;
    const placeholderPattern = /^(option|concept|tool|practice|method|pattern|debug|trend|framework|future|purpose|feature|topic|mistake|answer)\s*[a-d0-9]$/i;
    const valid = questions.filter(q =>
      q.question?.length > 10 &&
      Array.isArray(q.options) && q.options.length === 4 &&
      typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer <= 3 &&
      !q.options.some(o => placeholderPattern.test(o.trim()))
    );
    return valid.length >= 5 ? valid.slice(0, 10) : null;
  } catch {
    try {
      const fixed = jsonMatch[0].replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
      const questions = JSON.parse(fixed);
      return Array.isArray(questions) && questions.length >= 5 ? questions.slice(0, 10) : null;
    } catch { return null; }
  }
};

// Fallback question bank for common skills
const FALLBACK_QUESTIONS = {
  javascript: () => [
    { question: 'What does `typeof null` return in JavaScript?', options: ['null', 'undefined', 'object', 'string'], correctAnswer: 2 },
    { question: 'Which method removes the last element from an array?', options: ['shift()', 'pop()', 'splice()', 'slice()'], correctAnswer: 1 },
    { question: 'What is a closure in JavaScript?', options: ['A loop construct', 'A function with access to its outer scope', 'An error handler', 'A class method'], correctAnswer: 1 },
    { question: 'What does `===` check?', options: ['Value only', 'Type only', 'Value and type', 'Reference equality'], correctAnswer: 2 },
    { question: 'Which keyword declares a block-scoped variable?', options: ['var', 'let', 'function', 'global'], correctAnswer: 1 },
    { question: 'What does `Array.prototype.map()` return?', options: ['The original array', 'A new array', 'undefined', 'A boolean'], correctAnswer: 1 },
    { question: 'What is the event loop in JavaScript?', options: ['A for loop', 'A mechanism to handle async operations', 'A DOM event', 'A CSS animation'], correctAnswer: 1 },
    { question: 'Which of these is NOT a JavaScript primitive type?', options: ['Symbol', 'BigInt', 'Array', 'undefined'], correctAnswer: 2 },
    { question: 'What does `Promise.all()` do?', options: ['Runs promises sequentially', 'Runs all promises in parallel and waits for all', 'Returns the first resolved', 'Cancels all promises'], correctAnswer: 1 },
    { question: 'What is hoisting in JavaScript?', options: ['Moving code to the server', 'Variable/function declarations moved to top of scope', 'A CSS property', 'An async pattern'], correctAnswer: 1 },
  ],
  python: () => [
    { question: 'What is the output of `type([])`?', options: ['list', '<class list>', "<class 'list'>", 'array'], correctAnswer: 2 },
    { question: 'Which keyword is used to define a function in Python?', options: ['function', 'def', 'fun', 'lambda'], correctAnswer: 1 },
    { question: 'What does `len([1,2,3])` return?', options: ['2', '3', '4', 'Error'], correctAnswer: 1 },
    { question: 'What is a list comprehension?', options: ['A loop', 'A concise way to create lists', 'A dictionary method', 'A class'], correctAnswer: 1 },
    { question: 'Which of these is immutable in Python?', options: ['list', 'dict', 'tuple', 'set'], correctAnswer: 2 },
    { question: 'What does `*args` do in a function?', options: ['Passes keyword args', 'Passes variable positional args', 'Multiplies args', 'Unpacks a dict'], correctAnswer: 1 },
    { question: 'What is a decorator in Python?', options: ['A CSS concept', 'A function that wraps another function', 'A class attribute', 'A loop modifier'], correctAnswer: 1 },
    { question: 'What does `__init__` do?', options: ['Destroys an object', 'Initializes a class instance', 'Imports a module', 'Defines a static method'], correctAnswer: 1 },
    { question: 'Which module is used for regular expressions in Python?', options: ['regex', 're', 'regexp', 'pattern'], correctAnswer: 1 },
    { question: 'What is the GIL in Python?', options: ['Global Import Lock', 'Global Interpreter Lock', 'General Input Layer', 'Graph Interface Library'], correctAnswer: 1 },
  ],
  react: () => [
    { question: 'What hook is used for side effects in React?', options: ['useState', 'useEffect', 'useContext', 'useRef'], correctAnswer: 1 },
    { question: 'What does JSX stand for?', options: ['JavaScript XML', 'Java Syntax Extension', 'JSON XML', 'JavaScript Extension'], correctAnswer: 0 },
    { question: 'What is the virtual DOM?', options: ['A real browser DOM', 'A lightweight copy of the DOM', 'A CSS framework', 'A database'], correctAnswer: 1 },
    { question: 'Which hook manages local component state?', options: ['useEffect', 'useContext', 'useState', 'useReducer'], correctAnswer: 2 },
    { question: 'What is a React key used for?', options: ['Styling', 'Identifying list items uniquely', 'Event handling', 'API calls'], correctAnswer: 1 },
    { question: 'What is prop drilling?', options: ['A build tool', 'Passing props through many component levels', 'A CSS technique', 'A testing method'], correctAnswer: 1 },
    { question: 'What does `useCallback` do?', options: ['Fetches data', 'Memoizes a function reference', 'Creates a ref', 'Manages state'], correctAnswer: 1 },
    { question: 'What is React Context used for?', options: ['Routing', 'Global state sharing without prop drilling', 'Styling', 'Testing'], correctAnswer: 1 },
    { question: 'What is a controlled component?', options: ['A component with no state', 'A form element whose value is controlled by React state', 'A class component', 'A pure component'], correctAnswer: 1 },
    { question: 'What does `React.memo` do?', options: ['Stores data', 'Prevents re-render if props unchanged', 'Creates a context', 'Handles errors'], correctAnswer: 1 },
  ],
  'node.js': () => [
    { question: 'What is Node.js?', options: ['A browser', 'A JavaScript runtime built on Chrome V8', 'A database', 'A CSS framework'], correctAnswer: 1 },
    { question: 'Which module system does Node.js use natively?', options: ['AMD', 'CommonJS (require/module.exports)', 'UMD', 'SystemJS'], correctAnswer: 1 },
    { question: 'What does `npm` stand for?', options: ['Node Package Manager', 'New Project Module', 'Node Process Manager', 'Network Package Module'], correctAnswer: 0 },
    { question: 'What is the event loop in Node.js?', options: ['A for loop', 'A mechanism for non-blocking I/O', 'A database loop', 'A CSS animation'], correctAnswer: 1 },
    { question: 'Which built-in module handles file system operations?', options: ['http', 'path', 'fs', 'os'], correctAnswer: 2 },
    { question: 'What is middleware in Express.js?', options: ['A database', 'A function that processes requests before the route handler', 'A CSS file', 'A test runner'], correctAnswer: 1 },
    { question: 'What does `process.env` provide?', options: ['CPU info', 'Environment variables', 'File paths', 'Network config'], correctAnswer: 1 },
    { question: 'What is a stream in Node.js?', options: ['A video player', 'An object for reading/writing data in chunks', 'A database query', 'A CSS property'], correctAnswer: 1 },
    { question: 'What does `async/await` do in Node.js?', options: ['Blocks the thread', 'Simplifies working with Promises', 'Creates threads', 'Handles CSS'], correctAnswer: 1 },
    { question: 'What is the purpose of `package.json`?', options: ['Store CSS', 'Define project metadata and dependencies', 'Configure the database', 'Store images'], correctAnswer: 1 },
  ],
  java: () => [
    { question: 'What is the entry point of a Java program?', options: ['start()', 'main()', 'run()', 'init()'], correctAnswer: 1 },
    { question: 'Which keyword is used to inherit a class in Java?', options: ['implements', 'extends', 'inherits', 'super'], correctAnswer: 1 },
    { question: 'What is the difference between `==` and `.equals()` in Java?', options: ['No difference', '== compares references, .equals() compares values', '== compares values, .equals() compares references', 'Both compare values'], correctAnswer: 1 },
    { question: 'What is a Java interface?', options: ['A class with implementation', 'A contract defining method signatures', 'A database connection', 'A loop construct'], correctAnswer: 1 },
    { question: 'What does JVM stand for?', options: ['Java Virtual Machine', 'Java Variable Method', 'Java Version Manager', 'Java Visual Module'], correctAnswer: 0 },
    { question: 'Which collection allows duplicate elements in Java?', options: ['Set', 'Map', 'List', 'HashSet'], correctAnswer: 2 },
    { question: 'What is autoboxing in Java?', options: ['Automatic memory management', 'Automatic conversion between primitives and wrapper classes', 'Auto-importing packages', 'Automatic exception handling'], correctAnswer: 1 },
    { question: 'What is the purpose of the `final` keyword?', options: ['Marks a method as abstract', 'Prevents modification of variables, methods, or classes', 'Defines a constructor', 'Creates a new thread'], correctAnswer: 1 },
    { question: 'What is a checked exception in Java?', options: ['An exception caught at compile time', 'An exception that must be declared or caught', 'A runtime error', 'A syntax error'], correctAnswer: 1 },
    { question: 'What does `static` mean in Java?', options: ['The member belongs to an instance', 'The member belongs to the class, not instances', 'The variable cannot change', 'The method is private'], correctAnswer: 1 },
  ],
  typescript: () => [
    { question: 'What is TypeScript?', options: ['A database language', 'A typed superset of JavaScript', 'A CSS preprocessor', 'A testing framework'], correctAnswer: 1 },
    { question: 'What does the `interface` keyword do in TypeScript?', options: ['Creates a class', 'Defines a contract for object shapes', 'Imports a module', 'Declares a variable'], correctAnswer: 1 },
    { question: 'What is a union type in TypeScript?', options: ['A type that combines two classes', 'A type that can be one of several types', 'A generic type', 'An intersection type'], correctAnswer: 1 },
    { question: 'What does `readonly` do in TypeScript?', options: ['Makes a property optional', 'Prevents a property from being reassigned', 'Makes a property public', 'Marks a method as abstract'], correctAnswer: 1 },
    { question: 'What is the `any` type in TypeScript?', options: ['A strict type', 'A type that disables type checking', 'A generic constraint', 'A null type'], correctAnswer: 1 },
    { question: 'What is a generic in TypeScript?', options: ['A global variable', 'A reusable component that works with multiple types', 'A CSS class', 'A database type'], correctAnswer: 1 },
    { question: 'What does the `?` operator mean on a property?', options: ['The property is required', 'The property is optional', 'The property is readonly', 'The property is private'], correctAnswer: 1 },
    { question: 'What is type narrowing in TypeScript?', options: ['Reducing the number of types', 'Refining a type within a conditional block', 'Casting to any', 'Removing generics'], correctAnswer: 1 },
    { question: 'What does `as` do in TypeScript?', options: ['Imports a module', 'Type assertion — tells the compiler to treat a value as a specific type', 'Creates an alias', 'Defines an enum'], correctAnswer: 1 },
    { question: 'What is the difference between `type` and `interface` in TypeScript?', options: ['No difference', 'type can represent primitives and unions; interface is for object shapes and is extendable', 'interface is faster', 'type is deprecated'], correctAnswer: 1 },
  ],
  sql: () => [
    { question: 'What does SQL stand for?', options: ['Structured Query Language', 'Simple Query Logic', 'Standard Query List', 'Sequential Query Language'], correctAnswer: 0 },
    { question: 'Which SQL clause filters rows?', options: ['GROUP BY', 'ORDER BY', 'WHERE', 'HAVING'], correctAnswer: 2 },
    { question: 'What is a PRIMARY KEY?', options: ['A foreign key', 'A unique identifier for each row', 'An index', 'A constraint that allows nulls'], correctAnswer: 1 },
    { question: 'What does JOIN do in SQL?', options: ['Deletes rows', 'Combines rows from two or more tables', 'Creates a new table', 'Filters duplicates'], correctAnswer: 1 },
    { question: 'What is the difference between WHERE and HAVING?', options: ['No difference', 'WHERE filters rows before grouping; HAVING filters after grouping', 'HAVING is faster', 'WHERE works only with strings'], correctAnswer: 1 },
    { question: 'What does `SELECT DISTINCT` do?', options: ['Selects all rows', 'Returns only unique values', 'Selects the first row', 'Counts rows'], correctAnswer: 1 },
    { question: 'What is a foreign key?', options: ['A key from another database', 'A column that references the primary key of another table', 'An encrypted key', 'A composite key'], correctAnswer: 1 },
    { question: 'What does `GROUP BY` do?', options: ['Sorts results', 'Groups rows with the same values for aggregate functions', 'Filters rows', 'Joins tables'], correctAnswer: 1 },
    { question: 'What is an index in SQL?', options: ['A row number', 'A data structure that speeds up queries', 'A foreign key', 'A view'], correctAnswer: 1 },
    { question: 'What does `INNER JOIN` return?', options: ['All rows from both tables', 'Only matching rows from both tables', 'All rows from the left table', 'All rows from the right table'], correctAnswer: 1 },
  ],
  aws: () => [
    { question: 'What does AWS S3 stand for?', options: ['Simple Storage Service', 'Secure Server System', 'Scalable Storage Solution', 'Static Site Service'], correctAnswer: 0 },
    { question: 'What is AWS EC2?', options: ['A database service', 'A virtual server in the cloud', 'A DNS service', 'A CDN'], correctAnswer: 1 },
    { question: 'What is AWS Lambda?', options: ['A virtual machine', 'A serverless compute service', 'A database', 'A load balancer'], correctAnswer: 1 },
    { question: 'What does IAM stand for in AWS?', options: ['Internet Access Management', 'Identity and Access Management', 'Internal Application Module', 'Integrated API Manager'], correctAnswer: 1 },
    { question: 'What is Amazon RDS?', options: ['A file storage service', 'A managed relational database service', 'A serverless function', 'A CDN'], correctAnswer: 1 },
    { question: 'What is an AWS VPC?', options: ['A virtual private cloud — isolated network', 'A virtual processor core', 'A video processing cluster', 'A version control platform'], correctAnswer: 0 },
    { question: 'What is AWS CloudFront?', options: ['A database', 'A CDN for delivering content globally', 'A compute service', 'A monitoring tool'], correctAnswer: 1 },
    { question: 'What is the purpose of AWS Auto Scaling?', options: ['Backup data', 'Automatically adjust compute capacity based on demand', 'Monitor logs', 'Manage DNS'], correctAnswer: 1 },
    { question: 'What is AWS SQS?', options: ['A database', 'A managed message queue service', 'A serverless function', 'A storage service'], correctAnswer: 1 },
    { question: 'What is the AWS Shared Responsibility Model?', options: ['AWS handles everything', 'AWS secures the infrastructure; customers secure their data and apps', 'Customers handle everything', 'Security is optional'], correctAnswer: 1 },
  ],
  docker: () => [
    { question: 'What is Docker?', options: ['A programming language', 'A platform for containerizing applications', 'A cloud provider', 'A database'], correctAnswer: 1 },
    { question: 'What is a Docker image?', options: ['A running container', 'A read-only template used to create containers', 'A virtual machine', 'A network configuration'], correctAnswer: 1 },
    { question: 'What is a Dockerfile?', options: ['A log file', 'A script with instructions to build a Docker image', 'A container registry', 'A network config'], correctAnswer: 1 },
    { question: 'What does `docker run` do?', options: ['Builds an image', 'Creates and starts a container from an image', 'Stops a container', 'Pushes an image'], correctAnswer: 1 },
    { question: 'What is Docker Compose?', options: ['A music app', 'A tool for defining and running multi-container applications', 'A container registry', 'A monitoring tool'], correctAnswer: 1 },
    { question: 'What is a Docker volume?', options: ['A container size limit', 'Persistent storage for containers', 'A network bridge', 'An image layer'], correctAnswer: 1 },
    { question: 'What does `docker ps` show?', options: ['All images', 'Running containers', 'Docker version', 'Network config'], correctAnswer: 1 },
    { question: 'What is Docker Hub?', options: ['A local registry', 'A public registry for Docker images', 'A container orchestrator', 'A monitoring service'], correctAnswer: 1 },
    { question: 'What is the difference between CMD and ENTRYPOINT in a Dockerfile?', options: ['No difference', 'ENTRYPOINT sets the main command; CMD provides default arguments', 'CMD is required; ENTRYPOINT is optional', 'ENTRYPOINT runs at build time'], correctAnswer: 1 },
    { question: 'What does `docker build` do?', options: ['Runs a container', 'Builds a Docker image from a Dockerfile', 'Pulls an image', 'Stops all containers'], correctAnswer: 1 },
  ],
  git: () => [
    { question: 'What does `git init` do?', options: ['Clones a repo', 'Initializes a new Git repository', 'Commits changes', 'Pushes to remote'], correctAnswer: 1 },
    { question: 'What does `git clone` do?', options: ['Creates a branch', 'Copies a remote repository locally', 'Merges branches', 'Deletes a repo'], correctAnswer: 1 },
    { question: 'What is a Git branch?', options: ['A commit', 'A parallel line of development', 'A remote server', 'A merge conflict'], correctAnswer: 1 },
    { question: 'What does `git merge` do?', options: ['Deletes a branch', 'Combines changes from one branch into another', 'Creates a new commit', 'Reverts changes'], correctAnswer: 1 },
    { question: 'What is a merge conflict?', options: ['A network error', 'When two branches have conflicting changes to the same file', 'A deleted branch', 'A failed push'], correctAnswer: 1 },
    { question: 'What does `git rebase` do?', options: ['Deletes commits', 'Moves or replays commits onto another base branch', 'Creates a tag', 'Pushes to remote'], correctAnswer: 1 },
    { question: 'What is `git stash` used for?', options: ['Deleting changes', 'Temporarily saving uncommitted changes', 'Creating a branch', 'Merging branches'], correctAnswer: 1 },
    { question: 'What does `git pull` do?', options: ['Pushes local changes', 'Fetches and merges remote changes', 'Creates a branch', 'Reverts a commit'], correctAnswer: 1 },
    { question: 'What is a `.gitignore` file?', options: ['A commit message file', 'A file specifying which files Git should ignore', 'A branch config', 'A merge strategy'], correctAnswer: 1 },
    { question: 'What does `git cherry-pick` do?', options: ['Deletes a commit', 'Applies a specific commit from one branch to another', 'Creates a tag', 'Resets the HEAD'], correctAnswer: 1 },
  ],
  default: (skill) => [
    { question: `What is ${skill} primarily used for?`, options: [`Building user interfaces`, `Solving specific technical problems in its domain`, `Database management`, `Network configuration`], correctAnswer: 1 },
    { question: `Which of the following is a core concept in ${skill}?`, options: [`Abstraction and modularity`, `Physical hardware management`, `CSS styling`, `DNS routing`], correctAnswer: 0 },
    { question: `What is a best practice when working with ${skill}?`, options: [`Ignoring documentation`, `Writing clean, maintainable code`, `Avoiding version control`, `Skipping testing`], correctAnswer: 1 },
    { question: `How does ${skill} handle errors or exceptions?`, options: [`It ignores them`, `Through structured error handling mechanisms`, `By crashing the program`, `Errors are impossible`], correctAnswer: 1 },
    { question: `What tool is commonly used to manage ${skill} projects?`, options: [`A text editor or IDE`, `A physical calculator`, `A fax machine`, `A typewriter`], correctAnswer: 0 },
    { question: `Which of the following is a key benefit of ${skill}?`, options: [`Increased complexity`, `Improved developer productivity`, `Slower performance`, `Higher hardware costs`], correctAnswer: 1 },
    { question: `What does debugging mean in ${skill} development?`, options: [`Adding new features`, `Finding and fixing errors in code`, `Deploying to production`, `Writing documentation`], correctAnswer: 1 },
    { question: `What is version control used for in ${skill} projects?`, options: [`Tracking changes and collaborating with teams`, `Speeding up execution`, `Reducing file size`, `Encrypting data`], correctAnswer: 0 },
    { question: `Which approach improves code quality in ${skill}?`, options: [`Writing everything in one file`, `Code reviews and automated testing`, `Avoiding comments`, `Using global variables everywhere`], correctAnswer: 1 },
    { question: `What is the role of documentation in ${skill}?`, options: [`It slows development`, `It helps developers understand and use the codebase effectively`, `It is only for beginners`, `It replaces testing`], correctAnswer: 1 },
  ]
};

const getFallbackQuestions = (skill) => {
  const key = skill.toLowerCase();
  const generator = FALLBACK_QUESTIONS[key] || FALLBACK_QUESTIONS.default;
  return generator(skill);
};

// Generate exactly 10 AI questions for any skill
const generateAIQuestions = async (skill) => {
  const prompt = `Generate EXACTLY 10 multiple choice questions about ${skill} for a technical skill assessment.

Return ONLY a valid JSON array with no extra text.

Example format:
[
  {"question": "What does the 'let' keyword do in JavaScript?", "options": ["Declares a block-scoped variable", "Declares a function", "Imports a module", "Creates a class"], "correctAnswer": 0},
  {"question": "Which method removes the last element from an array?", "options": ["shift()", "unshift()", "pop()", "push()"], "correctAnswer": 2}
]

Rules:
- EXACTLY 10 real questions about ${skill}
- Each question must have exactly 4 meaningful, distinct options (NOT placeholders like 'Option A')
- correctAnswer is the index (0-3) of the correct option
- Questions must test real practical knowledge of ${skill}
- Return ONLY the JSON array`;

  const content = await callAI(prompt);
  if (!content) return null;
  console.log('📝 Raw response:', content.substring(0, 200));
  return parseQuestions(content);
};

const generateAssessmentReview = async (skill, score, correctAnswers, totalQuestions, questions = [], answers = []) => {
  try {
    if (!content) return getDefaultReview(skill, score, questions, answers);
    const wrongTopics = questions
      .map((q, i) => answers[i] !== q.correctAnswer ? q.question : null)
      .filter(Boolean)
      .slice(0, 5);

    const correctTopics = questions
      .map((q, i) => answers[i] === q.correctAnswer ? q.question : null)
      .filter(Boolean)
      .slice(0, 3);

    const prompt = `Generate a professional skill assessment review for:
- Skill: ${skill}
- Score: ${score}% (${correctAnswers}/${totalQuestions} correct)
- Questions answered correctly: ${correctTopics.join(' | ') || 'none'}
- Questions answered incorrectly: ${wrongTopics.join(' | ') || 'none'}

Based on the ACTUAL questions above, generate a personalized review.

Return ONLY valid JSON (no markdown, no extra text):
{
  "summary": "2 sentences specific to their ${skill} performance and score",
  "strengths": ["specific strength based on correct answers", "another specific strength"],
  "improvements": ["specific area from wrong answers", "another specific improvement area"],
  "recommendations": ["specific actionable step for ${skill}", "another specific step", "third step"],
  "level": "${score >= 80 ? 'Advanced' : score >= 60 ? 'Intermediate' : 'Beginner'}"
}`;

    const content = await callAI(prompt);
    if (!content) return getDefaultReview(skill, score, questions, answers);

    const jsonMatch = content.match(/\{[\s\S]*\}/m);
    if (!jsonMatch) return getDefaultReview(skill, score, questions, answers);

    const parsed = JSON.parse(jsonMatch[0]);
    // Validate all required fields exist
    if (!parsed.summary || !parsed.strengths || !parsed.improvements || !parsed.recommendations) {
      return getDefaultReview(skill, score, questions, answers);
    }
    return parsed;
  } catch (error) {
    console.error('Review generation failed:', error.message);
    return getDefaultReview(skill, score, questions, answers);
  }
};

const getDefaultReview = (skill, score, questions = [], answers = []) => {
  const level = score >= 80 ? 'Advanced' : score >= 60 ? 'Intermediate' : 'Beginner';
  const correct = questions.filter((q, i) => answers[i] === q.correctAnswer);
  const wrong = questions.filter((q, i) => answers[i] !== q.correctAnswer);

  // Dynamic summary based on score
  let summary;
  if (score >= 80) {
    summary = `Outstanding! You scored ${score}% on the ${skill} assessment, demonstrating advanced proficiency. You answered ${correct.length} out of ${questions.length || 10} questions correctly.`;
  } else if (score >= 60) {
    summary = `Good effort! You scored ${score}% on the ${skill} assessment, showing intermediate understanding. You got ${correct.length} out of ${questions.length || 10} correct — a solid foundation to build on.`;
  } else {
    summary = `You scored ${score}% on the ${skill} assessment. You answered ${correct.length} out of ${questions.length || 10} correctly. This is a great starting point to identify gaps and improve.`;
  }

  // Dynamic strengths from correct questions
  const strengths = correct.length > 0
    ? [
        `Correctly answered ${correct.length} question${correct.length > 1 ? 's' : ''} — showing real ${skill} knowledge`,
        correct.length >= 2 ? `Strong grasp of: "${correct[0].question.substring(0, 60)}..."` : `Demonstrated understanding of core ${skill} concepts`,
        score >= 60 ? `Above-average performance compared to typical ${skill} beginners` : `Completed the full assessment — showing commitment to learning`
      ]
    : [
        `Completed the full ${skill} assessment`,
        `Identified key areas that need focused study`,
        `Took the first step toward ${skill} proficiency`
      ];

  // Dynamic improvements from wrong questions
  const improvements = wrong.length > 0
    ? [
        `Review the concept behind: "${wrong[0].question.substring(0, 70)}..."`,
        wrong.length >= 2 ? `Strengthen understanding of: "${wrong[1].question.substring(0, 70)}..."` : `Practice more ${skill} hands-on exercises`,
        `Focus on the ${wrong.length} topic${wrong.length > 1 ? 's' : ''} you missed to close knowledge gaps`
      ]
    : [
        `Explore advanced ${skill} patterns and edge cases`,
        `Challenge yourself with real-world ${skill} projects`,
        `Mentor others to solidify your ${skill} expertise`
      ];

  // Dynamic recommendations based on level
  const recommendations = level === 'Advanced'
    ? [
        `Contribute to open-source ${skill} projects to showcase expertise`,
        `Explore advanced ${skill} design patterns and architecture`,
        `Consider getting a ${skill} certification to validate your skills`
      ]
    : level === 'Intermediate'
    ? [
        `Build 2-3 real projects using ${skill} to reinforce your knowledge`,
        `Take a focused course on the ${skill} topics you missed`,
        `Practice daily ${skill} coding challenges on platforms like LeetCode or HackerRank`
      ]
    : [
        `Start with the official ${skill} documentation and beginner tutorials`,
        `Complete a structured ${skill} course on freeCodeCamp, Coursera, or Udemy`,
        `Build a small project using ${skill} to apply what you learn`
      ];

  return { summary, strengths, improvements, recommendations, level };
};

// Optional auth middleware - allows both authenticated and guest users
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    // No token - create guest user
    req.user = { id: 'guest-' + Date.now(), isGuest: true };
    return next();
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    // Invalid token - treat as guest
    req.user = { id: 'guest-' + Date.now(), isGuest: true };
    next();
  }
};

// Start assessment
router.post('/start', optionalAuth, async (req, res) => {
  try {
    const { skill } = req.body;
    if (!skill) return res.status(400).json({ error: 'Skill is required' });

    console.log(`🚀 Starting assessment for ${skill}...`);
    
    // Try AI generation with single attempt and 10s timeout
    let questions = null;
    try {
      const aiPromise = generateAIQuestions(skill);
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('AI timeout')), 10000);
      });
      questions = await Promise.race([aiPromise, timeoutPromise]);
      console.log('✅ AI questions generated');
    } catch (err) {
      console.log('⚠️ AI generation failed/timeout:', err.message);
    }
    
    // Fallback to local questions if AI fails
    if (!questions || !Array.isArray(questions) || questions.length === 0) { 
      console.log('📝 Using fallback questions'); 
      questions = getFallbackQuestions(skill); 
    }

    // Use raw INSERT to avoid missing column errors on QA DB
    const id = randomUUID();
    const questionsWithAnswer = questions.map(q => ({ ...q, userAnswer: -1 }));

    // Try to insert into database, but don't fail if DB is down
    try {
      await sequelize.query(
        `INSERT INTO skill_assessments (id, "userId", skill, questions, score, answers, "createdAt", "updatedAt") VALUES (:id, :userId, :skill, :questions, 0, '{}', NOW(), NOW())`,
        { replacements: { id, userId: req.user.id, skill, questions: JSON.stringify(questionsWithAnswer) } }
      );
      console.log('✅ Saved to database');
    } catch (dbErr) {
      console.warn('⚠️ DB insert failed, trying with status column:', dbErr.message);
      try {
        await sequelize.query(
          `INSERT INTO skill_assessments (id, "userId", skill, questions, score, answers, status, "createdAt", "updatedAt") VALUES (:id, :userId, :skill, :questions, 0, '{}', 'in_progress', NOW(), NOW())`,
          { replacements: { id, userId: req.user.id, skill, questions: JSON.stringify(questionsWithAnswer) } }
        );
        console.log('✅ Saved to database (with status)');
      } catch (dbErr2) {
        console.error('❌ DB insert failed completely:', dbErr2.message);
        // Continue anyway - assessment can work without DB storage
      }
    }

    console.log(`✅ Assessment created with ${questions.length} questions`);
    res.json({
      assessmentId: id,
      skill,
      questions: questions.map(q => ({ question: q.question, options: q.options })),
      totalQuestions: questions.length,
      timeLimit: 30
    });
  } catch (error) {
    console.error('❌ Start assessment error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to start assessment' });
  }
});

// Submit assessment
router.post('/submit/:id', optionalAuth, async (req, res) => {
  try {
    const { answers, timeSpent } = req.body;

    // Step 1: fetch existing columns to know what QA DB actually has
    let existingCols = [];
    try {
      const colRows = await sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'skill_assessments'`,
        { type: sequelize.QueryTypes.SELECT }
      );
      existingCols = colRows.map(r => r.column_name);
      console.log('📋 skill_assessments columns:', existingCols);
    } catch (e) {
      console.warn('Could not fetch columns:', e.message);
    }

    // Step 2: fetch the assessment row
    let rows;
    try {
      rows = await sequelize.query(
        `SELECT id, "userId", skill, questions, score FROM skill_assessments WHERE id = :id`,
        { replacements: { id: req.params.id }, type: sequelize.QueryTypes.SELECT }
      );
    } catch (e) {
      console.error('Fetch assessment error:', e.message);
      return res.status(500).json({ error: 'Failed to fetch assessment: ' + e.message });
    }

    if (!rows || rows.length === 0) {
      console.warn('⚠️ Assessment not found in DB, treating as local assessment');
      return res.status(404).json({ 
        error: 'Assessment not found',
        isLocal: true,
        message: 'This assessment was not saved to the database. Please use local scoring.'
      });
    }

    const assessment = rows[0];
    // userId column may come back as userId or userId depending on pg driver
    const rowUserId = assessment.userId || assessment['userId'];
    if (String(rowUserId) !== String(req.user.id)) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const questions = typeof assessment.questions === 'string'
      ? JSON.parse(assessment.questions)
      : (Array.isArray(assessment.questions) ? assessment.questions : []);

    let correctAnswers = 0;
    const updatedQuestions = questions.map((q, i) => {
      const userAnswer = Array.isArray(answers) ? answers[i] : -1;
      if (userAnswer === q.correctAnswer) correctAnswers++;
      return { ...q, userAnswer };
    });

    const score = questions.length > 0 ? Math.round((correctAnswers / questions.length) * 100) : 0;
    const review = await generateAssessmentReview(assessment.skill, score, correctAnswers, questions.length, questions, answers);

    // Step 3: build UPDATE only with columns that exist
    // Auto-add missing columns on QA/prod if they don't exist
    if (!existingCols.includes('review')) {
      try { await sequelize.query(`ALTER TABLE skill_assessments ADD COLUMN IF NOT EXISTS review JSONB`); existingCols.push('review'); } catch (e) { console.warn('Could not add review column:', e.message); }
    }
    if (!existingCols.includes('completedAt')) {
      try { await sequelize.query(`ALTER TABLE skill_assessments ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP`); existingCols.push('completedAt'); } catch (e) { console.warn('Could not add completedAt column:', e.message); }
    }

    const hasCompletedAt = existingCols.includes('completedAt');
    const hasStatus = existingCols.includes('status');
    const hasReview = existingCols.includes('review');
    const hasAnswers = existingCols.includes('answers');

    let setClauses = [`questions=:questions`, `score=:score`, `"updatedAt"=NOW()`];
    if (hasAnswers) setClauses.push(`answers=:answers`);
    if (hasCompletedAt) setClauses.push(`"completedAt"=NOW()`);
    if (hasStatus) setClauses.push(`status='completed'`);
    if (hasReview) setClauses.push(`review=:review`);

    const updateSQL = `UPDATE skill_assessments SET ${setClauses.join(', ')} WHERE id=:id`;
    console.log('📝 UPDATE SQL:', updateSQL);

    await sequelize.query(updateSQL, {
      replacements: {
        questions: JSON.stringify(updatedQuestions),
        answers: JSON.stringify(answers),
        score,
        review: JSON.stringify(review),
        id: req.params.id
      }
    });

    res.json({ assessmentId: req.params.id, score, correctAnswers, totalQuestions: questions.length, timeSpent, status: 'completed', review });
  } catch (error) {
    console.error('Submit assessment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get assessment review
router.get('/review/:id', authenticateToken, async (req, res) => {
  try {
    // Detect available columns to handle QA DB schema differences
    let existingCols = [];
    try {
      const colRows = await sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'skill_assessments'`,
        { type: sequelize.QueryTypes.SELECT }
      );
      existingCols = colRows.map(r => r.column_name);
    } catch (e) {
      console.warn('Could not fetch columns:', e.message);
    }

    const selectCols = ['id', '"userId"', 'skill', 'score', 'questions'];
    if (existingCols.includes('review')) selectCols.push('review');
    if (existingCols.includes('completedAt')) selectCols.push('"completedAt"');
    if (existingCols.includes('status')) selectCols.push('status');

    const rows = await sequelize.query(
      `SELECT ${selectCols.join(', ')} FROM skill_assessments WHERE id = :id`,
      { replacements: { id: req.params.id }, type: sequelize.QueryTypes.SELECT }
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const assessment = rows[0];
    const rowUserId = assessment.userId || assessment['userId'];
    if (String(rowUserId) !== String(req.user.id)) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const questions = typeof assessment.questions === 'string'
      ? JSON.parse(assessment.questions)
      : (Array.isArray(assessment.questions) ? assessment.questions : []);

    const review = assessment.review
      ? (typeof assessment.review === 'string' ? JSON.parse(assessment.review) : assessment.review)
      : {};

    res.json({
      assessmentId: assessment.id,
      skill: assessment.skill,
      score: assessment.score,
      completedAt: assessment.completedAt || assessment.createdAt || null,
      review,
      status: assessment.status || 'completed',
      questions
    });
  } catch (error) {
    console.error('Review fetch error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get user assessments
router.get('/my-assessments', authenticateToken, async (req, res) => {
  try {
    let rows;
    try {
      rows = await sequelize.query(
        `SELECT id, skill, score, "completedAt", "createdAt" FROM skill_assessments WHERE "userId" = :userId ORDER BY "createdAt" DESC`,
        { replacements: { userId: req.user.id }, type: sequelize.QueryTypes.SELECT }
      );
    } catch {
      rows = await sequelize.query(
        `SELECT id, skill, score, "createdAt" FROM skill_assessments WHERE "userId" = :userId ORDER BY "createdAt" DESC`,
        { replacements: { userId: req.user.id }, type: sequelize.QueryTypes.SELECT }
      );
    }

    const data = Array.isArray(rows) ? rows : [];
    const completed = data.filter(a => a.completedAt != null || a.score > 0);

    res.json(completed.map(a => ({
      assessmentId: a.id,
      skill: a.skill,
      score: a.score,
      completedAt: a.completedAt || a.createdAt
    })));
  } catch (error) {
    console.error('my-assessments error:', error.message);
    res.json([]);
  }
});

// GET /api/skill-assessments/learning-resources?skill=React
router.get('/learning-resources', async (req, res) => {
  const { skill } = req.query;
  if (!skill) return res.status(400).json({ error: 'skill is required' });

  try {
    const prompt = `For the skill "${skill}", return a JSON object with exactly 3 free learning resources.
Return ONLY valid JSON, no markdown.
{
  "resources": [
    { "title": "resource name", "url": "https://...", "type": "Documentation|Course|Tutorial|Video" },
    { "title": "resource name", "url": "https://...", "type": "Documentation|Course|Tutorial|Video" },
    { "title": "resource name", "url": "https://...", "type": "Documentation|Course|Tutorial|Video" }
  ]
}
Rules:
- Only real, working URLs (official docs, freeCodeCamp, MDN, YouTube, Coursera free tier, etc.)
- No paid courses
- Specific to "${skill}"`;

    const content = await callAI(prompt);
    if (!content) return res.json({ resources: [] });

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.json({ resources: [] });

    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ skill, resources: parsed.resources || [] });
  } catch (e) {
    console.error('learning-resources error:', e.message);
    res.json({ resources: [] });
  }
});

// GET /api/skill-assessments/career-path?jobTitle=React Developer&skills=React,JavaScript
router.get('/career-path', async (req, res) => {
  const { jobTitle, skills } = req.query;
  if (!jobTitle) return res.status(400).json({ error: 'jobTitle is required' });

  try {
    const prompt = `Given a job role "${jobTitle}" with current skills: ${skills || 'not specified'}.
Return a JSON career path suggestion.
Return ONLY valid JSON, no markdown.
{
  "currentLevel": "Junior|Mid|Senior",
  "nextRole": "next logical job title",
  "timeframe": "e.g. 1-2 years",
  "skillsToLearn": ["skill1", "skill2", "skill3", "skill4"],
  "tip": "one actionable career advice sentence"
}`;

    const content = await callAI(prompt);
    if (!content) return res.json(null);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.json(null);

    res.json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    console.error('career-path error:', e.message);
    res.json(null);
  }
});

// Get available skills
router.get('/skills', async (req, res) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const skillsPath = path.join(__dirname, '../data/skills.json');
    
    const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
    res.json(skillsData.skills);
  } catch (error) {
    console.error('Error loading skills:', error);
    res.json(['JavaScript', 'Python', 'React', 'Node.js', 'Java', 'SQL', 'TypeScript', 'AWS']);
  }
});

// Test database connection
router.get('/test-db', async (req, res) => {
  try {
    // Test if table exists
    const result = await sequelize.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'skill_assessments'`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    if (result.length === 0) {
      return res.json({ 
        status: 'error', 
        message: 'skill_assessments table does not exist',
        suggestion: 'Run: npm run sync-models or create the table manually'
      });
    }
    
    // Test if we can query the table
    const count = await sequelize.query(
      `SELECT COUNT(*) as count FROM skill_assessments`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    res.json({ 
      status: 'ok', 
      message: 'Database connected and table exists',
      assessmentCount: count[0].count
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message,
      hint: 'Check if PostgreSQL is running and database exists'
    });
  }
});

export default router;
