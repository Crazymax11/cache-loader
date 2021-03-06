'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var fs = require('fs');
var crypto = require('crypto');
var path = require('path');
var mkdirp = require('mkdirp');
var async = require('async');
var loaderUtils = require('loader-utils');
var pkgVersion = require('../package.json').version;

var defaultCacheDirectory = path.resolve('.cache-loader');
var ENV = process.env.NODE_ENV || 'development';

function loader() {
  for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
    args[_key] = arguments[_key];
  }

  var callback = this.async();
  var data = this.data;

  var dependencies = this.getDependencies().concat(this.loaders.map(function (l) {
    return l.path;
  }));
  var contextDependencies = this.getContextDependencies();
  var toDepDetails = function toDepDetails(dep, mapCallback) {
    fs.stat(dep, function (err, stats) {
      if (err) {
        mapCallback(err);
        return;
      }
      fs.readFile(dep, 'utf-8', function (err, content) {
        if (err) {
          mapCallback(err);
          return;
        }

        mapCallback(null, {
          path: dep,
          mtime: stats.mtime.getTime(),
          hash: digest(content)
        });
      });
    });
  };
  async.parallel([function (cb) {
    return async.mapLimit(dependencies, 20, toDepDetails, cb);
  }, function (cb) {
    return async.mapLimit(contextDependencies, 20, toDepDetails, cb);
  }], function (err, taskResults) {
    if (err) {
      callback.apply(undefined, [null].concat(args));
      return;
    }

    var _taskResults = _slicedToArray(taskResults, 2),
        deps = _taskResults[0],
        contextDeps = _taskResults[1];

    var writeCacheFile = function writeCacheFile() {
      fs.writeFile(data.cacheFile, JSON.stringify({
        remainingRequest: data.remainingRequest,
        cacheIdentifier: data.cacheIdentifier,
        dependencies: deps,
        contextDependencies: contextDeps,
        result: args
      }), 'utf-8', function () {
        // ignore errors here
        callback.apply(undefined, [null].concat(args));
      });
    };
    if (data.fileExists) {
      // for performance skip creating directory
      writeCacheFile();
    } else {
      mkdirp(path.dirname(data.cacheFile), function (mkdirErr) {
        if (mkdirErr) {
          callback.apply(undefined, [null].concat(args));
          return;
        }
        writeCacheFile();
      });
    }
  });
}

function pitch(remainingRequest, prevRequest, dataInput) {
  var _this = this;

  var loaderOptions = loaderUtils.getOptions(this) || {};
  var defaultOptions = {
    cacheDirectory: defaultCacheDirectory,
    cacheIdentifier: `cache-loader:${pkgVersion} ${ENV}`
  };
  var options = Object.assign({}, defaultOptions, loaderOptions);
  var cacheIdentifier = options.cacheIdentifier,
      cacheDirectory = options.cacheDirectory;

  var data = dataInput;
  var callback = this.async();
  var hash = digest(`${cacheIdentifier}\n${remainingRequest}`);
  var cacheFile = path.join(cacheDirectory, `${hash}.json`);
  data.remainingRequest = remainingRequest;
  data.cacheIdentifier = cacheIdentifier;
  data.cacheFile = cacheFile;
  fs.readFile(cacheFile, 'utf-8', function (readFileErr, content) {
    if (readFileErr) {
      callback();
      return;
    }
    data.fileExists = true;
    var cacheData = void 0;
    try {
      cacheData = JSON.parse(content);
    } catch (e) {
      callback();
      return;
    }
    if (cacheData.remainingRequest !== remainingRequest || cacheData.cacheIdentifier !== cacheIdentifier) {
      // in case of a hash conflict
      callback();
      return;
    }
    async.each(cacheData.dependencies.concat(cacheData.contextDependencies), function (dep, eachCallback) {
      fs.readFile(dep.path, 'utf-8', function (err, content) {
        if (err) {
          eachCallback(err);
          return;
        }
        if (digest(content) !== dep.hash) {
          eachCallback(true);
          return;
        }

        eachCallback();
      });
      /*
      fs.stat(dep.path, (statErr, stats) => {
        if (statErr) {
          eachCallback(statErr);
          return;
        }
        if (stats.mtime.getTime() !== dep.mtime) {
          eachCallback(true);
          return;
        }
        eachCallback();
      });
      */
    }, function (err) {
      if (err) {
        callback();
        return;
      }
      cacheData.dependencies.forEach(function (dep) {
        return _this.addDependency(dep.path);
      });
      cacheData.contextDependencies.forEach(function (dep) {
        return _this.addContextDependency(dep.path);
      });
      callback.apply(undefined, [null].concat(_toConsumableArray(cacheData.result)));
    });
  });
}

function digest(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

exports.default = loader;
exports.pitch = pitch;