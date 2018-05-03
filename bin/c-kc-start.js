#!/usr/bin/env node
'use strict';

const program = require('commander');
const { resolve: resolvePath } = require('path');
const { exec } = require('shelljs');
const { kubernetesLocationsToObjects, loadConfig, loadState, reportError } = require('./lib/c');
const { ensureServiceFilesExist, renderServicesTemplates, setLocalsForServices } = require('./lib/c-kc');

program
    .description('This command will start all of your Kubernetes locations.')
    .parse(process.argv);

return loadState()
    .then((state) => {

        return Promise.all([
            loadConfig(`kubernetes.environments.${state.env}`),
            state,
        ]);

    })
    .then(([environment, state]) => {

        // Retrieve the loactions, namespace and path.
        const { locations, path } = environment;

        return Promise.all([
            locations,
            exec('c project prefix -n', { silent: true }).stdout,
            exec('c project prefix -e -n', { silent: true }).stdout,
            path,
            state,
        ]);

    })
    .then(([kubernetesLocations, prefix, namespace, path, state]) => new Promise((resolve, reject) => {

        const services = kubernetesLocationsToObjects(kubernetesLocations);

        try {
            setLocalsForServices(state, namespace, prefix, services);
        } catch (e) {
            return reject(e);
        }

        return resolve([services, path]);

    }))
    .then(([services, path]) => new Promise((resolve, reject) => {

        try {
            ensureServiceFilesExist(path, services);
        } catch (e) {
            reject(e);
        }

        return resolve([services, path]);

    }))
    .then(([services, path]) => {

        renderServicesTemplates(path, services);

        return [services, path];

    })
    .then(([services, path]) => new Promise((resolve, reject) => {

        const [namespace] = services
            .filter(service => (service.type === 'namespace'))
            .map(service => `${service.path}.yaml`);

        if (!namespace) {
            return reject(new Error('Could not find a namespace service.'));
        }

        // Deploy the namespace first.
        exec(`c kc cmd apply -f ${resolvePath(process.cwd(), path, namespace)}`);

        // Everything else next.
        exec(`c kc cmd apply -f ${resolvePath(process.cwd(), path)}`);

        return resolve();

    }))
    .catch((err) => {

        if (err.code === 'ENOENT') {
            return reportError(new Error('Please create a c.js file with your project configuration. See https://github.com/idearium/cli#configuration'), false, true);
        }

        return reportError(err, false, true);

    });
