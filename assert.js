var http = require('http');
var util = require('util');
var assert = require('assert-diff');
var zlib = require('zlib');
var _ = require('underscore');

var assertplus = module.exports = {};

assertplus.response = function(req, res, callback) {
    // res argument is optional.
    callback = callback || (typeof res === 'function' ? res : function() {});

    // Issue request
    var encoding = req.encoding || 'utf8';
    var request = http.request({
        host: req.host || '127.0.0.1',
        port: req.port,
        path: req.path || req.url,
        method: req.method || 'GET',
        headers: req.headers
    });

    if (req.data || req.body) request.write(req.data || req.body);

    // Response normalization.
    res.statusCode = res.statusCode || res.status;

    request.on('response', function(response) {
        var buffers = [];
        response.body = '';
        response.on('data', function(chunk) { buffers.push(chunk); });
        response.on('end', function() {
            response.body = Buffer.concat(buffers);
            var err = null;
            try {
                // Assert response status
                if (typeof res.statusCode === 'number') {
                    assert.equal(
                        res.statusCode,
                        response.statusCode,
                        'Invalid response status code.\n' +
                            '     Expected: ' + res.statusCode + '\n' +
                            '     Got: ' + response.statusCode + ' ' + response.body
                    );
                }

                // Assert response headers
                if (res.headers) {
                    response._rawHeaders = response.headers;
                    // Use fixjson method if provided to normalize response
                    // headers to fixture format.
                    if (res.clean) {
                        response.headers = JSON.parse(JSON.stringify(response.headers, res.clean));
                    }
                    var keys = Object.keys(res.headers);
                    for (var i = 0, len = keys.length; i < len; ++i) {
                        var name = keys[i],
                            actual = response.headers[name.toLowerCase()],
                            expected = res.headers[name];
                            if (expected instanceof RegExp) {
                                assert.ok(expected.test(actual),
                                    'Invalid response header ' + name + '.\n' +
                                        '    Expected: ' + expected + '\n' +
                                        '    Got: ' + actual
                                );
                            } else {
                                assert.deepEqual(actual, expected,
                                    'Invalid response header ' + name + '.\n' +
                                        '    Expected: ' + expected + '\n' +
                                        '    Got: ' + actual
                                );
                            }
                    }
                }

                // Assert response body
                if (res.body !== undefined) {
                    response.body = response.body.toString(encoding);
                    var eql = res.body instanceof RegExp ?
                        res.body.test(response.body) :
                        res.body === response.body;
                    assert.ok(
                        eql,
                        'Invalid response body.\n' +
                            '    Expected: ' + util.inspect(res.body) + '\n' +
                            '    Got: ' + util.inspect(response.body)
                    );
                }
                // handle gzipped responses
                if (response.headers['content-encoding'] == 'gzip') {
                    zlib.gunzip(response.body, function(err, buffer){
                        if (err) {
                            return callback(err, response);
                        } else {
                            response.body = buffer.toString(encoding);
                            return callback(err, response);
                        }
                    });
                } else {
                    response.body = response.body.toString(encoding);
                    return callback(err, response);
                }
            }
            catch (e) {
                return callback(e, response);
            }
        });
    });
    request.end();
};

assertplus = _(assertplus).extend(assert);
