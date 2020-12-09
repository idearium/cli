#!/usr/bin/env -S node --trace-warnings
'use strict';

const program = require('commander');
const inquirer = require('inquirer');
const { exec } = require('shelljs');
const {
    kubernetesLocationsToObjects,
    loadConfig,
    loadState,
    reportError,
} = require('./lib/c');
const getPropertyPath = require('get-value');

program
    .arguments('<location>')
    .description(
        'Stop all (or a specific) Kubernetes locations. Only deployment, ingress, pod, secret and service objects are removed. <location> defaults to `all`.'
    )
    .parse(process.argv);

const [location = 'all'] = program.args;

return Promise.all([loadState(), loadConfig()])
    .then(([state, config]) => {
        if (state.env === 'local') {
            return [state, config];
        }

        return inquirer
            .prompt([
                {
                    default: false,
                    message:
                        "You're in production mode and stopping everything is destructive. Are you sure you would like to continue?",
                    name: 'continue',
                    type: 'confirm',
                },
            ])
            .then((answers) => {
                if (answers.continue) {
                    return [state, config];
                }

                // eslint-disable-next-line no-process-exit
                process.exit(0);
            });
    })
    .then(([state, config]) => {
        let jsonPath = `kubernetes.environments.${state.env}.locations`;

        if (location !== 'all') {
            jsonPath = `${jsonPath}.${location}`;
        }

        let locations = getPropertyPath(config, jsonPath);

        if (location !== 'all') {
            locations = { [location]: locations };
        }

        return locations;
    })
    .then((locations) => {
        kubernetesLocationsToObjects(locations)
            .filter((service) =>
                ['deployment', 'ingress', 'pod', 'secret', 'service'].includes(
                    service.type
                )
            )
            .forEach((service) =>
                exec(`c kc cmd delete ${service.type} ${service.location}`)
            );
    })
    .catch((err) => {
        if (err.code === 'ENOENT') {
            return reportError(
                new Error(
                    'Please create a c.js file with your project configuration. See https://github.com/idearium/cli#configuration'
                ),
                false,
                true
            );
        }

        return reportError(err, false, true);
    });
