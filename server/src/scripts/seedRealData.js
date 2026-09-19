const { db } = require('../config/firebaseAdmin');
const { DEFAULT_GROUP_ID: CONTRACT_GROUP_ID } = require('../config/dataContract');
const path = require('path');

const DEFAULT_GROUP_ID = process.env.GROUP_ID || CONTRACT_GROUP_ID;

const realMembers = [
  { sr: 1, name: 'रवींद्र भागवत गुंजाळ', loan: 150000, inst: 8, interest: 450, fund: 1000 },
  { sr: 2, name: 'भारत सोमनाथ गुंजाळ', loan: 200000, inst: 3, interest: 800, fund: 1000 },
  { sr: 3, name: 'ध्रुव भारत गुंजाळ', loan: 150000, inst: 3, interest: 1200, fund: 1000 },
  { sr: 4, name: 'संदीप जयराम गुंजाळ', loan: 150000, inst: 7, interest: 600, fund: 1000 },
  { sr: 5, name: 'सचिन काशिनाथ गुंजाळ', loan: 0, inst: 0, interest: 0, fund: 1000 },
  { sr: 6, name: 'रमेश सुखदेव गुंजाळ', loan: 140000, inst: 4, interest: 980, fund: 1000 },
  { sr: 7, name: 'सतीश गणपत कुऱ्हे', loan: 200000, inst: 9, interest: 200, fund: 1000 },
  { sr: 8, name: 'अशोक खंडेराव दिघे', loan: 150000, inst: 6, interest: 750, fund: 1000 },
  { sr: 9, name: 'विजय विठ्ठल गुंजाळ', loan: 200000, inst: 6, interest: 500, fund: 1000 },
  { sr: 10, name: 'नारायण जयवंत गुंजाळ', loan: 100000, inst: 1, interest: 1000, fund: 1000 },
  { sr: 11, name: 'मनोज रामभाऊ गुंजाळ', loan: 150000, inst: 4, interest: 1050, fund: 1000 },
  { sr: 12, name: 'रामनाथ ज्ञानदेव खुळे', loan: 150000, inst: 4, interest: 1050, fund: 1000 },
  { sr: 13, name: 'निवृत्ती सुभाष शिंदे', loan: 125000, inst: 5, interest: 750, fund: 1000 },
  { sr: 14, name: 'विजय विठ्ठल दरकर', loan: 140000, inst: 7, interest: 560, fund: 1000 },
  { sr: 15, name: 'वाल्मिक दत्तात्रय गुंजाळ', loan: 150000, inst: 3, interest: 1200, fund: 1000 },
  { sr: 16, name: 'अजित दत्तात्रय गुंजाळ', loan: 150000, inst: 7, interest: 600, fund: 1000 },
  { sr: 17, name: 'साई रामनाथ खुळे', loan: 0, inst: 0, interest: 0, fund: 1000 },
  { sr: 18, name: 'रामनाथ सुखदेव खुळे', loan: 100000, inst: 1, interest: 1000, fund: 1000 },
  { sr: 19, name: 'बाळासाहेब सुखदेव खुळे', loan: 0, inst: 0, interest: 0, fund: 1000 },
  { sr: 20, name: 'होशीराम दत्तू गाडे', loan: 50000, inst: 7, interest: 200, fund: 1000 },
  { sr: 21, name: 'संजय दत्तू गाडे', loan: 0, inst: 0, interest: 0, fund: 1000 },
  { sr: 22, name: 'संतोष दत्तू गाडे', loan: 50000, inst: 3, interest: 400, fund: 1000 },
  { sr: 23, name: 'शिव पूजा', loan: 150000, inst: 2, interest: 1350, fund: 1000 },
  { sr: 24, name: 'यश बाळासाहेब पर्वत', loan: 0, inst: 0, interest: 0, fund: 1000 },
  { sr: 25, name: 'शांताबाई वे. ब्रिंज', loan: 150000, inst: 2, interest: 1350, fund: 1000 },
  { sr: 26, name: 'सुनील रामनाथ पखरे', loan: 140000, inst: 10, interest: 140, fund: 1000 },
  { sr: 27, name: 'बाळासाहेब रामनाथ पर्वत', loan: 100000, inst: 2, interest: 900, fund: 1000 },
  { sr: 28, name: 'समर्थ सुनील पर्वत', loan: 120000, inst: 6, interest: 600, fund: 1000 },
  { sr: 29, name: 'सोमनाथ मधुकर घोडके', loan: 0, inst: 0, interest: 0, fund: 1000 },
  { sr: 30, name: 'बाळासाहेब मधुकर घोडके', loan: 0, inst: 0, interest: 0, fund: 1000 },
  { sr: 31, name: 'मयूर साहेबराव जगताप', loan: 140000, inst: 5, interest: 840, fund: 1000 },
  { sr: 32, name: 'मारुती आबाजी शिंदे', loan: 0, inst: 0, interest: 0, fund: 1000 },
  { sr: 33, name: 'दिगंबर रामनाथ पर्वत', loan: 90000, inst: 8, interest: 270, fund: 1000 },
  { sr: 34, name: 'सोपान रामनाथ पर्वत', loan: 150000, inst: 2, interest: 1350, fund: 1000 },
  { sr: 35, name: 'अशोक सोमिनाथ पर्वत', loan: 0, inst: 0, interest: 0, fund: 1000 },
  { sr: 36, name: 'शंभू रविंद्र गुंजाळ', loan: 150000, inst: 8, interest: 450, fund: 1000 },
  { sr: 37, name: 'समर्थ निलेश गुंजाळ', loan: 150000, inst: 8, interest: 450, fund: 1000 },
  { sr: 38, name: 'नितेश भागवत गुंजाळ', loan: 150000, inst: 8, interest: 450, fund: 1000 },
  { sr: 39, name: 'सुभाष पांडुरंग आरटे', loan: 150000, inst: 8, interest: 450, fund: 1000 },
  { sr: 40, name: 'बाळासाहेब विश्वनाथ गुंजाळ', loan: 0, inst: 0, interest: 0, fund: 2000 },
  { sr: 41, name: 'मनोहर अशोक सातपुते', loan: 150000, inst: 5, interest: 900, fund: 2000 },
  { sr: 42, name: 'शेखर तात्यासाहेब गुंजाळ', loan: 150000, inst: 4, interest: 1200, fund: 2000 },
  { sr: 43, name: 'रमेश काशिनाथ कोल्हे', loan: 150000, inst: 2, interest: 1350, fund: 2000 },
];

async function cleanup() {
  const collections = ['users', 'loans', 'monthlyContributions', 'repayments', 'transactions'];
  for (const coll of collections) {
    const snapshot = await db.collection(coll).get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      // Keep admins
      if (coll === 'users' && (data.role === 'admin' || (data.email && data.email.includes('admin')))) {
        return;
      }
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`Cleared collection: ${coll}`);
  }
}

async function seed() {
  console.log('Starting seed process...');
  await cleanup();

  for (const m of realMembers) {
    const memberId = `member_${m.sr.toString().padStart(3, '0')}`;
    const memberData = {
      id: memberId,
      fullName: m.name,
      name: m.name,
      memberCode: `M-130-${m.sr.toString().padStart(2, '0')}`,
      groupId: DEFAULT_GROUP_ID,
      role: 'member',
      role_name: 'MEMBER',
      status: 'ACTIVE',
      isActive: true,
      monthlyContribution: m.fund,
      createdAt: new Date().toISOString()
    };

    await db.collection('users').doc(memberId).set(memberData);

    if (m.loan > 0) {
      const loanId = `loan_${m.sr.toString().padStart(3, '0')}`;
      const principal = m.loan;
      const installmentAmount = Math.round(principal / 10);

      const installmentsAlreadyPaid = m.inst - 1;
      const principalRepaid = installmentsAlreadyPaid * installmentAmount;
      const remainingAmount = principal - principalRepaid;

      const loanData = {
        id: loanId,
        memberId: memberId,
        memberName: m.name,
        groupId: DEFAULT_GROUP_ID,
        principalAmount: principal,
        originalPrincipal: principal,
        remainingAmount: remainingAmount,
        pendingPrincipal: remainingAmount,
        interestRate: 2.0,
        status: remainingAmount <= 0 ? 'CLOSED' : 'ACTIVE',
        lastInstallmentPaid: installmentsAlreadyPaid,
        createdAt: new Date(2026, 0, 1).toISOString(),
        issueDate: new Date(2026, 0, 1).toISOString()
      };

      await db.collection('loans').doc(loanId).set(loanData);

      for (let i = 1; i <= installmentsAlreadyPaid; i++) {
        const repayId = `repay_${m.sr}_${i}`;
        const prevRemaining = principal - (i - 1) * installmentAmount;
        const interestAmt = Math.round(prevRemaining * 0.02 * 100) / 100;

        await db.collection('repayments').doc(repayId).set({
          id: repayId,
          loanId: loanId,
          memberId: memberId,
          groupId: DEFAULT_GROUP_ID,
          installmentNumber: i,
          principalAmount: installmentAmount,
          interestAmount: interestAmt,
          amount: installmentAmount + interestAmt,
          paymentMonth: i,
          paymentYear: 2026,
          paymentDate: new Date(2026, i - 1, 20).toISOString(),
          createdAt: new Date(2026, i - 1, 20).toISOString()
        });
      }
    }

    for (let i = 1; i <= 6; i++) {
      const contribId = `C_${memberId}_2026_${i.toString().padStart(2, '0')}`;
      await db.collection('monthlyContributions').doc(contribId).set({
        id: contribId,
        memberId: memberId,
        groupId: DEFAULT_GROUP_ID,
        month: i,
        year: 2026,
        amount: m.fund,
        paidAmount: m.fund,
        status: 'PAID',
        paymentDate: new Date(2026, i - 1, 20).toISOString(),
        createdAt: new Date(2026, i - 1, 20).toISOString()
      });
    }
  }

  console.log('Seed completed successfully.');
}

seed().catch(console.error);
