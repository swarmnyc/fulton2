import * as caporal from 'caporal';
import * as inquirer from 'inquirer';
import * as lodash from 'lodash';

import chalk from 'chalk';
import { generateQuestions } from '../utils/questions';
import { GenerateFileOptions } from '../interfaces';
import { generateFile } from '../actions/geneateFile';

const supportSchematics = [
    ["e", "entity", "scaffolding a entity of Database ORM file"],
    ["r", "router", "scaffolding a router file"],
    ["s", "service", "scaffolding a service file"]
]

let questionDefs = [
    {
        name: "schematic",
        type: "list",
        message: "What is the schematic that you want to generate?",
        choices: supportSchematics.map((s) => {
            let name = lodash.capitalize(s[1])
            return {
                name: `${name} - ${s[2]}`,
                short: name,
                value: s[1]

            };
        }),
        validate: (value: any) => {
            if (value) {
                return true
            } else {
                return "Please enter the name";
            }
        }
    },
    {
        name: "name",
        type: "input",
        message: "What is the name of the file?",
        validate: (value: any) => {
            if (value) {
                return true
            } else {
                return "Please enter the name";
            }
        }
    },
];

function schematicsHelp(command: any) {
    let table = command["_program"]["_helper"]["_getSimpleTable"]();

    table.options.style["padding-left"] = 2

    for (const s of supportSchematics) {
        table.push([`${chalk.cyan(s[0])}, ${chalk.cyan(s[1])}`, s[2]])
    }

    return table.toString();
}

function verifySchematic(input: string) {
    for (const s of supportSchematics) {
        if (s[0] == input || s[1] == input) return s[1]
    }

    throw new Error(`Unknown schematic "${input}"`)
}

module.exports = function () {
    let command = caporal
        .command("generate", "Generates files based on a schematic.")
        .alias("g");

    command.argument("[schematic]", `The schematic that you want to generate.\nAvailable schematics are\n${schematicsHelp(command)}`, verifySchematic)
        .argument("[name]", "The name of file.");

    command.option("-f, --force", "override file if it exists");

    command.action(function (args, options, logger) {
        try {
            options.schematic = args.schematic;
            options.name = args.name;

            let questions = generateQuestions(questionDefs, options, logger);

            inquirer.prompt(questions).then((answers) => {
                let opts = Object.assign(options, answers) as GenerateFileOptions

                generateFile(opts, logger).catch((e) => {
                    logger.error(chalk.red("\nError: " + (e.message || e)));
                    process.exit(1);
                });
            })
        } catch (e) {
            logger.error(e.message);
            process.exit(1);
        }
    });
}