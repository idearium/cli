#!/usr/bin/env -S node

'use strict';

const program = require('commander');
const {
    devspacePath,
    reportError,
    stateFilePath,
    storeState,
} = require('./lib/c');

program
    .arguments('<dev-name>')
    .description("Set your dev computer's name.")
    .parse(process.argv);

const [name] = program.args;

if (!name) {
    return reportError(
        new Error("You must provide your dev computer's name."),
        program
    );
}

const run = async () => {
    try {
        await storeState('devName', name, stateFilePath(devspacePath()));
    } catch (err) {
        reportError(err, program, true);
    }
};

run();
