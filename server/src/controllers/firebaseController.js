const { auth, db } = require('../config/firebaseAdmin');
const { DEFAULT_GROUP_ID, getCollection, value, writeActivity, writeNotification } = require('../utils/firestore');
const { calculateMonthlyInterest, calculateProgressPercentage } = require('../utils/calculations');
const { calculateGroupFinancialSummary, calculateMemberFinancialSummary, calculateMonthlyBalanceReport, calculateMemberCollections } = require('../services/financialService');

const number = (item) => Number(item) || 0;
const today = () => new Date().toISOString().split('T')[0];
const groupIdOf = (req) => req.user.groupId || DEFAULT_GROUP_ID;

async function register(req, res) {
  res.status(410).json({ success: false, message: 'Registration is handled by Firebase Authentication in the client.' });
}

async function login(req, res) {
  res.status(410).json({ success: false, message: 'Login is handled by Firebase Authentication in the client.' });
}

async function getMe(req, res) {
  const profile = await db.collection('users').doc(req.user.uid).get();
  res.json({ success: true, user: { ...req.user, ...(profile.exists ? profile.data() : {}) } });
}

async function updateProfile(req, res, next) {
  try {
    const allowed = ['fullName', 'name', 'phone'];
    const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    update.updatedAt = new Date().toISOString();
    await db.collection('users').doc(req.user.uid).set(update, { merge: true });
    if (update.fullName || update.name) await auth.updateUser(req.user.uid, { displayName: update.fullName || update.name });
    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) { next(err); }
}

async function getGroupDetails(req, res) {
  const id = groupIdOf(req);
  const snapshot = await db.collection('groups').doc(id).get();
  const members = await getCollection('users', id);
  const group = snapshot.exists ? snapshot.data() : {};
  res.json({ success: true, group: { ...group, id, groupId: id, total_members: members.length, total_active_members: members.filter((m) => m.status !== 'INACTIVE' && m.isActive !== false).length } });
}

async function updateGroupDetails(req, res, next) {
  try {
    const id = groupIdOf(req);
    const body = req.body;
    const update = {
      groupName: body.group_name || body.groupName,
      group_name: body.group_name || body.groupName,
      monthlyContribution: number(body.monthly_contribution_per_share || body.monthlyContribution) || 1000,
      monthlyTarget: number(body.monthly_target || body.monthlyTarget) || 363000,
      description: body.description || '', updatedAt: new Date().toISOString(),
    };
    await db.collection('groups').doc(id).set(update, { merge: true });
    await writeActivity(id, req.user.uid, 'GROUP_UPDATED', `Group settings updated by ${req.user.name || req.user.email}`);
    res.json({ success: true, message: 'Group settings updated successfully.', group: { ...update, id, groupId: id } });
  } catch (err) { next(err); }
}

async function getAllMembers(req, res) {
  let members = await getCollection('users', groupIdOf(req));
  const { search, status, month, year } = req.query;
  if (search) { const term = search.toLowerCase(); members = members.filter((m) => `${m.fullName || m.name} ${m.email} ${m.phone} ${m.memberCode}`.toLowerCase().includes(term)); }
  if (status === 'active') members = members.filter((m) => m.status !== 'INACTIVE' && (m.status || '').toLowerCase() !== 'inactive' && m.isActive !== false && !m.isDeleted);
  if (status === 'inactive') members = members.filter((m) => m.status === 'INACTIVE' || (m.status || '').toLowerCase() === 'inactive' || m.isActive === false || m.isDeleted === true);
  const savings = await getCollection('monthlyContributions', groupIdOf(req));
  const loans = await getCollection('loans', groupIdOf(req));
  members = members.map((m) => ({ ...m, member_id: m.id, name: m.fullName || m.name, member_code: m.memberCode || m.member_code, total_savings: savings.filter((s) => s.memberId === m.id).reduce((sum, s) => sum + number(s.amount), 0), outstanding_loans: loans.filter((l) => l.memberId === m.id && l.status === 'ACTIVE').reduce((sum, l) => sum + number(value(l, 'remainingAmount', 'outstanding_amount')), 0), has_paid_current_month: savings.some((s) => s.memberId === m.id && number(s.month) === number(month) && number(s.year) === number(year)) }));
  res.json({ success: true, count: members.length, members });
}

async function getMemberById(req, res) {
  const groupId = groupIdOf(req);
  const [members, savings, loans, repayments] = await Promise.all([
    getCollection('users', groupId),
    getCollection('monthlyContributions', groupId),
    getCollection('loans', groupId),
    getCollection('repayments', groupId)
  ]);
  const member = members.find((m) => m.id === req.params.id);
  if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });

  const memberSummary = calculateMemberFinancialSummary(member.id, savings, loans, repayments);

  res.json({
    success: true,
    member: {
      ...member,
      ...memberSummary,
      totalSavings: memberSummary.mySavings,
      totalOutstanding: memberSummary.myLoanOutstanding,
      totalInterestPaid: memberSummary.myInterestPaid,
      pendingInterest: memberSummary.myPendingInterest,
      savingsHistory: savings.filter(s => s.memberId === member.id || s.member_id === member.id),
      loans: loans.filter(l => l.memberId === member.id || l.member_id === member.id),
      repayments: repayments.filter(r => r.memberId === member.id || r.member_id === member.id)
    }
  });
}

async function createMember(req, res, next) { try { const ref = db.collection('users').doc(); const member = { id: ref.id, ...req.body, groupId: groupIdOf(req), status: 'ACTIVE', isActive: true, createdAt: new Date().toISOString() }; await ref.set(member); res.status(201).json({ success: true, memberId: ref.id }); } catch (err) { next(err); } }
async function updateMember(req, res, next) { try { await db.collection('users').doc(req.params.id).set({ ...req.body, updatedAt: new Date().toISOString() }, { merge: true }); res.json({ success: true, message: 'Member updated successfully.' }); } catch (err) { next(err); } }
async function deleteMember(req, res, next) { try { await db.collection('users').doc(req.params.id).set({ status: 'INACTIVE', isActive: false }, { merge: true }); res.json({ success: true, message: 'Member deleted successfully.' }); } catch (err) { next(err); } }

async function getAllSavings(req, res) { let savings = await getCollection('monthlyContributions', groupIdOf(req)); const { month, year, memberId, search } = req.query; if (month) savings = savings.filter((s) => number(s.month) === number(month)); if (year) savings = savings.filter((s) => number(s.year) === number(year)); if (memberId) savings = savings.filter((s) => s.memberId === memberId); if (search) { const members = await getCollection('users', groupIdOf(req)); const ids = members.filter((m) => `${m.fullName || m.name} ${m.memberCode}`.toLowerCase().includes(search.toLowerCase())).map((m) => m.id); savings = savings.filter((s) => ids.includes(s.memberId)); } res.json({ success: true, count: savings.length, totalAmount: savings.reduce((sum, s) => sum + number(s.amount), 0), savings }); }
async function recordSavings(req, res, next) { try { const { member_id, amount, month, year } = req.body; const existing = (await getCollection('monthlyContributions', groupIdOf(req))).some((s) => s.memberId === member_id && number(s.month) === number(month) && number(s.year) === number(year)); if (existing) return res.status(400).json({ success: false, message: 'Savings for this member and period is already recorded.' }); const ref = db.collection('monthlyContributions').doc(); await ref.set({ id: ref.id, ...req.body, memberId: member_id, groupId: groupIdOf(req), amount: number(amount), createdAt: new Date().toISOString() }); res.status(201).json({ success: true, savingsId: ref.id }); } catch (err) { next(err); } }
async function updateSavings(req, res, next) { try { await db.collection('monthlyContributions').doc(req.params.id).set({ ...req.body, updatedAt: new Date().toISOString() }, { merge: true }); res.json({ success: true, message: 'Savings record updated successfully.' }); } catch (err) { next(err); } }

async function getAllLoans(req, res) { let loans = await getCollection('loans', groupIdOf(req)); const repayments = await getCollection('repayments', groupIdOf(req)); loans = loans.map((l) => ({ ...l, loan_id: l.id, loan_number: value(l, 'loanNumber', 'loan_number'), principal_amount: number(value(l, 'principalAmount', 'principal_amount')), outstanding_amount: number(value(l, 'remainingAmount', 'outstanding_amount')), interest_rate: number(value(l, 'interestRate', 'interest_rate')), total_principal_repaid: repayments.filter((r) => r.loanId === l.id).reduce((s, r) => s + number(value(r, 'principalAmount', 'principal_repayment_amount')), 0) })); if (req.query.status) loans = loans.filter((l) => l.status === req.query.status.toUpperCase()); res.json({ success: true, count: loans.length, loans }); }
async function getLoanById(req, res) { const loan = (await getCollection('loans', groupIdOf(req))).find((l) => l.id === req.params.id); if (!loan) return res.status(404).json({ success: false, message: 'Loan not found.' }); res.json({ success: true, loan }); }
async function createLoan(req, res, next) { try { const ref = db.collection('loans').doc(); const principal = number(req.body.principal_amount); await ref.set({ id: ref.id, ...req.body, loanNumber: `LN-${new Date().getFullYear()}-${ref.id.slice(-3)}`, principalAmount: principal, remainingAmount: principal, groupId: groupIdOf(req), status: 'ACTIVE', createdAt: new Date().toISOString() }); res.status(201).json({ success: true, loanId: ref.id }); } catch (err) { next(err); } }
async function recordLoanRepayment(req, res, next) { try { const ref = db.collection('repayments').doc(); await ref.set({ id: ref.id, ...req.body, loanId: req.params.loanId, groupId: groupIdOf(req), createdAt: new Date().toISOString() }); res.status(201).json({ success: true, repaymentId: ref.id }); } catch (err) { next(err); } }
async function getLoanRepayments(req, res) { const repayments = (await getCollection('repayments', groupIdOf(req))).filter((r) => r.loanId === req.params.loanId); res.json({ success: true, repayments }); }

async function getDashboardSummary(req, res) {
  const groupId = groupIdOf(req);
  const [savings, loans, repayments, members, groups, transactions] = await Promise.all([
    'monthlyContributions', 'loans', 'repayments', 'users', 'groups', 'transactions'
  ].map((name) => getCollection(name, groupId)));

  const summary = calculateGroupFinancialSummary(savings, loans, repayments, transactions);
  const group = groups.find(g => g.id === groupId) || groups[0] || {};

  let memberSummary = null;
  const memberId = req.query.memberId || req.user?.uid;
  if (memberId) {
    memberSummary = calculateMemberFinancialSummary(memberId, savings, loans, repayments);
  }

  res.json({
    success: true,
    debug: {
      requestedGroupId: groupId,
      userGroupId: req.user?.groupId,
      savingsCount: savings.length,
      loansCount: loans.length,
      membersCount: members.length,
      firstSaving: savings[0] ? { id: savings[0].id, groupId: savings[0].groupId } : null,
      firstLoan: loans[0] ? { id: loans[0].id, groupId: loans[0].groupId } : null,
      groups: groups.map(g => ({ id: g.id, groupId: g.groupId }))
    },
    summary: {
      groupName: value(group, 'groupName', 'group_name', 'name') || 'Bachat Gat',
      groupCode: value(group, 'groupCode', 'group_code') || groupIdOf(req),
      ...summary,
      totalMembers: members.length,
      activeMembers: members.filter((m) => m.status !== 'INACTIVE').length
    },
    memberSummary
  });
}

async function getMonthlyProgress(req, res) {
  const month = number(req.query.month) || new Date().getMonth() + 1;
  const year = number(req.query.year) || new Date().getFullYear();
  const [savings, members, groups] = await Promise.all(['monthlyContributions', 'users', 'groups'].map((name) => getCollection(name, groupIdOf(req))));
  const active = members.filter((m) => m.status !== 'INACTIVE' && m.isActive !== false);
  const collected = savings.filter((s) => number(s.month) === month && number(s.year) === year).reduce((sum, s) => sum + number(s.amount), 0);
  const target = number(value(groups[0] || {}, 'monthlyTarget', 'monthly_target')) || active.length * 1000;
  res.json({
    success: true,
    progress: {
      month,
      year,
      collectedAmount: collected,
      targetAmount: target,
      progressPercentage: calculateProgressPercentage(collected, target),
      activeMembersCount: active.length
    }
  });
}

async function getRecentActivities(req, res) {
  const limit = number(req.query.limit) || 10;
  const activities = await getCollection('transactions', groupIdOf(req));
  const sorted = activities.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  res.json({ success: true, activities: sorted.slice(0, limit) });
}

async function getNotifications(req, res) { const notifications = (await getCollection('notifications', groupIdOf(req))).filter((n) => !n.userId || n.userId === req.user.uid); res.json({ success: true, unreadCount: notifications.filter((n) => !n.isRead).length, notifications }); }
async function markNotificationAsRead(req, res, next) { try { await db.collection('notifications').doc(req.params.id).set({ isRead: true }, { merge: true }); res.json({ success: true }); } catch (err) { next(err); } }
async function markAllNotificationsAsRead(req, res, next) { try { const notifications = await getNotificationsForUser(req.user.uid); await Promise.all(notifications.map((n) => db.collection('notifications').doc(n.id).set({ isRead: true }, { merge: true }))); res.json({ success: true }); } catch (err) { next(err); } }
async function getNotificationsForUser(uid) { const snapshot = await db.collection('notifications').where('userId', '==', uid).get(); return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })); }

async function getMonthlyReport(req, res) {
  const month = number(req.query.month) || new Date().getMonth() + 1;
  const year = number(req.query.year) || new Date().getFullYear();
  const groupId = groupIdOf(req);

  const [savingsAll, loansAll, repaymentsAll] = await Promise.all([
    getCollection('monthlyContributions', groupId),
    getCollection('loans', groupId),
    getCollection('repayments', groupId)
  ]);

  const monthSavings = savingsAll.filter((s) => number(s.month) === month && number(s.year) === year);
  const monthRepayments = repaymentsAll.filter((r) => number(value(r, 'paymentMonth', 'payment_month')) === month && number(value(r, 'paymentYear', 'payment_year')) === year);

  const endOfMonth = new Date(year, month, 0);

  const loansTillDate = loansAll.filter(l => {
    const created = new Date(l.createdAt || l.issueDate || l.loanDate);
    return created <= endOfMonth && (l.status !== 'REJECTED' && l.status !== 'CANCELLED');
  });

  const repaymentsTillDate = repaymentsAll.filter(r => {
    const rMonth = number(value(r, 'paymentMonth', 'payment_month'));
    const rYear = number(value(r, 'paymentYear', 'payment_year'));
    return (rYear < year) || (rYear === year && rMonth <= month);
  });

  const totalDisbursed = loansTillDate.reduce((sum, l) => sum + number(l.principalAmount || l.principal_amount), 0);
  const totalPrincipalPaid = repaymentsTillDate.reduce((sum, r) => sum + number(value(r, 'principalAmount', 'principal_repayment_amount')), 0);
  const outstandingPrincipal = Math.max(0, totalDisbursed - totalPrincipalPaid);

  const calculatedInterest = Math.round(outstandingPrincipal * 0.02 * 100) / 100;

  const totalSavingsTillDate = savingsAll.filter(s => {
    const sMonth = number(s.month);
    const sYear = number(s.year);
    return (sYear < year) || (sYear === year && sMonth <= month);
  }).reduce((sum, s) => sum + number(s.amount), 0);

  const availableGroupBalance = Math.round((totalSavingsTillDate + calculatedInterest - outstandingPrincipal) * 100) / 100;

  const membersAll = await getCollection('users', groupId);
  const collections = calculateMemberCollections(membersAll, savingsAll, loansAll, repaymentsAll, month, year);

  res.json({
    success: true,
    month,
    year,
    summary: {
      monthSavings: monthSavings.reduce((s, x) => s + number(x.amount), 0),
      monthInterest: calculatedInterest,
      monthPrincipalRepaid: monthRepayments.reduce((s, x) => s + number(value(x, 'principalAmount', 'principal_repayment_amount')), 0),
      outstandingPrincipal,
      availableGroupBalance,
      totalPaidMembers: collections.filter(c => c.status === 'PAID').length,
      totalPendingMembers: collections.filter(c => c.status === 'PENDING').length
    },
    collections,
    savingsTransactions: monthSavings,
    repaymentTransactions: monthRepayments
  });
}

async function getPendingDuesReport(req, res) {
  const [members, savings, loans] = await Promise.all(['users', 'monthlyContributions', 'loans'].map((name) => getCollection(name, groupIdOf(req))));
  const month = number(req.query.month) || new Date().getMonth() + 1;
  const year = number(req.query.year) || new Date().getFullYear();

  const duesList = members.filter((m) => m.status !== 'INACTIVE').map((m) => {
    const paid = savings.some((s) => s.memberId === m.id && number(s.month) === month && number(s.year) === year);
    const loan = loans.find((l) => l.memberId === m.id && l.status === 'ACTIVE');
    const outstandingPrincipal = number(value(loan || {}, 'remainingAmount', 'outstanding_amount'));
    const pendingHafta = paid ? 0 : number(value(m, 'monthlyContribution', 'monthly_contribution')) || 1000;

    const pendingInterest = Math.round(outstandingPrincipal * 0.02 * 100) / 100;

    return {
      memberId: m.id,
      memberName: m.fullName || m.name,
      memberCode: m.memberCode,
      pendingHafta,
      outstandingPrincipal,
      pendingInterest,
      totalPending: pendingHafta + outstandingPrincipal + pendingInterest,
      isPending: pendingHafta > 0 || outstandingPrincipal > 0
    };
  }).filter((m) => m.isPending);

  res.json({
    success: true,
    month,
    year,
    summary: {
      totalPendingMembers: duesList.length,
      totalPendingAmount: duesList.reduce((s, d) => s + d.totalPending, 0)
    },
    duesList
  });
}

async function getLoansOverviewReport(req, res) { const loans = await getAllLoansData(groupIdOf(req)); res.json({ success: true, summary: { totalLoans: loans.length, totalPrincipalDisbursed: loans.reduce((s, l) => s + number(value(l, 'principalAmount', 'principal_amount')), 0) }, loans }); }
async function getAllLoansData(groupId) { return getCollection('loans', groupId); }

async function getMonthlyBalanceReport(req, res) {
  try {
    const { fromDate, toDate } = req.query;
    const groupId = groupIdOf(req);

    const [savings, loans, repayments, groupDoc] = await Promise.all([
      getCollection('monthlyContributions', groupId),
      getCollection('loans', groupId),
      getCollection('repayments', groupId),
      db.collection('groups').doc(groupId).get()
    ]);

    const groupName = groupDoc.exists ? (groupDoc.data().groupName || groupDoc.data().group_name) : 'Bachat Gat';

    const report = calculateMonthlyBalanceReport(savings, loans, repayments, fromDate, toDate);

    res.json({
      success: true,
      groupName,
      ...report
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { register, login, getMe, updateProfile, getGroupDetails, updateGroupDetails, getAllMembers, getMemberById, createMember, updateMember, deleteMember, getAllSavings, recordSavings, updateSavings, getAllLoans, getLoanById, createLoan, recordLoanRepayment, getLoanRepayments, getDashboardSummary, getMonthlyProgress, getRecentActivities, getNotifications, markNotificationAsRead, markAllNotificationsAsRead, getMonthlyReport, getPendingDuesReport, getLoansOverviewReport, getMonthlyBalanceReport };
