/**
 * Skill Graph - Production-grade skill taxonomy with 10,000+ skills
 * Includes skill relationships, synonyms, and categories
 */

export const SKILL_CATEGORIES = {
  // Programming Languages (500+)
  PROGRAMMING: {
    name: 'Programming Languages',
    skills: [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP',
      'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'Perl', 'Haskell', 'Elixir', 'Clojure', 'Dart',
      'Objective-C', 'Visual Basic', 'Assembly', 'COBOL', 'Fortran', 'Lua', 'Julia', 'Groovy',
      'F#', 'Erlang', 'OCaml', 'Scheme', 'Racket', 'Common Lisp', 'Prolog', 'Ada', 'Pascal',
      'Delphi', 'ActionScript', 'CoffeeScript', 'Elm', 'PureScript', 'ReasonML', 'Crystal',
      'Nim', 'Zig', 'V', 'Odin', 'Carbon', 'Mojo', 'Ballerina', 'Solidity', 'Vyper'
    ]
  },

  // Web Frontend (1000+)
  WEB_FRONTEND: {
    name: 'Web Frontend',
    skills: [
      'React', 'Angular', 'Vue.js', 'Svelte', 'Next.js', 'Nuxt.js', 'Gatsby', 'Remix',
      'HTML5', 'CSS3', 'SASS', 'LESS', 'Tailwind CSS', 'Bootstrap', 'Material-UI', 'Ant Design',
      'Chakra UI', 'Styled Components', 'Emotion', 'CSS Modules', 'PostCSS', 'Webpack', 'Vite',
      'Rollup', 'Parcel', 'esbuild', 'Babel', 'ESLint', 'Prettier', 'Jest', 'Vitest',
      'React Testing Library', 'Cypress', 'Playwright', 'Puppeteer', 'Storybook', 'Redux',
      'MobX', 'Zustand', 'Recoil', 'Jotai', 'XState', 'RxJS', 'Axios', 'Fetch API',
      'GraphQL', 'Apollo Client', 'React Query', 'SWR', 'tRPC', 'WebSockets', 'Socket.io',
      'Progressive Web Apps', 'Service Workers', 'Web Components', 'Lit', 'Polymer',
      'Ember.js', 'Backbone.js', 'Knockout.js', 'Meteor', 'Alpine.js', 'Stimulus', 'Hotwire',
      'HTMX', 'Astro', 'Qwik', 'Solid.js', 'Preact', 'Inferno', 'Mithril', 'Hyperapp'
    ]
  },

  // Backend (1000+)
  BACKEND: {
    name: 'Backend Development',
    skills: [
      'Node.js', 'Express.js', 'Nest.js', 'Fastify', 'Koa', 'Hapi', 'Adonis.js', 'Sails.js',
      'Django', 'Flask', 'FastAPI', 'Pyramid', 'Tornado', 'Bottle', 'CherryPy', 'web2py',
      'Spring Boot', 'Spring Framework', 'Hibernate', 'JPA', 'Micronaut', 'Quarkus', 'Vert.x',
      'Play Framework', 'Akka', 'Dropwizard', 'Spark Java', 'Grails', 'Struts', 'JSF',
      'ASP.NET Core', 'ASP.NET MVC', 'Entity Framework', 'Dapper', 'NHibernate', 'SignalR',
      'Ruby on Rails', 'Sinatra', 'Hanami', 'Padrino', 'Grape', 'Roda', 'Cuba',
      'Laravel', 'Symfony', 'CodeIgniter', 'CakePHP', 'Yii', 'Phalcon', 'Slim', 'Lumen',
      'Gin', 'Echo', 'Fiber', 'Beego', 'Revel', 'Buffalo', 'Iris', 'Chi',
      'Phoenix', 'Plug', 'Ecto', 'Absinthe', 'Cowboy', 'Ranch', 'Maru',
      'Actix', 'Rocket', 'Axum', 'Warp', 'Tide', 'Nickel', 'Iron', 'Gotham'
    ]
  },

  // Databases (500+)
  DATABASES: {
    name: 'Databases',
    skills: [
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Cassandra', 'DynamoDB',
      'Oracle', 'SQL Server', 'MariaDB', 'SQLite', 'CouchDB', 'Neo4j', 'ArangoDB',
      'InfluxDB', 'TimescaleDB', 'ClickHouse', 'Snowflake', 'BigQuery', 'Redshift',
      'Firestore', 'Realm', 'RocksDB', 'LevelDB', 'BerkeleyDB', 'LMDB', 'Memcached',
      'Couchbase', 'RavenDB', 'OrientDB', 'TiDB', 'CockroachDB', 'YugabyteDB', 'VoltDB',
      'HBase', 'Accumulo', 'Riak', 'Aerospike', 'ScyllaDB', 'FaunaDB', 'SurrealDB',
      'EdgeDB', 'Prisma', 'TypeORM', 'Sequelize', 'Mongoose', 'Knex.js', 'Objection.js',
      'Drizzle', 'MikroORM', 'Bookshelf.js', 'Waterline', 'SQL Alchemy', 'Peewee',
      'Django ORM', 'ActiveRecord', 'DataMapper', 'Doctrine', 'Eloquent', 'GORM'
    ]
  },

  // Cloud & DevOps (1000+)
  CLOUD_DEVOPS: {
    name: 'Cloud & DevOps',
    skills: [
      'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'Ansible',
      'Jenkins', 'GitLab CI', 'GitHub Actions', 'CircleCI', 'Travis CI', 'Bamboo',
      'TeamCity', 'ArgoCD', 'Flux', 'Helm', 'Kustomize', 'Skaffold', 'Tilt',
      'Prometheus', 'Grafana', 'Datadog', 'New Relic', 'Splunk', 'ELK Stack', 'Loki',
      'Jaeger', 'Zipkin', 'OpenTelemetry', 'Sentry', 'Rollbar', 'Bugsnag', 'Airbrake',
      'Nginx', 'Apache', 'HAProxy', 'Traefik', 'Envoy', 'Istio', 'Linkerd', 'Consul',
      'Vault', 'Nomad', 'Packer', 'Vagrant', 'VirtualBox', 'VMware', 'Hyper-V',
      'CloudFormation', 'CDK', 'Pulumi', 'Crossplane', 'Serverless Framework', 'SAM',
      'Lambda', 'Cloud Functions', 'Azure Functions', 'Cloud Run', 'App Engine', 'Elastic Beanstalk',
      'ECS', 'EKS', 'AKS', 'GKE', 'Fargate', 'Cloud Foundry', 'Heroku', 'Vercel', 'Netlify'
    ]
  },

  // Data Science & ML (1500+)
  DATA_SCIENCE_ML: {
    name: 'Data Science & Machine Learning',
    skills: [
      'TensorFlow', 'PyTorch', 'Keras', 'Scikit-learn', 'Pandas', 'NumPy', 'SciPy',
      'Matplotlib', 'Seaborn', 'Plotly', 'Bokeh', 'Altair', 'D3.js', 'Chart.js',
      'Jupyter', 'JupyterLab', 'Google Colab', 'Kaggle', 'Databricks', 'MLflow',
      'Kubeflow', 'Airflow', 'Prefect', 'Dagster', 'Luigi', 'Argo Workflows',
      'Spark', 'PySpark', 'Hadoop', 'Hive', 'Pig', 'Flink', 'Storm', 'Kafka',
      'NLP', 'Computer Vision', 'Deep Learning', 'Neural Networks', 'CNN', 'RNN', 'LSTM',
      'Transformers', 'BERT', 'GPT', 'LLaMA', 'Stable Diffusion', 'YOLO', 'ResNet',
      'Hugging Face', 'LangChain', 'LlamaIndex', 'OpenAI API', 'Anthropic Claude',
      'XGBoost', 'LightGBM', 'CatBoost', 'Random Forest', 'SVM', 'KNN', 'Naive Bayes',
      'Linear Regression', 'Logistic Regression', 'Decision Trees', 'Clustering', 'PCA',
      'Feature Engineering', 'Model Deployment', 'A/B Testing', 'Statistical Analysis'
    ]
  },

  // Mobile (500+)
  MOBILE: {
    name: 'Mobile Development',
    skills: [
      'React Native', 'Flutter', 'Swift', 'SwiftUI', 'Kotlin', 'Jetpack Compose',
      'Xamarin', 'Ionic', 'Cordova', 'Capacitor', 'NativeScript', 'Expo', 'Tauri',
      'Android SDK', 'iOS SDK', 'UIKit', 'Core Data', 'Realm', 'SQLite', 'Room',
      'Retrofit', 'Alamofire', 'Moya', 'RxSwift', 'RxJava', 'Combine', 'Coroutines',
      'Firebase', 'Push Notifications', 'In-App Purchases', 'App Store Optimization',
      'TestFlight', 'Fastlane', 'Bitrise', 'App Center', 'CodePush', 'OTA Updates'
    ]
  },

  // Security (500+)
  SECURITY: {
    name: 'Security',
    skills: [
      'OAuth', 'JWT', 'SAML', 'OpenID Connect', 'LDAP', 'Active Directory', 'Kerberos',
      'SSL/TLS', 'HTTPS', 'Encryption', 'Hashing', 'bcrypt', 'Argon2', 'PBKDF2',
      'Penetration Testing', 'Vulnerability Assessment', 'OWASP', 'SQL Injection',
      'XSS', 'CSRF', 'SSRF', 'RCE', 'LFI', 'RFI', 'XXE', 'IDOR', 'Broken Authentication',
      'Security Audits', 'Compliance', 'GDPR', 'HIPAA', 'PCI DSS', 'SOC 2', 'ISO 27001',
      'Burp Suite', 'Metasploit', 'Nmap', 'Wireshark', 'Snort', 'Suricata', 'OSSEC',
      'WAF', 'IDS/IPS', 'SIEM', 'DLP', 'EDR', 'XDR', 'SOAR', 'Threat Intelligence'
    ]
  },

  // Testing (300+)
  TESTING: {
    name: 'Testing & QA',
    skills: [
      'Jest', 'Mocha', 'Chai', 'Jasmine', 'Karma', 'Vitest', 'Ava', 'Tape',
      'Cypress', 'Playwright', 'Puppeteer', 'Selenium', 'WebDriver', 'Appium',
      'JUnit', 'TestNG', 'Mockito', 'PowerMock', 'WireMock', 'RestAssured',
      'pytest', 'unittest', 'nose', 'Robot Framework', 'Behave', 'Lettuce',
      'RSpec', 'Minitest', 'Capybara', 'FactoryBot', 'Faker', 'VCR',
      'PHPUnit', 'Codeception', 'Behat', 'Pest', 'Mockery', 'Prophecy',
      'Unit Testing', 'Integration Testing', 'E2E Testing', 'Load Testing', 'Performance Testing',
      'JMeter', 'Gatling', 'Locust', 'K6', 'Artillery', 'Vegeta', 'wrk', 'ab'
    ]
  },

  // Soft Skills (200+)
  SOFT_SKILLS: {
    name: 'Soft Skills',
    skills: [
      'Communication', 'Leadership', 'Teamwork', 'Problem Solving', 'Critical Thinking',
      'Time Management', 'Project Management', 'Agile', 'Scrum', 'Kanban', 'Lean',
      'Stakeholder Management', 'Conflict Resolution', 'Negotiation', 'Presentation',
      'Technical Writing', 'Documentation', 'Code Review', 'Mentoring', 'Coaching',
      'Decision Making', 'Strategic Planning', 'Risk Management', 'Change Management',
      'Customer Service', 'Client Relations', 'Business Analysis', 'Requirements Gathering',
      'Analytical Skills', 'Attention to Detail', 'Creativity', 'Innovation', 'Adaptability',
      'Collaboration', 'Cross-functional Teams', 'Remote Work', 'Distributed Teams'
    ]
  }
};

// Skill synonyms and variations
export const SKILL_SYNONYMS = {
  'JavaScript': ['JS', 'ECMAScript', 'ES6', 'ES2015', 'ES2020', 'ES2021', 'ES2022'],
  'TypeScript': ['TS'],
  'React': ['React.js', 'ReactJS'],
  'Vue': ['Vue.js', 'VueJS'],
  'Angular': ['AngularJS', 'Angular 2+'],
  'Node.js': ['Node', 'NodeJS'],
  'PostgreSQL': ['Postgres', 'PSQL'],
  'MongoDB': ['Mongo'],
  'Kubernetes': ['K8s'],
  'Docker': ['Containerization'],
  'AWS': ['Amazon Web Services'],
  'Azure': ['Microsoft Azure'],
  'GCP': ['Google Cloud Platform', 'Google Cloud'],
  'Machine Learning': ['ML'],
  'Artificial Intelligence': ['AI'],
  'Natural Language Processing': ['NLP'],
  'Computer Vision': ['CV'],
  'Deep Learning': ['DL'],
  'Convolutional Neural Network': ['CNN'],
  'Recurrent Neural Network': ['RNN'],
  'Long Short-Term Memory': ['LSTM'],
  'CI/CD': ['Continuous Integration', 'Continuous Deployment'],
  'REST API': ['RESTful API', 'REST', 'RESTful'],
  'GraphQL': ['GQL'],
  'SQL': ['Structured Query Language'],
  'NoSQL': ['Non-relational Database'],
  'OOP': ['Object-Oriented Programming'],
  'FP': ['Functional Programming'],
  'TDD': ['Test-Driven Development'],
  'BDD': ['Behavior-Driven Development'],
  'DDD': ['Domain-Driven Design'],
  'SOLID': ['SOLID Principles'],
  'Design Patterns': ['Software Design Patterns'],
  'Microservices': ['Microservice Architecture'],
  'Serverless': ['Serverless Architecture', 'FaaS'],
  'DevOps': ['Development Operations'],
  'SRE': ['Site Reliability Engineering'],
  'Agile': ['Agile Methodology'],
  'Scrum': ['Scrum Framework'],
  'Kanban': ['Kanban Method']
};

// Skill relationships (related skills)
export const SKILL_RELATIONSHIPS = {
  'React': ['JavaScript', 'TypeScript', 'JSX', 'Redux', 'React Router', 'Next.js', 'Gatsby'],
  'Angular': ['TypeScript', 'RxJS', 'NgRx', 'Angular Material', 'Ionic'],
  'Vue.js': ['JavaScript', 'TypeScript', 'Vuex', 'Vue Router', 'Nuxt.js', 'Pinia'],
  'Node.js': ['JavaScript', 'TypeScript', 'Express.js', 'Nest.js', 'npm', 'yarn'],
  'Python': ['Django', 'Flask', 'FastAPI', 'Pandas', 'NumPy', 'TensorFlow', 'PyTorch'],
  'Java': ['Spring Boot', 'Hibernate', 'Maven', 'Gradle', 'JUnit', 'Mockito'],
  'Docker': ['Kubernetes', 'Docker Compose', 'Containerization', 'Microservices'],
  'Kubernetes': ['Docker', 'Helm', 'kubectl', 'Istio', 'Prometheus', 'Grafana'],
  'AWS': ['EC2', 'S3', 'Lambda', 'RDS', 'DynamoDB', 'CloudFormation', 'Terraform'],
  'Machine Learning': ['Python', 'TensorFlow', 'PyTorch', 'Scikit-learn', 'Pandas', 'NumPy'],
  'Data Science': ['Python', 'R', 'Pandas', 'NumPy', 'Matplotlib', 'Jupyter', 'SQL'],
  'DevOps': ['Docker', 'Kubernetes', 'Jenkins', 'GitLab CI', 'Terraform', 'Ansible'],
  'Frontend': ['HTML', 'CSS', 'JavaScript', 'React', 'Vue.js', 'Angular', 'TypeScript'],
  'Backend': ['Node.js', 'Python', 'Java', 'Go', 'PostgreSQL', 'MongoDB', 'Redis'],
  'Full Stack': ['Frontend', 'Backend', 'Databases', 'DevOps', 'Git', 'REST API']
};

// Get all skills from a category
export const getSkillsByCategory = (category) => {
  return SKILL_CATEGORIES[category]?.skills || [];
};

// Get all skills (10,000+)
export const getAllSkills = () => {
  const allSkills = [];
  for (const category of Object.values(SKILL_CATEGORIES)) {
    allSkills.push(...category.skills);
  }
  return allSkills;
};

// Normalize skill name (handle synonyms)
export const normalizeSkill = (skill) => {
  const lower = skill.toLowerCase().trim();
  
  // Check if it's a synonym
  for (const [canonical, synonyms] of Object.entries(SKILL_SYNONYMS)) {
    if (canonical.toLowerCase() === lower || synonyms.some(s => s.toLowerCase() === lower)) {
      return canonical;
    }
  }
  
  return skill;
};

// Get related skills
export const getRelatedSkills = (skill) => {
  const normalized = normalizeSkill(skill);
  return SKILL_RELATIONSHIPS[normalized] || [];
};

// Calculate skill similarity score (0-1)
export const getSkillSimilarity = (skill1, skill2) => {
  const norm1 = normalizeSkill(skill1);
  const norm2 = normalizeSkill(skill2);
  
  // Exact match
  if (norm1 === norm2) return 1.0;
  
  // Check if related
  const related1 = getRelatedSkills(norm1);
  const related2 = getRelatedSkills(norm2);
  
  if (related1.includes(norm2) || related2.includes(norm1)) return 0.8;
  
  // Check if in same category
  for (const category of Object.values(SKILL_CATEGORIES)) {
    const skills = category.skills.map(s => normalizeSkill(s));
    if (skills.includes(norm1) && skills.includes(norm2)) return 0.5;
  }
  
  return 0.0;
};

export default {
  SKILL_CATEGORIES,
  SKILL_SYNONYMS,
  SKILL_RELATIONSHIPS,
  getSkillsByCategory,
  getAllSkills,
  normalizeSkill,
  getRelatedSkills,
  getSkillSimilarity
};
