const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');

const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test('organisation members can read licence but clients cannot write it', {
  skip: !emulatorEnabled,
}, async () => {
  const testEnv = await initializeTestEnvironment({
    projectId: 'shared-licence-rules-test',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'member-a'), { groupId: 'org-a', role: 'member', role_name: 'MEMBER' });
    await setDoc(doc(db, 'users', 'member-b'), { groupId: 'org-b', role: 'member', role_name: 'MEMBER' });
    await setDoc(doc(db, 'organisations', 'org-a', 'licence', 'current'), { status: 'active' });
  });

  const ownDb = testEnv.authenticatedContext('member-a').firestore();
  const otherDb = testEnv.authenticatedContext('member-b').firestore();
  const unauthenticatedDb = testEnv.unauthenticatedContext().firestore();
  const reference = doc(ownDb, 'organisations', 'org-a', 'licence', 'current');

  await assertSucceeds(getDoc(reference));
  await assertFails(setDoc(reference, { status: 'revoked' }));
  await assertFails(getDoc(doc(otherDb, 'organisations', 'org-a', 'licence', 'current')));
  await assertFails(getDoc(doc(unauthenticatedDb, 'organisations', 'org-a', 'licence', 'current')));
  await testEnv.cleanup();
});
