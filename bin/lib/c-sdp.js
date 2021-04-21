'use strict';

const path = require('path');

const inSubmodule = (submodulePath, command) => {
    const cwd = path.join(process.cwd(), submodulePath);

    return `cd ${cwd} && ${command}`;
};

const submoduleExists = (submodules, submodule) =>
    Object.keys(submodules).includes(submodule);

module.exports = {
    inSubmodule,
    submoduleExists,
};
