import axios from 'axios';

class MistralService {
  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY || null;
    this.apiUrl = 'https://api.mistral.ai/v1/chat/completions';
  }

  async callMistralAPI(prompt, maxTokens = 500) {
    try {
      const response = await axios.post(this.apiUrl, {
        model: 'mistral-7b-instruct',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return response.data.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Mistral API error:', error.response?.data || error.message);
      throw new Error('Failed to generate AI content');
    }
  }

  async generateJobTitleSuggestions(input) {
    const prompt = `Given the input "${input}", suggest 8 relevant job titles. Return only the job titles, one per line, no numbering or extra text.

Examples:
- For "Software": Software Developer, Software Engineer, Software Tester, Software Architect, Senior Software Engineer, Full-Stack Software Developer, Software Quality Assurance Engineer, Software Product Manager
- For "Data": Data Scientist, Data Analyst, Data Engineer, Data Architect, Senior Data Scientist, Data Product Manager, Data Visualization Specialist, Big Data Engineer

Input: "${input}"
Job titles:`;

    try {
      const response = await this.callMistralAPI(prompt);
      return response.split('\n')
        .map(title => title.trim())
        .filter(title => title.length > 0)
        .slice(0, 8);
    } catch (error) {
      return this.getFallbackJobTitles(input);
    }
  }

  async generateSkillSuggestions(input) {
    const prompt = `Given the input "${input}", suggest 10 relevant technical skills. Return only the skill names, one per line, no numbering or extra text.

Examples:
- For "Py": Python, PyTorch, PySpark, Pygame, PyQt, Pytest, Pyramid, Pylint, PyCharm, Pydantic
- For "Java": JavaScript, Java, JavaFX, Jakarta EE, Jackson, JUnit, Jenkins, Jira, jQuery, JSON

Input: "${input}"
Skills:`;

    try {
      const response = await this.callMistralAPI(prompt);
      return response.split('\n')
        .map(skill => skill.trim())
        .filter(skill => skill.length > 0)
        .slice(0, 10);
    } catch (error) {
      return this.getFallbackSkills(input);
    }
  }

  async generateLocationSuggestions(input) {
    const prompt = `Given the input "${input}", suggest 8 relevant cities/locations for job postings. Include major cities worldwide. Return only the location names, one per line, no numbering or extra text.

Examples:
- For "Ch": Chennai, Chicago, Charlotte, Chandigarh, Charleston, Chengdu, Chester, Christchurch
- For "San": San Francisco, San Diego, San Antonio, San Jose, Santa Clara, Santiago, Santos, Santander

Input: "${input}"
Locations:`;

    try {
      const response = await this.callMistralAPI(prompt);
      return response.split('\n')
        .map(location => location.trim())
        .filter(location => location.length > 0)
        .slice(0, 8);
    } catch (error) {
      return this.getFallbackLocations(input);
    }
  }

  async generateJobDescription(jobTitle, company, location) {
    const prompt = `Generate a professional job description for the position "${jobTitle}"${company ? ` at ${company}` : ''}${location ? ` in ${location}` : ''}. 

The job description should include:
- Brief company/role overview
- Key responsibilities (4-6 bullet points)
- Required qualifications and skills
- Preferred qualifications
- What we offer/benefits

Make it engaging and professional. Use bullet points for responsibilities and qualifications.

Job Title: ${jobTitle}
${company ? `Company: ${company}` : ''}
${location ? `Location: ${location}` : ''}

Job Description:`;

    try {
      const response = await this.callMistralAPI(prompt, 800);
      return response.trim();
    } catch (error) {
      return this.getFallbackJobDescription(jobTitle);
    }
  }

  // Fallback methods
  getFallbackJobTitles(input) {
    const jobTitles = [
      'Software Engineer', 'Software Developer', 'Full Stack Developer', 'Frontend Developer', 'Backend Developer',
      'DevOps Engineer', 'Cloud Engineer', 'AI Engineer', 'ML Engineer', 'Data Scientist', 'Data Analyst', 'Data Engineer',
      'Cybersecurity Analyst', 'Network Engineer', 'IT Support Specialist', 'QA Engineer', 'Automation Engineer',
      'Product Manager', 'Project Manager', 'Scrum Master', 'UI Designer', 'UX Designer', 'Graphic Designer',
      'Business Analyst', 'HR Manager', 'Recruiter', 'Talent Acquisition Specialist', 'Digital Marketing Specialist',
      'SEO Specialist', 'Content Writer', 'Copywriter', 'Sales Manager', 'Sales Executive', 'Account Manager',
      'Customer Support Executive', 'Operations Manager', 'Finance Manager', 'Accountant', 'Chartered Accountant',
      'Auditor', 'Banking Officer', 'Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Teacher', 'Professor',
      'Mechanical Engineer', 'Electrical Engineer', 'Civil Engineer', 'Architect', 'Interior Designer',
      'Business Development Manager', 'Store Manager', 'Chef', 'Hotel Manager', 'Logistics Manager',
      'Supply Chain Manager', 'Warehouse Supervisor', 'Driver', 'Electrician', 'Plumber', 'Carpenter'
    ];

    const key = input.toLowerCase();
    const filtered = jobTitles.filter(title => 
      title.toLowerCase().includes(key)
    );
    
    return filtered.length > 0 ? filtered.slice(0, 8) : jobTitles.slice(0, 8);
  }

  getFallbackSkills(input) {
    const skills = [
      'Python', 'Java', 'JavaScript', 'C#', 'C++', 'React', 'Node.js', 'Angular', 'Django', 'Flask',
      'Next.js', 'SQL', 'NoSQL', 'MongoDB', 'PostgreSQL', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes',
      'DevOps', 'Git', 'Jenkins', 'CI/CD', 'Linux', 'REST API', 'GraphQL', 'Machine Learning',
      'Deep Learning', 'NLP', 'Data Visualization', 'Power BI', 'Tableau', 'Excel', 'Communication',
      'Teamwork', 'Leadership', 'Time Management', 'Problem-Solving', 'Accounting', 'Tally', 'GST',
      'Bookkeeping', 'Digital Marketing', 'SEO', 'SEM', 'Content Writing', 'Editing', 'Graphic Design',
      'Photoshop', 'Illustrator', 'TypeScript', 'Vue.js', 'Redux', 'Express.js', 'Spring Boot',
      'Laravel', 'Ruby on Rails', 'PHP', 'Swift', 'Kotlin', 'Flutter', 'React Native'
    ];

    const key = input.toLowerCase();
    const filtered = skills.filter(skill => 
      skill.toLowerCase().includes(key)
    );
    
    return filtered.length > 0 ? filtered.slice(0, 8) : skills.slice(0, 8);
  }

  getFallbackLocations(input) {
    const locations = [
      'Chennai', 'Bangalore', 'Hyderabad', 'Mumbai', 'Pune', 'Delhi', 'Kolkata', 'Ahmedabad',
      'Coimbatore', 'Madurai', 'Singapore', 'Dubai', 'Abu Dhabi', 'London', 'Manchester',
      'New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Seattle', 'Toronto', 'Vancouver',
      'Sydney', 'Melbourne', 'Brisbane', 'Tokyo', 'Osaka', 'Seoul', 'Paris', 'Berlin',
      'Frankfurt', 'Amsterdam', 'Rotterdam', 'Dublin', 'Doha', 'Riyadh', 'Jeddah', 'Remote',
      'Work from Home', 'Hybrid', 'Austin', 'Boston', 'Denver', 'Atlanta', 'Phoenix',
      'Philadelphia', 'San Diego', 'Dallas', 'Houston', 'Miami', 'Portland', 'Nashville'
    ];

    const key = input.toLowerCase();
    const filtered = locations.filter(location => 
      location.toLowerCase().includes(key)
    );
    
    return filtered.length > 0 ? filtered.slice(0, 8) : locations.slice(0, 8);
  }

  getFallbackJobDescription(jobTitle) {
    return `We are seeking a talented ${jobTitle} to join our dynamic team.

Key Responsibilities:
• Develop and maintain high-quality software solutions
• Collaborate with cross-functional teams to deliver projects
• Write clean, efficient, and well-documented code
• Participate in code reviews and technical discussions
• Stay updated with latest industry trends and technologies

Required Qualifications:
• Bachelor's degree in Computer Science or related field
• 3+ years of relevant experience
• Strong problem-solving and analytical skills
• Excellent communication and teamwork abilities

What We Offer:
• Competitive salary and benefits package
• Flexible working arrangements
• Professional development opportunities
• Collaborative and innovative work environment`;
  }
}

export default new MistralService();