#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .command('restart', 'Restart minikube')
    .command('start', 'Start minikube')
    .command('stop', 'Stop minikube')
    .parse(process.argv);

missingCommand(program);
