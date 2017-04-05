/*
**  GemstoneJS -- Gemstone JavaScript Technology Stack
**  Copyright (c) 2016-2017 Gemstone Project <http://gemstonejs.com>
**  Licensed under Apache License 2.0 <https://spdx.org/licenses/Apache-2.0>
*/

/*  external requirements  */
const fs                  = require("fs-promise")
const path                = require("path")
const gemstoneConfig      = require("gemstone-config")
const spawn               = require("child_process").spawn
const glob                = require("glob-promise")
const chalk               = require("chalk")
const table               = require("table")
const codeFrame           = require("babel-code-frame")
const pkg                 = require("./package.json")
const gemstoneLinterJS    = require("gemstone-linter-js")
const gemstoneLinterHTML  = require("gemstone-linter-html")
const gemstoneLinterCSS   = require("gemstone-linter-css")
const gemstoneLinterYAML  = require("gemstone-linter-yaml")
const gemstoneLinterJSON  = require("gemstone-linter-json")
const Progress            = require("progress")
const Chokidar            = require("chokidar")
const beep                = require("beepbeep")

/*  generate a table  */
const mktable = (data, config = {}) => {
    let cfg = Object.assign({}, {
        border: table.getBorderCharacters("void"),
        columnDefault: { paddingLeft: 0, paddingRight: 1 },
        drawJoin: () => false,
        drawHorizontalLine: () => false
    }, config)
    return table.table(data, cfg)
        .replace(/^/, "   ")
        .replace(/\n(.)/g, "\n   $1")
}

/*  export the Gemstone Tool plugin API  */
module.exports = function () {
    this.register({
        name: "frontend-build",
        desc: "Build Gemstone Frontend Application",
        opts: [
            {   name: "cwd", type: "string", def: ".",
                desc: "Change working directory to given path" },
            {   name: "debug", type: "boolean", def: false,
                desc: "Enable debugging mode" },
            {   name: "verbose", type: "boolean", def: false,
                desc: "Enable verbose output mode" },
            {   name: "watch", type: "boolean", def: false,
                desc: "Enable filesystem watching mode" },
            {   name: "beep", type: "boolean", def: false,
                desc: "Beep terminal after build" },
            {   name: "server", type: "boolean", def: false,
                desc: "Enable HTTP server mode" },
            {   name: "env", type: "string", def: "development",
                desc: "Build for target environment (\"production\" or \"development\")" },
            {   name: "tag", type: "string", def: "",
                desc: "Build for tagged environment (\"\")" }
        ],
        args: [
        ],
        func: async function (opts /*, ...args */) {
            /*  sanity check options  */
            if (!opts.env.match(/^(?:production|development)$/))
                throw new Error(`invalid environment "${opts.env}"`)

            /*  display header  */
            let header = `${chalk.bold("** Gemstone Frontend Build Tool " + pkg.version)}\n` +
                "** Copyright (c) 2016-2017 Gemstone Project <http://gemstonejs.com>\n" +
                "** Licensed under Apache License 2.0 <https://spdx.org/licenses/Apache-2.0>\n" +
                "\n"
            process.stderr.write(header)

            /*  change working directory  */
            if (opts.cwd !== ".")
                process.chdir(opts.cwd)

            /*  locate Node executable  */
            let nodeExe = process.execPath

            /*  locate Webpack CLI  */
            let webpackCli = require.resolve("webpack/bin/webpack.js")

            /*  locate Webpack configuration generator  */
            let gwcFile = require.resolve("gemstone-config-webpack")

            /*  determine Gemstone configuration  */
            let cfg = gemstoneConfig()

            /*
             *  PASS 1: Linting
             */

            const Pass1 = async () => {
                process.stderr.write(chalk.bold("++ PASS 1: LINTING\n"))
                process.stderr.write(`-- using configuration for ${chalk.bold.green(opts.env)} environment\n`)
                process.stderr.write("-- executing linters with Gemstone configuration\n")

                /*  lint source files  */
                let progressCur = 0.0
                let progressBar = new Progress(`   linting: [:bar] ${chalk.bold(":percent")} (elapsed: :elapseds) :msg `, {
                    complete:   chalk.bold.green("#"),
                    incomplete: "=",
                    width:      20,
                    total:      5.0,
                    stream:     process.stderr
                })
                let rounds = 0
                let options = {
                    verbose:  opts.verbose,
                    env:      opts.env,
                    colors:   process.stderr.isTTY,
                    rules:    {},
                    progress: (fraction, msg) => {
                        if (msg.length > 40)
                            msg = msg.substr(0, 40) + "..."
                        let delta = ((rounds * 1.0) + fraction) - progressCur
                        progressBar.tick(delta, { msg })
                        if (progressBar.complete)
                            process.stderr.write("\n")
                        progressCur += delta
                    }
                }
                let report = {
                    sources:  {},
                    findings: []
                }
                let passed = true
                let filenames = {}
                const doLint = async (ctx, linter, proc, ext) => {
                    filenames[ctx] = await glob(path.join(cfg.path.source, "**", ext))
                    passed &= await linter(filenames[ctx],
                        Object.assign({}, options,
                            cfg.linting && cfg.linting[proc] ? { rules: cfg.linting[proc] } : {}), report)
                    rounds++
                }
                await doLint("JS",   gemstoneLinterJS,   "eslint",    "*.js")
                await doLint("HTML", gemstoneLinterHTML, "htmlhint",  "*.html")
                await doLint("CSS",  gemstoneLinterCSS,  "stylelint", "*.css")
                await doLint("YAML", gemstoneLinterYAML, "jsyaml",    "*.yaml")
                await doLint("JSON", gemstoneLinterJSON, "jsonlint",  "*.json")

                /*  report linting results  */
                let data = [ [
                    chalk.underline("Source Type"),
                    chalk.underline("Files"),
                    chalk.underline("Findings")
                ] ]
                const mkstat = (ctx) => {
                    let files = filenames[ctx].length
                    let findings = report.findings
                        .filter((finding) => finding.ctx === ctx)
                        .length
                    if (findings > 0) {
                        ctx = chalk.bold.red(ctx)
                        findings = chalk.red(findings)
                    }
                    else {
                        ctx = chalk.bold(ctx)
                        findings = chalk.green(findings)
                    }
                    data.push([ ctx, files, findings ])
                }
                mkstat("JS")
                mkstat("HTML")
                mkstat("CSS")
                mkstat("YAML")
                mkstat("JSON")
                process.stderr.write(mktable(data))
                process.stderr.write("\n")

                /*  report linting details  */
                report.findings
                    .sort((a, b) => {
                        let diff = a.filename.localeCompare(b.filename)
                        if (diff === 0) {
                            diff = a.line - b.line
                            if (diff === 0)
                                diff = a.col - b.col
                        }
                        return diff
                    })
                    .forEach((finding) => {
                        let ctx      = `[${finding.ctx}]`
                        let dirname  = path.dirname(finding.filename)
                        if (dirname !== "")
                            dirname += "/"
                        let basename = path.basename(finding.filename)
                        let line     = finding.line
                        let column   = finding.column
                        let message  = finding.message
                        let origin   = `[${finding.ruleProc}: ${finding.ruleId}]`
                        let frame = codeFrame(
                            report.sources[finding.filename] || "",
                            finding.line,
                            finding.column, {
                                linesAbove: 2,
                                linesBelow: 2
                            }
                        )
                        frame = frame
                            .replace(/^(\s*\d+\s+\|)/, (_, m1) =>
                                chalk.grey(m1))
                            .replace(/(\n)(\s*\d+\s+\|)/g, (_, m1, m2) =>
                                m1 + chalk.grey(m2))
                            .replace(/(\|\s*)(\^)/, (_, m1, m2) =>
                                chalk.grey(m1) + chalk.bold.red(m2))
                            .replace(/(\n)(>)(\s*\d+\s+\|)(.*)/, (_, m1, m2, m3, m4) =>
                                m1 + chalk.bold.red(m2) + chalk.grey(m3) + chalk.green(m4))
                        let output =
                            `${chalk.bold.red("ERROR:")} ` +
                            `${chalk.red("file")} ${chalk.red(dirname)}${chalk.red.bold(basename)}` +
                            `${chalk.red(", line ")}${chalk.red.bold(line)}${chalk.red(", column ")}${chalk.red.bold(column)}${chalk.red("")} ` +
                            `${chalk.grey(ctx)}\n` +
                            `       ${chalk.bold(message)} ${chalk.grey(origin)}\n` +
                            `${frame}\n` +
                            "\n"
                        process.stderr.write(output)
                    })

                return passed
            }

            /*
             *  PASS 2: Bundling
             */

            const Pass2 = async () => {
                process.stderr.write(chalk.bold("++ PASS 2: COMPILING\n"))
                process.stderr.write(`-- using configuration for ${chalk.bold.green(opts.env)} environment\n`)

                /*  generate temporary Webpack configuration stub  */
                let wpcFile = ".gemstone.webpack.js"
                let wpcData = `module.exports = require("${gwcFile}")({\n` +
                `    verbose: ${opts.verbose},\n` +
                `    env: "${opts.env}",\n` +
                `    tag: "${opts.tag}"\n` +
                "})\n"
                await fs.writeFile(wpcFile, wpcData, { encoding: "utf8" })

                /*  spawn Webpack command-line interface  */
                let stats = await new Promise((resolve, reject) => {
                    process.stderr.write("-- executing bundler with Gemstone configuration\n")
                    let wpOpts = [ webpackCli, "--config", wpcFile, "--json" ]
                    if (opts.debug)
                        wpOpts.push("--debug")
                    let child = spawn(nodeExe, wpOpts, { stdio: [ "inherit", "pipe", "inherit" ] })
                    let stdout = ""
                    child.stdout.on("data", async (data) => {
                        stdout += data.toString()
                    })
                    child.on("close", async (code) => {
                        await fs.unlink(wpcFile)
                        let stats
                        try {
                            stats = JSON.parse(stdout)
                        }
                        catch (ex) {
                            process.stderr.write(`ERROR: failed to parse JSON output of Webpack:\n${stdout}`)
                            reject(stdout)
                        }
                        if (code === 0)
                            resolve(stats)
                        else
                            resolve(stats) /* no need to reject  */
                    })
                })
                process.stderr.write("\n")

                /*  report Webpack on entries  */
                if (stats.errors.length === 0) {
                    let data = [ [
                        chalk.underline("Entry"),
                        chalk.underline("Chunks"),
                        chalk.underline("Assets")
                    ] ]
                    Object.keys(stats.entrypoints).forEach((name) => {
                        let entry = stats.entrypoints[name]
                        data.push([
                            chalk.bold(name),
                            entry.chunks.map((chunk) => chalk.green(chunk)).join(", "),
                            entry.assets.join(", ")
                        ])
                    })
                    process.stderr.write(mktable(data))
                    process.stderr.write("\n")
                }

                /*  report on Webpack chunks  */
                if (stats.errors.length === 0) {
                    let data = [ [
                        chalk.underline("Chunk"),
                        chalk.underline("Parents"),
                        chalk.underline("Names"),
                        chalk.underline("Size"),
                        chalk.underline("Modules")
                    ] ]
                    Object.keys(stats.chunks).forEach((name) => {
                        let chunk = stats.chunks[name]
                        data.push([
                            chalk.green(chunk.id),
                            chunk.parents.map((chunk) => chalk.green(chunk)).join(", "),
                            chunk.names.join(", "),
                            chunk.size,
                            chunk.modules.length
                        ])
                    })
                    process.stderr.write(mktable(data))
                    process.stderr.write("\n")
                }

                /*  report on Webpack modules  */
                if (stats.errors.length === 0) {
                    let data = [ [
                        chalk.underline("Module"),
                        chalk.underline("Size"),
                        chalk.underline("Chunks"),
                        chalk.underline("Depth")
                    ] ]
                    stats.modules.map((module) => {
                        let name = module.identifier
                        name = name.replace(/^.*!/, "")
                        name = path.relative(process.cwd(), name)
                        return { name, size: module.size, chunks: module.chunks, depth: module.depth }
                    }).sort((a, b) => {
                        if (a.depth !== b.depth)
                            return a.depth - b.depth
                        else
                            a.name.localeCompare(b.name)
                    }).forEach((module) => {
                        let name = module.name
                        if (!opts.verbose && name.match(/^(?:node_modules|bower_components)\//))
                            return
                        if (module.errors > 0)
                            name = chalk.red(name)
                        else if (module.warnings > 0)
                            name = chalk.yellow(name)
                        data.push([
                            name,
                            module.size,
                            module.chunks.map((chunk) => chalk.green(chunk)).join(", "),
                            module.depth
                        ])
                    })
                    process.stderr.write(mktable(data))
                    process.stderr.write("\n")
                }

                /*  report Webpack errors  */
                if (stats.errors.length > 0) {
                    process.stderr.write(`${chalk.bold.red("** ERROR: Webpack reported the following errors:")}\n`)
                    process.stderr.write(stats.errors.join("\n"))
                    process.stderr.write("\n")
                }

                /*  report Webpack warnings  */
                if (stats.warnings.length > 0) {
                    process.stderr.write(`${chalk.bold.yellow("** WARNING: Webpack reported the following warnings")}:\n`)
                    process.stderr.write(stats.warnings.join("\n"))
                    process.stderr.write("\n")
                }

                return (stats.errors.length === 0 && stats.warnings.length === 0)
            }

            /*
             *  MAIN
             */

            /*  execute passes  */
            const singleRun = async () => {
                let passed = await Pass1()
                if (passed)
                    passed = await Pass2()
                if (opts.beep) {
                    if (passed)
                        beep(1)
                    else
                        beep([ 0, 100, 500 ])
                }
            }

            /*  distinguish between continuous and on-time execution  */
            if (opts.watch) {
                /*  continuous execution  */
                return new Promise((/* resolve, reject */) => {
                    /*  internal state  */
                    let first   = true     /*  is this the first call after last watching?  */
                    let ready   = false    /*  is the filesyste watching already ready?     */
                    let need    = false    /*  is there a need for running the passes?      */
                    let changed = {}       /*  the paths which have changed                 */
                    let timer   = null     /*  the timer for deferred handling              */
                    let running = false    /*  are we currently running the handler         */

                    /*  deferred handler  */
                    const handler = async () => {
                        running = true
                        if (!first) {
                            process.stderr.write("\r                                                             \r")
                            process.stderr.write(`-- files changed: ${chalk.bold.green(Object.keys(changed).length)}\n\n`)
                            Object.keys(changed).forEach((filename) => {
                                filename = path.relative(process.cwd(), filename)
                                process.stderr.write(`   ${chalk.green(filename)}\n`)
                            })
                            process.stderr.write("\n")
                            process.stderr.write(`${chalk.grey("== ========================================================================= ==")}\n`)
                            process.stderr.write("\n")
                        }
                        first   = false
                        need    = false
                        changed = {}
                        await singleRun()
                        process.stderr.write(`## ${chalk.bold("IDLE: WATCHER")}\n` +
                            `   files changed: ${chalk.bold.yellow("[WAITING FOR FILESYSTEM CHANGES] ")}`)
                        running = false

                        /*  is there ne need in the meantime?  */
                        if (need) {
                            if (timer !== null)
                                clearTimeout(timer)
                            timer = setTimeout(handler, 0.0 * 1000)
                        }
                    }

                    /*  watch filesystem  */
                    let watcher = Chokidar.watch(cfg.path.source, {
                        ignored: /[/\\]\./,
                        ignorePermissionErrors: true,
                        ignoreInitial: true,
                        awaitWriteFinish: {
                            stabilityThreshold: 1.5 * 1000,
                            pollInterval: 100
                        }
                    })
                    watcher.on("ready", (/* ev, path */) => {
                        /*  filesysten watching is ready  */
                        timer = setTimeout(handler, 0.0 * 1000)
                        ready = true
                    })
                    watcher.on("all", (ev, path) => {
                        /*  filesysten has changed  */
                        if (ready) {
                            need = true
                            changed[path] = true
                            if (!running) {
                                if (timer !== null)
                                    clearTimeout(timer)
                                timer = setTimeout(handler, 1.0 * 1000)
                            }
                        }
                    })
                })
            }
            else {
                /*  one-time execution  */
                await singleRun()
                return ""
            }
        }
    })
}

