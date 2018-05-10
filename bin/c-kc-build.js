#!/usr/bin/env node

'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { dockerToKubernetesLocation, loadConfig, loadState, storeState } = require('./lib/c');
const getPropertyPath = require('get-value');

program
    .arguments('<location>')
    .option('-d', 'Also deploy the location(s).')
    .description('Provide a Docker location and the Dockerfile will be used to build a Docker image. If you don\'t pass a location, all locations will be built.')
    .parse(process.argv);

const [location = 'all'] = program.args;

return loadConfig()
    .then((config) => {

        const prefix = exec('c project prefix -n', { silent: true }).stdout;

        return Promise.all([prefix, config]);

    })
    .then(([prefix, config]) => {

        const locations = location === 'all' ? Object.keys(getPropertyPath(config, 'docker.locations')) : [location];

        return Promise.all([
            prefix,
            config,
            loadState(),
            locations,
        ]);

    })
    .then(([prefix, config, state, locations]) => {

        return Promise.all([
            state,
            config,
            Promise.all(locations.map(loc => new Promise((resolve, reject) => {

                const dockerfilePath = getPropertyPath(config, `docker.locations.${loc}`);

                if (!dockerfilePath) {
                    return reject(new Error(`Could not find the ${loc} Docker location.`), false, true);
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

                    storeState(`kubernetes.environments.${state.env}.build.tags.${prefix}/${loc}`, tag)
                        .then(() => resolve(loc))
                        .catch(reject);

                });

            }))),
        ]);

    })
    .then(([state, config, locations]) => {

        // Do we need to build too?
        if (!program.D) {
            return Promise.resolve();
        }

        const kubernetesLocations = getPropertyPath(config, `kubernetes.environments.${state.env}.locations`);

        locations.forEach((dockerLocation) => {

            return dockerToKubernetesLocation(dockerLocation, kubernetesLocations)
                .then((kLocation) => {

                    exec(`c kc deploy ${kLocation.dockerLocation}`);

                });

        });

    })
    // eslint-disable-next-line handle-callback-err, no-unused-vars, no-empty-function
    .catch((err) => {});
