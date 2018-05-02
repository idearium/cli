#!/usr/bin/env node
'use strict';

const program = require('commander');
const { exec } = require('shelljs');

program
    .arguments('<selector>')
    .description('Output logs from all Kubernetes pods. The selector defaults to `--selector svc`.')
    .parse(process.argv);

// Default the selector.
const [selector = 'svc'] = program.args;

exec(`stern --color always --selector ${selector}`);
