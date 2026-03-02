import express from 'express';
import Notification from '../models/Notification.js';

const router = express.Router();

// Get user notifications
router.get('/:userId', async (req, res) => {
  try {
    const notifications = await Notification.findAll({ 
      where: { userId: req.params.userId },
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark as read
router.put('/:id/read', async (req, res) => {
  try {
    await Notification.update({ read: true }, { where: { id: req.params.id } });
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all as read
router.put('/user/:userId/read-all', async (req, res) => {
  try {
    await Notification.update({ read: true }, { where: { userId: req.params.userId, read: false } });
    res.json({ message: 'All marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete notification
router.delete('/:id', async (req, res) => {
  try {
    await Notification.destroy({ where: { id: req.params.id } });
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
