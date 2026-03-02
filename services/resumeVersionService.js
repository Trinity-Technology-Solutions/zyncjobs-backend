import ResumeVersion from '../models/ResumeVersion.js';

class ResumeVersionService {
  async saveVersion(userId, resumeId, resumeData) {
    const latestVersion = await ResumeVersion.findOne({ userId, resumeId }).sort({ version: -1 });
    const newVersion = latestVersion ? latestVersion.version + 1 : 1;

    // Deactivate previous active version
    await ResumeVersion.updateMany({ userId, resumeId }, { isActive: false });

    const versionDoc = new ResumeVersion({
      userId,
      resumeId,
      version: newVersion,
      data: resumeData,
      isActive: true
    });

    return await versionDoc.save();
  }

  async getVersions(userId, resumeId) {
    return await ResumeVersion.find({ userId, resumeId }).sort({ version: -1 });
  }

  async getVersion(userId, resumeId, version) {
    return await ResumeVersion.findOne({ userId, resumeId, version });
  }

  async restoreVersion(userId, resumeId, version) {
    const versionDoc = await this.getVersion(userId, resumeId, version);
    if (!versionDoc) throw new Error('Version not found');

    await ResumeVersion.updateMany({ userId, resumeId }, { isActive: false });
    versionDoc.isActive = true;
    return await versionDoc.save();
  }

  async getActiveVersion(userId, resumeId) {
    return await ResumeVersion.findOne({ userId, resumeId, isActive: true });
  }
}

export default new ResumeVersionService();