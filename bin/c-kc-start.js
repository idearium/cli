'use strict';

const program = require('commander');
const getPropertyPath = require('get-value');
const { resolve: resolvePath } = require('path');
const { exec } = require('shelljs');
const {
    kubernetesLocationsToObjects,
    loadConfig,
    loadState,
    reportError,
} = require('./lib/c');
const { formatProjectPrefix } = require('./lib/c-project');
const {
    ensureServiceFilesExist,
    removeCompiledSecrets,
    renderServicesTemplates,
    setLocalsForServices,
} = require('./lib/c-kc');
const { generateSecretManifests } = require('./lib/c-secrets-manifests');

program
    .description('This command will start all of your Kubernetes locations.')
    .parse(process.argv);

return Promise.all([loadState(), loadConfig()])
    .then(([state, config]) => {
        const { project } = config;
        const { organisation, name } = project;
        const { locations, path } = getPropertyPath(
            config,
            `kubernetes.environments.${state.env}`
        );
        const prefix = formatProjectPrefix(
            organisation,
            name,
            state.env,
            false,
            true
        );
        const namespace =
            getPropertyPath(
                config,
                `kubernetes.environments.${state.env}.namespace`
            ) || formatProjectPrefix(organisation, name, state.env, true, true);

        return [config, locations, prefix, namespace, path, state];
    })
    .then(
        ([config, kubernetesLocations, prefix, namespace, path, state]) =>
            new Promise((resolve, reject) => {
                const services =
                    kubernetesLocationsToObjects(kubernetesLocations);

                try {
                    setLocalsForServices(state, namespace, prefix, services);
                } catch (e) {
                    return reject(e);
                }

                return resolve([config, namespace, services, path, state]);
            })
    )
    .then(([config, namespace, services, path, state]) =>
        generateSecretManifests({
            config,
            env: state.env,
            namespace,
            path,
            services,
        }).then(() => [services, path, state])
    )
    .then(([services, path, state]) =>
        ensureServiceFilesExist(path, services).then(() => [
            services,
            path,
            state,
        ])
    )
    .then(([services, path, state]) =>
        renderServicesTemplates(path, services).then(() => [
            services,
            path,
            state,
        ])
    )
    .then(
        ([services, path, state]) =>
            new Promise((resolve, reject) => {
                const [namespace] = services
                    .filter((service) => service.type === 'namespace')
                    .map((service) => `${service.path}.yaml`);

                if (!namespace) {
                    return reject(
                        new Error('Could not find a namespace service.')
                    );
                }

                // Deploy the namespace first.
                exec(
                    `c kc cmd apply -f ${resolvePath(
                        process.cwd(),
                        path,
                        '.compiled',
                        namespace
                    )}`
                );

                // Everything else next.
                exec(
                    `c kc cmd apply -f ${resolvePath(
                        process.cwd(),
                        path,
                        '.compiled'
                    )}`
                );

                return removeCompiledSecrets({
                    env: state.env,
                    path,
                    services,
                }).then(resolve);
            })
    )
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
