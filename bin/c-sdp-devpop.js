'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('open', 'Open the devpop UI in the browser.')
    .parse(process.argv);

missingCommand(program);
