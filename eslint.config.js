const iobrokerConfig = require("@iobroker/eslint-config");

module.exports = [
    {
        ignores: ["dist/**", "build/**", "node_modules/**"],
    },
    ...iobrokerConfig,
];
