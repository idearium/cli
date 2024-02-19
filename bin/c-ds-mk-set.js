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
    .arguments('<mk-name>')
    .description("Set your Minikube's name.")
    .parse(process.argv);

const [name] = program.args;

if (!name) {
    return reportError(
        new Error("You must provide your Minikube's name."),
        program
    );
}

const run = async () => {
    try {
        await storeState('mkName', name, stateFilePath(devspacePath()));
    } catch (err) {
        reportError(err, program, true);
    }
};

run();
