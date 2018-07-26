#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('get', 'Get the current context of kubectrl.')
    .command('set', 'Set the current context of kubectrl.')
    .parse(process.argv);

missingCommand(program);
