import assert from 'node:assert/strict';
import test from 'node:test';

import activate from '../api/license/activate.js';
import verify from '../api/license/verify.js';

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

for (const [path, handler] of [
  ['/api/license/activate', activate],
  ['/api/license/verify', verify],
]) {
  test(`${path} exists and requires POST`, async () => {
    const response = responseRecorder();
    await handler({ method: 'GET', headers: {} }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.valid, false);
  });

  test(`${path} requires Firebase authentication`, async () => {
    const response = responseRecorder();
    await handler({ method: 'POST', headers: {}, body: {} }, response);
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 'unauthenticated');
  });
}
