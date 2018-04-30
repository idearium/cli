#!/usr/bin/env node
'use strict';

const program = require('commander');
const mustache = require('mustache');
const { resolve: resolvePath } = require('path');
const { accessSync, constants: fsConstants, readFileSync, writeFileSync } = require('fs');
const { exec } = require('shelljs');
const { loadConfig, loadState, reportError } = require('./lib/c');

program
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

        // Prepare the locals for each `.yaml.tmpl`
        const services = [];

        Object.keys(kubernetesLocations).forEach((locationLabel) => {

            const location = kubernetesLocations[locationLabel];

            location.forEach((service) => {

                const templateLocals = service.templateLocals || [];
                const constantLocals = {
                    environment: state.env,
                    namespace,
                    prefix,
                };

                // Locals values will live in here.
                service.locals = {};

                templateLocals.forEach((local) => {

                    if (typeof local === 'string' && Object.keys(constantLocals).includes(local)) {

                        service.locals[local] = constantLocals[local];

                        return;

                    }

                    if (typeof local === 'string' && local === 'tag') {

                        service.locals[local] = state.kubernetes.build.tags[`${prefix}/${locationLabel}`];

                        return;

                    }

                    if (typeof local === 'function') {

                        const { label, value } = local();

                        service.locals[label] = value;

                        return;

                    }

                    return reject(new Error(`Could not resolve '${local}' local`));

                });

                services.push(service);

            });

        });

        return resolve([services, path]);

    }))
    .then(([services, path]) => new Promise((resolve, reject) => {

        services.forEach((service) => {

            const servicePath = resolvePath(process.cwd(), path, service.path);

            try {
                accessSync(`${servicePath}.yaml.tmpl`, fsConstants.R_OK);
            } catch (e) {
                try {
                    accessSync(`${servicePath}.yaml`, fsConstants.R_OK);
                } catch (err) {
                    return reject(new Error(`Neither ${path}/${service.path}.yaml.tmpl or ${path}/${service.path}.yaml could be found`));
                }
            }

        });

        return resolve([services, path]);

    }))
    .then(([services, path]) => {

        services.forEach((service) => {

            const servicePath = resolvePath(process.cwd(), path, service.path);

            try {

                const content = readFileSync(`${servicePath}.yaml.tmpl`, 'utf-8');

                writeFileSync(`${servicePath}.yaml`, mustache.render(content, service.locals), 'utf8');

            } catch (e) {
                // Do nothing.
                // It just means we don't have a templ file to render.
            }

        });

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
        exec(`kubectl apply -f ${resolvePath(process.cwd(), path, namespace)}`);

        // Everything else next.
        exec(`kubectl apply -f ${resolvePath(process.cwd(), path)}`);

        return resolve();

    }))
    .catch((err) => {

        if (err.code === 'ENOENT') {
            return reportError(new Error('Please create a c.js file with your project configuration. See https://github.com/idearium/cli#configuration'), false, true);
        }

        console.log(err);

        return reportError(err, false, true);

    });
