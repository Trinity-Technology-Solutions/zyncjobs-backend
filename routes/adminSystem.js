import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import os from 'os';
import fs from 'fs';

const router = express.Router();

// System health metrics
let systemMetrics = {
  uptime: 0,
  cpuUsage: 0,
  memoryUsage: 0,
  diskUsage: 0,
  responseTime: 0,
  errorRate: 0,
  activeConnections: 0
};

// Alert system
let systemAlerts = [];

// Support tickets
let supportTickets = [];

// GET /api/admin/system/health - System health monitoring
router.get('/health', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const cpuUsage = os.loadavg()[0];
    
    systemMetrics = {
      uptime: Math.floor(uptime),
      cpuUsage: Math.round(cpuUsage * 100),
      memoryUsage: Math.round((memUsage.used / memUsage.total) * 100),
      diskUsage: 78, // Mock data
      responseTime: Math.random() * 2 + 0.5,
      errorRate: Math.random() * 0.5,
      activeConnections: Math.floor(Math.random() * 100) + 50
    };

    res.json({
      status: 'healthy',
      metrics: systemMetrics,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/system/alerts - Get system alerts
router.get('/alerts', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    // Generate mock alerts
    if (systemAlerts.length === 0) {
      systemAlerts = [
        { id: 1, type: 'warning', message: 'High CPU usage detected', timestamp: new Date(), resolved: false },
        { id: 2, type: 'info', message: 'Daily backup completed', timestamp: new Date(), resolved: true },
        { id: 3, type: 'error', message: 'Failed login attempts increased', timestamp: new Date(), resolved: false }
      ];
    }

    res.json({ alerts: systemAlerts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/system/alerts/:id/resolve - Resolve alert
router.post('/alerts/:id/resolve', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const alert = systemAlerts.find(a => a.id === parseInt(req.params.id));
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
    }
    res.json({ message: 'Alert resolved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/support/tickets - Get support tickets
router.get('/support/tickets', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    if (supportTickets.length === 0) {
      supportTickets = [
        { id: 1, subject: 'Cannot upload resume', user: 'john@example.com', status: 'open', priority: 'high', createdAt: new Date() },
        { id: 2, subject: 'Job posting not approved', user: 'company@test.com', status: 'in-progress', priority: 'medium', createdAt: new Date() },
        { id: 3, subject: 'Profile visibility issue', user: 'user@test.com', status: 'resolved', priority: 'low', createdAt: new Date() }
      ];
    }

    res.json({ tickets: supportTickets });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/support/tickets/:id - Update ticket status
router.put('/support/tickets/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { status, response } = req.body;
    const ticket = supportTickets.find(t => t.id === parseInt(req.params.id));
    
    if (ticket) {
      ticket.status = status;
      ticket.adminResponse = response;
      ticket.updatedAt = new Date();
    }

    res.json({ message: 'Ticket updated', ticket });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/system/backup - Trigger backup
router.post('/backup', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    // Mock backup process
    const backupId = Date.now();
    
    setTimeout(() => {
      systemAlerts.push({
        id: systemAlerts.length + 1,
        type: 'success',
        message: `Backup ${backupId} completed successfully`,
        timestamp: new Date(),
        resolved: true
      });
    }, 2000);

    res.json({ 
      message: 'Backup initiated', 
      backupId,
      estimatedTime: '2 minutes'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/system/performance - Performance metrics
router.get('/performance', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const metrics = {
      responseTime: Array.from({length: 24}, () => Math.random() * 2 + 0.5),
      throughput: Array.from({length: 24}, () => Math.floor(Math.random() * 1000) + 500),
      errorRate: Array.from({length: 24}, () => Math.random() * 0.5),
      activeUsers: Array.from({length: 24}, () => Math.floor(Math.random() * 200) + 100)
    };

    res.json({ metrics, timestamp: new Date() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;