'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command(
        'cmd',
        "Execute a kubectl command against Section's devpop kubernetes cluster"
    )
    .parse(process.argv);

missingCommand(program);
