#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');

// The basic program, which uses sub-commands.
program.parse(process.argv);

exec('docker images');
