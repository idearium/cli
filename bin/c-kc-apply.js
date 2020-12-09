#!/usr/bin/env -S node --trace-warnings
'use strict';

const program = require('commander');
const getPropertyPath = require('get-value');
const { exec } = require('shelljs');
const { resolve: resolvePath } = require('path');
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
    .arguments('<location>')
    .option(
        '-t [type]',
        'Specify a particular service type to apply, otherwise all will be.'
    )
    .description(
        'Apply a Kubernetes location (specific to service type if desired) to Kubernetes'
    )
    .parse(process.argv);

const [location] = program.args;

if (!location) {
    return reportError(
        new Error('You need to provide a Kubernetes location'),
        program,
        true
    );
}

return Promise.all([loadConfig(), loadState()])
    .then(([config, state]) => {
        return Promise.all([
            config,
            getPropertyPath(config, `kubernetes.environments.${state.env}`),
            state,
        ]);
    })
    .then(([config, environment, state]) => {
        // Retrieve the loactions, namespace and path.
        const { locations, path } = environment;

        // Filter the location to one specific one.
        const [matchingLocation] = Object.keys(locations)
            .filter((loc) => loc === location)
            .map((loc) => locations[loc]);

        return Promise.all([config, matchingLocation, path, state]);
    })
    .then(
        ([config, matchingLocation, path, state]) =>
            new Promise((resolve, reject) => {
                const { project } = config;
                const { organisation, name } = project;

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
                    ) ||
                    formatProjectPrefix(
                        organisation,
                        name,
                        state.env,
                        true,
                        true
                    );

                let services = kubernetesLocationsToObjects({
                    [location]: matchingLocation,
                });

                if (program.T) {
                    services = services.filter(
                        (service) => service.type === program.T
                    );
                }

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
            new Promise((resolve) => {
                services.forEach((service) => {
                    exec(
                        `c kc cmd apply -f ${resolvePath(
                            process.cwd(),
                            path,
                            '.compiled',
                            `${service.path}.yaml`
                        )}`
                    );
                });

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
