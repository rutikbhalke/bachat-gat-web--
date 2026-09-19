process.env.FIREBASE_PROJECT_ID = 'bachat-gat-32ffe';
const { db } = require('../config/firebaseAdmin');
const { calculateGroupFinancialSummary } = require('../services/financialService');

const DEFAULT_GROUP_ID = 'shivshahi_group_001';

async function verify() {
  console.log('Fetching data from Firestore...');
  const [savingsSnap, loansSnap] = await Promise.all([
    db.collection('monthlyContributions').where('groupId', '==', DEFAULT_GROUP_ID).get(),
    db.collection('loans').where('groupId', '==', DEFAULT_GROUP_ID).get()
  ]);

  const savings = savingsSnap.docs.map(d => d.data());
  const loans = loansSnap.docs.map(d => d.data());

  console.log(`Found ${savings.length} savings records.`);
  console.log(`Found ${loans.length} loan records.`);

  const summary = calculateGroupFinancialSummary(savings, loans);

  console.log('\n==================================================');
  console.log('AUTHORITATIVE FINANCIAL SUMMARY');
  console.log('==================================================');
  console.log(`TOTAL SAVINGS:       ₹${summary.totalGroupSavings.toLocaleString('en-IN')}`);
  console.log(`ACTIVE LOANS:        ₹${summary.activeLoansOutstanding.toLocaleString('en-IN')}`);
  console.log(`TOTAL INTEREST @ 2%: ₹${summary.totalInterest.toLocaleString('en-IN')}`);
  console.log(`TOTAL GROUP FUND:    ₹${summary.totalGroupFund.toLocaleString('en-IN')}`);
  console.log(`AVAILABLE BALANCE:   ₹${summary.availableBalance.toLocaleString('en-IN')}`);
  console.log('==================================================\n');
}

verify().catch(console.error);
