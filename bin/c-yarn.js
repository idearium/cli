'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command(
        'proxy <location> [cmd...]',
        'Run a Yarn command against an NPM location.'
    )
    .parse(process.argv);

missingCommand(program);
