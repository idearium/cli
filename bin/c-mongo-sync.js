#!/usr/bin/env node

'use strict';

const program = require('commander');
const { spawn } = require('child_process');
const { reportError } = require('./lib/c');

// The basic program, which uses sub-commands.
program
    .arguments('[env]').arguments('<collection>')
    .description('Syncronise all or a specific collection from a remote Mongo database to the local. If you don\'t provide a collection, all will be synced.')
    .parse(process.argv);

if (!program.args.length) {
    return reportError(new Error('Please provide an environment'), program);
}

const [env, collection] = program.args;

if (env.toLowerCase() === 'local') {
    return reportError(new Error('You cannot sync the local database'), program);
}

let collectionArg = '';

if (collection) {
    collectionArg = ` ${collection}`;
}

spawn(`c mongo download ${env}${collectionArg} && c mongo import ${env}${collectionArg}`, {
    shell: true,
    stdio: 'inherit',
});
