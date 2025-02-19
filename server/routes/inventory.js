const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/auth.js');

const router = express.Router();
const prisma = new PrismaClient();

// Get all inventory items with filtering and pagination
router.get('/', [
  query('search').optional().trim(),
  query('category').optional().trim(),
  query('status').optional().isIn(['AVAILABLE', 'ISSUED']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { search, category, status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * Number(limit);

    const where = {
      AND: [
        search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
            { location: { contains: search, mode: 'insensitive' } }
          ]
        } : {},
        category ? { category } : {},
        status ? { status } : {}
      ]
    };

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { lastUpdated: 'desc' }
      }),
      prisma.inventoryItem.count({ where })
    ]);

    res.json({
      items,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// Create new item (ADMIN only)
router.post('/', [
  requireRole('ADMIN'),
  body('name').notEmpty().trim(),
  body('category').notEmpty().trim(),
  body('quantity').isInt({ min: 0 }),
  body('location').notEmpty().trim(),
  body('status').isIn(['AVAILABLE', 'ISSUED'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const item = await prisma.inventoryItem.create({
      data: {
        ...req.body,
        lastUpdated: new Date()
      }
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

// Update item (ADMIN only)
router.put('/:id', [
  requireRole('ADMIN'),
  body('name').optional().trim(),
  body('category').optional().trim(),
  body('quantity').optional().isInt({ min: 0 }),
  body('location').optional().trim(),
  body('status').optional().isIn(['AVAILABLE', 'ISSUED'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const existingItem = await prisma.inventoryItem.findUnique({
      where: { id }
    });

    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        ...req.body,
        lastUpdated: new Date()
      }
    });

    res.json(item);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// Delete item (ADMIN only)
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    const existingItem = await prisma.inventoryItem.findUnique({
      where: { id }
    });

    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await prisma.inventoryItem.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// Export inventory data
router.get('/export', requireRole('ADMIN'), async (req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { lastUpdated: 'desc' }
    });

    const csv = [
      'ID,Name,Category,Quantity,Location,Status,Last Updated',
      ...items.map(item => 
        `${item.id},${item.name},${item.category},${item.quantity},${item.location},${item.status},${item.lastUpdated}`
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting inventory data:', error);
    res.status(500).json({ error: 'Failed to export inventory data' });
  }
});

module.exports = router;