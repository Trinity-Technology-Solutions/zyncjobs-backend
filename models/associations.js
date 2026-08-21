import TalentCandidate from './TalentCandidate.js';
import Skill from './Skill.js';
import CandidateSkill from './CandidateSkill.js';

// Central association definitions (models are standalone; includes require these)
CandidateSkill.belongsTo(TalentCandidate, { foreignKey: 'candidateId', as: 'candidate' });
CandidateSkill.belongsTo(Skill, { foreignKey: 'skillId', as: 'skill' });
Skill.hasMany(CandidateSkill, { foreignKey: 'skillId', as: 'candidateSkills' });
TalentCandidate.hasMany(CandidateSkill, { foreignKey: 'candidateId', as: 'candidateSkills' });

export default { TalentCandidate, Skill, CandidateSkill };