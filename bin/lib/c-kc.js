'use strict';

const { accessSync, constants, readFileSync, writeFileSync } = require('fs');
const { resolve: resolvePath } = require('path');
const Mustache = require('Mustache');

/**
 * Check that a file for each service exists (either a .yaml or .tmpl.yaml file).
 * @param {String} path The path to a bunch of Kubernetes manifests.
 * @param {Array} services An array of Kubernetes location services.
 * @returns {void}
 */
const ensureServiceFilesExist = (path = '', services = []) => {

    services.forEach((service) => {

        const servicePath = resolvePath(process.cwd(), path, service.path);

        try {
            accessSync(`${servicePath}.yaml.tmpl`, constants.R_OK);
        } catch (e) {
            try {
                accessSync(`${servicePath}.yaml`, constants.R_OK);
            } catch (err) {
                throw new Error(new Error(`Neither ${path}/${service.path}.yaml.tmpl or ${path}/${service.path}.yaml could be found`));
            }
        }

    });

};

const renderServicesTemplates = (path = '', services = []) => {

    services.forEach((service) => {

        const servicePath = resolvePath(process.cwd(), path, service.path);

        try {

            const content = readFileSync(`${servicePath}.yaml.tmpl`, 'utf-8');

            writeFileSync(`${servicePath}.yaml`, Mustache.render(content, service.locals), 'utf8');

        } catch (e) {
            // Do nothing.
            // It just means we don't have a templ file to render.
        }

    });

};

/**
 * Directly mutate a services array by resolving a list of locals to pass to a template engine.
 * @param {Object} state The current state of the project.
 * @param {String} namespace The current namespace.
 * @param {String} prefix The current project prefix.
 * @param {Array} services A list of Kubernetes location services.
 * @returns {void}
 */
const setLocalsForServices = (state, namespace, prefix, services) => {

    services.forEach((service) => {

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

                service.locals[local] = state.kubernetes.build.tags[`${prefix}/${service.location}`];

                return;

            }

            if (typeof local === 'function') {

                const { label, value } = local();

                service.locals[label] = value;

                return;

            }

            throw Error(`Could not resolve '${local}' local`);

        });

    });

};

module.exports = {
    ensureServiceFilesExist,
    renderServicesTemplates,
    setLocalsForServices,
};
