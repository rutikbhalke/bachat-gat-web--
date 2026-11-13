const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Bulk monthly loan principal collection routes (must precede /:id)
router.get('/bulk/preview', authenticateToken, loanController.getBulkLoanPrincipalPreview);
router.post('/bulk/collect', authenticateToken, authorizeRoles('ADMIN', 'TREASURER'), loanController.recordBulkLoanPrincipal);

router.get('/', authenticateToken, loanController.getAllLoans);
router.get('/:id', authenticateToken, loanController.getLoanById);
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'TREASURER'), loanController.createLoan);
router.post('/:loanId/repayments', authenticateToken, authorizeRoles('ADMIN', 'TREASURER'), loanController.recordLoanRepayment);
router.get('/:loanId/repayments', authenticateToken, loanController.getLoanRepayments);

module.exports = router;
