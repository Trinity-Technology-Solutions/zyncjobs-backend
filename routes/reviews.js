import express from 'express';
import Review from '../models/Review.js';
import Job from '../models/Job.js';
import { Op } from 'sequelize';

const router = express.Router();

// POST /api/reviews - Submit a review (requires company to have posted jobs)
router.post('/', async (req, res) => {
  try {
    const { companyName, rating, title, review, reviewerName, reviewerEmail, reviewerRole } = req.body;
    const companyId = req.body.companyId || companyName;

    if (!companyName || !rating || !review) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if company has posted any jobs
    const jobCount = await Job.count({
      where: {
        company: { [Op.iLike]: `%${companyName}%` }
      }
    });

    if (jobCount === 0) {
      return res.status(403).json({ error: 'Company must post jobs before accepting reviews' });
    }

    // Create review
    const newReview = await Review.create({
      companyId,
      companyName,
      rating,
      title,
      review,
      reviewerName,
      reviewerEmail,
      reviewerRole
    });

    res.status(201).json(newReview);
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reviews - Get all reviews
router.get('/', async (req, res) => {
  try {
    const { companyId, companyName, page = 1, limit = 10 } = req.query;
    const where = {};

    if (companyId) where.companyId = companyId;
    if (companyName) where.companyName = { [Op.iLike]: `%${companyName}%` };

    const { count, rows } = await Review.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({
      reviews: rows,
      total: count,
      pages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reviews/:companyId - Get reviews for a company
router.get('/:companyId', async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { companyId: req.params.companyId },
      order: [['createdAt', 'DESC']]
    });

    res.json(reviews);
  } catch (error) {
    console.error('Error fetching company reviews:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/reviews/:id - Delete a review (owner only)
router.delete('/:id', async (req, res) => {
  try {
    const { reviewerEmail } = req.body;
    const review = await Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (reviewerEmail && review.reviewerEmail !== reviewerEmail) {
      return res.status(403).json({ error: 'Not authorized to delete this review' });
    }
    await review.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
