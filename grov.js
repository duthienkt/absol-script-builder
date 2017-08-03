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
        intevalId = setInterval(this.tick, ms);
        return this;
    };
    this.stop = function() {
        if (intevalId) {
            clearInterval(intevalId);
            intevalId = false;
        }
        return this;
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

builders.php = builders.raw;




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

builders.html = builders.txt;

builders.folder = function(rec){
    
};


function Builder(path, inteval) {
    var THIS = this;
    var data;
    var monitorsHolder = [];
    var id = 0;
    function MonitorHolder(item) {
        var fileMonitor = new FileMonitor(item.input)
            .setOnModify(function() {
                if (builders[item.type]) {
                    builders[item.type](item);
                    console.log("["+(++ id) +"] "+ item.input +" -> "+ item.output);
                }
            }).start();

        this.dispose = function() {
            fileMonitor.stop();
        };
    }

    this.onSettingFileChanged = function() {
        fs.readFile(path, function(err, data) {
            if (err) {
                console.log(err);
            }
            else {
                var rec = JSON.parse(data);
                if (rec) {
                    THIS.onDataChanged(rec);
                }
            }
        });
    };

    this.onDataChanged = function(rec) {
        data = rec;
        for (var i = 0; i < monitorsHolder.length; ++i)
            monitorsHolder[i].dispose();
        monitorsHolder = [];
        for (var i = 0; i < rec.items.length; ++i) {
            var item = rec.items[i];
            monitorsHolder.push(new MonitorHolder(item));
        }
        console.log("Setting changed");
    };

    var settingMonitor = new FileMonitor(path)
        .setOnModify(this.onSettingFileChanged).start(inteval);

    this.dispose = function() {
        for (var i = 0; i < monitorsHolder.length; ++i)
            monitorsHolder[i].dispose();
        monitorsHolder = [];
        settingMonitor.stop();
    };
}

exports.createBuilder = function(path, inteval) {
    if (!inteval) inteval = 3000; 
    return new Builder(path, inteval);
};

