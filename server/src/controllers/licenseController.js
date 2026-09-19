const { validateLicense } = require('../services/licenseService');

function respondWithValidation(req, res, successMessage) {
  try {
    const result = validateLicense({
      machineId: req.body?.machineId,
      key: req.body?.key,
      secret: process.env.LICENSE_SIGNING_SECRET,
    });
    return res.json({ ...result, message: successMessage });
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 400;
    return res.status(statusCode).json({
      success: false,
      valid: false,
      message: statusCode === 503
        ? 'Licence service is unavailable.'
        : error.message || 'The licence key is invalid or expired.',
    });
  }
}

function activateLicense(req, res) {
  return respondWithValidation(req, res, 'Licence activated successfully.');
}

function verifyLicense(req, res) {
  return respondWithValidation(req, res, 'Licence verified successfully.');
}

module.exports = { activateLicense, verifyLicense };
