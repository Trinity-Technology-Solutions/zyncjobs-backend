import ResumeVersion from '../models/ResumeVersion.js';
import Resume from '../models/Resume.js';

const resumeVersionService = {

  saveVersion: async (userId, resumeId, resumeData) => {
    const count = await ResumeVersion.count({ where: { userId, resumeId } });
    const version = ResumeVersion.create({ userId, resumeId, parsedData: resumeData, version: count + 1 });
    
    // If this is the first version, also create a Resume entry
    if (count === 0 && resumeData.email) {
      try {
        await Resume.create({
          userId,
          email: resumeData.email,
          fileName: resumeData.fileName || `Builder Resume - ${resumeId}`, 
          fileUrl: resumeData.fileUrl || null,
          parsedData: resumeData,
          status: 'approved',
          moderationNotes: 'Auto-created from builder'
        });
        console.log('✅ Resume created in main table:', resumeId);
      } catch (err) {
        console.warn('⚠️  Could not create main Resume:', err.message);
      }
    }
    
    return version;
  },
  saveVersion: async (userId, resumeId, resumeData) => {
    const count = await ResumeVersion.count({ where: { userId, resumeId } });
    return ResumeVersion.create({ userId, resumeId, parsedData: resumeData, version: count + 1 });
  },

  getVersions: async (userId, resumeId) => {
    return ResumeVersion.findAll({ where: { userId, resumeId }, order: [['version', 'DESC']] });
  },

  getVersion: async (userId, resumeId, version) => {
    return ResumeVersion.findOne({ where: { userId, resumeId, version } });
  },

  restoreVersion: async (userId, resumeId, version) => {
    const target = await ResumeVersion.findOne({ where: { userId, resumeId, version } });
    if (!target) throw new Error('Version not found');
    return resumeVersionService.saveVersion(userId, resumeId, target.parsedData);
  }
};

export default resumeVersionService;
