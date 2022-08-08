'use strict';

const program = require('commander-latest');
const { exec } = require('shelljs');

const { loadConfig, reportError } = require('./lib/c');
const { submoduleExists } = require('./lib/c-sdp');

program
    .description('Pushes the submodule state to the local devpop remote.')
    .requiredOption(
        '-s, --submodule <name>',
        'The name of the section submodule as defined in c.js'
    )
    .parse(process.argv);

loadConfig('section').then((submodules) => {
    const { submodule } = program.opts();

    if (!submoduleExists(submodules, submodule)) {
        return reportError(
            new Error('The submodule name you provided does not exist in c.js'),
            program
        );
    }

    exec(`yarn c sdp gm cmd -s ${submodule} push developer-pop`);
});
