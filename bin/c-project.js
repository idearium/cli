#!/usr/bin/env node

'use strict';

const program = require('commander');
const { missingCommand } = require('./lib/c');

program
    .command('bump', 'Shortcuts to version bump projects.')
    .command('env', 'Configure the projects environment.')
    .command('init', 'Initialize a new project and create a c.js file.')
    .command('name', 'Get the projects name.')
    .command('organisation', 'Get the projects organisation.')
    .command('prefix', 'Get the projects prefix.')
    .parse(process.argv);

missingCommand(program);
