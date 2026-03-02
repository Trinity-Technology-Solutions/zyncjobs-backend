import express from 'express';
import { Op } from 'sequelize';
import Message from '../models/Message.js';

const router = express.Router();

// Get conversations for user
router.get('/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get all messages for this user
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      order: [['createdAt', 'DESC']]
    });
    
    // Group by conversationId and get latest message
    const conversationsMap = new Map();
    
    for (const message of messages) {
      if (!conversationsMap.has(message.conversationId)) {
        // Count unread messages
        const unreadCount = await Message.count({
          where: {
            conversationId: message.conversationId,
            receiverId: userId,
            read: false
          }
        });
        
        conversationsMap.set(message.conversationId, {
          _id: message.conversationId,
          lastMessage: message,
          unreadCount
        });
      }
    }
    
    res.json(Array.from(conversationsMap.values()));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages in conversation
router.get('/:conversationId', async (req, res) => {
  try {
    const messages = await Message.findAll({ 
      where: { conversationId: req.params.conversationId },
      order: [['createdAt', 'ASC']]
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message
router.post('/', async (req, res) => {
  try {
    const { senderId, receiverId, message } = req.body;
    const conversationId = [senderId, receiverId].sort().join('_');
    
    const newMessage = await Message.create({
      conversationId,
      senderId,
      receiverId,
      message
    });
    
    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark messages as read
router.put('/:conversationId/read/:userId', async (req, res) => {
  try {
    await Message.update(
      { read: true },
      { 
        where: { 
          conversationId: req.params.conversationId, 
          receiverId: req.params.userId, 
          read: false 
        }
      }
    );
    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
