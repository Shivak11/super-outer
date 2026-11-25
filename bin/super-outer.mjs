#!/usr/bin/env node

import { runCli } from "../src/cli.mjs";
import { sweepCommand } from "../src/sweep.mjs";

const argv = process.argv.slice(2);
process.exitCode = argv[0] === "sweep" ? sweepCommand(argv.slice(1)) : await runCli(argv);
