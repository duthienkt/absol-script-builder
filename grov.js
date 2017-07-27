var fs = require("fs");

function FileMonitor(path) {
    var lastModify = "";
    var onModify;
    this.tick = function() {
        fs.stat(path, function(err, stats) {
            if (err) {
                console.log(err);
            }
            else {
                if (stats.mtime + "" != lastModify) {
                    lastModify = stats.mtime + "";
                    if (onModify)
                        onModify();
                }
            }
        });
    };

    this.setOnModify = function(callback) {
        onModify = callback;
        return this;
    };

    this.start = function(ms) {
        if (!ms)
            ms = 3000;
        setInterval(this.tick, ms);
    };
}


function CssBuilder(path) {
    this.lastModify = "";
    this.outPath = "temp.txt";
    this.id = "temp";
    this.path = path;
    var THIS = this;
    this.to = function(path2) {
        THIS.outPath = path2;
        return THIS;
    };
    this.withId = function(id) {
        THIS.id = id;
        return THIS;
    };
    this.build = function() {
        fs.stat(path, function(err, stats) {
            if (THIS.lastModify + "" == stats.mtime + "") return;
            console.log(stats.mtime);
            THIS.lastModify = stats.mtime;
            console.log("Build file \"" + path + "\" to \"" + THIS.outPath + "\" with id=\"" + THIS.id + "\"");
            fs.readFile(path, function(err, data) {
                var wdata =
                    "<?php\n$content[\"" +
                    THIS.id +
                    "\"] = function(){ ?>\n<style>\n" +
                    data +
                    "\n</style>\n<?php\n}?>\n";
                fs.writeFile(THIS.outPath, wdata, 'utf8');
            });

        });
    };
}



function JavaScriptBuilder(path) {
    this.lastModify = "";
    this.outPath = "temp.txt";
    this.id = "temp";
    this.path = path;
    var THIS = this;
    this.to = function(path2) {
        THIS.outPath = path2;
        return THIS;
    };
    this.withId = function(id) {
        THIS.id = id;
        return THIS;
    };
    this.build = function() {
        fs.stat(path, function(err, stats) {
            if (THIS.lastModify == stats.mtime) return;
            console.log(stats.mtime);
            THIS.lastModify = stats.mtime;
            console.log("Build file \"" + path + "\" to \"" + THIS.outPath + "\" with id=\"" + THIS.id + "\"");
            fs.readFile(path, function(err, data) {
                var wdata =
                    "<?php\n$content[\"" +
                    THIS.id +
                    "\"] = function(){ ?>\n<script type=\"text/javascript\">\n" +
                    data +
                    "\n</script>\n<?php\n}?>\n";
                fs.writeFile(THIS.outPath, wdata, 'utf8');
            });

        });
    };
}

function BuilderManager() {
    var builders = [];
    var THIS = this;
    this.css = function(path) {
        var b = new CssBuilder(path);
        builders.push(b);
        return b;

    };

    this.js = function(path) {
        var b = new JavaScriptBuilder(path);
        builders.push(b);
        return b;

    };

    this.buildAll = function() {
        builders.forEach(function(builder) {
            builder.build();
        });
    };

    this.printDocument = function(path) {
        var data = "| Source | Output | Id |\n|---|---|---|\n";
        for (var i = 0; i < builders.length; ++i) {
            data += "| " + builders[i].path + " | " + builders[i].outPath + " | " + builders[i].id + " |\n";
        }
    };

    this.start = function(inteval) {
        setInterval(THIS.buildAll, 1500);
    };
}

var b = new BuilderManager();
b.css('abc.txt').to('abc.css.php').withId('abc.css');
b.start(5000);
exports = new BuilderManager();
