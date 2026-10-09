'use strict';

const { execFileSync } = require('child_process');
const { createHash, randomBytes } = require('crypto');
const espree = require('espree');
const https = require('https');
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const VAULT = 'Team';
const OP_SESSION_FILE = join(homedir(), '.local/state/idearium/op-session');

// Environment variables whose presence indicates a non-interactive agent
// context - plaintext output is hard-blocked while any is set.
const AGENT_ENV_VARS = [
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CODEX_SANDBOX',
    'GEMINI_CLI',
    'OPENCODE',
];

const sha12 = ({ value }) =>
    createHash('sha256').update(value).digest('hex').slice(0, 12);

/**
 * Resolve the op session token from the environment or `c op session`'s
 * state file. Never print or log the return value.
 * @returns {String} The session token.
 */
const opSession = () => {
    if (process.env.OP_SESSION_idearium) {
        return process.env.OP_SESSION_idearium;
    }

    try {
        return readFileSync(OP_SESSION_FILE, 'utf8').trim();
    } catch (e) {
        throw new Error(
            'No 1Password session. Run `c op session` (or export OP_SESSION_idearium), then retry.'
        );
    }
};

/**
 * Run the op cli with the session wired in. Input/values pass via stdin or
 * in-memory buffers, never via printed output.
 * @param {Object} options
 * @param {Array} options.args The op arguments.
 * @param {String} [options.input] Stdin to pipe into op.
 * @returns {String} The command's stdout.
 */
const runOp = ({ args, input }) => {
    try {
        return execFileSync('op', ['--session', opSession()].concat(args), {
            encoding: 'utf8',
            input,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } catch (e) {
        const stderr = String(e.stderr);

        if (
            stderr.includes('not currently signed in') ||
            stderr.includes('no active session found')
        ) {
            throw new Error(
                'The 1Password session has expired. Run `c op session`, then retry.'
            );
        }

        throw e;
    }
};

/**
 * Read a 1Password reference's value (exact bytes, no trailing newline).
 * The return value is a secret - never print it; hash it instead.
 * @param {Object} options
 * @param {String} options.ref The op:// reference.
 * @returns {String} The value.
 */
const opRead = ({ ref }) => runOp({ args: ['read', '-n', ref] });

/**
 * Hash a 1Password reference's value without exposing it.
 * @param {Object} options
 * @param {String} options.ref The op:// reference.
 * @returns {String} A truncated sha256.
 */
const opReadSha = ({ ref }) =>
    sha12({ value: Buffer.from(opRead({ ref }), 'utf8') });

/**
 * List a 1Password item's fields (labels and sections only).
 * @param {Object} options
 * @param {String} options.item The item id.
 * @returns {Array} Fields with section labels.
 */
const opItemFields = ({ item }) => {
    const raw = runOp({ args: ['item', 'get', item, '--format=json'] });

    return JSON.parse(raw).fields.map((field) => ({
        field: field.label,
        section: field.section ? field.section.label : null,
    }));
};

/**
 * Read a 1Password item's fields and values in one call (bulk reads - one
 * op invocation per item instead of one per field).
 * @param {Object} options
 * @param {String} options.item The item id.
 * @returns {Object} { fields: [{ field, section }], values } with values
 * keyed 'section/field'.
 */
const opItemValues = ({ item }) => {
    const raw = JSON.parse(
        runOp({ args: ['item', 'get', item, '--format=json'] })
    );

    const fields = [];
    const values = {};

    (raw.fields || []).forEach((field) => {
        const section = field.section ? field.section.label : null;

        fields.push({ field: field.label, section });
        values[`${section}/${field.label}`] = field.value;
    });

    return { fields, values };
};

/**
 * Check whether a section/field exists on an item.
 * @param {Object} options
 * @param {String} options.field The field label.
 * @param {String} options.item The item id.
 * @param {String} options.section The section label.
 * @returns {Boolean}
 */
const opFieldExists = ({ field, item, section }) =>
    opItemFields({ item }).some(
        (candidate) =>
            candidate.section === section && candidate.field === field
    );

/**
 * Upsert a field on a 1Password item by piping a JSON item template via
 * stdin (`op item edit` reads the template from piped input): the value
 * never transits argv, where it would be visible to other processes on
 * the machine.
 * @param {Object} options
 * @param {String} options.field The field label.
 * @param {String} options.item The item id.
 * @param {String} options.section The section label.
 * @param {String} options.value The value.
 * @returns {Void}
 */
const opUpsertField = ({ field, item, section, value }) => {
    const raw = JSON.parse(
        runOp({ args: ['item', 'get', item, '--format=json'] })
    );

    const fields = raw.fields || [];

    const sectionLabel = (candidate) =>
        candidate.section ? candidate.section.label : null;

    const target = fields.find(
        (candidate) =>
            candidate.label === field && sectionLabel(candidate) === section
    );

    if (target) {
        target.value = value;
    }

    if (!target) {
        // A new field mirrors a sibling of its section so sections stay
        // internally consistent; concealed is the safe default for
        // secrets.
        const sibling = fields.find(
            (candidate) => sectionLabel(candidate) === section
        );

        fields.push({
            fieldType: (sibling || {}).fieldType || 'CONCEALED',
            label: field,
            section: { label: section },
            value,
        });
    }

    runOp({
        args: ['item', 'edit', item, '--format=json'],
        input: JSON.stringify(raw),
    });
};

/**
 * Create a 1Password item (DATABASE category, no required built-ins) and
 * return its id.
 * @param {Object} options
 * @param {String} options.title The item title (e.g. ras-rsc/service).
 * @returns {String} The new item id.
 */
const opCreateItem = ({ title }) => {
    const raw = runOp({
        args: [
            'item',
            'create',
            '--category=database',
            `--title=${title}`,
            `--vault=${VAULT}`,
            '--format=json',
        ],
    });

    return JSON.parse(raw).id;
};

/**
 * Block plaintext output unless the user is at a terminal with no agent
 * environment variables set. --force overrides, with a warning.
 * @param {Object} options
 * @param {Boolean} options.force Whether --force was passed.
 * @returns {Void}
 */
const guardPlaintext = ({ force }) => {
    if (force) {
        process.stderr.write(
            'WARNING: plaintext output forced. Do not paste this into transcripts, files or tickets.\n'
        );

        return;
    }

    if (!process.stdout.isTTY) {
        throw new Error(
            'Plaintext output requires a terminal (stdout is not a TTY).'
        );
    }

    const agent = AGENT_ENV_VARS.find((envVar) => process.env[envVar]);

    if (agent) {
        throw new Error(
            `Plaintext output is blocked in agent/CI contexts (${agent} is set). Re-run personally, or use --force against your better judgement.`
        );
    }
};

/**
 * Generate a random value for `set --generate`.
 * @param {Object} options
 * @param {Number} options.length The desired length (characters).
 * @param {String} options.type hex, base64 or alphanumeric.
 * @returns {String} The generated value.
 */
const generateValue = ({ length = 32, type = 'hex' }) => {
    if (type === 'hex') {
        return randomBytes(Math.ceil(length / 2))
            .toString('hex')
            .slice(0, length);
    }

    if (type === 'base64') {
        return randomBytes(length).toString('base64').slice(0, length);
    }

    if (type === 'alphanumeric') {
        const alphabet =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const bytes = randomBytes(length);

        return Array.from(bytes)
            .map((byte) => alphabet[byte % alphabet.length])
            .join('');
    }

    throw new Error(`Unknown --type '${type}' (hex, base64, alphanumeric)`);
};

/**
 * Generate a random value from a parsed commander program's --generate
 * flags, failing with a friendly error for malformed input (a bare -l
 * parses to true then NaN; a bare -t parses to true).
 * @param {Object} options
 * @param {Object} options.program The parsed commander program.
 * @returns {String} The generated value.
 */
const generateValueForProgram = ({ program }) => {
    if (program.T === true) {
        throw new Error(
            '--type requires a value: hex, base64 or alphanumeric.'
        );
    }

    // A bare -l parses to true; an absent one leaves L undefined, so the
    // destructuring default supplies 32.
    const { L = 32 } = program;
    const length = parseInt(L, 10);

    if (!Number.isInteger(length) || length < 1) {
        throw new Error('--length must be a positive integer.');
    }

    return generateValue({ length, type: program.T });
};

/**
 * Map gcloud authentication failures to a friendly, actionable error.
 * @param {Object} options
 * @param {String} options.stderr The failed command's stderr.
 * @returns {Error|null} The friendly error, or null when not auth-related.
 */
const gcloudAuthError = ({ stderr }) => {
    const phrases = [
        'Reauthentication failed',
        'to obtain new credentials',
        'cannot prompt during non-interactive execution',
        'do not currently have an active account selected',
    ];

    return phrases.some((phrase) => stderr.includes(phrase))
        ? new Error(
              'gcloud authentication has expired. Run `gcloud auth login` (interactive), then retry.'
          )
        : null;
};

/**
 * Run gcloud and return its stdout.
 * @param {Object} options
 * @param {Array} options.args The gcloud arguments.
 * @returns {String} The command's stdout.
 */
const runGcloud = ({ args }) => {
    try {
        return execFileSync('gcloud', args, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } catch (e) {
        const friendly = gcloudAuthError({ stderr: String(e.stderr) });

        throw friendly || e;
    }
};

/**
 * Assert gcloud is authenticated (up front, before any work) for commands
 * that touch Google Cloud.
 * @returns {Void}
 */
const assertGcloudAuth = () => {
    runGcloud({ args: ['auth', 'print-access-token'] });
};

/**
 * Make a Google Secret Manager REST call against the global endpoint.
 * Payloads are built in-process and never logged.
 * @param {Object} options
 * @param {String} [options.body] A JSON request body.
 * @param {String} options.method The HTTP method.
 * @param {String} options.path The path after /v1.
 * @param {String} options.project The GCP project id.
 * @returns {Promise} Resolves with the parsed JSON response.
 */
const gsmRequest = ({ body, method, path, project }) =>
    new Promise((resolve, reject) => {
        const token = runGcloud({ args: ['auth', 'print-access-token'] });

        const request = https.request(
            {
                headers: {
                    'authorization': `Bearer ${token.trim()}`,
                    'content-type': 'application/json',
                },
                host: 'secretmanager.googleapis.com',
                method,
                path: `/v1/projects/${project}${path}`,
            },
            (res) => {
                let raw = '';

                res.on('data', (chunk) => {
                    raw += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode >= 300) {
                        return reject(
                            new Error(
                                `GSM ${method} ${path} failed (${
                                    res.statusCode
                                }): ${raw.slice(0, 200)}`
                            )
                        );
                    }

                    return resolve(raw ? JSON.parse(raw) : {});
                });
            }
        );

        request.on('error', reject);

        if (body) {
            request.write(JSON.stringify(body));
        }

        request.end();
    });

/**
 * Check whether a GSM secret exists (and return its labels).
 * @param {Object} options
 * @param {String} options.id The GSM secret id.
 * @param {String} options.project The GCP project id.
 * @returns {Promise} Resolves with the secret resource, or null.
 */
const gsmDescribe = ({ id, project }) =>
    gsmRequest({ method: 'GET', path: `/secrets/${id}`, project }).catch(
        (e) => {
            if (e.message.includes('(404)')) {
                return null;
            }

            throw e;
        }
    );

/**
 * Create a pinned-global GSM secret with the standard labels.
 * @param {Object} options
 * @param {String} options.env The environment label.
 * @param {String} options.id The GSM secret id.
 * @param {String} options.managedBy The managed-by label (org-repo).
 * @param {String} options.project The GCP project id.
 * @param {String} options.region The replication region.
 * @param {String} options.service The service label.
 * @returns {Promise}
 */
const gsmCreate = ({ env, id, managedBy, project, region, service }) =>
    gsmRequest({
        body: {
            labels: {
                'environment': env,
                'managed-by': managedBy,
                service,
            },
            replication: {
                userManaged: {
                    replicas: [{ location: region }],
                },
            },
        },
        method: 'POST',
        path: `/secrets?secretId=${id}`,
        project,
    });

/**
 * Add a version to a GSM secret. The value is base64-encoded in-process.
 * @param {Object} options
 * @param {String} options.id The GSM secret id.
 * @param {String} options.project The GCP project id.
 * @param {String} options.value The secret value.
 * @returns {Promise}
 */
const gsmAddVersion = ({ id, project, value }) =>
    gsmRequest({
        body: {
            payload: { data: Buffer.from(value, 'utf8').toString('base64') },
        },
        method: 'POST',
        path: `/secrets/${id}:addVersion`,
        project,
    });

/**
 * Read a GSM secret's latest version. The return value is a secret - never
 * print it; hash it instead.
 * @param {Object} options
 * @param {String} options.id The GSM secret id.
 * @param {String} options.project The GCP project id.
 * @returns {Promise} Resolves with the value as a Buffer.
 */
const gsmRead = ({ id, project }) =>
    gsmRequest({
        method: 'GET',
        path: `/secrets/${id}/versions/latest:access`,
        project,
    }).then((res) => Buffer.from(res.payload.data, 'base64'));

/**
 * Delete a GSM secret. Point of no return - callers must gate this on a
 * consumers check.
 * @param {Object} options
 * @param {String} options.id The GSM secret id.
 * @param {String} options.project The GCP project id.
 * @returns {Promise}
 */
const gsmDelete = ({ id, project }) =>
    gsmRequest({ method: 'DELETE', path: `/secrets/${id}`, project });

/**
 * List every GSM secret id in the project.
 * @param {Object} options
 * @param {String} options.project The GCP project id.
 * @returns {Promise} Resolves with an array of secret ids.
 */
const gsmList = ({ project }) => {
    const ids = [];

    const page = (pageToken) =>
        gsmRequest({
            method: 'GET',
            path: `/secrets${pageToken ? `?pageToken=${pageToken}` : ''}`,
            project,
        }).then((res) => {
            (res.secrets || []).forEach((secret) => {
                ids.push(secret.name.split('/').pop());
            });

            if (res.nextPageToken) {
                return page(res.nextPageToken);
            }

            return ids;
        });

    return page('');
};

/**
 * List the project's Cloud Functions (scoped to the repo's name prefix)
 * with the GSM secret ids each consumes. Function names do not encode the
 * environment (e.g. beta carries an infix, production does not) - the env
 * lives in the referenced secret ids.
 * @param {Object} options
 * @param {String} options.project The GCP project id.
 * @param {String} options.region The region.
 * @param {String} options.repoPrefix The function-name prefix (org-repo-).
 * @returns {Promise} Resolves with [{ name, secrets: [secretId] }].
 */
const gcfList = ({ project, region, repoPrefix }) => {
    const names = runGcloud({
        args: [
            'functions',
            'list',
            `--filter=name~functions/${repoPrefix}`,
            `--format=value(name)`,
            `--project=${project}`,
        ],
    })
        .split('\n')
        .map((name) => name.trim().split('/').pop())
        .filter((name) => name.length > 0);

    return Promise.all(
        names.map((name) => {
            const shortName = name.split('/').pop();

            const raw = runGcloud({
                args: [
                    'functions',
                    'describe',
                    shortName,
                    `--format=json`,
                    `--project=${project}`,
                    `--region=${region}`,
                ],
            });

            const secrets = (
                (JSON.parse(raw).serviceConfig || {})
                    .secretEnvironmentVariables || []
            ).map((entry) => entry.secret);

            return { name: shortName, secrets };
        })
    );
};

/**
 * Map kubectl failures to a friendly, actionable error.
 * @param {Object} options
 * @param {String} options.context The kubectl context (for messages).
 * @param {String} options.stderr The failed command's stderr.
 * @returns {Error|null} The friendly error, or null when unmapped.
 */
const kubectlError = ({ context, stderr }) => {
    if (
        /context "[^"]+" does not exist/.test(stderr) ||
        stderr.includes('no context exists') ||
        stderr.includes('context was not found')
    ) {
        return new Error(
            `kubectl has no context '${context}'. Run \`c kc context set\`, then retry.`
        );
    }

    const unreachable = [
        'Unable to connect to the server',
        'You must be logged in',
        'Unauthorized',
        'error: exec',
    ];

    return unreachable.some((phrase) => stderr.includes(phrase))
        ? new Error(
              `kubectl cannot reach the cluster '${context}' (credentials expired or cluster unreachable). Run \`gcloud auth login\` if expired, and confirm the context with \`c kc context set\`, then retry.`
          )
        : null;
};

/**
 * Run kubectl and return its stdout, with friendly failure mapping.
 * @param {Object} options
 * @param {Array} options.args The kubectl arguments.
 * @param {String} options.context The kubectl context.
 * @returns {String} The command's stdout.
 */
const runKubectl = ({ args, context }) => {
    try {
        return execFileSync('kubectl', ['--context', context].concat(args), {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } catch (e) {
        const friendly = kubectlError({ context, stderr: String(e.stderr) });

        throw friendly || e;
    }
};

/**
 * Assert kubectl can reach the context's server with valid credentials
 * (up front, before any work) for commands that read the cluster.
 * @param {Object} options
 * @param {String} options.context The kubectl context.
 * @returns {Void}
 */
const assertKubectl = ({ context }) => {
    try {
        execFileSync(
            'kubectl',
            [
                '--context',
                context,
                '--request-timeout=10s',
                'get',
                '--raw',
                '/version',
            ],
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
    } catch (e) {
        const friendly = kubectlError({ context, stderr: String(e.stderr) });

        if (friendly) {
            throw friendly;
        }

        throw new Error(
            `kubectl cannot reach the cluster '${context}'. Confirm the context with \`c kc context set\`, then retry. (${String(
                e.stderr || e.message
            )
                .trim()
                .slice(0, 120)})`
        );
    }
};

/**
 * Read one key of a Kubernetes secret.
 * @param {Object} options
 * @param {String} options.context The kubectl context.
 * @param {String} options.key The secret key.
 * @param {String} options.namespace The namespace.
 * @param {String} options.secret The Kubernetes secret name.
 * @returns {String} The base64-encoded value.
 */
const k8sReadKey = ({ context, key, namespace, secret }) =>
    runKubectl({
        args: [
            '-n',
            namespace,
            'get',
            'secret',
            secret,
            '-o',
            `jsonpath={.data.${key}}`,
        ],
        context,
    }).trim();

/**
 * List the keys of a Kubernetes secret.
 * @param {Object} options
 * @param {String} options.context The kubectl context.
 * @param {String} options.namespace The namespace.
 * @param {String} options.secret The Kubernetes secret name.
 * @returns {Array} The secret's keys.
 */
const k8sSecretKeys = ({ context, namespace, secret }) => {
    const raw = runKubectl({
        args: ['-n', namespace, 'get', 'secret', secret, '-o', 'json'],
        context,
    });

    return Object.keys(JSON.parse(raw).data || {});
};

/**
 * Read a Kubernetes secret in one call: its keys and their decoded values
 * (bulk reads - one kubectl invocation per secret instead of one per key).
 * @param {Object} options
 * @param {String} options.context The kubectl context.
 * @param {String} options.namespace The namespace.
 * @param {String} options.secret The Kubernetes secret name.
 * @returns {Object} { keys, values } with values keyed and decoded.
 */
const k8sReadSecret = ({ context, namespace, secret }) => {
    const raw = runKubectl({
        args: ['-n', namespace, 'get', 'secret', secret, '-o', 'json'],
        context,
    });

    const data = JSON.parse(raw).data || {};
    const values = {};

    Object.keys(data).forEach((key) => {
        values[key] = Buffer.from(data[key], 'base64');
    });

    return { keys: Object.keys(values), values };
};

/**
 * List every SecretProviderClass in a namespace with the GSM ids their
 * parameters reference.
 * @param {Object} options
 * @param {String} options.context The kubectl context.
 * @param {String} options.namespace The namespace.
 * @returns {Promise} Resolves with [{ name, ids: [secretId] }].
 */
const spcList = ({ context, namespace }) =>
    new Promise((resolve, reject) => {
        let raw = '';

        try {
            raw = runKubectl({
                args: [
                    '-n',
                    namespace,
                    'get',
                    'secretproviderclass',
                    '-o',
                    'json',
                ],
                context,
            });
        } catch (e) {
            return reject(e);
        }

        const items = JSON.parse(raw).items.map((item) => ({
            ids:
                ((item.spec.parameters || {}).secrets || '').match(
                    /resourceName:\s*'projects\/[^/]+\/secrets\/([^']+)'/g
                ) || [],
            name: item.metadata.name,
        }));

        return resolve(
            items.map((item) => ({
                ids: item.ids.map((entry) =>
                    entry
                        .replace(/.*secrets\//, '')
                        .replace(/'/g, '')
                        .replace(/\/versions\/latest$/, '')
                ),
                name: item.name,
            }))
        );
    });

/**
 * Assert a warm 1Password session (up front, before any work) for commands
 * that read or write op values. Throws the friendly session errors.
 * @returns {Void}
 */
const assertOpSession = () => {
    opSession();
    runOp({ args: ['whoami', '--format=json'] });
};

/**
 * List the Team vault's 1Password items in one call (bulk title lookups -
 * one item list instead of one per title).
 * @returns {Array} The raw items (id, title, ...).
 */
const opListItems = () =>
    JSON.parse(
        runOp({ args: ['item', 'list', '--vault=Team', '--format=json'] })
    );

/**
 * Find a 1Password item by exact title, returning its id (or null).
 * @param {Object} options
 * @param {String} options.title The item title.
 * @returns {String|null} The item id.
 */
const opFindItemByTitle = ({ title }) => {
    const item = opListItems().find((candidate) => candidate.title === title);

    return item ? item.id : null;
};

/**
 * Resolve a 1Password item: a bound opItem wins; otherwise look the item
 * up by title; when creation is not allowed, fail with a guidance error
 * instead (the shared block, which never creates, gets its own message).
 * @param {Object} options
 * @param {Boolean} options.create Whether an item may be created.
 * @param {String} [options.noCreateMessage] A specific error message when
 * creation is not allowed (used for the shared block, which never creates).
 * @param {String} [options.opItem] The bound opItem, when present.
 * @param {String} options.title The item title ({org}-{repo}/{service}).
 * @returns {Object} { created, id, persisted } - persisted true when the
 * binding should be written back into c.js.
 */
const resolveOpItem = ({ create, noCreateMessage, opItem, title }) => {
    if (opItem) {
        return { created: false, id: opItem, persisted: false };
    }

    const found = opFindItemByTitle({ title });

    if (found) {
        return { created: false, id: found, persisted: true };
    }

    if (!create) {
        throw new Error(
            noCreateMessage ||
                `No 1Password item '${title}' - read commands never create items. Bind one first: c op set (or add) the service's first key.`
        );
    }

    return { created: true, id: opCreateItem({ title }), persisted: true };
};

/**
 * Resolve an owning entry's 1Password item without ever creating one: a
 * bound opItem wins; otherwise the item is looked up by title, failing
 * with a guidance error when it does not exist. Every read path uses
 * this - 1Password is never mutated.
 * @param {Object} options
 * @param {Object} options.owner The owning service or shared entry.
 * @param {String} options.title The item title ({org}-{repo}/{service}).
 * @returns {Object} { created, id, persisted } - persisted true when the
 * binding should be written back into c.js.
 */
const resolveOwnerItem = ({ owner, title }) => {
    if (owner && owner.name === 'shared') {
        return resolveOpItem({
            create: false,
            noCreateMessage:
                "The 'shared' block stores its values in a 1Password item you choose - set shared.opItem in c.js (often the item of a service that uses the key).",
            opItem: owner.opItem,
            title,
        });
    }

    return resolveOpItem({
        create: false,
        opItem: owner && owner.opItem,
        title,
    });
};

/**
 * Resolve an owning entry's 1Password item on a write path: services
 * resolve (or create) their item; the shared block only ever resolves
 * (where a shared value lives is the author's decision, never the
 * tool's).
 * @param {Object} options
 * @param {Object} options.owner The owning service or shared entry.
 * @param {String} options.title The item title ({org}-{repo}/{service}).
 * @returns {Object} { created, id, persisted }.
 */
const resolveOrCreateOwnerItem = ({ owner, title }) => {
    if (owner && owner.name === 'shared') {
        return resolveOwnerItem({ owner, title });
    }

    return resolveOpItem({
        create: true,
        opItem: owner && owner.opItem,
        title,
    });
};

/**
 * The c.js file's path in the project directory.
 * @returns {String} The absolute file path.
 */
const cjsPath = () => join(process.cwd(), 'c.js');

/**
 * Read the c.js file's text from the project directory.
 * @returns {String} The file contents.
 */
const readCjs = () => readFileSync(cjsPath(), 'utf8');

/**
 * Write the c.js file's text back to the project directory.
 * @param {Object} options
 * @param {String} options.text The new file contents.
 * @returns {Void}
 */
const writeCjs = ({ text }) => writeFileSync(cjsPath(), text);

/**
 * Quote a service/key name for c.js: single quotes only when required.
 * @param {Object} options
 * @param {String} options.name The name to quote.
 * @returns {String} The (maybe quoted) name.
 */
const quoteIfNeeded = ({ name }) =>
    /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name}'`;

/**
 * Parse c.js text into an AST, returning the module.exports object.
 * Positions come from the parser, not regexes, so formatting (quoted
 * names, comments, single vs multi-line layouts) cannot mislocate an
 * edit.
 * @param {Object} options
 * @param {String} options.text The c.js file contents.
 * @returns {Object} The module.exports ObjectExpression node.
 */
const parseCjs = ({ text }) => {
    const ast = espree.parse(text, { ecmaVersion: 2020, range: true });

    const assignment = ast.body.find(
        (statement) =>
            statement.type === 'ExpressionStatement' &&
            statement.expression.type === 'AssignmentExpression' &&
            statement.expression.left.type === 'MemberExpression' &&
            statement.expression.left.object.name === 'module' &&
            statement.expression.left.property.name === 'exports' &&
            statement.expression.right.type === 'ObjectExpression'
    );

    if (!assignment) {
        throw new Error(
            'Could not find a module.exports object in c.js - add the contract manually.'
        );
    }

    return assignment.expression.right;
};

/**
 * Find a property of an ObjectExpression by name (quoted or unquoted).
 * @param {Object} options
 * @param {String} options.name The property name.
 * @param {Object} options.object The ObjectExpression node.
 * @returns {Object|undefined} The Property node, when present.
 */
const findProperty = ({ name, object }) =>
    object.properties.find(
        (property) =>
            property.type === 'Property' &&
            (property.key.name === name || property.key.value === name)
    );

/**
 * The index of the start of the line containing the given index.
 * @param {Object} options
 * @param {Number} options.index A position within the text.
 * @param {String} options.text The full text.
 * @returns {Number} The line's start index.
 */
const lineStartIndex = ({ index, text }) => text.lastIndexOf('\n', index) + 1;

/**
 * The whitespace between the start of the line and the given index (the
 * indentation of a node that starts its own line).
 * @param {Object} options
 * @param {Number} options.index A position within the text.
 * @param {String} options.text The full text.
 * @returns {String} The leading whitespace.
 */
const indentBefore = ({ index, text }) =>
    text.slice(lineStartIndex({ index, text }), index);

/**
 * The file's dominant line ending, so insertions never mix endings.
 * @param {Object} options
 * @param {String} options.text The full text.
 * @returns {String} '\r\n' or '\n'.
 */
const lineEndingOf = ({ text }) => (text.includes('\r\n') ? '\r\n' : '\n');

/**
 * The secrets contract's ObjectExpression within c.js: only properties of
 * this node belong to the contract, as c.js may contain identically-named
 * properties elsewhere (docker locations etc).
 * @param {Object} options
 * @param {String} options.text The c.js file contents.
 * @returns {Object} The secrets ObjectExpression node.
 */
const secretsObject = ({ text }) => {
    const root = parseCjs({ text });

    const secrets = findProperty({ name: 'secrets', object: root });

    if (!secrets || secrets.value.type !== 'ObjectExpression') {
        throw new Error(
            'Could not find secrets in c.js - add the contract manually.'
        );
    }

    return secrets.value;
};

/**
 * A service entry's Property node inside secrets.services, or the shared
 * block's, failing with actionable messages when absent.
 * @param {Object} options
 * @param {String} options.name The service name, or 'shared'.
 * @param {Object} options.secrets The secrets ObjectExpression node.
 * @returns {Object} The entry's Property node.
 */
const entryProperty = ({ name, secrets }) => {
    if (name === 'shared') {
        const shared = findProperty({ name: 'shared', object: secrets });

        if (!shared) {
            throw new Error(
                'Could not find secrets.shared in c.js - add the block manually.'
            );
        }

        return shared;
    }

    const services = findProperty({ name: 'services', object: secrets });

    if (!services || services.value.type !== 'ObjectExpression') {
        throw new Error(
            'Could not find secrets.services in c.js - add the service manually.'
        );
    }

    const service = findProperty({ name, object: services.value });

    if (!service) {
        throw new Error(
            `Could not find service '${name}' in secrets.services in c.js.`
        );
    }

    return service;
};

/**
 * Insert a rendered property (or multi-line block) into an object, right
 * before its closing brace, matching the object's own layout: a closing
 * brace on its own line gets the property on its own line at the
 * properties' indentation (with the file's line ending), a one-line
 * object stays one-line. A final property written without a trailing
 * comma gets one so the sibling parses.
 * @param {Object} options
 * @param {String} options.line The rendered property (may be multi-line).
 * @param {Object} options.object The ObjectExpression node to insert into.
 * @param {String} options.text The c.js file contents.
 * @returns {String} The edited text (not yet written).
 */
const insertPropertyIntoObject = ({ line, object: obj, text }) => {
    const closeIndex = obj.range[1] - 1;
    const closingIndent = indentBefore({ index: closeIndex, text });
    const braceOnOwnLine =
        text.slice(obj.range[0], closeIndex).includes('\n') &&
        /^\s*$/.test(closingIndent);

    if (!braceOnOwnLine) {
        const separator = obj.properties.length > 0 ? ', ' : ' ';

        return `${text.slice(0, closeIndex)}${separator}${line} ${text.slice(
            closeIndex
        )}`;
    }

    const lineEnding = lineEndingOf({ text });
    const [firstProperty] = obj.properties;
    const propertyIndent = firstProperty
        ? indentBefore({ index: firstProperty.range[0], text })
        : `${indentBefore({ index: obj.range[0], text })}    `;

    const lastProperty = obj.properties[obj.properties.length - 1];
    const commaFix = text.slice(lastProperty.range[1], closeIndex).includes(',')
        ? ''
        : ',';

    return (
        text.slice(0, lastProperty.range[1]) +
        commaFix +
        text.slice(
            lastProperty.range[1],
            lineStartIndex({ index: closeIndex, text })
        ) +
        `${propertyIndent}${line}${lineEnding}${closingIndent}` +
        text.slice(closeIndex)
    );
};

/**
 * The freshly parsed service entry, failing loudly when an edit did not
 * land in secrets.services.
 * @param {Object} options
 * @param {Object} options.config The freshly required c.js configuration.
 * @param {String} options.name The service name.
 * @returns {Object} The parsed service entry.
 */
const expectService = ({ config, name }) => {
    const service =
        config.secrets &&
        config.secrets.services &&
        config.secrets.services[name];

    if (!service) {
        throw new Error(`secrets.services.${name} is missing after the edit`);
    }

    return service;
};

/**
 * The freshly parsed service or shared entry ('shared' addresses the
 * shared block, a sibling of services), failing loudly when an edit did
 * not land in the secrets block.
 * @param {Object} options
 * @param {Object} options.config The freshly required c.js configuration.
 * @param {String} options.name The service name, or 'shared'.
 * @returns {Object} The parsed entry.
 */
const expectEntry = ({ config, name }) => {
    if (name === 'shared') {
        const shared = config.secrets && config.secrets.shared;

        if (!shared) {
            throw new Error('secrets.shared is missing after the edit');
        }

        return shared;
    }

    return expectService({ config, name });
};

/**
 * Re-parse c.js after an edit and verify the expectation against the
 * parsed result, restoring the original text when it fails: an edit that
 * misses its target block (or breaks the file) is never kept.
 * @param {Object} options
 * @param {String} options.backup The pre-edit file text.
 * @param {Function} options.expect Receives the freshly parsed c.js
 * configuration; throws when the edit did not land as intended.
 * @returns {Void}
 */
const verifyCjsEdit = ({ backup, expect }) => {
    delete require.cache[require.resolve(cjsPath())];

    try {
        expect(require(cjsPath()));
    } catch (e) {
        writeCjs({ text: backup });

        delete require.cache[require.resolve(cjsPath())];

        throw new Error(
            `The c.js edit did not land as expected and was rolled back: ${e.message}`
        );
    }
};

/**
 * Register a new service in c.js's secrets contract (used by set/add when
 * the service doesn't exist yet). Inserts alphabetically into
 * secrets.services, then re-parses c.js to verify the edit landed.
 * @param {Object} options
 * @param {String} options.key The first key the service owns.
 * @param {String} options.name The service name.
 * @param {String} options.opItem The 1Password item id.
 * @returns {Void}
 */
const registerServiceInCjs = ({ key, name, opItem }) => {
    const text = readCjs();
    const secrets = secretsObject({ text });
    const services = findProperty({ name: 'services', object: secrets });

    if (!services || services.value.type !== 'ObjectExpression') {
        throw new Error(
            'Could not find secrets.services in c.js - add the service manually.'
        );
    }

    const servicesObjectNode = services.value;

    const verify = () =>
        verifyCjsEdit({
            backup: text,
            expect: (config) => {
                const service = expectService({ config, name });

                if (!service.keys.includes(key) || service.opItem !== opItem) {
                    throw new Error(
                        `secrets.services.${name} does not carry the registered entry`
                    );
                }
            },
        });

    const lineEnding = lineEndingOf({ text });
    const servicesIndent = indentBefore({ index: services.range[0], text });
    const propertyIndent = `${servicesIndent}    `;

    const block = [
        `${propertyIndent}${quoteIfNeeded({ name })}: {`,
        `${propertyIndent}    keys: ['${key}'],`,
        `${propertyIndent}    opItem: '${opItem}',`,
        `${propertyIndent}},`,
    ].join(lineEnding);

    // The minimal scaffold's single-line empty map: expand it.
    if (servicesObjectNode.properties.length === 0) {
        const expanded = [`{`, `${block}`, `${servicesIndent}}`].join(
            lineEnding
        );

        writeCjs({
            text:
                text.slice(0, servicesObjectNode.range[0]) +
                expanded +
                text.slice(servicesObjectNode.range[1]),
        });

        return verify();
    }

    // Insert before the first service sorting after the new one.
    const target = servicesObjectNode.properties.find(
        (property) =>
            property.type === 'Property' &&
            (property.key.name || property.key.value) > name
    );

    if (target) {
        const insertIndex = lineStartIndex({ index: target.range[0], text });

        writeCjs({
            text:
                text.slice(0, insertIndex) +
                `${block}${lineEnding}` +
                text.slice(insertIndex),
        });

        return verify();
    }

    // Alphabetically last: append before the services closing brace.
    writeCjs({
        text: insertPropertyIntoObject({
            line: block.trim(),
            object: servicesObjectNode,
            text,
        }),
    });

    return verify();
};

/**
 * Add a key to an entry's keys array in c.js (a service, or the shared
 * block) with insertion-only edits: the new element is spliced in at its
 * sorted position between existing elements, so the array's own layout,
 * comments and trailing-comma style all survive. An entry without a keys
 * array gets one. The edit is re-parsed to verify it landed.
 * @param {Object} options
 * @param {String} options.key The key to add.
 * @param {String} options.name The service name, or 'shared'.
 * @returns {Void}
 */
const addKeyToEntryInCjs = ({ key, name }) => {
    const text = readCjs();
    const secrets = secretsObject({ text });
    const entry = entryProperty({ name, secrets });

    if (entry.value.type !== 'ObjectExpression') {
        throw new Error(
            `Could not find a keys array for '${name}' in c.js - add '${key}' manually.`
        );
    }

    const keysProperty = findProperty({ name: 'keys', object: entry.value });

    const verify = () =>
        verifyCjsEdit({
            backup: text,
            expect: (config) => {
                if (!expectEntry({ config, name }).keys.includes(key)) {
                    throw new Error(
                        `secrets entry '${name}' does not include '${key}' in keys after the edit`
                    );
                }
            },
        });

    // No keys array yet: create one in the entry's own layout.
    if (!keysProperty) {
        writeCjs({
            text: insertPropertyIntoObject({
                line: `keys: ['${key}'],`,
                object: entry.value,
                text,
            }),
        });

        return verify();
    }

    const array = keysProperty.value;

    const editable =
        array.type === 'ArrayExpression' &&
        array.elements.every(
            (element) =>
                element &&
                element.type === 'Literal' &&
                typeof element.value === 'string'
        );

    if (!editable) {
        throw new Error(
            `Could not find a plain keys array for '${name}' in c.js - add '${key}' manually.`
        );
    }

    if (array.elements.some((element) => element.value === key)) {
        return;
    }

    // An empty array renders its first element, keeping the bracket
    // layout it was written with.
    if (array.elements.length === 0) {
        const propertyIndent = indentBefore({
            index: keysProperty.range[0],
            text,
        });
        const multiline = text
            .slice(array.range[0], array.range[1])
            .includes('\n');

        const rendered = multiline
            ? `[\n${propertyIndent}    '${key}',\n${propertyIndent}]`
            : `['${key}']`;

        writeCjs({
            text:
                text.slice(0, array.range[0]) +
                rendered +
                text.slice(array.range[1]),
        });

        return verify();
    }

    const lineEnding = lineEndingOf({ text });

    // Insert before the first element sorting after the key, matching
    // the existing element layout.
    const target = array.elements.find((element) => element.value > key);

    if (target) {
        const targetIndent = indentBefore({ index: target.range[0], text });
        const onOwnLine = /^\s*$/.test(targetIndent);
        const separator = onOwnLine ? `${lineEnding}${targetIndent}` : ' ';

        writeCjs({
            text:
                text.slice(0, target.range[0]) +
                `'${key}',${separator}` +
                text.slice(target.range[0]),
        });

        return verify();
    }

    // Alphabetically last: attach after the last element, which hands
    // the new element the old last element's trailing separator.
    const last = array.elements[array.elements.length - 1];
    const gap = text.slice(last.range[1], array.range[1] - 1);
    const separator = gap.includes('\n')
        ? `${lineEnding}${indentBefore({ index: last.range[0], text })}`
        : ' ';

    writeCjs({
        text:
            text.slice(0, last.range[1]) +
            `,${separator}'${key}'` +
            text.slice(last.range[1]),
    });

    return verify();
};

/**
 * Bind an entry's opItem in c.js (inserting the property when the block
 * has none) - used to persist lazily resolved item ids. The entry is a
 * service or the shared block, and the edit is re-parsed to verify it
 * landed.
 * @param {Object} options
 * @param {String} options.name The service name, or 'shared'.
 * @param {String} options.opItem The 1Password item id.
 * @returns {Void}
 */
const setOpItemInCjs = ({ name, opItem }) => {
    const text = readCjs();
    const secrets = secretsObject({ text });
    const entry = entryProperty({ name, secrets });

    if (entry.value.type !== 'ObjectExpression') {
        throw new Error(
            `Could not find the entry '${name}' in c.js - set its opItem manually.`
        );
    }

    if (findProperty({ name: 'opItem', object: entry.value })) {
        return;
    }

    writeCjs({
        text: insertPropertyIntoObject({
            line: `opItem: '${opItem}',`,
            object: entry.value,
            text,
        }),
    });

    verifyCjsEdit({
        backup: text,
        expect: (config) => {
            if (expectEntry({ config, name }).opItem !== opItem) {
                throw new Error(
                    `secrets entry '${name}' does not carry the opItem binding after the edit`
                );
            }
        },
    });
};

/**
 * Push a value to a GSM secret and verify the readback by hash: create the
 * secret (with labels, pinned-global replication) when missing, add a
 * version otherwise. versions/latest is eventually consistent, so the
 * readback retries briefly before declaring a mismatch.
 * @param {Object} options
 * @param {Object} options.contract The normalised contract.
 * @param {String} options.env The environment (labels).
 * @param {String} options.id The GSM secret id.
 * @param {String} options.owner The owning service name (labels).
 * @param {String} options.value The secret value.
 * @returns {Promise} Resolves with { created, sourceSha, readbackSha }.
 */
const gsmPushVerified = ({ contract, env, id, owner, value }) => {
    const attempts = 5;
    const delayMs = 3000;

    const sleep = (ms) =>
        new Promise((resolve) => {
            setTimeout(resolve, ms);
        });

    const sourceSha = sha12({ value: Buffer.from(value, 'utf8') });

    return gsmDescribe({ id, project: contract.project }).then((secret) => {
        const created = !secret;

        const create = secret
            ? Promise.resolve()
            : gsmCreate({
                  env,
                  id,
                  managedBy: `${contract.organisation}-${contract.name}`,
                  project: contract.project,
                  region: contract.region,
                  service: owner,
              });

        return create
            .then(() => gsmAddVersion({ id, project: contract.project, value }))
            .then(() => {
                const attempt = (remaining) =>
                    gsmRead({ id, project: contract.project }).then(
                        (readback) => {
                            const readbackSha = sha12({ value: readback });

                            if (readbackSha === sourceSha) {
                                return { created, readbackSha, sourceSha };
                            }

                            if (remaining > 0) {
                                return sleep(delayMs).then(() =>
                                    attempt(remaining - 1)
                                );
                            }

                            throw new Error(
                                `Readback MISMATCH for ${id} (source:${sourceSha} gsm:${readbackSha}) - versions/latest may still be propagating.`
                            );
                        }
                    );

                return attempt(attempts);
            });
    });
};

module.exports = {
    OP_SESSION_FILE,
    addKeyToEntryInCjs,
    assertGcloudAuth,
    assertKubectl,
    assertOpSession,
    cjsPath,
    gcfList,
    generateValue,
    generateValueForProgram,
    guardPlaintext,
    gsmAddVersion,
    gsmCreate,
    gsmDelete,
    gsmDescribe,
    gsmList,
    gsmPushVerified,
    gsmRead,
    k8sReadKey,
    k8sReadSecret,
    k8sSecretKeys,
    opCreateItem,
    opFieldExists,
    opFindItemByTitle,
    opItemFields,
    opItemValues,
    opListItems,
    opRead,
    opSession,
    opReadSha,
    opUpsertField,
    quoteIfNeeded,
    registerServiceInCjs,
    resolveOrCreateOwnerItem,
    resolveOwnerItem,
    runKubectl,
    runOp,
    setOpItemInCjs,
    sha12,
    spcList,
};
