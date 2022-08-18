const babel = require("@babel/core");
const fs = require('fs');
const traverse = require("@babel/traverse").default;
const path = require('path');


function hashCode(cHash, text) {
    var hash = cHash || 0, i, chr;
    if (this.length === 0) return hash;
    for (i = 0; i < text.length; i++) {
        chr = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

function comparingHashCode(text) {
    var hash = 0, i, chr;
    if (this.length === 0) return hash;
    for (i = 0; i < text.length; i++) {
        chr = text.charCodeAt(i);
        if (chr === 13) continue;
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

function compareText(text0, text1) {
    return comparingHashCode(text0) === comparingHashCode(text1);
}

/***
 *
 * @param {[]}arr
 * @return {[]}
 */
function arrRemoveDup(arr) {
    var d = {};
    var j = 0;
    for (var i = 0; i < arr.length; ++i) {
        if (!d[i]) {
            if (i !== j) {
                arr[j] = arr[i];
                d[arr[i]] = true;
            }
            ++j;
        }
    }
    while (arr.length > j) arr.pop();
    return arr;
}

function printLine(text, newLine) {
    if (newLine || newLine === undefined) {
        process.stdout.write(text + ' '.repeat(process.stdout.columns - text.length) + '\n');
    }
    else {
        process.stdout.write(text + ' '.repeat(process.stdout.columns - text.length) + '\r');
    }
}


function JSPureBuilder(opt) {
    this.opt = opt || {};
    this.root = this.opt.root || __dirname;
    this.entry = this.opt.entry || '.';
    this.output = this.opt.output || 'dist';
    this.indexedFile = this.opt.indexedFile || 'indexed_source.php';
    if (path.extname(this.indexedFile).toLowerCase() !== '.php')
        this.indexedFile += '.php';
    this.phpVar = this.opt.phpVar || '$indexed_source';
    if (!this.phpVar.startsWith('$')) this.phpVar = '$' + this.phpVar;
    this.transformedFiles = {};
    this.sortedIds = [];
    this.shortIds = {};
    this._filePathAsyncCache = {};

    this.jsFiles = [];
    this.jsModified = 0;

    this.cssFiles = [];
    this.cssModified = 0;


    this._buildSync = Promise.resolve();
    this.sync = this.depthBuildFile(path.join(this.root, this.entry), {})
        .then(this._sortIds.bind(this))
        .then(this._writeOutput.bind(this))
        .then(this._statAll.bind(this))
        .then(this._writeMap.bind(this));
}

JSPureBuilder.prototype._getImportList = function (ast) {
    var res = [];
    traverse(ast, {
        CallExpression: function (path) {
            const node = path.node;
            if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
                if (!path.context.scope.hasBinding('require')) {
                    var rqPath = node.arguments[0].value;
                    if (typeof rqPath === 'string')
                        res.push(rqPath);
                }
            }

        }
    });
    return res;
};

JSPureBuilder.prototype._resolveImportPath = function (buildFileFullPath, rqPath) {
    var folder = path.dirname(buildFileFullPath);
    if (rqPath.startsWith('.')) {
        return path.relative(this.root, path.join(folder, rqPath)).replace(/\\/g, '/') || '.';
    }
    else {
        return path.join(this.root, 'node_modules', rqPath).replace(/\\/g, '/');
    }
};

JSPureBuilder.prototype.depthBuildFile = function (buildFileFullPath, prev) {
    var self = this;
    var sync = this._buildSync.then(function () {
        return self._resolveFilePathAsync(buildFileFullPath);
    });
    this._buildSync = sync;
    sync = sync.then(function (filePath) {
        if (!filePath) return null;// not need to do
        var idPath = (path.relative(self.root, filePath) || '.').replace(/\\/g, '/');
        var transformInfo = self.transformedFiles[idPath];
        if (transformInfo) {
            return null;
        }
        else {
            transformInfo = {
                moduleId: idPath,
                prev: prev,
                dependencies: []
            };
            self.transformedFiles[idPath] = transformInfo;
        }

        var extName = path.extname(filePath).toLowerCase();

        if (extName === '.js') {
            return self.buildJS(filePath, transformInfo);
        }
        else if (extName.match(/\.(tpl|rels|xml|svg|txt)/)) {
            self.buildTpl(filePath, transformInfo);
        }
        else if (extName === '.css') {
            return self.buildCSS(filePath, transformInfo);
        }
        else if (extName === '.json') {
            return self.buildJSON(filePath, transformInfo);
        }
        else {
            throw new Error("Not detect type " + extName + '!');
        }
    });
    sync = sync.then(function (transformInfo) {
        if (!transformInfo) return;
        var buildDependenciesAsync = transformInfo.dependencies.map(function (id) {
            var cPrev = Object.assign({}, prev);
            cPrev[transformInfo.moduleId] = true;
            return self.depthBuildFile(path.join(self.root, id), cPrev);
        });
        return Promise.all(buildDependenciesAsync);
    });
    return sync;
};

JSPureBuilder.prototype._transformJSFile = function (path) {
    return new Promise(function (resolve, reject) {
        var worker = new Worker(__dirname + '/workerTransformJSFile.js', { WorkerData: { path: path } });
        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0)
                reject(new Error(`stopped with  ${code} exit code`));
        })
    });
};

JSPureBuilder.prototype.buildJS = function (filePath, transformInfo) {
    var self = this;
    return self._readFileAsync(filePath).then(function (code) {
        return babel.transformAsync(code, {
            ast: true,
            plugins: [
                ["@babel/plugin-transform-modules-commonjs",
                    {
                        "importInterop": "babel"
                    },
                ],
                "@babel/plugin-transform-spread",
                '@babel/plugin-transform-exponentiation-operator'
            ]//, not work?
            // generatorOpts:{
            //     format:{ indent:{
            //         style:"    "
            //     }}
            // }
        })
    }).then(function (bbResult) {
        var importList = self._getImportList(bbResult.ast);
        transformInfo.code = bbResult.code.replace(/(\r?\n)function\s+(_interopRequire|_getRequireWildcardCache)[^\r\n]+(\r?\n)/g, '\n');
        transformInfo.code = '/*** module: ' + transformInfo.moduleId + ' ***/\n' + transformInfo.code;
        transformInfo.type = 'javascript';
        var loadingImportFilePaths = importList.map(function (rqPath) {
            return self._resolveFilePathAsync(self._resolveImportPath(filePath, rqPath));
        });

        printLine('JS  ' + filePath, false);

        return Promise.all(loadingImportFilePaths).then(function (result) {
            return result.map(function (aPath) {
                return (path.relative(self.root, aPath) || '.').replace(/\\/g, '/');
            });
        }).then(function (dependencies) {
            transformInfo.dependencies = arrRemoveDup(dependencies);
            // transformInfo.dependencies.sort();
            return transformInfo;
        });
    }).catch(function (err) {
        console.log("Building", err);
    });
};

JSPureBuilder.prototype.buildTpl = function (filePath, transformInfo) {
    var self = this;
    return self._readFileAsync(filePath).then(function (code) {
        transformInfo.dependencies = [];
        transformInfo.code = '/*** module: ' + transformInfo.moduleId + ' ***/\n' + 'module.exports = ' + JSON.stringify(code) + ';\n';
        transformInfo.type = 'javascript';
        printLine('TPL ' + filePath, false);
    });
};


JSPureBuilder.prototype.buildJSON = function (filePath, transformInfo) {
    var self = this;
    return self._readFileAsync(filePath).then(function (code) {
        transformInfo.dependencies = [];
        transformInfo.code = '/*** module: ' + transformInfo.moduleId + ' ***/\n' + 'module.exports = ' + code + ';\n';
        transformInfo.type = 'javascript';
        printLine('JSON ' + filePath, false);
    });
};


JSPureBuilder.prototype.buildCSS = function (filePath, transformInfo) {
    var self = this;
    return self._readFileAsync(filePath).then(function (code) {
        transformInfo.dependencies = [];
        var id = (path.relative(self.root, filePath) || '.').replace(/^node_module/, 'mdl').replace(/[/\\]/, '__');
        transformInfo.code = 'document.getElementById("' + id + '");\n';
        transformInfo.styleSheet = '/*** module: ' + transformInfo.moduleId + ' ***/\n' + code;
        transformInfo.type = 'stylesheet'
        transformInfo.id = id;
        printLine('CSS ' + filePath, false);

    });
}

/***
 *
 * @param fPath
 * @return {Promise<string>}
 * @private
 */
JSPureBuilder.prototype._readFileAsync = function (fPath) {
    return new Promise(function (resolve, reject) {
        fs.readFile(fPath, 'utf8', function (err, data) {
            if (err) reject(err);
            else
                resolve(data)
        });
    });
};


/***
 *
 * @param {string} fPath absolute path
 * @return {string}
 * @private
 */
JSPureBuilder.prototype._resolveFilePathAsync = function (fPath) {
    var self = this;
    this._filePathAsyncCache[fPath] = this._filePathAsyncCache[fPath] || new Promise(function (resolve, reject) {
        function mainCheck(mainFPath) {
            fs.stat(mainFPath,
                function (err2, stats2) {
                    if (err2) {
                        reject(err2);
                    }
                    else {
                        var shortId = (path.relative(self.root, fPath) || '.').replace(/\\/g, '/');
                        var longId = (path.relative(self.root, mainFPath) || '.').replace(/\\/g, '/');
                        if (longId !== shortId && shortId + '.js' !== longId) {
                            self.shortIds[shortId] = longId;
                            printLine('Map ' + shortId + '=>' + longId);
                        }
                        resolve(mainFPath);
                    }
                })
        }

        fs.stat(fPath, function (err, stats) {
            if (err || fs.existsSync(fPath + '.js')) {
                mainCheck(fPath + '.js');
            }
            else {
                if (stats.isDirectory()) {
                    fs.stat(path.join(fPath, 'package.json'),
                        function (err1, stats1) {
                            if (err1) {
                                mainCheck(path.join(fPath, 'index.js'));
                            }
                            else {
                                self._readFileAsync(path.join(fPath, 'package.json')).then(function (res) {
                                    var value = JSON.parse(res);
                                    var mainFilePath = value.main || 'index.js';
                                    if (!fs.existsSync(path.join(fPath, mainFilePath))) {
                                        mainFilePath = "index.js";
                                    }
                                    if (mainFilePath.toLowerCase().split('.').pop() !== 'js')
                                        mainFilePath += '.js';
                                    mainCheck(path.join(fPath, mainFilePath));

                                }).catch(reject)
                            }
                        });
                }
                else if (stats.isFile()) {
                    resolve(fPath);
                }
            }
        })
    });
    return this._filePathAsyncCache[fPath];
};


JSPureBuilder.prototype._sortIds = function () {
    printLine("Sorting", false);
    var transformedFiles = this.transformedFiles;
    var us = Object.keys(this.transformedFiles);
    var graph = us.reduce(function (ac, u) {
        ac[u] = { vs: transformedFiles[u].dependencies.slice() };
        ac[u].count = Object.keys(ac[u].vs).length;
        return ac;
    }, {});


    var entryID = path.relative(this.root, path.join(this.root, this.entry));
    var d = {};
    var counter = 1;
    var visited = {};

    function visit(u) {
        if (visited[u]) return;
        visited[u] = true;
        var vs = graph[u].vs.slice();
        vs.forEach(function (v) {
            visit(v);
        })
        d[u] = counter++;
    }

    visit(entryID, 1);
    us.sort(function (a, b) {
        return d[a] - d[b];
    })
    this.sortedIds = us;
    printLine('SORT ' + us.length + ' items');


};

JSPureBuilder.prototype._calcHash = function () {
    var self = this;
    var transformedFiles = this.transformedFiles;
    var sortedIds = this.sortedIds;
    sortedIds.forEach(function (id) {
        var transformedFile = transformedFiles[id];
        if (transformedFile.type === 'javascript') {
            self.jsHash = hashCode(self.jsHash, transformedFile.code);
        }
        else if (transformedFile.type === 'stylesheet') {
            self.cssHash = hashCode(self.cssHash, transformedFile.styleSheet);
        }
    });
    printLine("Hash " + [self.jsHash, self.cssHash].join(':'));
};

JSPureBuilder.prototype._writeOutput = function () {
    var self = this;
    var transformedFiles = this.transformedFiles;
    var sortedIds = this.sortedIds;
    var output = this.output;
    var jsFolder = path.join(output, 'js');
    var cssFolder = path.join(output, 'css');
    if (!fs.existsSync(output)) fs.mkdirSync(output);
    if (!fs.existsSync((jsFolder))) fs.mkdirSync(jsFolder);
    if (!fs.existsSync(cssFolder)) fs.mkdirSync(cssFolder);

    var promises = sortedIds.map(function (id) {
        return new Promise(function (resolve) {

            var fName = id.replace(/^node_module/, 'mdl').replace(/[/\\]/g, '__');
            var transformedFile = transformedFiles[id];
            transformedFile.fName = fName;
            var destFile;

            if (transformedFile.type === 'javascript') {
                destFile = path.join(output, 'js', fName);

                if (!destFile.toLowerCase().match(/\.js$/)) {
                    destFile += '.js';
                    transformedFile.fName += '.js';
                }
                self.jsFiles.push(destFile);
                fs.readFile(destFile, 'utf8', function (err, data) {
                    if (err || !compareText(data, transformedFile.code)) {
                        printLine((err ? "New " : "Update ") + destFile);
                        fs.writeFile(destFile, transformedFile.code, 'utf8', function (err) {
                        });
                    }
                    else {
                        printLine("Unchange: " + destFile, false);
                    }
                    resolve();
                });
            }
            else if (transformedFile.type === 'stylesheet') {
                destFile = path.join(output, 'css', fName);
                if (!destFile.toLowerCase().match(/\.css$/)) destFile += '.css';

                self.cssFiles.push(destFile);
                fs.readFile(destFile, 'utf8', function (err, data) {
                    if (err || !compareText(data, transformedFile.styleSheet)) {
                        printLine((err ? "New " : "Update ") + destFile);
                        fs.writeFile(destFile, transformedFile.styleSheet, 'utf8', function (err) {
                            if (err) console.error(err);
                        });
                    }
                    else {
                        printLine("Unchange: " + destFile, false);
                    }
                    resolve();
                });
            }
        });
    });
    return Promise.all(promises);
};

JSPureBuilder.prototype._statAll = function () {
    var sync = [];
    this.cssFiles.forEach(fName => {
        sync.push(new Promise(rs => {
            fs.stat(fName, (err, stats) => {
                if (!err) {
                    this.cssModified = Math.max(stats.mtime.getTime(), this.cssModified);
                }
                else
                    console.log(err)
                rs();
            });
        }));
    });

    this.jsFiles.forEach(fName => {
        sync.push(new Promise(rs => {
            fs.stat(fName, (err, stats) => {
                if (!err) {
                    this.jsModified = Math.max(stats.mtime.getTime(), this.jsModified);
                }
                else
                    console.log(err)
                rs();
            });
        }));
    });

    return Promise.all(sync).then(() => {
        printLine(`Javascript Files: ${this.jsFiles.length}  -  ${new Date(this.jsModified)}`);
        printLine(`CSS Files: ${this.cssFiles.length}  -  ${new Date(this.cssModified)}`);
    });
};

JSPureBuilder.prototype._writeMap = function () {
    var output = this.output;
    var phpPath = path.join(output, this.indexedFile);
    var transformedFiles = this.transformedFiles;
    var sortedIds = this.sortedIds;
    var shortIds = this.shortIds;
    var shortIdsRev = Object.keys(shortIds).reduce(function (ac, sId) {
        var lId = shortIds[sId];
        ac[lId] = ac[lId] || [];
        ac[lId].push(sId);
        return ac;
    }, {});
    var jsCmd = sortedIds.reduce(function (ac, lId) {
        if (transformedFiles[lId].type === 'javascript') {
            ac.push(['module', lId, 'js/' + transformedFiles[lId].fName]);
            if (shortIdsRev[lId]) {
                ac.push.apply(ac, shortIdsRev[lId].map(function (sId) {
                    return ['map_module', lId, sId];
                }))
            }
        }
        return ac;
    }, []);

    var cssCmd = sortedIds.reduce(function (ac, lId) {
        if (transformedFiles[lId].type === 'stylesheet') {
            ac.push(['module', lId, 'css/' + transformedFiles[lId].fName]);
            if (shortIdsRev[lId]) {
                ac.push.apply(ac, shortIdsRev[lId].map(function (sId) {
                    return ['map_module', lId, sId];
                }))
            }
        }
        return ac;
    }, []);
    var phpCode = '<?php\n';
    phpCode += '    ' + this.phpVar + '_dir = __DIR__;\n\n';
    phpCode += '    ' + this.phpVar + '_js_mtime_stamp = ' + (this.jsModified / 1000 >> 0) + ';\n\n';
    phpCode += '    ' + this.phpVar + '_css_mtime_stamp = ' + (this.cssModified / 1000 >> 0) + ';\n\n';
    phpCode += '    ' + this.phpVar + '_js_mtime = gmdate(\'D, d M Y H:i:s\', ' + (this.jsModified / 1000 >> 0) + ').\' GMT\';\n';
    phpCode += '    ' + this.phpVar + '_css_mtime = gmdate(\'D, d M Y H:i:s\', ' + (this.cssModified / 1000 >> 0) + ').\' GMT\';\n';
    phpCode += '    ' + this.phpVar + '_css = array(\n';
    phpCode += cssCmd.map(function (cmd) {
        return '        array(' + cmd.map(function (t) {
            return JSON.stringify(t);
        }).join(', ') + ')';
    }).join(',\n')
    phpCode += '\n    );\n\n';


    phpCode += '    ' + this.phpVar + '_js = array(\n';
    phpCode += jsCmd.map(function (cmd) {
        return '        array(' + cmd.map(function (t) {
            return JSON.stringify(t);
        }).join(', ') + ')';
    }).join(',\n')
    phpCode += '\n    );\n\n';

    phpCode += '    ' + this.phpVar + ' = array("js"=> &' + this.phpVar + '_js,\n' +
        '        "css" => &' + this.phpVar + '_css,\n' +
        '        "dir" => &' + this.phpVar + '_dir,\n' +
        '        "css_mtime" => &' + this.phpVar + '_css_mtime,\n' +
        '        "js_mtime" => &' + this.phpVar + '_js_mtime,\n' +
        '        "css_mtime_stamp" => &' + this.phpVar + '_css_mtime_stamp,\n' +
        '        "js_mtime_stamp" => &' + this.phpVar + '_js_mtime_stamp\n' +
        '    );\n\n';

    phpCode += '?>';

    fs.readFile(phpPath, 'utf8', function (err, data) {
        if (err || !compareText(data, phpCode)) {
            printLine((err ? "New " : "Update ") + phpPath);
            fs.writeFile(phpPath, phpCode, 'utf8', function (err) {
                if (err) console.error(err);
            });
        }
    });
};


module.exports = JSPureBuilder;