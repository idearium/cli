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
    .arguments('<handle>')
    .description('Set your Idearium handle.')
    .parse(process.argv);

const [handle] = program.args;

if (!handle) {
    return reportError(
        new Error('You must provide your Idearium handle.'),
        program
    );
}

const run = async () => {
    const file = stateFilePath(devspacePath());

    try {
        await storeState('handle', handle, file);
        await storeState('mkName', `${handle}-minikube`, file);
        await storeState('pcName', `${handle}-macbook`, file);
    } catch (err) {
        reportError(err, program, true);
    }
};

run();
