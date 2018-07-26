#!/usr/bin/env node
'use strict';

const program = require('commander');
const inquirer = require('inquirer');
const { exec } = require('shelljs');
const { kubernetesLocationsToObjects, loadConfig, loadState, reportError } = require('./lib/c');

program
    .description('Stop all Kubernetes locations. Only deployment, ingress, pod, secret and service objects are removed, all other types will remain.')
    .parse(process.argv);

return loadState()
    .then((state) => {

        if (state.env === 'local') {
            return state;
        }

        return inquirer
            .prompt([
                {
                    'default': false,
                    'message': 'You\'re in production mode and stopping everything is destructive. Are you sure you would like to continue?',
                    'name': 'continue',
                    'type': 'confirm',
                },
            ])
            .then((answers) => {

                if (answers.continue) {
                    return state;
                }

                // eslint-disable-next-line no-process-exit
                process.exit(0);

            });

    })
    .then(state => loadConfig(`kubernetes.environments.${state.env}.locations`))
    .then((locations) => {

        kubernetesLocationsToObjects(locations)
            .filter(service => ['deployment', 'ingress', 'pod', 'secret', 'service'].includes(service.type))
            .forEach(service => exec(`c kc cmd delete ${service.type} ${service.location}`));

    })
    .catch((err) => {

        if (err.code === 'ENOENT') {
            return reportError(new Error('Please create a c.js file with your project configuration. See https://github.com/idearium/cli#configuration'), false, true);
        }

        return reportError(err, false, true);

    });
