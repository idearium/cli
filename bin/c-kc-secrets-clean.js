'use strict';

const program = require('commander');
const getPropertyPath = require('get-value');
const {
    kubernetesLocationsToObjects,
    loadConfig,
    loadState,
    reportError,
} = require('./lib/c');
const { removeCompiledSecrets } = require('./lib/c-kc');

program
    .description(
        'This command will remove any compiled secret manifests, so that plaintext secrets do not linger on disk. It only applies to the local environment.'
    )
    .option('-q', 'Do not print the removed files.')
    .parse(process.argv);

return Promise.all([loadState(), loadConfig()])
    .then(([state, config]) => {
        const { locations, path } = getPropertyPath(
            config,
            `kubernetes.environments.${state.env}`
        );

        return [
            removeCompiledSecrets({
                env: state.env,
                path,
                services: kubernetesLocationsToObjects(locations),
            }),
            state.env,
        ];
    })
    .then(async ([removal, env]) => {
        const removed = await removal;

        if (program.Q) {
            return;
        }

        if (removed.length === 0) {
            // eslint-disable-next-line no-console
            return console.log(
                env === 'local'
                    ? 'No compiled secret manifests to remove.'
                    : `Nothing to do: secrets are only removed for the local environment (currently ${env}).`
            );
        }

        removed.forEach((file) => {
            // eslint-disable-next-line no-console
            console.log(`Removed ${file}`);
        });
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
