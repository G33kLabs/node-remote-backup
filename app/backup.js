#!/usr/bin/env node

// -- Change dir to local dir
var path  = require("path")
process.chdir(path.normalize(__dirname+'/../')) ;
__dirname = process.cwd() ;

// -- Load clients config file
var FTPClient = require('ftp'), 
	util = require('util'), 
	conn = null,
	clients = require(__dirname+'/conf/conf.shared.js').clients ;

// -- Loop over clients


console.log(clients) ;