'use strict';

const program = require('commander');
const getPropertyPath = require('get-value');

const {
    loadConfig,
    loadState,
    reportError,
    spawnWithExitCode,
} = require('./lib/c');
const { formatProjectPrefix } = require('./lib/c-project');

program
    .arguments('[command...]')
    .description(
        "Runs a kubectl command, configured to use the project's context, rather than kubectl's context."
    )
    .parse(process.argv);

return Promise.all([loadState('env'), loadConfig()])
    .then(([env, config]) => {
        const { kubernetes, project } = config;
        const { organisation, name } = project;
        const { environments } = kubernetes;

        const namespace =
            getPropertyPath(
                config,
                `kubernetes.environments.${env}.namespace`
            ) || formatProjectPrefix(organisation, name, env, true, true);

        // The context and namespace flags precede the user's command:
        // anything after kubectl's -- would otherwise be executed inside
        // the pod, letting kubectl fall back to the ambient context and
        // namespace. The argv is an array (never a shell string), so
        // nothing is re-parsed or interpolated, and the child's exit code
        // propagates.
        return spawnWithExitCode({
            args: [
                '--context',
                environments[env].context,
                '--namespace',
                namespace,
            ].concat(program.rawArgs.slice(2)),
            command: 'kubectl',
        });
    })
    .catch((err) => reportError(err, false, true));
