import licenseService from '../../server/src/services/licenseService.js';

export function createLicenseHandler(successMessage) {
  return function licenseHandler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ success: false, valid: false, message: 'Method not allowed.' });
    }

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const result = licenseService.validateLicense({
        machineId: body.machineId,
        key: body.key,
        secret: process.env.LICENSE_SIGNING_SECRET,
      });
      return res.status(200).json({ ...result, message: successMessage });
    } catch (error) {
      const statusCode = error.statusCode === 503 ? 503 : 400;
      return res.status(statusCode).json({
        success: false,
        valid: false,
        message: statusCode === 503
          ? 'Licence service is unavailable.'
          : 'The licence key is invalid or expired.',
      });
    }
  };
}
