const { getGroupDetails, updateGroupDetails } = require('./firebaseController');
const { resetCleanData, getResetPreview } = require('./adminResetController');

module.exports = {
  getGroupDetails,
  updateGroupDetails,
  resetCleanData,
  getResetPreview,
};
