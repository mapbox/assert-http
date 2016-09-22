/* jshint evil: true */
var _ = require('underscore');
var fs = require('fs');
var http = require('http');
var path = require('path');
var util = require('util');
var crypto = require('crypto');
var request = require('request');
var mapnik = require('mapnik');
var mkdirp = require('mkdirp');
var os = require('os');
var sortKeys = module.exports.sortKeys = require('sort-keys');
var _imageEqualsConfig = {};

//export the extended assert
var assert = module.exports.assert =require('./assert');
var updateFixtures = false;
module.exports.updateFixtures = function() {
    updateFixtures = true;
};

module.exports.mkdirpSync = mkdirpSync;
function mkdirpSync(p, mode) {
    var ps = path.normalize(p).split('/');
    var created = [];
    while (ps.length) {
        created.push(ps.shift());
        if (created.length > 1 && !fs.existsSync(created.join('/'))) {
            var err = fs.mkdirSync(created.join('/'), 0755);
            if (err) return err;
        }
    }
}

module.exports.md5 = md5;
function md5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
}

function dirty(fixture, handlers, callback) {
    var pattern = /$^/;
    if (handlers) {
        pattern = new RegExp('{(' + Object.keys(handlers).join('|') + ')_?([^}]+)?}');
    }

    var req = JSON.stringify(fixture.request);
    var res = _(fixture.response).clone();
    var next = function(err) {
        if (err) return callback(err);

        // Work through each handler and replace tokens.
        var matches = req.match(pattern);
        if (matches) {
            return handlers[matches[1]](fixture.request, matches[2], function(err, value) {
                if (err) return callback(err);
                var token = [];
                if (matches[1]) token.push(matches[1]);
                if (matches[2]) token.push(matches[2]);
                req = req.replace('{' + token.join('_') + '}', value||'');
                next();
            });
        }

        // All tokens have been replaced.
        req = JSON.parse(req);

        // Stringify body of JSON requests.
        if (req.headers && /json/.test(req.headers['content-type'])) {
            req.body = JSON.stringify(req.body);
        }
        return callback(null, req, res);
    };
    next();
}

module.exports.load = function(dirname) {
    return fs.readdirSync(dirname).sort().filter(function(basename) {
        if (basename[0] == '.') return false;
        return !(/\.(js|json|jsonp|txt|png|jpg|pbf|mvt|css|swp|html|kml|webp)$/.test(basename));
    }).map(function(basename) {
        var filepath = dirname + '/' + basename, fixture;
        try {
            fixture = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        } catch (e) {
            console.log(e);
            console.log(filepath);
        }
        var status = fixture.response.statusCode;
        var method = fixture.request.method.substr(0,3);
        return {
            id: basename,
            name: util.format('%s %s - %s', status, method, basename),
            filepath: filepath,
            fixture: fixture
        };
    });
};

module.exports.runtest = function(test, opts, callback) {
    var clean = function(k, v) {
        if (opts.clean && opts.clean[k]) return opts.clean[k](k, v, this);
        return v;
    };
    var fixture = test.fixture || JSON.parse(fs.readFileSync(test.filepath, 'utf8'));

    dirty(fixture, opts.handlers, function(err, req, res) {
        if (err) return callback(err, req, res);

        // Body comparison done outside of assert.response.
        delete res.body;

        // If should be safe to assume a headers object
        res.headers = res.headers || {};

        // @TODO temporary default user-agent header override.
        // move this out of runtest and into each test fixture.
        req.headers = req.headers || {};
        req.headers['user-agent'] = req.headers['user-agent'] || 'testagent';

        // Attach clean helper to res object.
        // @TODO this is a hack that assert.response interprets specifically for us.
        res.clean = clean;

        assert.response(req, res, function(err, response) {
            var extname = '';
            if (/text\/plain/.test(response.headers['content-type'])) {
                extname = '.txt';
            } else if (/text\/html/.test(response.headers['content-type'])) {
                extname = '.html';
            } else if (/text\/css/.test(response.headers['content-type'])) {
                extname = '.css';
            } else if (/json/.test(response.headers['content-type'])) {
                extname = '.json';
            } else if (/(application|text)\/javascript/.test(response.headers['content-type'])) {
                extname = '.js';
            } else if (/png/.test(response.headers['content-type'])) {
                extname = '.png';
            } else if (/jpeg/.test(response.headers['content-type'])) {
                extname = '.jpg';
            } else if (/mapbox-vector-tile/.test(response.headers['content-type'])) {
                extname = '.mvt';
            } else if (/protobuf/.test(response.headers['content-type'])) {
                extname = '.pbf';
            } else if (/kml/.test(response.headers['content-type'])) {
                extname = '.kml';
            } else if(/webp/.test(response.headers['content-type'])) {
                extname = '.webp';
            }


            // For status code differences, throw -- it's up to the developer
            // to update the expected status code, test again, and let the
            // fixture get updated. Body differences are handled below.
            if (err) {
                if (/Invalid response header/.test(err.message) && updateFixtures) {
                    return needsupdate();
                } else {
                    return callback(err, req, response);
                }
            }

            var actualHeaders = Object.keys(response.headers);
            actualHeaders.sort();
            var expectedHeaders = Object.keys(res.headers);
            expectedHeaders.sort();
            if (actualHeaders.toString() != expectedHeaders.toString()) {
                if (updateFixtures) return needsupdate();
                assert.fail(actualHeaders.toString(), expectedHeaders.toString(), 'Missing headers', '=');
            }

            // Load body from separate file if necessary.
            var expected;
            try {
                expected = fixture.response.body || fs.readFileSync(test.filepath + (extname || '.body'), 'utf8');
            } catch(e) {
                if (e.code !== 'ENOENT') throw e;
            }

            if (response.body && !expected) {
                var e = new Error('Unexpected response body');
                if (updateFixtures) {
                    console.error(e);
                    return needsupdate();
                } else {
                    return callback(e, req, response);
                }
            }

            if (expected) try {
                switch (extname) {
                    case '.txt':
                    case '.html':
                    case '.kml':
                        assert.equal(clean.call({}, 'body', response.body), expected);
                        break;
                    case '.json':
                        assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(response.body), clean)), expected);
                        break;
                    case '.jsonp':
                        var cbA = expected.toString().match(/^[a-z]+/)[0];
                        var cbB = response.body.match(/^[a-z]+/)[0];
                        assert.deepEqual(
                            eval('function '+cbB+'(d) { return d; }; ' + response.body),
                            eval('function '+cbA+'(d) { return d; }; ' + expected));
                        break;
                    case '.js':
                        var jsonp = response.body.match(/^[A-z]+\([{["'0-9]/);
                        if (jsonp) {
                            var cbA = expected.toString().match(/^[a-z]+/)[0];
                            var cbB = response.body.match(/^[a-z]+/)[0];
                            var resA = eval('function '+cbA+'(d) { return d; }; ' + expected);
                            var resB = eval('function '+cbB+'(d) { return d; }; ' + response.body);
                            assert.deepEqual(JSON.parse(JSON.stringify(resB, clean)), resA);
                        } else {
                            assert.equal(response.body, expected);
                        }
                        break;
                    case '.css':
                        assert.equal(response.body, expected);
                        break;
                    case '.pbf':
                    case '.mvt':
                        assert.deepEqual(new Buffer(response.body, 'binary'), fs.readFileSync(test.filepath + extname));
                        break;
                    case '.png':
                    case '.jpg':
                    case '.webp':
                        return imageEquals(new Buffer(response.body, 'binary'), fs.readFileSync(test.filepath + extname), _imageEqualsConfig, function(err) {
                            if (err && updateFixtures) {
                                console.error(err);
                                return needsupdate();
                            }
                            callback(err, req, response);
                        });
                        break;
                }
            } catch(e) {
                if (updateFixtures) {
                    console.error(e);
                    return needsupdate();
                } else {
                    return callback(e, req, response);
                }
            }

            function needsupdate() {
                console.warn('\n');
                console.warn('  *** Updating fixtures (mismatch at %s)', path.basename(test.filepath));
                console.warn('ext: %s', extname);
                console.warn('');

                fixture.response.statusCode = response.statusCode;
                fixture.response.headers = response.headers;
                switch (extname) {
                case '.txt':
                    fixture.response.body = response.body;
                    break;
                case '.json':
                    fixture.response.body = JSON.parse(response.body);
                    break;
                case '.jsonp':
                    var matches = response.body.match(/^([\w]+)\((.*)\);$/);
                    var data = matches[1] + '(' + JSON.stringify(sortKeys(JSON.parse(matches[2])), clean, 2) + ');';
                    fs.writeFileSync(test.filepath + extname, data, 'utf8');
                    delete fixture.response.body;
                    break;
                case '.js':
                case '.css':
                case '.html':
                    fs.writeFileSync(test.filepath + extname, response.body, 'utf8');
                    delete fixture.response.body;
                    break;
                case '.png':
                case '.jpg':
                case '.pbf':
                case '.mvt':
                case '.webp':
                    fs.writeFileSync(test.filepath + extname, response.body, 'binary');
                    delete fixture.response.body;
                    break;
                default:
                    fixture.response.body = response.body;
                    break;
                }
                fs.writeFileSync(test.filepath, JSON.stringify(sortKeys(fixture), clean, 2) + '\n');

                callback(err, req, response);
            }

            return callback(err, req, response);
        });
    });
};

// Image comparison.
module.exports.imageEqualsConfig = imageEqualsConfig;
module.exports.imageEquals = imageEquals;

function imageEqualsConfig(options) {
    if (typeof options === 'undefined') return _imageEqualsConfig;
    if (typeof options.threshold === 'number') _imageEqualsConfig.threshold = options.threshold;
    if (typeof options.diffsize === 'number') _imageEqualsConfig.diffsize = options.diffsize;
    if (typeof options.diffpx === 'number') _imageEqualsConfig.diffpx = options.diffpx;
    return _imageEqualsConfig;
}

function imageEquals(buffer, fixture, options, callback) {
    options = options || {};
    options.threshold = typeof options.threshold === 'number' ? options.threshold : 16;
    options.diffsize = typeof options.diffsize === 'number' ? options.diffsize : 0.10;
    options.diffpx = typeof options.diffpx === 'number' ? options.diffpx : 0.02;

    var sizediff = Math.abs(fixture.length - buffer.length) / fixture.length;
    if (sizediff > options.diffsize) {
        return callback(new Error('Image size is too different from fixture: ' + buffer.length + ' vs. ' + fixture.length));
    }
    var expectImage = new mapnik.Image.fromBytesSync(fixture);
    var resultImage = new mapnik.Image.fromBytesSync(buffer);

    // Allow < 2% of pixels to vary by > default comparison threshold of 16.
    var pxThresh = resultImage.width() * resultImage.height() * options.diffpx;
    var pxDiff = expectImage.compare(resultImage, { threshold: options.threshold });

    if (pxDiff > pxThresh) {
        callback(new Error('Image is too different from fixture: ' + pxDiff + ' pixels > ' + pxThresh + ' pixels'));
    } else {
        callback();
    }
}

