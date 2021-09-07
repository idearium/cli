#!/usr/bin/env -S node --trace-warnings

'use strict';

const program = require('commander-latest');
const { exec } = require('shelljs');
const {
    dockerToKubernetesLocation,
    loadConfig,
    loadState,
    storeState,
} = require('./lib/c');
const getPropertyPath = require('get-value');
const {
    flagBuildArgs,
    formatBuildArgs,
    validateBuildArgs,
} = require('./lib/c-kc');

program
    .arguments('<location>')
    .option('-d', 'Also deploy the location(s).')
    .option('-t, --tag <tag>', 'A tag for the generated Docker image(s).')
    .option('--build-arg <arg...>', 'Build arguments to pass to Docker.')
    .description(
        "Provide a Docker location and the Dockerfile will be used to build a Docker image. If you don't pass a location, all locations will be built."
    )
    .parse(process.argv);

const [location = 'all'] = program.args;
const { tag = String(Math.floor(Date.now() / 1000)) } = program.opts();
const buildArgs = flagBuildArgs(
    validateBuildArgs(program.opts().buildArg || [])
);

return (
    loadConfig()
        .then((config) => {
            const prefix = exec('c project prefix -n', { silent: true }).stdout;

            return Promise.all([prefix, config]);
        })
        .then(([prefix, config]) => {
            const locations =
                location === 'all'
                    ? Object.keys(getPropertyPath(config, 'docker.locations'))
                    : [location];

            return Promise.all([prefix, config, loadState(), locations]);
        })
        .then(([prefix, config, state, locations]) => {
            return Promise.all([
                state,
                config,
                Promise.all(
                    locations.map(
                        (loc) =>
                            new Promise((resolve, reject) => {
                                const dockerfilePath = getPropertyPath(
                                    config,
                                    `docker.locations.${loc}`
                                );

                                if (!dockerfilePath) {
                                    return reject(
                                        new Error(
                                            `Could not find the ${loc} Docker location.`
                                        ),
                                        false,
                                        true
                                    );
                                }

                                const cmd = `c d build -n ${prefix}/${loc} -t ${tag}${formatBuildArgs(
                                    buildArgs
                                )} ${loc}`;

                                exec(cmd, (err, stdout, stderr) => {
                                    if ((err || stderr) && stderr) {
                                        return reject(new Error(stderr));
                                    }

                                    if ((err || stderr) && err) {
                                        return reject(err);
                                    }

                                    storeState(
                                        `kubernetes.environments.${state.env}.build.tags.${prefix}/${loc}`,
                                        tag
                                    )
                                        .then(() => resolve(loc))
                                        .catch(reject);
                                });
                            })
                    )
                ),
            ]);
        })
        .then(([state, config, locations]) => {
            // Do we need to build too?
            if (!program.D) {
                return Promise.resolve();
            }

            const kubernetesLocations = getPropertyPath(
                config,
                `kubernetes.environments.${state.env}.locations`
            );

            locations.forEach((dockerLocation) => {
                return dockerToKubernetesLocation(
                    dockerLocation,
                    kubernetesLocations
                ).then((kLocation) => {
                    exec(`c kc deploy ${kLocation.dockerLocation}`);
                });
            });
        })
        // eslint-disable-next-line no-console
        .catch(console.error)
);
