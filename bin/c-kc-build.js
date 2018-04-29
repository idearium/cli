#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { loadConfig, reportError, storeState } = require('./lib/c');
const getPropertyPath = require('get-value');

program
    .arguments('<location>')
    .description('Provide a Docker location and the Dockerfile will be used to build a Docker image. Pass `all` as the location to build all locations.')
    .parse(process.argv);

const [location] = program.args;

if (!location) {
    return reportError(new Error('You need to provide a Docker location'), program);
}

return loadConfig()
    .then((config) => {

        // Kubernetes prefix
        const prefix = getPropertyPath(config, 'kubernetes.prefix');

        if (!prefix) {
            return reportError(new Error('You need to provide a Kubernetes prefix configuration'), false, true);
        }

        return Promise.all([prefix, config]);

    })
    .then(([prefix, config]) => {

        const locations = location === 'all' ? Object.keys(getPropertyPath(config, 'docker.locations')) : [location];

        return Promise.all([prefix, config, locations]);

    })
    .then(([prefix, config, locations]) => {

        locations.forEach((loc) => {

            const dockerfilePath = getPropertyPath(config, `docker.locations.${loc}`);

            if (!dockerfilePath) {
                return reportError(new Error(`Could not find the ${loc} Docker location.`), false, true);
            }

            const tag = String(Math.floor(Date.now() / 1000));
            const cmd = `c d build -n ${prefix}/${loc} -t ${tag} ${loc}`;

            exec(cmd, (err, stdout, stderr) => {

                if ((err || stderr) && stderr) {
                    return reportError(stderr, false, true);
                }

                if ((err || stderr) && err) {
                    return reportError(err, false, true);
                }

                storeState(`kubernetes.build.tags.${prefix}/${loc}`, tag);

            });

        });

    });
