const originalConfig = require('@j.u.p.iter/jupiter-scripts/dist/lib/config/jest.config');

module.exports = {
  ...originalConfig,
  watchPathIgnorePatterns: ['/cache/'],
  coverageThreshold: null, 
};
