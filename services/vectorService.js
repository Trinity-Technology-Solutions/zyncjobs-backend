class VectorService {
  constructor() {
    this.enabled = false; // Disabled - optional feature
  }



  async upsertJobEmbedding(jobId, jobData) {
    return; // Disabled
  }

  async upsertResumeEmbedding(userId, resumeData) {
    return; // Disabled
  }

  async findSimilarJobs(resumeText, topK = 10) {
    return []; // Disabled
  }

  async findSimilarCandidates(jobText, topK = 10) {
    return []; // Disabled
  }
}

export default new VectorService();