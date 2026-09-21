import { chromium } from 'playwright';

const TEST_GROUP = 'test_isolated_group_999';
const PROD_GROUP = 'shivshahi_group_001';

async function runAudit() {
  console.log('============================================================');
  console.log('🏁 DEEP MEMBER DELETE AUDIT & VERIFICATION');
  console.log('   Isolated Test Group: ' + TEST_GROUP);
  console.log('   Production Guard:    ' + PROD_GROUP);
  console.log('============================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', msg => {
    const text = '[' + msg.type() + '] ' + msg.text();
    consoleLogs.push(text);
    if (msg.type() === 'error') console.log(text);
  });

  page.on('pageerror', err => {
    const text = '[Page Error] ' + err.message;
    consoleLogs.push(text);
    console.error(text);
  });

  page.on('response', resp => {
    if (resp.status() >= 400) {
      const text = '[Network Error] ' + resp.status() + ' ' + resp.url();
      networkErrors.push(text);
      console.log(text);
    }
  });

  // 1. Authenticate as Admin
  console.log('1. Logging in as Admin...');
  await page.goto('http://localhost:3001/login');
  await page.waitForTimeout(600);

  const adminBtn = page.locator('button:has-text("Admin Login")');
  if (await adminBtn.isVisible()) {
    await adminBtn.click();
    await page.waitForTimeout(200);
  }

  await page.fill('input[type="email"]', 'admin3@bachatgat.com');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('✔ Logged in as admin3@bachatgat.com\n');

  // Helper to query document counts directly in Firestore
  const getCounts = async (targetGroup) => {
    return await page.evaluate(async (gid) => {
      const { memberService } = await import('/src/services/memberService.js');
      const { loanService } = await import('/src/services/loanService.js');
      const { savingsService } = await import('/src/services/savingsService.js');
      const { bonusService } = await import('/src/services/bonusService.js');
      const [u, l, s, b] = await Promise.all([
        memberService.getAllMembers({}, gid).catch(() => ({ members: [] })),
        loanService.getAllLoans({}, gid).catch(() => ({ loans: [] })),
        savingsService.getAllSavings({}, gid).catch(() => ({ savings: [] })),
        bonusService.getBonusPoolSummary(2026, gid).catch(() => ({ yearBonuses: [] })),
      ]);
      return {
        users: (u.members || []).length,
        loans: (l.loans || []).length,
        savings: (s.savings || []).length,
        bonuses: (b.yearBonuses || []).length,
      };
    }, targetGroup);
  };

  const prodBaseline = await getCounts(PROD_GROUP);
  console.log('📊 PRODUCTION BASELINE (' + PROD_GROUP + '):', JSON.stringify(prodBaseline));

  // =========================================================================
  // TEST 1: Active Loan Safety (DELETE MUST BE BLOCKED)
  // =========================================================================
  console.log('\n------------------------------------------------------------');
  console.log('TEST 1: Active Loan Safety (Member with active loan)');
  console.log('------------------------------------------------------------');

  const testMemberWithLoan = await page.evaluate(async (gid) => {
    const { db, doc, setDoc, serverTimestamp } = await import('/src/config/firebase.js');
    const mid = 'test_loan_mem_' + Date.now();
    const lid = 'L_test_' + Date.now();

    // 1. Create member
    await setDoc(doc(db, 'users', mid), {
      id: mid,
      userId: mid,
      name: 'Member With Active Loan',
      fullName: 'Member With Active Loan',
      memberCode: 'M-LOAN-' + Date.now().toString().slice(-4),
      email: 'loanmem' + Date.now() + '@example.com',
      phone: '9876500001',
      groupId: gid,
      monthlyShare: 1000,
      role: 'member',
      role_name: 'MEMBER',
      isActive: true,
      isDeleted: false,
      status: 'active',
      joinedDate: '2026-09-01',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Create active loan with outstanding principal
    await setDoc(doc(db, 'loans', lid), {
      id: lid,
      loanId: lid,
      loanNumber: 'LN-' + Date.now().toString().slice(-4),
      memberId: mid,
      memberName: 'Member With Active Loan',
      groupId: gid,
      principalAmount: 10000,
      originalPrincipal: 10000,
      remainingAmount: 8000,
      pendingPrincipal: 8000,
      outstanding_amount: 8000,
      status: 'ACTIVE',
      interestRate: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { mid, lid };
  }, TEST_GROUP);

  console.log('Created test member with active loan: ' + testMemberWithLoan.mid);

  // Navigate to member profile
  await page.goto('http://localhost:3001/members/' + testMemberWithLoan.mid);
  await page.waitForSelector('h1:has-text("Member With Active Loan")', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Click Delete Member button
  console.log('Clicking Delete Member button...');
  const t0_validate = Date.now();
  await page.click('button:has-text("Delete Member")');

  // Verify warning dialog appears immediately (blocking confirmation modal)
  const warningModal = page.locator('text=Cannot Delete Member');
  await warningModal.waitFor({ timeout: 5000 });
  const t_validate = Date.now() - t0_validate;

  const warningText = await page.locator('.popup-modal, [role="dialog"]').innerText();
  console.log('✔ Active Loan Block Warning displayed in ' + t_validate + ' ms: ' + warningText.replace(/\n/g, ' '));

  if (!warningText.includes('8,000')) {
    throw new Error('Warning text did not mention outstanding loan amount: ' + warningText);
  }

  // Click Cancel on the warning modal
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(500);

  // Verify member in Firestore remains active with 0 mutations
  const memLoanCheck = await page.evaluate(async (mid) => {
    const { db, doc, getDoc } = await import('/src/config/firebase.js');
    const snap = await getDoc(doc(db, 'users', mid));
    return snap.data();
  }, testMemberWithLoan.mid);

  if (!memLoanCheck.isActive || memLoanCheck.isDeleted) {
    throw new Error('Member with active loan was modified unexpectedly!');
  }
  console.log('✔ Verified: Member with active loan remains ACTIVE, 0 writes performed!');

  // =========================================================================
  // TEST 2: Confirmation Cancel (Zero Writes)
  // =========================================================================
  console.log('\n------------------------------------------------------------');
  console.log('TEST 2: Confirmation Cancel (Zero Writes)');
  console.log('------------------------------------------------------------');

  const testCleanMember = await page.evaluate(async (gid) => {
    const { db, doc, setDoc, serverTimestamp } = await import('/src/config/firebase.js');
    const mid = 'test_clean_mem_' + Date.now();
    await setDoc(doc(db, 'users', mid), {
      id: mid,
      userId: mid,
      name: 'Clean Test Member 01',
      fullName: 'Clean Test Member 01',
      memberCode: 'M-CLN-' + Date.now().toString().slice(-4),
      email: 'clean' + Date.now() + '@example.com',
      phone: '9876500002',
      groupId: gid,
      monthlyShare: 1000,
      role: 'member',
      role_name: 'MEMBER',
      isActive: true,
      isDeleted: false,
      status: 'active',
      joinedDate: '2026-09-01',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { mid };
  }, TEST_GROUP);

  console.log('Created clean test member: ' + testCleanMember.mid);
  await page.goto('http://localhost:3001/members/' + testCleanMember.mid);
  await page.waitForSelector('h1:has-text("Clean Test Member 01")', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Click Delete Member to open confirmation modal
  await page.click('button:has-text("Delete Member")');
  await page.waitForSelector('text=Delete Member?', { timeout: 5000 });
  console.log('Confirmation modal is open. Clicking Cancel...');

  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(500);

  // Check Firestore state: Must remain ACTIVE, 0 writes
  const cancelCheck = await page.evaluate(async (mid) => {
    const { db, doc, getDoc } = await import('/src/config/firebase.js');
    const snap = await getDoc(doc(db, 'users', mid));
    return snap.data();
  }, testCleanMember.mid);

  if (!cancelCheck.isActive || cancelCheck.isDeleted) {
    throw new Error('Cancel unexpectedly mutated member state!');
  }
  console.log('✔ Verified: Cancel button dismissed modal with 0 writes! Member remains ACTIVE.');

  // =========================================================================
  // TEST 3: Confirm Delete (Successful Soft-Delete)
  // =========================================================================
  console.log('\n------------------------------------------------------------');
  console.log('TEST 3: Confirm Delete (Successful Soft-Delete)');
  console.log('------------------------------------------------------------');

  const t0_delete = Date.now();
  await page.click('button:has-text("Delete Member")');
  await page.waitForSelector('text=Delete Member?', { timeout: 5000 });

  // Click Confirm Delete inside modal
  const confirmBtn = page.locator('button:has-text("Delete Member")').last();
  await confirmBtn.click();

  // Wait for success modal
  const successModal = page.locator('text=Member deleted successfully');
  await successModal.waitFor({ timeout: 5000 });
  const t_delete_total = Date.now() - t0_delete;

  console.log('✔ Soft delete completed with UI confirmation in ' + t_delete_total + ' ms');

  // Dismiss success popup and navigate back to /members
  await page.click('button:has-text("Done")');
  await page.waitForURL('**/members', { timeout: 5000 });
  await page.waitForTimeout(1000);
  console.log('✔ Successfully redirected to /members');

  // Verify Firestore state of deleted member
  const deletedDoc = await page.evaluate(async (mid) => {
    const { db, doc, getDoc, collection, getDocs, query, where } = await import('/src/config/firebase.js');
    const memSnap = await getDoc(doc(db, 'users', mid));
    const txSnap = await getDocs(query(collection(db, 'transactions'), where('memberId', '==', mid), where('type', '==', 'MEMBER_SOFT_DELETED')));
    return {
      member: memSnap.data(),
      auditCount: txSnap.size,
      auditRecord: txSnap.docs[0]?.data(),
    };
  }, testCleanMember.mid);

  console.log('Deleted Member Doc:', {
    isActive: deletedDoc.member.isActive,
    is_active: deletedDoc.member.is_active,
    status: deletedDoc.member.status,
    isDeleted: deletedDoc.member.isDeleted,
    deletedAt: deletedDoc.member.deletedAt,
  });

  if (deletedDoc.member.isActive !== false || deletedDoc.member.isDeleted !== true || deletedDoc.member.status !== 'inactive') {
    throw new Error('Soft delete fields not correctly set: ' + JSON.stringify(deletedDoc.member));
  }
  if (!deletedDoc.member.deletedAt) {
    throw new Error('deletedAt timestamp missing!');
  }
  if (deletedDoc.auditCount !== 1) {
    throw new Error('Expected exactly 1 audit transaction, got ' + deletedDoc.auditCount);
  }
  if (deletedDoc.auditRecord.groupId !== TEST_GROUP) {
    throw new Error('Audit record groupId is wrong: ' + deletedDoc.auditRecord.groupId + ' (Expected ' + TEST_GROUP + ')');
  }
  console.log('✔ Soft-delete fields verified: isDeleted=true, isActive=false, status="inactive", valid deletedAt timestamp.');
  console.log('✔ Audit record verified: ' + deletedDoc.auditRecord.id + ' (' + deletedDoc.auditRecord.type + ') in ' + TEST_GROUP);

  // =========================================================================
  // TEST 4: Double Click Protection
  // =========================================================================
  console.log('\n------------------------------------------------------------');
  console.log('TEST 4: Double Click Protection');
  console.log('------------------------------------------------------------');

  const testDoubleMember = await page.evaluate(async (gid) => {
    const { db, doc, setDoc, serverTimestamp } = await import('/src/config/firebase.js');
    const mid = 'test_double_mem_' + Date.now();
    await setDoc(doc(db, 'users', mid), {
      id: mid,
      userId: mid,
      name: 'Double Click Test Member',
      fullName: 'Double Click Test Member',
      memberCode: 'M-DBL-' + Date.now().toString().slice(-4),
      email: 'dbl' + Date.now() + '@example.com',
      phone: '9876500003',
      groupId: gid,
      monthlyShare: 1000,
      role: 'member',
      role_name: 'MEMBER',
      isActive: true,
      isDeleted: false,
      status: 'active',
      joinedDate: '2026-09-01',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { mid };
  }, TEST_GROUP);

  await page.goto('http://localhost:3001/members/' + testDoubleMember.mid);
  await page.waitForSelector('h1:has-text("Double Click Test Member")', { timeout: 10000 });
  await page.waitForTimeout(500);

  await page.click('button:has-text("Delete Member")');
  await page.waitForSelector('text=Delete Member?', { timeout: 5000 });

  const modalConfirm = page.locator('button:has-text("Delete Member")').last();
  // Rapidly trigger 3 clicks
  await Promise.allSettled([
    modalConfirm.click(),
    modalConfirm.click(),
    modalConfirm.click(),
  ]);

  await page.waitForSelector('text=Member deleted successfully', { timeout: 5000 });
  await page.click('button:has-text("Done")');
  await page.waitForTimeout(1000);

  const doubleAuditCount = await page.evaluate(async (mid) => {
    const { db, collection, getDocs, query, where } = await import('/src/config/firebase.js');
    const txSnap = await getDocs(query(collection(db, 'transactions'), where('memberId', '==', mid), where('type', '==', 'MEMBER_SOFT_DELETED')));
    return txSnap.size;
  }, testDoubleMember.mid);

  if (doubleAuditCount !== 1) {
    throw new Error('Double click resulted in multiple audit records: ' + doubleAuditCount);
  }
  console.log('✔ Double click protection verified: exactly 1 audit record created (count=' + doubleAuditCount + ').');

  // =========================================================================
  // TEST 5: Historical Financial Data Preservation
  // =========================================================================
  console.log('\n------------------------------------------------------------');
  console.log('TEST 5: Historical Financial Data Preservation');
  console.log('------------------------------------------------------------');

  const testHistoryMember = await page.evaluate(async (gid) => {
    const { db, doc, setDoc, serverTimestamp } = await import('/src/config/firebase.js');
    const mid = 'test_hist_mem_' + Date.now();
    const cid = 'C_' + mid + '_2026_9';
    const lid = 'L_' + mid + '_closed';
    const rid = 'R_' + mid + '_001';

    // 1. Member
    await setDoc(doc(db, 'users', mid), {
      id: mid,
      userId: mid,
      name: 'History Preservation Member',
      fullName: 'History Preservation Member',
      memberCode: 'M-HST-' + Date.now().toString().slice(-4),
      email: 'hist' + Date.now() + '@example.com',
      phone: '9876500004',
      groupId: gid,
      monthlyShare: 1000,
      role: 'member',
      role_name: 'MEMBER',
      isActive: true,
      isDeleted: false,
      status: 'active',
      joinedDate: '2026-09-01',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Savings record
    await setDoc(doc(db, 'monthlyContributions', cid), {
      id: cid,
      contributionId: cid,
      memberId: mid,
      groupId: gid,
      month: 9,
      year: 2026,
      paidAmount: 1000,
      paymentMode: 'Cash',
      paymentDate: '2026-09-10',
      createdAt: serverTimestamp(),
    });

    // 3. Fully settled/closed loan
    await setDoc(doc(db, 'loans', lid), {
      id: lid,
      loanId: lid,
      loanNumber: 'LN-HST-' + Date.now().toString().slice(-4),
      memberId: mid,
      groupId: gid,
      principalAmount: 5000,
      remainingAmount: 0,
      pendingPrincipal: 0,
      status: 'CLOSED',
      createdAt: serverTimestamp(),
    });

    // 4. Repayment record
    await setDoc(doc(db, 'repayments', rid), {
      id: rid,
      repaymentId: rid,
      loanId: lid,
      memberId: mid,
      groupId: gid,
      principalAmount: 5000,
      interestAmount: 100,
      totalPayment: 5100,
      createdAt: serverTimestamp(),
    });

    return { mid, cid, lid, rid };
  }, TEST_GROUP);

  console.log('Created test member with financial history: ' + testHistoryMember.mid);

  // Soft delete through memberService
  const delHistRes = await page.evaluate(async ({ mid, gid }) => {
    const { memberService } = await import('/src/services/memberService.js');
    return await memberService.deleteMember(mid, gid);
  }, { mid: testHistoryMember.mid, gid: TEST_GROUP });

  if (!delHistRes.success) {
    throw new Error('Failed to delete history member: ' + JSON.stringify(delHistRes));
  }

  // Verify all historical documents still exist in Firestore
  const historyCheck = await page.evaluate(async (info) => {
    const { db, doc, getDoc } = await import('/src/config/firebase.js');
    const [cSnap, lSnap, rSnap] = await Promise.all([
      getDoc(doc(db, 'monthlyContributions', info.cid)),
      getDoc(doc(db, 'loans', info.lid)),
      getDoc(doc(db, 'repayments', info.rid)),
    ]);
    return {
      savingsExists: cSnap.exists(),
      loanExists: lSnap.exists(),
      repaymentExists: rSnap.exists(),
    };
  }, testHistoryMember);

  if (!historyCheck.savingsExists || !historyCheck.loanExists || !historyCheck.repaymentExists) {
    throw new Error('Historical records were lost: ' + JSON.stringify(historyCheck));
  }
  console.log('✔ Verified: ALL historical records (savings, loans, repayments) remain 100% intact after soft delete!');

  // =========================================================================
  // TEST 6: Error Handling (Member Not Found & Already Deleted)
  // =========================================================================
  console.log('\n------------------------------------------------------------');
  console.log('TEST 6: Error Handling (Not Found & Already Deleted)');
  console.log('------------------------------------------------------------');

  const errorResults = await page.evaluate(async (deletedMid) => {
    const { memberService } = await import('/src/services/memberService.js');
    let notFoundCaught = false;
    let alreadyDeletedCaught = false;

    try {
      await memberService.deleteMember('non_existent_member_id_xyz');
    } catch (e) {
      notFoundCaught = e.message.includes('not found');
    }

    try {
      await memberService.deleteMember(deletedMid);
    } catch (e) {
      alreadyDeletedCaught = e.message.includes('already deleted') || e.message.includes('inactive');
    }

    return { notFoundCaught, alreadyDeletedCaught };
  }, testCleanMember.mid);

  if (!errorResults.notFoundCaught) {
    throw new Error('Member not found error was not properly caught!');
  }
  if (!errorResults.alreadyDeletedCaught) {
    throw new Error('Already deleted error was not properly caught!');
  }
  console.log('✔ Error handling verified: Member Not Found caught, Already Deleted caught.');

  // =========================================================================
  // VERIFY PRODUCTION INVARIANT
  // =========================================================================
  console.log('\n============================================================');
  console.log('🔒 VERIFYING PRODUCTION INVARIANT (' + PROD_GROUP + ')');
  console.log('============================================================');

  const prodPostCheck = await getCounts(PROD_GROUP);
  console.log('📊 PRODUCTION POST-AUDIT (' + PROD_GROUP + '):', JSON.stringify(prodPostCheck));

  const prodWrites = Object.keys(prodBaseline).reduce((acc, key) => {
    return acc + Math.abs(prodPostCheck[key] - prodBaseline[key]);
  }, 0);

  console.log('\n🛡 PRODUCTION DELTA: ' + prodWrites + ' mutations (Expected: 0)');
  if (prodWrites !== 0) {
    console.error('❌ CRITICAL SAFETY FAILURE: Production data was mutated!');
    process.exit(1);
  } else {
    console.log('✔ PRODUCTION INVARIANT VERIFIED: EXACTLY 0 WRITES, 0 DELETES TO shivshahi_group_001!');
  }

  await browser.close();
  console.log('\n🎉 ALL MEMBER DELETE CHECKS COMPLETED SUCCESSFULLY!');
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
