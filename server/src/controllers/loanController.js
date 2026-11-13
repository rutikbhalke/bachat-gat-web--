const { getAllLoans, getLoanById, createLoan, recordLoanRepayment, getLoanRepayments } = require('./firebaseController');
const { getBulkLoanPrincipalPreview, recordBulkLoanPrincipal } = require('./bulkLoanPrincipalController');

module.exports = {
  getAllLoans,
  getLoanById,
  createLoan,
  recordLoanRepayment,
  getLoanRepayments,
  getBulkLoanPrincipalPreview,
  recordBulkLoanPrincipal,
};
