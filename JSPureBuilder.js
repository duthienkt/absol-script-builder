const babel = require("@babel/core");
const fs = require('fs');
const traverse = require("@babel/traverse").default;
const path = require('path');

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

    this._buildSync = Promise.resolve();
    this.sync = this.depthBuildFile(path.join(this.root, this.entry), {})
        .then(this._sortIds.bind(this))
        .then(this._writeOutput.bind(this))
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
        return path.relative(this.root, path.join(folder, rqPath)).replace(/\\/g, '/');
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
                prev: prev
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
            self.buildCSS(filePath, transformInfo);
        }
        else if (extName === '.json') {
            self.buildJSON(filePath, transformInfo);
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
                ]
            ],
        })
    }).then(function (bbResult) {
        var importList = self._getImportList(bbResult.ast);
        transformInfo.code = bbResult.code;//.replace(/(\r?\n)function\s+(_interopRequire|_getRequireWildcardCache)[^\r\n]+(\r?\n)/g, '\n');
        transformInfo.code = '/*** module: ' + transformInfo.moduleId + ' ***/\n' + transformInfo.code;
        transformInfo.type = 'javascript';
        var loadingImportFilePaths = importList.map(function (rqPath) {
            return self._resolveFilePathAsync(self._resolveImportPath(filePath, rqPath));
        });

        return Promise.all(loadingImportFilePaths).then(function (result) {
            return result.map(function (aPath) {
                return (path.relative(self.root, aPath) || '.').replace(/\\/g, '/');
            });
        }).then(function (dependencies) {
            transformInfo.dependencies = arrRemoveDup(dependencies);
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
    });
};


JSPureBuilder.prototype.buildJSON = function (filePath, transformInfo) {
    var self = this;
    return self._readFileAsync(filePath).then(function (code) {
        transformInfo.dependencies = [];
        transformInfo.code = '/*** module: ' + transformInfo.moduleId + ' ***/\n' + 'module.exports = ' + code + ';\n';
        transformInfo.type = 'javascript';
    });
};


JSPureBuilder.prototype.buildCSS = function (filePath, transformInfo) {
    var self = this;
    return self._readFileAsync(filePath).then(function (code) {
        transformInfo.dependencies = {};

        var id = path.relative(self.root, filePath).replace(/^node_module/, 'mdl').replace(/[/\\]/, '__');
        transformInfo.code = 'document.getElementById("' + id + '");\n';
        transformInfo.styleSheet = '/*** module: ' + transformInfo.moduleId + ' ***/\n' + code;
        transformInfo.type = 'stylesheet'
        transformInfo.id = id;
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
                        var longId = (path.relative(self.root, mainFPath)).replace(/\\/g, '/');
                        if (longId !== shortId && shortId + '.js' !== longId) {
                            self.shortIds[shortId] = longId;
                            console.log('Map ', shortId, '=>', longId);
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
    var transformedFiles = this.transformedFiles;
    var us = Object.keys(this.transformedFiles)
    var graph = us.reduce(function (ac, u) {
        ac[u] = { vs: transformedFiles[u].dependencies.slice() };
        ac[u].count = Object.keys(ac[u].vs).length;
        return ac;
    }, {});


    var entryID = path.relative(this.root, path.join(this.root, this.entry));
    var d = {};
    var inStack = {};
    var counter = 1;

    function visit(u) {
        d[u] = counter++;
        inStack[u] = true;
        var vs = graph[u].vs.reverse();
        vs.forEach(function (v) {
            if (inStack[v]) {
                console.log("Loop", u, v);
            }
            else {
                if (!d[v] || counter > d[v]) {
                    visit(v);
                }
            }

        })
        inStack[u] = false;
    }

    visit(entryID, 1);
    us.sort(function (a, b) {
        return d[b] - d[a];
    })
    this.sortedIds = us;
};

JSPureBuilder.prototype._writeOutput = function () {
    var transformedFiles = this.transformedFiles;
    var sortedIds = this.sortedIds;
    var output = this.output;
    var jsFolder = path.join(output, 'js');
    var cssFolder = path.join(output, 'css');
    if (!fs.existsSync(output)) fs.mkdirSync(output);
    if (!fs.existsSync((jsFolder))) fs.mkdirSync(jsFolder);
    if (!fs.existsSync(cssFolder)) fs.mkdirSync(cssFolder);
    sortedIds.forEach(function (id) {
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
            fs.readFile(destFile, 'utf8', function (err, data) {
                if (err || data !== transformedFile.code) {
                    console.log(err ? "New " : "Update ", destFile);
                    fs.writeFile(destFile, transformedFile.code, 'utf8', function (err) {
                    });
                }
            });
        }
        else if (transformedFile.type === 'stylesheet') {
            destFile = path.join(output, 'css', fName);
            if (!destFile.toLowerCase().match(/\.css$/)) destFile += '.css';
            fs.readFile(destFile, 'utf8', function (err, data) {
                if (err || data !== transformedFile.styleSheet) {
                    console.log(err ? "New " : "Update ", destFile);
                    fs.writeFile(destFile, transformedFile.styleSheet, 'utf8', function (err) {
                        if (err) console.error(err);
                    });
                }
            });
        }
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

    phpCode += '    ' + this.phpVar + ' = array("js"=> ' + this.phpVar + '_js,\n' +
        '        "css" => ' + this.phpVar + '_css,\n' +
        '        "dir" => ' + this.phpVar + '_dir\n' +
        '    );\n\n';

    phpCode += '?>';

    fs.readFile(phpPath, 'utf8', function (err, data) {
        if (err || data !== phpCode) {
            console.log(err ? "New " : "Update ", phpPath);
            fs.writeFile(phpPath, phpCode, 'utf8', function (err) {
                if (err) console.error(err);
            });
        }
    });

};


module.exports = JSPureBuilder;