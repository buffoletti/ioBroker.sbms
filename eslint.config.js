const iobrokerConfig = require("@iobroker/eslint-config");

module.exports = {
    ...iobrokerConfig,
    ignorePatterns: ["dist/**", "build/**", "node_modules/**"], // replaces .eslintignore
};
