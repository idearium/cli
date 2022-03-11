#!/usr/bin/env -S node --trace-warnings

'use strict';

const chalk = require('chalk');
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
    .option('-s', 'Build the locations sequentially.')
    .option('-c', 'Build the locations concurrently.')
    .option('-t, --tag <tag>', 'A tag for the generated Docker image(s).')
    .option('--build-arg <arg...>', 'Build arguments to pass to Docker.')
    .description(
        "Provide one or more (separated by a comma) Docker locations and the Dockerfile will be used to build a Docker image. If you don't pass a location, all locations will be built."
    )
    .parse(process.argv);

const [location = 'all'] = program.args;
const { tag = String(Math.floor(Date.now() / 1000)) } = program.opts();
const buildArgs = flagBuildArgs(
    validateBuildArgs(program.opts().buildArg || [])
);

const buildLocation = ({ config, loc, prefix, state }) =>
    new Promise((resolve, reject) => {
        const dockerfilePath = getPropertyPath(
            config,
            `docker.locations.${loc}`
        );

        if (!dockerfilePath) {
            return reject(
                new Error(`Could not find the ${loc} Docker location.`),
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
    });

(async () => {
    const config = await loadConfig();
    const prefix = exec('c project prefix -n', { silent: true }).stdout;
    const state = await loadState();
    const locations =
        location === 'all'
            ? Object.keys(getPropertyPath(config, 'docker.locations'))
            : location.split(',');

    if (!program.opts().s || program.opts().c) {
        if (!program.opts().c) {
            // eslint-disable-next-line no-console
            console.error(
                chalk.red(
                    `\nWarning: Building concurrently will soon be put behind a flag (-c).\nBuilding sequentially is more reliable. Use -s to build sequentially. This will become the default in a future version.\n`
                )
            );
        }

        await Promise.all(
            locations.map((loc) =>
                buildLocation({ config, loc, prefix, state })
            )
        );
    }

    if (program.opts().s && !program.opts().c) {
        for (const loc of locations) {
            // eslint-disable-next-line no-console
            console.log(`\nBuilding ${loc}...\n`);
            // eslint-disable-next-line no-await-in-loop
            await buildLocation({ config, loc, prefix, state });
        }
    }

    if (!program.opts().d) {
        return;
    }

    const kubernetesLocations = getPropertyPath(
        config,
        `kubernetes.environments.${state.env}.locations`
    );

    locations.forEach(async (dockerLocation) => {
        const kLocation = await dockerToKubernetesLocation(
            dockerLocation,
            kubernetesLocations
        );

        exec(`c kc deploy ${kLocation.dockerLocation}`);
    });
})();
