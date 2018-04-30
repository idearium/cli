#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { loadConfig, loadState, reportError } = require('./lib/c');

program
    .option('-s', 'Do not print any output.')
    .parse(process.argv);

return loadState()
    .then((state) => {

        return loadConfig(`kubernetes.environments.${state.env}`);

    })
    .then((environment) => {

        return Promise.all([
            environment,
            exec('c project prefix -e -n', { silent: true }).stdout,
        ]);

    })
    .then(([environment, namespace]) => {

        const { context } = environment;

        exec(`kubectl config set-context ${context} --namespace=${namespace}`, { silent: program.S }, (err, stdout, stderr) => {

            if (stderr) {
                reportError(new Error(stderr), false, true);
            }

            if (err) {
                reportError(err, false, true);
            }

        });

    })
    .catch((err) => {

        if (err.code === 'ENOENT') {
            return reportError(new Error('Please create a c.json file with your project configuration. See https://github.com/idearium/cli#configuration'), false, true);
        }

        return reportError(err, false, true);

    });
