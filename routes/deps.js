var express = require('express');
var router = express.Router();

re_pkg = '\\/([\\w\\.]+)';
re_ver = '(?:\\/([0-9\\.]+))?';
re_full = new RegExp('^' + re_pkg + re_ver + '$');

router.get(re_full, function(req, res) {
    var pkg = req.params[0];
    var ver = req.params[1];
    res.set('Content-Type', 'application/json');
    do_query(res, pkg, ver);
});

function do_query(res, pkg, ver) {
    res.set(200);
    res.send('"hello' + ' ' + pkg + ' ' + ver + '"');
    res.end();
}

module.exports = router;
