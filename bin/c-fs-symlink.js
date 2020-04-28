#!/usr/bin/env node

'use strict';

const program = require('commander');
const { symlink } = require('fs');
const { resolve } = require('path');
const { promisify } = require('util');
const { reportError } = require('./lib/c');

const link = promisify(symlink);

program
    .arguments('<from> <to>')
    .description(
        'Create a symlink at the <to> directory, pointing to the <from> directory.'
    )
    .parse(process.argv);

const [from, to] = program.args;

if (!(from && to)) {
    return reportError(
        new Error('You must pass the from and to arguments.'),
        program
    );
}

link(resolve(process.cwd(), from), resolve(process.cwd(), to)).catch(
    reportError
);
