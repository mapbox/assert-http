Assert HTTP
-----------

Test helpers for testing a HTTP interface. This library contains two primary interfaces; a test runner which executes a set of HTTP calls as described by files in a directory, and a extension to the assert module.

[![Build Status](https://travis-ci.com/mapbox/assert-http.svg?branch=master)](https://travis-ci.com/mapbox/assert-http)
[![Build status](https://ci.appveyor.com/api/projects/status/6rnqyj048nf5k84g)](https://ci.appveyor.com/project/Mapbox/assert-http)

## HTTP testing inferface

With [mocha](http://mochajs.org/), usage looks like;

```
describe('api server', function(done) {
    fixtures.load('/path/to/tests/').forEach(function(test) {
        it(test.name, function(done) {
            fixtures.runtest(test, {handlers: handlers, clean: clean}, done);
        });
    });
});
```

### assertHTTP.load(dirname)

Syncronous function that loads text fixtures from a directory. Returns an array of test objects.

### assertHTTP.runtest(test, options, callback)

Runs an individual test. Requires a test object (from assertHTTP.load), options object and callback function. The options object may contain the keys;

* `handlers`; an object of keys and replacer methods for populating http requests. Handlers are async and have the function signature `function(req, value, next)`
* `clean`; an object of keys and replacer methods for sanitizing http response headers and body. Replacer methodes have the signature `function(key, value, context)`

### assertHTTP.updateFixtures()

Call this method to notify assertHTTP to update fixtures as it runs.

### assertHTTP.mkdirpSync(path)

Sync version of mkdirp

### assertHTTP.md5(string)

md5 helper.

### assertHTTP.imageEquals(buffer, buffer, options)

A pixel-by-pixel comparison of two image buffers using the node-mapnik `Image.compare()` API. The options object may contain the keys:

* `threshold`; tolerance level of RGB value difference between two pixels. Defaults to 16.
* `diffsize`; a float between 0-1 expressing the max allowed difference between buffer lengths. Defaults to 0.1.
* `diffpx`; a float between 0-1 expressing the max number of pixels allowed to exceed the `threshold` option. Defaults to 0.02.

## Assertion module extension

### assert.response(req, res, callback)

If `res.clean` is present it is expected to be a method that `json.stringify` can use to sanitize the response headers.
