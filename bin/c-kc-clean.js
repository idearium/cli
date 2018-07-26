#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { loadConfig, reportError } = require('./lib/c');
const getPropertyPath = require('get-value');

program
    .arguments('<location>')
    .description('Provide a Docker location and all Docker images from that location will be cleaned. Pass `all` as the location to clean all locations.')
    .parse(process.argv);

const [location] = program.args;

if (!location) {
    return reportError(new Error('You need to provide a Docker location'), program);
}

return loadConfig()
    .then((config) => {

        // Kubernetes prefix
        const prefix = exec('c project prefix -n', { silent: true }).stdout;

        return Promise.all([prefix, config]);

    })
    .then(([prefix, config]) => {

        const locations = location === 'all' ? Object.keys(getPropertyPath(config, 'docker.locations')) : [location];

        return Promise.all([prefix, locations]);

    })
    .then(([prefix, locations]) => {

        locations.forEach((loc) => {

            exec(`docker rmi -f $(docker images --filter reference=${prefix}/${loc} -q --no-trunc)`);

        });

    });
