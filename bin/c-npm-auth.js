#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { npmAuthToken } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('[service]')
    .parse(process.argv);

npmAuthToken()
    .then((token) => process.stdout.write(token));
