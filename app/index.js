/**
 * Augur market monitor
 * @author Keivn Day (@k_day)
 */


var http = require("http");
var getopt = require("posix-getopt");
var chalk = require("chalk");
var express = require('express');
var loader = require("./elastic_loader");
var market_index = require('./indexes/markets');

var geth_host = process.env.GETH_HOST || "localhost";

var config = {
    http: 'http://' + geth_host + ':8545',
    ws: 'ws://' + geth_host + ':8546',
    //ipc: process.env.GETH_IPC || join(DATADIR, "geth.ipc"),
    limit: null,
    filtering: true,
    scan: true,
}

var app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

function log(str) {
     console.log(chalk.cyan.dim("[augur]"), str);
}

function timestamp(s) {
    return chalk.cyan.dim((new Date()).toString() + ": ") + s;
}

function isPositiveInt(str) {
    var n = ~~Number(str);
    return String(n) === str && n >= 0;
}

function toBool(str){
    return str == "true";
}

app.get('/getMarketsInfo', function (req, res) {

    var options = {};
    options.branchID = req.query['branchID'] || loader.augur.constants.DEFAULT_BRANCH_ID;
    options.active = req.query['active'];
    options.page = req.query['page'];
    options.limit = req.query['limit'];
    options.query = req.query['query'];
    options.sort = req.query['sort'];
    options.tag = req.query['tag'];

    if (options.active) options.active = toBool(options.active);

    //convert branch id to hex if int as passed in
    if (isPositiveInt(options['branchID'])){
        options['branchID'] = "0x" + parseInt(options['branchID']).toString(16);
    }

    //if query passed in, it's a search. Otherwise it's a filter
    if (options.query){
        market_index.searchMarkets(options)
        .then( (response) => {res.send(response)})
        .catch( (error) => {res.status(500).send({ error: error })});
    }else{
        market_index.filterMarkets(options)
        .then( (response) => {res.send(response)})
        .catch( (error) => {res.status(500).send({ error: error })});
    }
});

app.get('/getTags', function (req, res) {

    var options = {};
    options.page = req.query['page'];
    options.limit = req.query['limit'];
    options.branchID = req.query['branchID'] || loader.augur.constants.DEFAULT_BRANCH_ID;

    market_index.getTags(options)
    .then( (response) => {res.send(response)})
    .catch( (error) => {res.status(500).send({ error: error })});
});

process.on("uncaughtException", function (e) {
    log(timestamp(chalk.red("Uncaught exception\n")));
    try {
        log(e.toString());
        log(e.stack.toString());
    } catch (exc) {
        console.log(exc);
    }
    log('\n');
    process.exit(1);
});

process.on("exit", function (code) {
     loader.unwatch( () => {
        loader.disconnect( () => {
            log(timestamp(chalk.red("Augur node shut down (" + code.toString() + ")\n")));
        });
    });
});

process.on("SIGINT", function () {
    loader.unwatch( () => {
        loader.disconnect( () => {
            log(timestamp(chalk.red("Augur node shut down (SIGINT)\n")));
            process.exit(2);
        })
    })    
});

function runserver(protocol, port) {
    app.listen(port, function() {
        log("Listening on port " + port);
    });
}

(function init(args) {
    var opt, port, protocol, parser;
    parser = new getopt.BasicParser("n(noscan)s(ssl)p:(port)d:(datadir)", args);
    while ( (opt = parser.getopt()) !== undefined) {
        switch (opt.option) {
            case 's':
                protocol = "https";
                break;
            case 'p':
                port = opt.optarg;
                break;
            case 'n':
                config.scan = null;
                break;
        }
    }
    runserver(protocol || "http", port || process.env.PORT || 8547);
    //to be safe, rescan on every restart. Markets might have updated
    //when node was down.
    loader.watch(config, function (err, numUpdates) {
        if (err) throw err;
        log(numUpdates + " markets have been updated!");
    });

})(process.argv);
