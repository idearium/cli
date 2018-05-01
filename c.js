'use strict';

module.exports = {
{{#hasDockerLocations}}    docker: {
        locations: {
{{#docker}}            {{label}}: { path: '{{{value}}}' },
{{/docker}}
        },
    },{{/hasDockerLocations}}
    environments: {
{{#environments}}        {{.}}: {},
{{/environments}}
    },{{#usesKubernetes}}
    kubernetes: {
        environments: {
{{#environments}}            {{.}}: {
                context: '',
                locations: {},
                path: '',
            },
{{/environments}}
        },
    },{{/usesKubernetes}}{{#hasNpmLocations}}
    npm: {
        locations: {
{{#npm}}            {{label}}: '{{{value}}}',
{{/npm}}
        },
    },{{/hasNpmLocations}}
    project: {
        name: '{{project.name}}',
        organisation: '{{project.organisation}}',
    },
};
