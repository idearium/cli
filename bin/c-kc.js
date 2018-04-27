#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('context', 'Get and set the kubectrl context.')
    .parse(process.argv);

missingCommand(program);
