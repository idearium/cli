'use strict';

const print = (line) => process.stdout.write(`${line}\n`);

const program = require('commander');
const { loadConfig, newline, reportError } = require('./lib/c');
const {
    assertKnownEnv,
    getSecretsContract,
    opRef,
    resolveConsumerKey,
    resolveIdentity,
    resolveServiceKey,
} = require('./lib/c-secrets');
const {
    assertOpSession,
    guardPlaintext,
    opRead,
    resolveOpItem,
    resolveOwnerItem,
    sha12,
} = require('./lib/c-secrets-io');

program
    .arguments('<service> <env> <key>')
    .option(
        '-f, --force',
        'Allow plaintext outside a personal terminal (discouraged).'
    )
    .option('-n', 'Do not print the trailing newline character.')
    .option('-p, --plaintext', 'Print the value itself instead of its hash.')
    .description(
        'Get a secret value summary from 1Password: a truncated sha256, the op:// reference and the length. Values are never displayed unless --plaintext is used.'
    )
    .parse(process.argv);

const [name, env, key] = program.args;

if (!name || !env || !key) {
    return reportError(
        new Error('You need to provide <service> <env> <key>'),
        program,
        true
    );
}

return loadConfig()
    .then((config) => {
        const contract = getSecretsContract({ config });

        if (!contract) {
            throw new Error(
                'No secrets contract in c.js. See https://github.com/idearium/cli#configuration'
            );
        }

        assertOpSession();
        assertKnownEnv({ config, env });

        const identity = resolveIdentity({ contract, env, name });
        const resolved =
            identity.kind === 'service'
                ? resolveServiceKey({
                      contract,
                      env,
                      key,
                      service: identity.service,
                  })
                : resolveConsumerKey({
                      contract,
                      consumer: identity.consumer,
                      key,
                  });

        // Unbound services resolve their item lazily, and reads never
        // create; the shared block resolves too but is never auto-created.
        const itemTitle = resolved.owner
            ? `${contract.organisation}-${contract.name}/${resolved.owner.name}`
            : `${contract.organisation}-${contract.name}/${name}`;

        const item = resolved.owner
            ? resolveOwnerItem({
                  create: false,
                  owner: resolved.owner,
                  title: itemTitle,
              }).id
            : resolveOpItem({ create: false, title: itemTitle }).id;

        const ref =
            resolved.opRef ||
            opRef({
                contract,
                env: identity.kind === 'service' ? env : 'local',
                key,
                opItem: item,
            });

        const value = opRead({ ref });

        if (program.plaintext) {
            guardPlaintext({ force: program.force });

            return process.stdout.write(`${value}${newline(program.N)}`);
        }

        return print(
            `${sha12({ value: Buffer.from(value, 'utf8') })} ${ref} len=${
                value.length
            }`
        );
    })
    .catch((e) => reportError(e, false, true));
