#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('d <command>', 'Shortcuts to control Docker.')
    .command('dc <command>', 'Shortcuts to control Docker Compose.')
    .command('hosts <command>', 'Shortcuts to help with hosts management.')
    .command('mk <command>', 'Shortcuts to control Minikube.')
    .command('npm <command>', 'Shortcuts to help with NPM.')
    .command('yarn <command>', 'Shortcuts to help with Yarn.')
    .parse(process.argv);

missingCommand(program);
