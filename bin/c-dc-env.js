'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('file <value>', 'Set the COMPOSE_FILE value.')
    .parse(process.argv);

missingCommand(program);
