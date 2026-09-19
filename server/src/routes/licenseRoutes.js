const express = require('express');
const { activateLicense, verifyLicense } = require('../controllers/licenseController');

const router = express.Router();

router.post('/activate', activateLicense);
router.post('/verify', verifyLicense);

module.exports = router;
