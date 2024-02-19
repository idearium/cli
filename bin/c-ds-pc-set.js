#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander');
const {
    devspacePath,
    reportError,
    stateFilePath,
    storeState,
} = require('./lib/c');

program
    .arguments('<pc-name>')
    .description("Set your pc's name.")
    .parse(process.argv);

const [name] = program.args;

if (!name) {
    return reportError(
        new Error("You must provide your computer's name."),
        program
    );
}

const run = async () => {
    try {
        await storeState('pcName', name, stateFilePath(devspacePath()));
    } catch (err) {
        reportError(err, program, true);
    }
};

run();
