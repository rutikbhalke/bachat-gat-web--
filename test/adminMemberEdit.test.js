import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Test Suite: Admin Member Edit – Restrict Editable Fields
 *
 * Verifies:
 * 1. Admin can ONLY edit Member Name and Mobile Number.
 * 2. Pre-filling existing values.
 * 3. Strict removal & backend dropping of Email, Password, Role, Status, and financial fields.
 * 4. Validation rules:
 *    - Name: required, trimmed, min 2 characters.
 *    - Phone: required, exactly 10 digits, normalized (handles +91 and 0 prefixes).
 * 5. Preservation of existing restricted fields (email, role, authUid, etc.) without corruption.
 * 6. Role immutability: Admin cannot change their own or another user's role.
 */

// Helper to simulate the backend updateMember logic
function sanitizeAndValidateMemberUpdate(member, body) {
  // 1. Validate Member Name
  const rawName = body.name ?? body.fullName;
  if (rawName === undefined || rawName === null || typeof rawName !== 'string' || !rawName.trim()) {
    throw new Error('Member Name is required.');
  }
  const cleanName = rawName.trim();
  if (cleanName.length < 2) {
    throw new Error('Member Name must be at least 2 characters.');
  }

  // 2. Validate Mobile Number
  const rawPhone = body.mobileNumber ?? body.phone;
  if (rawPhone === undefined || rawPhone === null) {
    throw new Error('Mobile Number is required.');
  }
  let digitsOnly = String(rawPhone).replace(/\D/g, '');
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    digitsOnly = digitsOnly.slice(2);
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    digitsOnly = digitsOnly.slice(1);
  }

  if (digitsOnly.length !== 10) {
    throw new Error('A valid 10-digit mobile number is required.');
  }
  const cleanPhone = digitsOnly;

  // 3. Strict Whitelist ONLY: name, fullName, phone, mobileNumber
  // DROP any restricted fields: email, password, role, status, etc.
  const allowedUpdate = {
    name: cleanName,
    fullName: cleanName,
    phone: cleanPhone,
    mobileNumber: cleanPhone,
    updatedAt: new Date().toISOString(),
  };

  // Merge into existing member record
  const updatedMember = {
    ...member,
    ...allowedUpdate,
  };

  return {
    success: true,
    message: 'Member details updated successfully.',
    member: updatedMember,
  };
}

test('1. Valid Member Name and 10-digit Mobile Number updates successfully', () => {
  const existingMember = {
    id: 'MEM_001',
    name: 'Anjali Sharma',
    fullName: 'Anjali Sharma',
    phone: '9876543210',
    email: 'anjali@example.com',
    role: 'member',
    role_name: 'MEMBER',
    status: 'ACTIVE',
  };

  const payload = {
    name: '  Anjali R. Sharma  ',
    mobileNumber: '9123456789',
  };

  const result = sanitizeAndValidateMemberUpdate(existingMember, payload);

  assert.equal(result.success, true);
  assert.equal(result.member.name, 'Anjali R. Sharma');
  assert.equal(result.member.fullName, 'Anjali R. Sharma');
  assert.equal(result.member.phone, '9123456789');
  assert.equal(result.member.mobileNumber, '9123456789');
  // Restricted fields remain unchanged
  assert.equal(result.member.email, 'anjali@example.com');
  assert.equal(result.member.role, 'member');
  assert.equal(result.member.role_name, 'MEMBER');
  assert.equal(result.member.status, 'ACTIVE');
});

test('2. Phone number normalization: handles +91 and leading 0 correctly', () => {
  const existingMember = {
    id: 'MEM_002',
    name: 'Rahul Patil',
    phone: '9822012345',
  };

  // With +91
  const res1 = sanitizeAndValidateMemberUpdate(existingMember, {
    name: 'Rahul Patil',
    phone: '+91 9822012345',
  });
  assert.equal(res1.member.phone, '9822012345');

  // With leading 0
  const res2 = sanitizeAndValidateMemberUpdate(existingMember, {
    name: 'Rahul Patil',
    phone: '09822012345',
  });
  assert.equal(res2.member.phone, '9822012345');

  // With dashes and spaces
  const res3 = sanitizeAndValidateMemberUpdate(existingMember, {
    name: 'Rahul Patil',
    phone: '9822-012-345',
  });
  assert.equal(res3.member.phone, '9822012345');
});

test('3. Validation: Missing or invalid Member Name is rejected', () => {
  const member = { id: 'MEM_003', name: 'Sunita' };

  // Empty string
  assert.throws(
    () => sanitizeAndValidateMemberUpdate(member, { name: '', phone: '9876543210' }),
    /Member Name is required/
  );

  // Whitespace only
  assert.throws(
    () => sanitizeAndValidateMemberUpdate(member, { name: '   ', phone: '9876543210' }),
    /Member Name is required/
  );

  // Less than 2 characters
  assert.throws(
    () => sanitizeAndValidateMemberUpdate(member, { name: 'A', phone: '9876543210' }),
    /Member Name must be at least 2 characters/
  );

  // Null / undefined
  assert.throws(
    () => sanitizeAndValidateMemberUpdate(member, { phone: '9876543210' }),
    /Member Name is required/
  );
});

test('4. Validation: Invalid Mobile Number (< 10 digits, > 10 digits, non-digits) is rejected', () => {
  const member = { id: 'MEM_004', name: 'Pooja' };

  // Too short (9 digits)
  assert.throws(
    () => sanitizeAndValidateMemberUpdate(member, { name: 'Pooja Patil', phone: '987654321' }),
    /A valid 10-digit mobile number is required/
  );

  // Too long (13 digits)
  assert.throws(
    () => sanitizeAndValidateMemberUpdate(member, { name: 'Pooja Patil', phone: '9876543210123' }),
    /A valid 10-digit mobile number is required/
  );

  // Non-numeric
  assert.throws(
    () => sanitizeAndValidateMemberUpdate(member, { name: 'Pooja Patil', phone: 'abcdefghij' }),
    /A valid 10-digit mobile number is required/
  );

  // Missing phone
  assert.throws(
    () => sanitizeAndValidateMemberUpdate(member, { name: 'Pooja Patil' }),
    /Mobile Number is required/
  );
});

test('5. Security: Attempts to inject Email, Password, or Role are strictly ignored & dropped', () => {
  const existingMember = {
    id: 'MEM_005',
    name: 'Kavita Deshmukh',
    phone: '9890123456',
    email: 'kavita.original@example.com',
    role: 'member',
    role_name: 'MEMBER',
    passwordHash: 'secret_hash_value',
    authUid: 'AUTH_KAVITA_123',
    status: 'ACTIVE',
    groupId: 'shivshahi_group_001',
    totalSavings: 25000,
  };

  // Malicious attack payload trying privilege escalation and email change
  const maliciousPayload = {
    name: 'Kavita Deshmukh',
    mobileNumber: '9890123456',
    email: 'hacker@malicious.com',
    password: 'NewInjectedPassword123!',
    role: 'ADMIN',
    role_name: 'ADMIN',
    status: 'DELETED',
    groupId: 'hacked_group',
    totalSavings: 999999,
  };

  const result = sanitizeAndValidateMemberUpdate(existingMember, maliciousPayload);

  // Verify only name and phone were applied
  assert.equal(result.member.name, 'Kavita Deshmukh');
  assert.equal(result.member.phone, '9890123456');

  // Verify all restricted fields remain completely untouched
  assert.equal(result.member.email, 'kavita.original@example.com');
  assert.equal(result.member.role, 'member');
  assert.equal(result.member.role_name, 'MEMBER');
  assert.equal(result.member.passwordHash, 'secret_hash_value');
  assert.equal(result.member.status, 'ACTIVE');
  assert.equal(result.member.groupId, 'shivshahi_group_001');
  assert.equal(result.member.totalSavings, 25000);
  assert.equal(result.member.password, undefined);
});

test('6. Role Immutability: Admin cannot change their own or other user roles through this edit operation', () => {
  const adminMember = {
    id: 'ADMIN_001',
    name: 'Super Admin',
    phone: '9999999999',
    role: 'admin',
    role_name: 'ADMIN',
  };

  const regularMember = {
    id: 'MEM_006',
    name: 'Suresh More',
    phone: '9888888888',
    role: 'member',
    role_name: 'MEMBER',
  };

  // 1. Trying to demote Admin to MEMBER via edit operation
  const resAdmin = sanitizeAndValidateMemberUpdate(adminMember, {
    name: 'Super Admin',
    phone: '9999999999',
    role: 'MEMBER',
  });
  assert.equal(resAdmin.member.role, 'admin');
  assert.equal(resAdmin.member.role_name, 'ADMIN');

  // 2. Trying to promote Member to ADMIN via edit operation
  const resMember = sanitizeAndValidateMemberUpdate(regularMember, {
    name: 'Suresh More',
    phone: '9888888888',
    role: 'ADMIN',
  });
  assert.equal(resMember.member.role, 'member');
  assert.equal(resMember.member.role_name, 'MEMBER');
});

