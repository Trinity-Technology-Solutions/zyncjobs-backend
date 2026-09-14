'use strict';

/**
 * MASTER SCHEMA SYNC MIGRATION
 * ─────────────────────────────
 * Reads every table's current columns from the DB and adds any that are
 * missing according to the model definitions below.
 *
 * Safe to run multiple times — each column is guarded by describeTable check.
 * When you add a new column to a model:
 *   1. Add it to the matching TABLE_SCHEMAS entry below
 *   2. Commit + push
 *   3. Run: NODE_ENV=production npx sequelize-cli db:migrate
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const S = Sequelize;

    const TABLE_SCHEMAS = {

      // ── users ──────────────────────────────────────────────────────────
      users: {
        employerId:                 { type: S.STRING,    allowNull: true },
        company:                    { type: S.STRING,    allowNull: true },
        companyName:                { type: S.STRING,    allowNull: true },
        companyLogo:                { type: S.STRING,    allowNull: true },
        companyWebsite:             { type: S.STRING,    allowNull: true },
        phone:                      { type: S.STRING,    allowNull: true },
        location:                   { type: S.STRING,    allowNull: true },
        title:                      { type: S.STRING,    allowNull: true },
        position:                   { type: S.STRING,    allowNull: true },
        bio:                        { type: S.TEXT,      allowNull: true },
        headline:                   { type: S.STRING,    allowNull: true },
        experience:                 { type: S.INTEGER,   allowNull: true },
        education:                  { type: S.TEXT,      allowNull: true },
        profilePicture:             { type: S.STRING,    allowNull: true },
        resumeUrl:                  { type: S.STRING,    allowNull: true },
        linkedinUrl:                { type: S.STRING,    allowNull: true },
        githubUrl:                  { type: S.STRING,    allowNull: true },
        portfolioUrl:               { type: S.STRING,    allowNull: true },
        googleId:                   { type: S.STRING,    allowNull: true },
        linkedinId:                 { type: S.STRING,    allowNull: true },
        googleMeetAccessToken:      { type: S.TEXT,      allowNull: true },
        googleMeetRefreshToken:     { type: S.TEXT,      allowNull: true },
        emailVerified:              { type: S.BOOLEAN,   defaultValue: false },
        lastLogin:                  { type: S.DATE,      allowNull: true },
        companyProfile:             { type: S.JSONB,     allowNull: true },
        domainVerificationMethod:   { type: S.STRING,    allowNull: true },
        verificationRequestedAt:    { type: S.DATE,      allowNull: true },
        verifiedAt:                 { type: S.DATE,      allowNull: true },
        verifiedBy:                 { type: S.STRING,    allowNull: true },
        verificationNote:           { type: S.TEXT,      allowNull: true },
        gstNumber:                  { type: S.STRING,    allowNull: true },
        gstVerification:            { type: S.JSONB,     allowNull: true },
        inviteToken:                { type: S.STRING,    allowNull: true },
        inviteTokenExpiry:          { type: S.DATE,      allowNull: true },
        isFirstLogin:               { type: S.BOOLEAN,   defaultValue: false },
        companyDomain:              { type: S.STRING,    allowNull: true },
        lastPasswordChange:         { type: S.DATE,      allowNull: true },
        passwordExpiryDays:         { type: S.INTEGER,   defaultValue: 0 },
        mustChangePassword:         { type: S.BOOLEAN,   defaultValue: false },
        passwordHistory:            { type: S.JSONB,     defaultValue: [] },
        failedLoginAttempts:        { type: S.INTEGER,   defaultValue: 0 },
        accountLockedUntil:         { type: S.DATE,      allowNull: true },
        lastFailedLogin:            { type: S.DATE,      allowNull: true },
        lastSuccessfulLogin:        { type: S.DATE,      allowNull: true },
      },

      // ── applications ───────────────────────────────────────────────────
      applications: {
        candidate_id:               { type: S.UUID,      allowNull: true },
        employerId:                 { type: S.UUID,      allowNull: true },
        candidateName:              { type: S.STRING,    allowNull: true },
        employerEmail:              { type: S.STRING,    allowNull: true },
        coverLetter:                { type: S.TEXT,      allowNull: true },
        resumeUrl:                  { type: S.STRING,    allowNull: true },
        aiScore:                    { type: S.INTEGER,   allowNull: true },
        aiAnalysis:                 { type: S.JSONB,     allowNull: true },
        aiSuggestion:               { type: S.STRING(20),allowNull: true },
        employerConfirmedRejection: { type: S.BOOLEAN,   defaultValue: false },
        candidatePhone:             { type: S.STRING,    allowNull: true },
        isQuickApply:               { type: S.BOOLEAN,   defaultValue: false },
        withdrawnAt:                { type: S.DATE,      allowNull: true },
        withdrawalReason:           { type: S.STRING,    allowNull: true },
        timeline:                   { type: S.JSONB,     allowNull: true },
        skills:                     { type: S.JSONB,     defaultValue: [] },
        resumeSkills:               { type: S.JSONB,     defaultValue: [] },
      },

      // ── jobs ───────────────────────────────────────────────────────────
      jobs: {
        title:                      { type: S.STRING,    allowNull: true },
        companyLogo:                { type: S.STRING,    allowNull: true },
        jobHeaderImage:             { type: S.STRING,    allowNull: true },
        requirements:               { type: S.TEXT,      allowNull: true },
        responsibilities:           { type: S.TEXT,      allowNull: true },
        salaryMin:                  { type: S.INTEGER,   allowNull: true },
        salaryMax:                  { type: S.INTEGER,   allowNull: true },
        currency:                   { type: S.STRING,    defaultValue: 'USD' },
        payRate:                    { type: S.STRING,    allowNull: true },
        payType:                    { type: S.STRING,    allowNull: true },
        jobCategory:                { type: S.STRING,    allowNull: true },
        experienceRange:            { type: S.STRING,    allowNull: true },
        country:                    { type: S.STRING,    allowNull: true },
        latitude:                   { type: S.FLOAT,     allowNull: true },
        longitude:                  { type: S.FLOAT,     allowNull: true },
        postedBy:                   { type: S.STRING,    allowNull: true },
        postedByEmail:              { type: S.STRING,    allowNull: true },
        postedByName:               { type: S.STRING,    allowNull: true },
        assignedTo:                 { type: S.STRING,    allowNull: true },
        companyId:                  { type: S.UUID,      allowNull: true },
        applicationDeadline:        { type: S.DATE,      allowNull: true },
        slug:                       { type: S.STRING,    allowNull: true },
        views:                      { type: S.INTEGER,   defaultValue: 0 },
        applicationsCount:          { type: S.INTEGER,   defaultValue: 0 },
        refreshCount:               { type: S.INTEGER,   defaultValue: 0 },
        lastRefreshedAt:            { type: S.DATE,      allowNull: true },
        originalPostedAt:           { type: S.DATE,      allowNull: true },
      },

      // ── profiles ───────────────────────────────────────────────────────
      profiles: {
        userId:                     { type: S.UUID,      allowNull: true },
        phone:                      { type: S.STRING,    allowNull: true },
        title:                      { type: S.STRING,    allowNull: true },
        jobTitle:                   { type: S.STRING,    allowNull: true },
        yearsExperience:            { type: S.STRING,    allowNull: true },
        experience:                 { type: S.TEXT,      allowNull: true },
        education:                  { type: S.TEXT,      allowNull: true },
        certifications:             { type: S.TEXT,      allowNull: true },
        workAuthorization:          { type: S.STRING,    allowNull: true },
        securityClearance:          { type: S.STRING,    allowNull: true },
        employmentType:             { type: S.STRING,    allowNull: true },
        resume:                     { type: S.JSONB,     allowNull: true },
        resumeUrl:                  { type: S.STRING,    allowNull: true },
        profilePhoto:               { type: S.STRING,    allowNull: true },
        profileFrame:               { type: S.STRING,    allowNull: true },
        coverPhoto:                 { type: S.STRING,    allowNull: true },
        bannerPhoto:                { type: S.STRING,    allowNull: true },
        profileSummary:             { type: S.TEXT,      allowNull: true },
        employment:                 { type: S.TEXT,      allowNull: true },
        projects:                   { type: S.TEXT,      allowNull: true },
        internships:                { type: S.TEXT,      allowNull: true },
        languages:                  { type: S.TEXT,      allowNull: true },
        awards:                     { type: S.TEXT,      allowNull: true },
        clubsCommittees:            { type: S.TEXT,      allowNull: true },
        competitiveExams:           { type: S.TEXT,      allowNull: true },
        academicAchievements:       { type: S.TEXT,      allowNull: true },
        companyName:                { type: S.STRING,    allowNull: true },
        roleTitle:                  { type: S.STRING,    allowNull: true },
        salary:                     { type: S.STRING,    allowNull: true },
        jobType:                    { type: S.STRING,    allowNull: true },
        birthday:                   { type: S.DATE,      allowNull: true },
        gender:                     { type: S.STRING,    allowNull: true },
        college:                    { type: S.STRING,    allowNull: true },
        degree:                     { type: S.STRING,    allowNull: true },
        careerPreferences:          { type: S.TEXT,      allowNull: true },
        educationCollege:           { type: S.TEXT,      allowNull: true },
        educationClass12:           { type: S.TEXT,      allowNull: true },
        educationClass10:           { type: S.TEXT,      allowNull: true },
        openToWork:                 { type: S.BOOLEAN,   defaultValue: false },
      },

      // ── talent_candidates ──────────────────────────────────────────────
      talent_candidates: {
        candidate_id:               { type: S.STRING(20),allowNull: true },
        name:                       { type: S.STRING,    defaultValue: '' },
        email:                      { type: S.STRING,    defaultValue: '' },
        phone:                      { type: S.STRING,    defaultValue: '' },
        gender:                     { type: S.STRING,    defaultValue: '' },
        dob:                        { type: S.STRING,    defaultValue: '' },
        skills:                     { type: S.TEXT,      defaultValue: '' },
        experience:                 { type: S.STRING,    defaultValue: '' },
        totalExperience:            { type: S.FLOAT,     allowNull: true },
        jobTitle:                   { type: S.STRING,    defaultValue: '' },
        currentCompany:             { type: S.STRING,    defaultValue: '' },
        summary:                    { type: S.TEXT,      defaultValue: '' },
        location:                   { type: S.STRING,    defaultValue: '' },
        country:                    { type: S.STRING,    defaultValue: '' },
        tools:                      { type: S.TEXT,      defaultValue: '' },
        softSkills:                 { type: S.TEXT,      defaultValue: '' },
        workExperiences:            { type: S.TEXT,      defaultValue: '[]' },
        internships:                { type: S.TEXT,      defaultValue: '[]' },
        languages:                  { type: S.TEXT,      defaultValue: '' },
        awards:                     { type: S.TEXT,      defaultValue: '[]' },
        educations:                 { type: S.TEXT,      defaultValue: '[]' },
        projects:                   { type: S.TEXT,      defaultValue: '[]' },
        certifications:             { type: S.TEXT,      defaultValue: '[]' },
        resumePath:                 { type: S.STRING,    allowNull: true },
        resumeFile:                 { type: S.STRING,    allowNull: true },
        resumeOriginalName:         { type: S.STRING,    defaultValue: '' },
        resumeType:                 { type: S.STRING,    defaultValue: '' },
        resumeSize:                 { type: S.BIGINT,    defaultValue: 0 },
        status:                     { type: S.STRING,    defaultValue: 'Parsed' },
        parserStatus:               { type: S.STRING,    defaultValue: 'Pending' },
        parserError:                { type: S.TEXT,      defaultValue: '' },
        retryCount:                 { type: S.INTEGER,   defaultValue: 0 },
        source:                     { type: S.STRING,    defaultValue: 'uploaded_resume' },
        isRegistered:               { type: S.BOOLEAN,   defaultValue: false },
        isVisible:                  { type: S.BOOLEAN,   defaultValue: false },
        emailStatus:                { type: S.STRING,    defaultValue: 'Not Sent' },
        emailSentAt:                { type: S.DATE,      allowNull: true },
        addedDate:                  { type: S.DATE,      allowNull: true },
        rawText:                    { type: S.TEXT,      defaultValue: '' },
      },

      // ── interviews ─────────────────────────────────────────────────────
      interviews: {
        jobId:                      { type: S.UUID,      allowNull: true },
        candidateId:                { type: S.UUID,      allowNull: true },
        employerId:                 { type: S.UUID,      allowNull: true },
        applicationId:              { type: S.UUID,      allowNull: true },
        candidateName:              { type: S.STRING,    allowNull: true },
        employerEmail:              { type: S.STRING,    allowNull: true },
        duration:                   { type: S.INTEGER,   defaultValue: 60 },
        meetingLink:                { type: S.STRING,    allowNull: true },
        location:                   { type: S.STRING,    allowNull: true },
        notes:                      { type: S.TEXT,      allowNull: true },
        candidateConfirmed:         { type: S.BOOLEAN,   defaultValue: false },
        employerConfirmed:          { type: S.BOOLEAN,   defaultValue: false },
        feedback:                   { type: S.JSONB,     allowNull: true },
        interviewer:                { type: S.STRING,    allowNull: true },
        responseToken:              { type: S.STRING,    allowNull: true },
        tokenExpiry:                { type: S.DATE,      allowNull: true },
        responseAt:                 { type: S.DATE,      allowNull: true },
        acceptedAt:                 { type: S.DATE,      allowNull: true },
        rejectedAt:                 { type: S.DATE,      allowNull: true },
        candidateResponded:         { type: S.BOOLEAN,   defaultValue: false },
      },

      // ── resumes ────────────────────────────────────────────────────────
      resumes: {
        userId:                     { type: S.UUID,      allowNull: true },
        email:                      { type: S.STRING,    allowNull: true },
        fileName:                   { type: S.STRING,    allowNull: true },
        fileUrl:                    { type: S.STRING,    allowNull: true },
        fileSize:                   { type: S.INTEGER,   allowNull: true },
        parsedData:                 { type: S.JSONB,     allowNull: true },
        moderationNotes:            { type: S.TEXT,      allowNull: true },
        isActive:                   { type: S.BOOLEAN,   defaultValue: true },
      },

      // ── companies ──────────────────────────────────────────────────────
      companies: {
        domain:                     { type: S.STRING,    allowNull: true },
        logo:                       { type: S.STRING,    allowNull: true },
        description:                { type: S.TEXT,      allowNull: true },
        industry:                   { type: S.STRING,    allowNull: true },
        size:                       { type: S.STRING,    allowNull: true },
        website:                    { type: S.STRING,    allowNull: true },
        location:                   { type: S.STRING,    allowNull: true },
        tagline:                    { type: S.STRING,    allowNull: true },
        foundedYear:                { type: S.STRING,    allowNull: true },
        companyType:                { type: S.STRING,    defaultValue: 'Private' },
        companySize:                { type: S.STRING,    allowNull: true },
        headquarters:               { type: S.STRING,    allowNull: true },
        companyWebsite:             { type: S.STRING,    allowNull: true },
        benefits:                   { type: S.JSONB,     defaultValue: [] },
        socialLinks:                { type: S.JSONB,     defaultValue: {} },
        additionalLocations:        { type: S.JSONB,     defaultValue: [] },
        cinNumber:                  { type: S.STRING,    allowNull: true },
        companyEmail:               { type: S.STRING,    allowNull: true },
        phoneNumber:                { type: S.STRING,    allowNull: true },
        companyPhotos:              { type: S.JSONB,     defaultValue: [] },
        followers:                  { type: S.JSONB,     defaultValue: [] },
        verified:                   { type: S.BOOLEAN,   defaultValue: false },
        gstNumber:                  { type: S.STRING,    allowNull: true },
        registrationNumber:         { type: S.STRING,    allowNull: true },
        createdBy:                  { type: S.STRING,    allowNull: true },
        verificationDocuments:      { type: S.JSONB,     defaultValue: [] },
        verifiedBy:                 { type: S.STRING,    allowNull: true },
        verifiedAt:                 { type: S.DATE,      allowNull: true },
        profileCompleted:           { type: S.BOOLEAN,   defaultValue: false },
      },

      // ── team_members ───────────────────────────────────────────────────
      team_members: {
        memberName:                 { type: S.STRING,    defaultValue: '' },
        position:                   { type: S.STRING,    defaultValue: 'Recruiter' },
        inviteToken:                { type: S.STRING,    allowNull: true },
        companyName:                { type: S.STRING,    allowNull: true },
      },

      // ── saved_candidates ───────────────────────────────────────────────
      saved_candidates: {
        candidateName:              { type: S.STRING,    allowNull: true },
        candidateTitle:             { type: S.STRING,    allowNull: true },
        candidateLocation:          { type: S.STRING,    allowNull: true },
        candidatePhone:             { type: S.STRING,    allowNull: true },
        candidateHeadline:          { type: S.STRING,    allowNull: true },
        candidateBio:               { type: S.TEXT,      allowNull: true },
        candidateExperience:        { type: S.INTEGER,   allowNull: true },
        candidateEducation:         { type: S.TEXT,      allowNull: true },
        candidateProfilePicture:    { type: S.STRING,    allowNull: true },
        candidateResumeUrl:         { type: S.STRING,    allowNull: true },
        candidateLinkedinUrl:       { type: S.STRING,    allowNull: true },
        candidateGithubUrl:         { type: S.STRING,    allowNull: true },
        candidatePortfolioUrl:      { type: S.STRING,    allowNull: true },
        companyName:                { type: S.STRING,    allowNull: true },
        companyLogo:                { type: S.STRING,    allowNull: true },
        appliedJobTitle:            { type: S.STRING,    allowNull: true },
        appliedJobId:               { type: S.UUID,      allowNull: true },
        notes:                      { type: S.TEXT,      allowNull: true },
        savedAt:                    { type: S.DATE,      allowNull: true },
      },

      // ── notifications ──────────────────────────────────────────────────
      notifications: {
        link:                       { type: S.STRING,    allowNull: true },
        read:                       { type: S.BOOLEAN,   defaultValue: false },
      },

      // ── messages ───────────────────────────────────────────────────────
      messages: {
        read:                       { type: S.BOOLEAN,   defaultValue: false },
      },

      // ── candidate_skills ───────────────────────────────────────────────
      candidate_skills: {
        candidateId:                { type: S.STRING,    allowNull: false },
        skillId:                    { type: S.INTEGER,   allowNull: false },
      },

      // ── skills ─────────────────────────────────────────────────────────
      skills: {
        normalizedName:             { type: S.STRING,    allowNull: true },
      },
    };

    let added = 0;
    for (const [table, columns] of Object.entries(TABLE_SCHEMAS)) {
      let desc;
      try {
        desc = await queryInterface.describeTable(table);
      } catch {
        console.log(`[SCHEMA SYNC] Table "${table}" does not exist yet — skipping`);
        continue;
      }
      for (const [col, definition] of Object.entries(columns)) {
        if (!desc[col]) {
          console.log(`[SCHEMA SYNC] ${table}.${col} — ADDING`);
          await queryInterface.addColumn(table, col, definition);
          added++;
        }
      }
    }
    console.log(`[SCHEMA SYNC] Done — ${added} column(s) added`);
  },

  async down() {
    // Intentionally empty — this migration only adds columns, never removes
    // Removing columns risks data loss; handle rollbacks manually if needed
  },
};
