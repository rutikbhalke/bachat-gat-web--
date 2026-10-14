const express = require('express');
const router = express.Router();
const savingsController = require('../controllers/savingsController');
const bulkSavingsController = require('../controllers/bulkSavingsController');
const { getSyncStatus, retryPendingSync } = require('../services/crossProjectSyncService');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Bulk savings preview and collection
router.get('/preview', authenticateToken, bulkSavingsController.getBulkSavingsPreview);
router.post('/bulk', authenticateToken, authorizeRoles('ADMIN', 'TREASURER'), bulkSavingsController.recordBulkSavings);

// Cross-project synchronization health and retry
router.get('/sync-status', authenticateToken, async (req, res) => {
  const targetGroupId = req.query.groupId || (req.query.all === 'true' ? null : req.user?.groupId);
  const status = await getSyncStatus(targetGroupId);
  res.json(status);
});
router.post('/sync/retry', authenticateToken, authorizeRoles('ADMIN'), retryPendingSync);

// Standard individual savings routes
router.get('/', authenticateToken, savingsController.getAllSavings);
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'TREASURER'), savingsController.recordSavings);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'TREASURER'), savingsController.updateSavings);

module.exports = router;
