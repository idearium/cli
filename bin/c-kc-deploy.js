#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { loadConfig, loadState, reportError } = require('./lib/c');

program
    .arguments('<location>')
    .description('Provide a Docker location and the associated Kubernetes location will be redployed with the latest build tag.')
    .parse(process.argv);

const [location] = program.args;

if (!location) {
    return reportError(new Error('You need to provide a Docker location'), program);
}

return loadState()
    .then((state) => {

        return Promise.all([
            state,
            loadConfig(`kubernetes.environments.${state.env}.locations`)
                .then(locations => new Promise((resolve, reject) => {

                    const keys = Object.keys(locations);

                    for (let keysIndex = 0; keysIndex < keys.length; keysIndex++) {

                        locations[keys[keysIndex]].forEach((service) => {

                            if (service.dockerLocation && service.dockerLocation === location) {
                                return resolve(service);
                            }

                        });

                    }

                    return reject(new Error(`Could not find a Kubernetes location that uses the ${location} Docker location.`));

                })),
        ]);

    })
    .then(([state, service]) => {

        const prefix = exec('c project prefix -n', { silent: true }).stdout;
        const tag = state.kubernetes.build.tags[`${prefix}/${location}`];
        const cmd = `kubectl set image ${service.type}/${location} ${location}=${prefix}/${location}:${tag}`;

        exec(cmd);

    });
