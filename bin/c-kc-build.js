#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { dockerToKubernetesLocation, loadConfig, loadState, reportError, storeState } = require('./lib/c');
const getPropertyPath = require('get-value');

program
    .arguments('<location>')
    .option('-d', 'Also deploy the location(s).')
    .description('Provide a Docker location and the Dockerfile will be used to build a Docker image. Pass `all` as the location to build all locations.')
    .parse(process.argv);

const [location] = program.args;

if (!location) {
    return reportError(new Error('You need to provide a Docker location'), program);
}

return loadConfig()
    .then((config) => {

        const prefix = exec('c project prefix -n', { silent: true }).stdout;

        return Promise.all([prefix, config]);

    })
    .then(([prefix, config]) => {

        const locations = location === 'all' ? Object.keys(getPropertyPath(config, 'docker.locations')) : [location];

        return Promise.all([prefix, config, locations]);

    })
    .then(([prefix, config, locations]) => {

        return Promise.all([
            loadState(),
            config,
            Promise.all(locations.map(loc => new Promise((resolve, reject) => {

                const dockerfilePath = getPropertyPath(config, `docker.locations.${loc}`);

                if (!dockerfilePath) {
                    return reportError(new Error(`Could not find the ${loc} Docker location.`), false, true);
                }

                const tag = String(Math.floor(Date.now() / 1000));
                const cmd = `c d build -n ${prefix}/${loc} -t ${tag} ${loc}`;

                exec(cmd, (err, stdout, stderr) => {

                    if ((err || stderr) && stderr) {
                        return reject(new Error(stderr));
                    }

                    if ((err || stderr) && err) {
                        return reject(err);
                    }

                    storeState(`kubernetes.build.tags.${prefix}/${loc}`, tag)
                        .then(() => resolve(loc))
                        .catch(reject);

                });

            }))),
        ]);

    })
    .then(([state, config, locations]) => {

        // Do we need to build too?
        if (!program.D) {
            return;
        }

        const kubernetesLocations = getPropertyPath(config, `kubernetes.environments.${state.env}.locations`);

        locations.forEach((dockerLocation) => {

            dockerToKubernetesLocation(dockerLocation, kubernetesLocations)
                .then((kLocation) => {

                    exec(`c kc deploy ${kLocation.dockerLocation}`);

                });

        });

    });
