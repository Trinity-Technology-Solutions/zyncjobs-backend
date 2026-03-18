import ResumeVersion from '../models/ResumeVersion.js';

const resumeVersionService = {
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
