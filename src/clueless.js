/* eslint no-console: 0 */
'use strict';

var fs = require('fs');
var path = require('path');
var less = require('less');
var walk = require('walk');
var merge = require('lodash.merge');

module.exports = function(lessDir, options, callback) {
    options = options || {};
    options.lessDir = lessDir;

    findLessFiles(lessDir, function(err, files) {
        if (err) {
            return console.error(err);
        }

        monitorLess(files, options, callback);
    });
};

function monitorLess(lessFiles, options, callback) {
    // Quite often we'll see two or more change events within a short timespan
    // This object keeps timeout references, keyed by filename, so we can easily
    // avoid running compilation multiple times
    var debouncers = {};

    // Holds the number of imports for each root-level less file. If this number
    // changes, we should trigger a re-initialization of the dependency tree, as
    // we might have new dependencies to consider
    var importCounters = {};

    // Initialize dependency tree
    var rootLessFiles = getRootLessFiles(lessFiles);
    var depTree = getLessDependencyTree(rootLessFiles);

    // Compile on initial launch
    rootLessFiles.forEach(compileLess);

    function onLessChanged(err, file) {
        if (err) {
            return console.error(err);
        }

        clearTimeout(debouncers[file]);
        debouncers[file] = setTimeout(function() {
            log('Changed: ' + file);
            var name = path.basename(file);
            if (depTree[name]) {
                depTree[name].forEach(compileLess);
            } else if (name[0] !== '_') {
                compileLess(file);
            }
        }, 25);
    }

    function compileLess(file) {
        log('Compile: ' + file);
        fs.readFile(file, { encoding: 'utf-8' }, function(err, content) {
            if (err) {
                console.error('[LESS] ' + err);
                return;
            }

            var opts = merge({}, options, { filename: file });
            less.render(content, opts).then(function(output) {
                var filename = path.basename(file, '.less') + '.css';
                var destination = path.join(opts.outputDir, filename);
                var destFile = '/' + path.relative(opts.publicDir, destination);

                fs.writeFile(destination, output.css, function(writeErr) {
                    if (err) {
                        console.error('[LESS] Error writing compiled less: ', writeErr.toString());
                        return;
                    }

                    log('Wrote ' + destination);
                    callback(null, destFile);
                });
            }, function(lessErr) {
                console.error('[LESS] Error: ', lessErr.toString());
            });
        });
    }

    function getRootLessFiles(files) {
        return files.filter(function(file) {
            return path.basename(file).indexOf('_') !== 0 && path.extname(file) === '.less';
        });
    }

    function getLessDependencyTree(rootFiles) {
        var tree = {};
        rootFiles.forEach(function(file) {
            getLessDependenciesFromFile(file).forEach(function(dependency) {
                tree[dependency] = tree[dependency] || [];
                tree[dependency].push(file);
            });
        });

        return tree;
    }

    function getLessDependenciesFromFile(file) {
        var content = fs.readFileSync(file, { encoding: 'utf-8' });
        return getLessDependencies(file, content);
    }

    function getLessDependencies(file, content) {
        var pattern = /@import\s+["'](.*?)["']/g, match;
        var dependencies = [];

        do {
            match = pattern.exec(content);
            if (match) {
                dependencies.push(
                    match[1].match(/\.less$/) ?
                    match[1] :
                    match[1] + '.less'
                );
            }
        } while (match);

        if (importCounters[file] && importCounters[file] !== dependencies.length) {
            // Trigger re-init of tree
            log(
                'Number of imports for ' + path.basename(file) +
                ' changed, re-initializing dependency tree'
            );

            process.nextTick(function() {
                depTree = getLessDependencyTree(getRootLessFiles(lessFiles));
            });
        } else if (!importCounters[file]) {
            importCounters[file] = dependencies.length;
        }

        var newFiles = dependencies.map(function(item) {
            return path.join(options.lessDir, item);
        }).filter(function(item) {
            return lessFiles.indexOf(item) === -1;
        });

        watchLessFiles(newFiles, onLessChanged);

        return dependencies;
    }

    function log(msg) {
        if (options.verbose) {
            console.log('[LESS] ' + msg);
        }
    }

    watchLessFiles(lessFiles, onLessChanged);
}

function findLessFiles(dir, callback) {
    var walker = walk.walk(dir, { followLinks: false });
    var files = [];

    walker.on('file', function(rootDir, fileStats, next) {
        if (path.extname(fileStats.name) === '.less') {
            var filePath = path.resolve(rootDir, fileStats.name);
            files.push(filePath);
        }

        next();
    });

    walker.on('end', function() {
        callback(null, files);
    });
}

function watchLessFiles(files, callback) {
    files.forEach(function(filePath) {
        fs.watch(filePath, function() {
            callback(null, filePath);
        });
    });
}
