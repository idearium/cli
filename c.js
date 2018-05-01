'use strict';

module.exports = {
{{#hasDockerLocations}}    docker: {
        locations: {
{{#docker}}            {{label}}: { path: '{{{value}}}' },
{{/docker}}
        },
    },{{/hasDockerLocations}}
    environments: {
{{#environments}}        {{label}}: {
            url: '{{{url}}}',
        },
{{/environments}}
    },{{#usesKubernetes}}
    kubernetes: {
        environments: {
{{#environments}}            {{label}}: {
                context: '',
                locations: {},
                path: './manifests/{{label}}',
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
