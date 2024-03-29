#!/usr/bin/env -S node --trace-warnings
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
    renderServicesTemplates,
    setLocalsForServices,
} = require('./lib/c-kc');

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

        return [locations, prefix, namespace, path, state];
    })
    .then(
        ([kubernetesLocations, prefix, namespace, path, state]) =>
            new Promise((resolve, reject) => {
                const services =
                    kubernetesLocationsToObjects(kubernetesLocations);

                try {
                    setLocalsForServices(state, namespace, prefix, services);
                } catch (e) {
                    return reject(e);
                }

                return resolve([services, path]);
            })
    )
    .then(
        ([services, path]) =>
            new Promise(async (resolve, reject) => {
                try {
                    await ensureServiceFilesExist(path, services);
                } catch (e) {
                    reject(e);
                }

                return resolve([services, path]);
            })
    )
    .then(
        ([services, path]) =>
            new Promise(async (resolve, reject) => {
                try {
                    await renderServicesTemplates(path, services);
                } catch (e) {
                    reject(e);
                }

                return resolve([services, path]);
            })
    )
    .then(
        ([services, path]) =>
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

                return resolve();
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
