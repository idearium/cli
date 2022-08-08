'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const {
    dockerToKubernetesLocation,
    loadConfig,
    loadState,
    reportError,
} = require('./lib/c');

program
    .arguments('<location>')
    .description(
        'Provide a Docker location and the associated Kubernetes location will be redployed with the latest build tag.'
    )
    .parse(process.argv);

const [location] = program.args;

if (!location) {
    return reportError(
        new Error('You need to provide a Docker location'),
        program
    );
}

return loadState()
    .then((state) => {
        return Promise.all([
            state,
            loadConfig(`kubernetes.environments.${state.env}.locations`).then(
                (locations) => dockerToKubernetesLocation(location, locations)
            ),
        ]);
    })
    .then(([state, service]) => {
        const prefix = exec('c project prefix -n', { silent: true }).stdout;
        const tag =
            state.kubernetes.environments[state.env].build.tags[
                `${prefix}/${location}`
            ];
        const cmd = `c kc cmd set image ${service.type}/${location} ${location}=${prefix}/${location}:${tag}`;

        exec(cmd);
    });
