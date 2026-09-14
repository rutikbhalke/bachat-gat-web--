export * from '../services/financialService.js';
export { calculateNextUnpaidSavingsPeriod } from '../services/savingsService.js';
import { calculateLoanInterest } from '../services/financialService.js';

export const calculateInterest = calculateLoanInterest;

