#!/usr/bin/env node

'use strict';

const program = require('commander-latest');
const { exec } = require('shelljs');

const { loadConfig, reportError } = require('./lib/c');
const { submoduleExists, inSubmodule } = require('./lib/c-sdp');

// The basic program, which uses sub-commands.
program
    .description('Executes a git command against the sectionio submodule.')
    .allowUnknownOption(true)
    .arguments('<cmd>')
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

    const { path } = submodules[submodule];
    exec(inSubmodule(path, `git ${program.args.join(' ')}`));
});
