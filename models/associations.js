import TalentCandidate from './TalentCandidate.js';
import Skill from './Skill.js';
import CandidateSkill from './CandidateSkill.js';
import SubmissionBatch from './SubmissionBatch.js';
import CandidateSubmission from './CandidateSubmission.js';

// Central association definitions (models are standalone; includes require these)
CandidateSkill.belongsTo(TalentCandidate, { foreignKey: 'candidateId', as: 'candidate' });
CandidateSkill.belongsTo(Skill, { foreignKey: 'skillId', as: 'skill' });
Skill.hasMany(CandidateSkill, { foreignKey: 'skillId', as: 'candidateSkills' });
TalentCandidate.hasMany(CandidateSkill, { foreignKey: 'candidateId', as: 'candidateSkills' });

SubmissionBatch.hasMany(CandidateSubmission, { foreignKey: 'batchId', as: 'submissions' });
CandidateSubmission.belongsTo(SubmissionBatch, { foreignKey: 'batchId', as: 'batch' });
CandidateSubmission.belongsTo(TalentCandidate, { foreignKey: 'candidateId', targetKey: 'candidateId', as: 'candidate' });
TalentCandidate.hasMany(CandidateSubmission, { foreignKey: 'candidateId', sourceKey: 'candidateId', as: 'submissions' });

export default { TalentCandidate, Skill, CandidateSkill, SubmissionBatch, CandidateSubmission };