var fs = require("fs");

function FileMonitor(path) {
    var lastModify = "";
    var onModify;
    var intevalId = false;
    this.tick = function() {
        if (fs.existsSync(path)) {
            // Do something

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
        }
        else {
            console.log("Error : " + path + " not found");
        }
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
    this.stop = function() {
        if (intevalId) {
            clearInterval(intevalId);
            intevalId = false;
        }
    };
}

// new FileMonitor(".gitignore").setOnModify(function(){console.log("edit")}).start();

var builders = {};

builders.css = function(rec) {
    fs.readFile(rec.input, function(err, data) {
        if (err) {
            console.log(err);
        }
        else {
            var wdata =
                "<?php\n$CONTENT->exports[\"" +
                rec.id +
                "\"] = function(){ ?>\n<style>\n" +
                data +
                "\n</style>\n<?php\n}?>\n";
            fs.writeFile(rec.output, wdata, 'utf8');
        }
    });

};


builders.js = function(rec) {
    fs.readFile(rec.input, function(err, data) {
        if (err) {
            console.log(err);
        }
        else {
            var wdata =
                "<?php\n$CONTENT->exports[\"" +
                rec.id +
                "\"] = function(){ ?>\n<script type=\"text/javascript\">\n" +
                data +
                "\n</script>\n<?php\n}?>\n";
            fs.writeFile(rec.output, wdata, 'utf8');
        }
    });

};


builders.raw = function(rec) {
    fs.createReadStream(rec.input).pipe(fs.createWriteStream(rec.output));
};

builders.txt = function(rec) {
    fs.readFile(rec.input, function(err, data) {
        if (err) {
            console.log(err);
        }
        else {
            var wdata =
                "<?php\n$CONTENT->exports[\"" +
                rec.id +
                "\"] = function(){ ?>\n" +
                data +
                "\n<?php\n}?>\n";
            fs.writeFile(rec.output, wdata, 'utf8');
        }
    });
};


function Builder(rec) {

}

exports.createBuilder = function(path) {
    if (fs.existsSync(path)) {
        
    }
    else {
        console.log("Error : "+ path +" not found");
    }
};





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

// var b = new BuilderManager();
// b.css('abc.txt').to('abc.css.php').withId('abc.css');
// b.start(5000);
// exports = new BuilderManager();
