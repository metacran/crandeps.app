var express = require('express');
var router = express.Router();
var request = require('request');
var async = require('async');

var base_url = 'https://crandb.r-pkg.org';

var base_packages = ["base", "compiler", "datasets", "graphics",
                     "grDevices", "grid", "methods", "parallel",
                     "splines", "stats", "stats4", "tcltk", "tools",
                     "utils"]

var re_pkgs = '\\/([-\\w0-9\\.,]+)';
var re_full = new RegExp('^' + re_pkgs + '$');

router.get(re_full, function(req, res) {
    var pkgs = parse_packages(req.params[0])
    res.set('Content-Type', 'application/json');
    do_query(res, pkgs);
});

function parse_packages(pkgs) {
    var pkgs = pkgs.split(",").map(function(pkg) {
	var pkg = pkg.split("-")
	return pkg
    })
    return pkgs
}

function do_query(res, pkgs) {
    var pkgs_str = pkgs.map(function(x) {
	return(x.join("-"))
    })
    var url = base_url + '/-/versions?keys=' + JSON.stringify(pkgs_str)
    request(url, function (error, response, body) {
	if (error || response.statusCode != 200) { return handle_error(res); }
	var pkg_obj = JSON.parse(body);
	do_package(res, pkg_obj)
    })
}

function get_deps(pkg_obj) {
    var deps = Object.keys(pkg_obj["Depends"] || [])
	.concat(Object.keys(pkg_obj["LinkingTo"] || []))
	.concat(Object.keys(pkg_obj["Imports"] || []));
    var rindex = deps. indexOf('R');
    if (rindex > -1) deps.splice(rindex, 1);
    return deps;
}

function do_package(res, pkg_obj) {

    var deps = {} 		// Contains the results
    var seen = { false: false }	// Keep track of what was queried

    var cranq = async.queue(function(task, callback) {
	if (base_packages.indexOf(task) > -1) {
	    deps[task] = false
	    seen[task] = task
	    callback()
	} else {
	    var url = base_url + '/' + task
	    request(url, function(error, response, body) {
		if (error || response.statusCode != 200) { return handle_error(res); }
		var pkg_obj = JSON.parse(body)
		var task_deps = get_deps(pkg_obj)
		var ver = pkg_obj["Version"]
		var pkg_ver = task + '-' + ver
		deps[pkg_ver] = task_deps
		seen[task] = pkg_ver
		task_deps.map(function(x) {
		    if (! (x in seen)) {
			seen[x] = false
			cranq.push(x)
		    }
		})
		callback();
	    })
	}
    }, 20)

    cranq.drain = function() { return_res(res, deps, seen) }

    for (i in pkg_obj) {
	var pkg = pkg_obj[i]
	var pkg_deps = get_deps(pkg)
	var pkg_name = pkg["Package"]
	var pkg_ver = pkg["Version"]
	seen[pkg_name] = pkg_name + '-' + pkg_ver
	deps[pkg_name + '-' + pkg_ver] = pkg_deps
	pkg_deps.map(function(x) { seen[x] = false; cranq.push(x) })
    }

    // In case there are no dependencies. The plus one is for false: false.
    if (Object.keys(seen).length == Object.keys(pkg_obj).length + 1) {
	return_res(res, deps, seen)
    }
}

function return_res(res, deps, seen) {
    var keys = Object.keys(deps);

    // Need to add version numbers
    Object.keys(deps).forEach(function(key) {
	var value = deps[key]
	if (value !== false) {
	    deps[key] = value.map(function(y) { return seen[y] })
	}
    })
    res.set(200)
    res.send(JSON.stringify(deps))
    res.end()
}

function handle_error(res) {
    res.set(500);
    res.end('{ "error": "Cannot connect to DB",' +
            '  "email": "csardi.gabor+crandeps@gmail.com" }');
}

module.exports = router;
