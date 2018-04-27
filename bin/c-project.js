#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('env', 'Configure the projects environment.')
    .parse(process.argv);

missingCommand(program);
