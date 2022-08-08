'use strict';

const program = require('commander');
const { missingCommand, reportError } = require('./lib/c');
const { getAll } = require('./lib/c-workflow');

// Load in the workflows provided by the project.
const projectWorkflows = getAll().map((workflow) => {
    workflow.description = `[project workflow] ${workflow.description}`;

    return workflow;
});

// List the default commands for `c workflow`.
const commands = [
    {
        description: 'List all workflows supported by this project',
        name: 'list',
    },
];

// Command the commands subcommands and the project workflows and register as subcommands.
[]
    .concat(commands, projectWorkflows)
    .forEach((command) => program.command(command.name, command.description));

const [, , cmd] = process.argv;
const isProjectWorkflow = projectWorkflows.find(
    (workflow) => workflow.name === cmd
);
const isCommand = commands.find((command) => command.name === cmd);

// Execute the function, if we're processing a command, it is a project workflow, but not a subcommand.
if (cmd && isProjectWorkflow && !isCommand) {
    const { fn, name } = projectWorkflows.find(
        (workflow) => workflow.name === cmd
    );

    if (typeof fn !== 'function') {
        return reportError(
            new Error(
                `The ${name} workflow doesn't exist. Create it at './devops/workflows/${name}.js'.`
            ),
            false,
            true
        );
    }

    return fn();
}

// We're not processing a project workflow.
program.parse(process.argv);

missingCommand(program);
