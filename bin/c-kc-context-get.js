#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');

program
    .parse(process.argv);

exec('kubectl config current-context');
