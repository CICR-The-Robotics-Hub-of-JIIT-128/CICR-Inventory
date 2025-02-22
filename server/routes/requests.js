const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();
const prisma = new PrismaClient();

// Create a new equipment request
router.post('/', [
  auth,
  body('itemId').notEmpty().isString(),
  body('quantity').isInt({ min: 1 }),
  body('purpose').notEmpty().isString(),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, quantity, purpose, notes } = req.body;
    const userId = req.user.id.toString();

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if item exists and has enough quantity
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient quantity available' });
    }

    // Create request
    const request = await prisma.equipmentRequest.create({
      data: {
        itemId,
        userId,
        quantity: parseInt(quantity),
        purpose,
        notes: notes || null,
        status: 'PENDING'
      },
      include: {
        item: true,
        user: {
          select: {
            id: true,
            username: true,
            role: true
          }
        }
      }
    });

    res.status(201).json({
      status: 'success',
      data: request
    });
  } catch (error) {
    console.error('Create request error:', error);
    res.status(500).json({ 
      error: 'Failed to create request',
      details: error.message
    });
  }
});

// Get all requests (Admin/Manager only)
router.get('/all', [auth, requireRole(['ADMIN', 'MANAGER'])], async (req, res) => {
  try {
    const requests = await prisma.equipmentRequest.findMany({
      include: {
        item: true,
        user: {
          select: {
            id: true,
            username: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(requests);
  } catch (error) {
    console.error('Get all requests error:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Get user's requests
router.get('/my-requests', auth, async (req, res) => {
  try {
    const requests = await prisma.equipmentRequest.findMany({
      where: {
        userId: req.user.id
      },
      include: {
        item: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(requests);
  } catch (error) {
    console.error('Get user requests error:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Update request status (Admin/Manager only)
router.put('/:id/status', [
  auth,
  requireRole(['ADMIN', 'MANAGER']),
  body('status').isIn(['APPROVED', 'DENIED', 'COMPLETED', 'CANCELLED'])
], async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const request = await prisma.equipmentRequest.update({
      where: { id },
      data: { status },
      include: {
        item: true,
        user: {
          select: {
            id: true,
            username: true,
            role: true
          }
        }
      }
    });

    res.json(request);
  } catch (error) {
    console.error('Update request status error:', error);
    res.status(500).json({ error: 'Failed to update request status' });
  }
});

// Create new request
// Remove the duplicate POST route and combine the validation and logic
router.post('/', [
  auth,
  body('itemId').notEmpty().isString(),
  body('quantity').isInt({ min: 1 }),
  body('purpose').notEmpty().trim(),
  body('notes').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId, quantity, purpose, notes } = req.body;
    const userId = req.user.id;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if item exists and has enough quantity
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient quantity available' });
    }

    // Create the request
    const request = await prisma.equipmentRequest.create({
      data: {
        itemId,
        userId,
        quantity: parseInt(quantity),
        purpose,
        notes: notes || null,
        status: 'PENDING'
      },
      include: {
        item: true,
        user: {
          select: {
            id: true,
            username: true,
            role: true
          }
        }
      }
    });

    res.status(201).json({
      status: 'success',
      data: request
    });
  } catch (error) {
    console.error('Create request error:', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// Get user's request history
router.get('/user/:userId', async (req, res) => {
  try {
    const requests = await prisma.equipmentRequest.findMany({
      where: { userId: req.params.userId },
      include: {
        item: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      status: 'success',
      data: requests
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

module.exports = router;