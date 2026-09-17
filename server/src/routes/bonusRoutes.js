const express = require('express');
const router = express.Router();
const bonusController = require('../controllers/bonusController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/summary', authenticateToken, bonusController.getBonusSummary);
router.post('/distribute', authenticateToken, authorizeRoles('ADMIN'), bonusController.distributeBonus);

module.exports = router;
