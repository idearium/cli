#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { loadConfig, loadState, reportError } = require('./lib/c');

program
    .option('-c [context]', 'The context you\'d like to use. Used to override values in c.js.')
    .option('-n [namespace]', 'The namespace you\'d like to use. Used to override values in c.js.')
    .option('-s', 'Do not print any output.')
    .parse(process.argv);

/**
 * Give a context and namespace, setup kubectl.
 * @param {String} context The context to use.
 * @param {String} namespace The namespace to use.
 * @returns {void}
 */
const runCommand = (context, namespace) => {

    exec(`kubectl config use-context ${context} --namespace=${namespace}`, { silent: program.S }, (err, stdout, stderr) => {

        if (stderr) {
            reportError(new Error(stderr), false, true);
        }

        if (err) {
            reportError(err, false, true);
        }

    });

};

// If they were provided directly, we don't need to load any configuration.
if (program.C && program.N) {
    return runCommand(program.C, program.N);
}

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

        runCommand(context, namespace);

    })
    .catch((err) => {

        if (err.code === 'ENOENT') {
            return reportError(new Error('Please create a c.json file with your project configuration. See https://github.com/idearium/cli#configuration'), false, true);
        }

        return reportError(err, false, true);

    });
