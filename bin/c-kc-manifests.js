#!/usr/bin/env node
'use strict';

const program = require('commander');
const getPropertyPath = require('get-value');
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
    .description('This command will compile any found template manifests.')
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
                const services = kubernetesLocationsToObjects(
                    kubernetesLocations
                );

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
