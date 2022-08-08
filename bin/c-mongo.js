'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('connect [env]', 'Connect to a remote database.')
    .command('download [env]', 'Download the data from a remote database.')
    .command('import [env]', 'Import downloaded data.')
    .command('sync [env]', 'Download and import data from a remote database.')
    .parse(process.argv);

missingCommand(program);
