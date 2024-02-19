'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program.command('prune', 'Removes unused dangling images.').parse(process.argv);

missingCommand(program);
