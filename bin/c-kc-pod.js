#!/usr/bin/env node
'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { newline, reportError } = require('./lib/c');

program
    .arguments('<location>')
    .option('-r [replica]', 'The replica index of a pod, defaults to one.')
    .option('-n', 'Do not print the trailing newline character.')
    .description('Get the name of a pod for a Kubernetes location')
    .parse(process.argv);

const [location] = program.args;
const { R: replica = 0 } = program;

if (!location) {
    return reportError(new Error('You need to provide a Kubernetes location'), program, true);
}

const name = exec(`c kc cmd get pods --selector=svc=${location} --output=jsonpath={.items[${replica}].metadata.name}`, { silent: true }).stdout;

process.stdout.write(`${name}${newline(program.N)}`);
