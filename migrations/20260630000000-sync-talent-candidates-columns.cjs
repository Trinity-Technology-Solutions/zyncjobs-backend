'use strict';

// Full sync migration for talent_candidates table
// Checks every column from TalentCandidate model and adds if missing
// Safe to run multiple times — IF NOT EXISTS check on each column

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('talent_candidates');

    const columns = {
      candidate_id:          { type: Sequelize.STRING(20),  allowNull: true },
      name:                  { type: Sequelize.STRING,       defaultValue: '' },
      email:                 { type: Sequelize.STRING,       defaultValue: '' },
      phone:                 { type: Sequelize.STRING,       defaultValue: '' },
      gender:                { type: Sequelize.STRING,       defaultValue: '' },
      dob:                   { type: Sequelize.STRING,       defaultValue: '' },
      skills:                { type: Sequelize.TEXT,         defaultValue: '' },
      experience:            { type: Sequelize.STRING,       defaultValue: '' },
      totalExperience:       { type: Sequelize.FLOAT,        allowNull: true },
      jobTitle:              { type: Sequelize.STRING,       defaultValue: '' },
      currentCompany:        { type: Sequelize.STRING,       defaultValue: '' },
      summary:               { type: Sequelize.TEXT,         defaultValue: '' },
      location:              { type: Sequelize.STRING,       defaultValue: '' },
      country:               { type: Sequelize.STRING,       defaultValue: '' },
      tools:                 { type: Sequelize.TEXT,         defaultValue: '' },
      softSkills:            { type: Sequelize.TEXT,         defaultValue: '' },
      workExperiences:       { type: Sequelize.TEXT,         defaultValue: '[]' },
      internships:           { type: Sequelize.TEXT,         defaultValue: '[]' },
      languages:             { type: Sequelize.TEXT,         defaultValue: '' },
      awards:                { type: Sequelize.TEXT,         defaultValue: '[]' },
      educations:            { type: Sequelize.TEXT,         defaultValue: '[]' },
      projects:              { type: Sequelize.TEXT,         defaultValue: '[]' },
      certifications:        { type: Sequelize.TEXT,         defaultValue: '[]' },
      resumePath:            { type: Sequelize.STRING,       allowNull: true },
      resumeFile:            { type: Sequelize.STRING,       allowNull: true },
      resumeOriginalName:    { type: Sequelize.STRING,       defaultValue: '' },
      resumeType:            { type: Sequelize.STRING,       defaultValue: '' },
      resumeSize:            { type: Sequelize.BIGINT,       defaultValue: 0 },
      status:                { type: Sequelize.STRING,       defaultValue: 'Parsed' },
      parserStatus:          { type: Sequelize.STRING,       defaultValue: 'Pending' },
      parserError:           { type: Sequelize.TEXT,         defaultValue: '' },
      retryCount:            { type: Sequelize.INTEGER,      defaultValue: 0 },
      source:                { type: Sequelize.STRING,       defaultValue: 'uploaded_resume' },
      isRegistered:          { type: Sequelize.BOOLEAN,      defaultValue: false },
      isVisible:             { type: Sequelize.BOOLEAN,      defaultValue: false },
      emailStatus:           { type: Sequelize.STRING,       defaultValue: 'Not Sent' },
      emailSentAt:           { type: Sequelize.DATE,         allowNull: true },
      addedDate:             { type: Sequelize.DATE,         allowNull: true },
      rawText:               { type: Sequelize.TEXT,         defaultValue: '' },
    };

    // Sequelize uses camelCase field names as-is for column names unless `field` is set
    // TalentCandidate model uses underscored: false (default), so column = camelCase
    // Exception: candidateId has field: 'candidate_id' explicitly set in model
    for (const [col, definition] of Object.entries(columns)) {
      if (!desc[col]) {
        console.log(`[MIGRATION] Adding missing column: ${col}`);
        await queryInterface.addColumn('talent_candidates', col, definition);
      }
    }
  },

  async down(queryInterface) {
    // Only remove columns added by this migration — do not drop core columns
    const removable = [
      'candidate_id', 'gender', 'dob', 'tools', 'softSkills', 'workExperiences',
      'internships', 'languages', 'awards', 'projects', 'certifications',
      'resumeOriginalName', 'resumeType', 'resumeSize', 'parserStatus',
      'parserError', 'retryCount', 'source', 'isRegistered', 'isVisible',
      'emailStatus', 'emailSentAt', 'rawText', 'totalExperience', 'currentCompany',
    ];
    for (const col of removable) {
      await queryInterface.removeColumn('talent_candidates', col);
    }
  },
};
