import express from 'express';
import { Op } from 'sequelize';
import Message from '../models/Message.js';
import User from '../models/User.js';

const router = express.Router();

// Socket.IO instance (set by server.js via setIo)
let _io = null;
export function setIo(io) { _io = io; }

// Get all messages for a candidate (supports candidateId query parameter)
router.get('/', async (req, res) => {
  try {
    const { candidateId } = req.query;
    
    if (!candidateId) {
      return res.status(400).json({ error: 'candidateId query parameter is required' });
    }
    
    // Get all messages for this candidate with user details
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: candidateId },
          { receiverId: candidateId }
        ]
      },
      order: [['createdAt', 'DESC']],
      raw: false,
      subQuery: false
    });

    // Enrich messages with sender and receiver details
    const enrichedMessages = await Promise.all(
      messages.map(async (msg) => {
        const sender = await User.findByPk(msg.senderId, {
          attributes: ['name', 'company', 'companyName', 'companyLogo', 'profilePicture', 'email']
        });
        const receiver = await User.findByPk(msg.receiverId, {
          attributes: ['name', 'company', 'companyName', 'companyLogo', 'profilePicture', 'email']
        });

        return {
          ...msg.toJSON(),
          senderName: sender?.name || msg.senderId,
          senderEmail: sender?.email,
          companyName: sender?.companyName || sender?.company,
          companyLogo: sender?.companyLogo,
          receiverName: receiver?.name || msg.receiverId,
          receiverEmail: receiver?.email
        };
      })
    );

    res.json(enrichedMessages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

    const enriched = await Promise.all(
      messages.map(async (msg) => {
        const sender = await User.findByPk(msg.senderId, {
          attributes: ['name', 'email', 'companyName', 'company', 'companyLogo', 'profilePicture']
        });
        const receiver = await User.findByPk(msg.receiverId, {
          attributes: ['name', 'email']
        });
        return {
          ...msg.toJSON(),
          senderName: sender?.name || msg.senderId,
          senderEmail: sender?.email,
          receiverName: receiver?.name || msg.receiverId,
          receiverEmail: receiver?.email,
        };
      })
    );

    res.json(enriched);
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

// ── Shared: mark messages read + emit socket event ────────────────────────────

async function markConversationRead(conversationId, userId) {
  const [updated] = await Message.update(
    { read: true },
    {
      where: {
        conversationId,
        receiverId: userId,
        read: false
      }
    }
  );
  // Emit socket event so both parties see the update in real time
  if (_io && updated > 0) {
    _io.emit('conversation_read', {
      conversationId,
      userId,
      readBy: userId,
      updatedCount: updated,
      timestamp: new Date().toISOString()
    });
  }
  return updated;
}

// PUT /api/messages/read — body-based (used by frontend)
router.put('/read', async (req, res) => {
  try {
    const { conversationId, userId } = req.body;
    if (!conversationId || !userId) {
      return res.status(400).json({ error: 'conversationId and userId are required' });
    }
    const updated = await markConversationRead(conversationId, userId);
    res.json({ success: true, updated, conversationId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/messages/:conversationId/read/:userId — path-based (legacy)
router.put('/:conversationId/read/:userId', async (req, res) => {
  try {
    const updated = await markConversationRead(req.params.conversationId, req.params.userId);
    res.json({ success: true, updated, conversationId: req.params.conversationId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a message (only sender can delete)
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId query parameter is required' });
    }

    const message = await Message.findByPk(id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Only allow the sender to delete their own messages
    if (message.senderId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    await message.destroy();
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
