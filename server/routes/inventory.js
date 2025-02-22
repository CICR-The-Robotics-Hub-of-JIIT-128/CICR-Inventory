const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/auth.js');
const { validate } = require('../middleware/validation.js');

const router = express.Router();
const prisma = new PrismaClient();

// Get inventory statistics
router.get('/stats', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const stats = await prisma.$transaction([
      prisma.inventoryItem.count(),
      prisma.inventoryItem.count({ where: { status: 'OUT_OF_STOCK' } }),
      prisma.inventoryItem.aggregate({
        _sum: { price: true },
        where: { status: 'AVAILABLE' }
      }),
      prisma.inventoryItem.findMany({
        where: { quantity: { lte: prisma.inventoryItem.minimumStock } }
      })
    ]);

    res.json({
      status: 'success',
      data: {
        totalItems: stats[0],
        outOfStock: stats[1],
        totalValue: stats[2]._sum.price || 0,
        lowStock: stats[3]
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to fetch inventory statistics'
    });
  }
});

// Add audit log
const logAuditTrail = async (userId, itemId, action, details) => {
  await prisma.auditLog.create({
    data: {
      userId,
      itemId,
      action,
      details
    }
  });
};

// Enhanced create item endpoint
router.post('/', [
  requireRole(['ADMIN', 'MANAGER']),
  body('name').notEmpty().trim(),
  body('category').notEmpty().trim(),
  body('quantity').isInt({ min: 0 }),
  body('location').notEmpty().trim(),
  body('status').isIn(['AVAILABLE', 'ISSUED', 'IN_MAINTENANCE', 'OUT_OF_STOCK', 'DISCONTINUED']),
  // Make these fields truly optional
  body('description').optional({ nullable: true }).trim(),
  body('serialNumber').optional({ nullable: true }).trim(),
  body('manufacturer').optional({ nullable: true }).trim(),
  body('purchaseDate').optional({ nullable: true }),
  body('warrantyExpiry').optional({ nullable: true }),
  body('minimumStock').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
  body('price').optional({ nullable: true })
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      const floatValue = parseFloat(value);
      if (isNaN(floatValue) || floatValue < 0) {
        throw new Error('Price must be a positive number or empty');
      }
      return true;
    }),
  validate
], async (req, res) => {
  try {
    const userId = req.user.id;
    
    const item = await prisma.inventoryItem.create({
      data: {
        name: req.body.name,
        category: req.body.category,
        quantity: parseInt(req.body.quantity),
        location: req.body.location,
        status: req.body.status,
        description: req.body.description || null,
        serialNumber: req.body.serialNumber || null,
        manufacturer: req.body.manufacturer || null,
        // Handle empty date strings
        purchaseDate: req.body.purchaseDate && req.body.purchaseDate !== '' ? new Date(req.body.purchaseDate) : null,
        warrantyExpiry: req.body.warrantyExpiry && req.body.warrantyExpiry !== '' ? new Date(req.body.warrantyExpiry) : null,
        minimumStock: req.body.minimumStock || 0,
        price: req.body.price ? parseFloat(req.body.price) : null,
      }
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        userId: userId,
        itemId: item.id,
        action: 'CREATE',
        details: `Created item: ${item.name}`
      }
    });

    res.status(201).json({
      status: 'success',
      data: item
    });
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create inventory item',
      details: error.message
    });
  }
});

// Get low stock alerts
router.get('/alerts/low-stock', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const lowStockItems = await prisma.inventoryItem.findMany({
      where: {
        quantity: {
          lte: prisma.inventoryItem.minimumStock
        }
      }
    });

    res.json({
      status: 'success',
      data: lowStockItems
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch low stock alerts'
    });
  }
});

// Get audit logs
router.get('/audit-logs', requireRole(['ADMIN']), async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: {
          select: {
            username: true,
            role: true
          }
        },
        item: {
          select: {
            name: true,
            category: true
          }
        }
      },
      orderBy: {
        timestamp: 'desc'
      }
    });

    res.json({
      status: 'success',
      data: logs
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch audit logs'
    });
  }
});

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
    const item = await prisma.inventoryItem.findUnique({
      where: { id }
    });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// Get single item by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await prisma.inventoryItem.findUnique({
      where: { id }
    });

    if (!item) {
      return res.status(404).json({
        status: 'error',
        message: 'Item not found'
      });
    }

    res.json({
      status: 'success',
      data: item
    });
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch inventory item'
    });
  }
});

// Create new item
router.post('/', requireRole(['ADMIN', 'MANAGER']), validate, async (req, res) => {
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

// Update item
router.put('/:id', requireRole(['ADMIN', 'MANAGER']), validate, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const item = await prisma.inventoryItem.findUnique({
      where: { id }
    });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// Get single item by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await prisma.inventoryItem.findUnique({
      where: { id }
    });

    if (!item) {
      return res.status(404).json({
        status: 'error',
        message: 'Item not found'
      });
    }

    res.json({
      status: 'success',
      data: item
    });
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch inventory item'
    });
  }
});

// Delete item - restrict to ADMIN only
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