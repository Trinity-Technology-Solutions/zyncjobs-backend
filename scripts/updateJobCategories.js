import { sequelize } from '../config/postgresql.js';
import Job from '../models/Job.js';

// Function to determine category from job title
function getCategoryFromTitle(jobTitle) {
  const title = jobTitle.toLowerCase();
  
  if (title.includes('software') || title.includes('developer') || title.includes('engineer') || 
      title.includes('programmer') || title.includes('frontend') || title.includes('backend') || 
      title.includes('fullstack') || title.includes('full stack')) {
    return 'Software Development';
  }
  
  if (title.includes('data') || title.includes('analyst') || title.includes('scientist') || 
      title.includes('analytics') || title.includes('bi ')) {
    return 'Data Science & Analytics';
  }
  
  if (title.includes('devops') || title.includes('cloud') || title.includes('infrastructure') || 
      title.includes('sre') || title.includes('system')) {
    return 'DevOps & Cloud';
  }
  
  if (title.includes('designer') || title.includes('ui') || title.includes('ux') || 
      title.includes('graphic') || title.includes('product design')) {
    return 'Design';
  }
  
  if (title.includes('marketing') || title.includes('digital') || title.includes('seo') || 
      title.includes('content') || title.includes('social media')) {
    return 'Marketing';
  }
  
  if (title.includes('sales') || title.includes('business development') || title.includes('account')) {
    return 'Sales';
  }
  
  if (title.includes('hr') || title.includes('human resource') || title.includes('recruiter') || 
      title.includes('talent')) {
    return 'Human Resources';
  }
  
  if (title.includes('finance') || title.includes('accounting') || title.includes('accountant')) {
    return 'Finance & Accounting';
  }
  
  if (title.includes('project') || title.includes('manager') || title.includes('scrum') || 
      title.includes('product manager') || title.includes('program')) {
    return 'Project Management';
  }
  
  if (title.includes('qa') || title.includes('quality') || title.includes('test') || 
      title.includes('automation')) {
    return 'Quality Assurance';
  }
  
  if (title.includes('security') || title.includes('cyber')) {
    return 'Cybersecurity';
  }
  
  if (title.includes('support') || title.includes('customer success') || title.includes('help desk')) {
    return 'Customer Support';
  }
  
  return 'Other';
}

async function updateJobCategories() {
  try {
    console.log('🔄 Updating job categories...');
    
    // Get all jobs without categories
    const jobs = await Job.findAll({
      where: {
        jobCategory: null
      }
    });
    
    console.log(`Found ${jobs.length} jobs without categories`);
    
    let updated = 0;
    for (const job of jobs) {
      const category = getCategoryFromTitle(job.jobTitle);
      await job.update({ jobCategory: category });
      updated++;
      
      if (updated % 10 === 0) {
        console.log(`Updated ${updated}/${jobs.length} jobs...`);
      }
    }
    
    console.log(`✅ Successfully updated ${updated} jobs with categories`);
    
    // Show category distribution
    const categories = await Job.findAll({
      attributes: [
        'jobCategory',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        isActive: true,
        status: 'approved'
      },
      group: ['jobCategory'],
      raw: true
    });
    
    console.log('\n📊 Category Distribution:');
    categories.forEach(cat => {
      console.log(`  ${cat.jobCategory}: ${cat.count} jobs`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating job categories:', error);
    process.exit(1);
  }
}

updateJobCategories();
