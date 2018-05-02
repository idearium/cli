#!/usr/bin/env node
'use strict';

const program = require('commander');
const { exec } = require('shelljs');
const { kubernetesLocationsToObjects, loadConfig, loadState, reportError } = require('./lib/c');

program
    .description('Stop all Kubernetes locations. Only deployment, ingress, pod, secret and service objects are removed, all other types will remain.')
    .parse(process.argv);

return loadState()
    .then((state) => {

        return loadConfig(`kubernetes.environments.${state.env}.locations`);

    })
    .then((locations) => {

        kubernetesLocationsToObjects(locations)
            .filter(service => ['deployment', 'ingress', 'pod', 'secret', 'service'].includes(service.type))
            .forEach(service => exec(`kubectl delete ${service.type} ${service.location}`));

    })
    .catch((err) => {

        if (err.code === 'ENOENT') {
            return reportError(new Error('Please create a c.js file with your project configuration. See https://github.com/idearium/cli#configuration'), false, true);
        }

        return reportError(err, false, true);

    });
