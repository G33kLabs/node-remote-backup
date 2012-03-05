#!/usr/bin/env node

// -- Change dir to local dir
var path  = require("path")
process.chdir(path.normalize(__dirname+'/../')) ;
__dirname = process.cwd() ;

// -- Load clients config file
var FTPClient = require(__dirname+'/libs/ftp'),
	spawn = require('child_process').spawn,
	exec = require('child_process').exec,
	fs = require('fs'),
	util = require('util'), 
	config = require(__dirname+'/conf/conf.shared.js') ;

var months = {
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	may: 5,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	oct: 10,
	nov: 11,
	dec: 12
};

// -- Load Globals
GLOBAL.tools = require(__dirname+'/libs/tools.kit') ;

// -- Create Class
var RemoteBackup = Backbone.Model.extend({

	// -> Constructor
	initialize: function() {
		var self = this ;

		// -> Reset catalogs
		self.localCatalog = {} ;
		self.remoteCatalog = {} ;
		self.completeFiles = [] ;

		// -> Size counters
		self.totalRemoteSize = 0 ;
		self.totalLocalSize = 0 ;
		self.completeSize = 0 ;

		// -> Init remote scan Queue
		self.remoteQueue = [{
			action: 'list',
			path: self.get('remote_path')||'/'
		}] ;

		// -> Log errors
		self.errors = [] ;

		// -> Set timers 
		self.set({
			initTime: tools.now(),
			startTime: tools.now()
		}); 

		// -> Get mysql dump
		self.dumpMysql() ;

		// -> Scan local dir and start ftp list
		self.scanLocalDir(function() {
			self.isInit = true ;
			self.FTPClient = FTPClient ;
			self.connectRemote() ;		
		}) ;

	},

	// -> Dump mysql
	dumpMysql: function() {
		var self = this;

		// -> Get remote dump
		if ( self.get('mysql') && self.get('mysql').remote) {

			tools.request({
				url: self.get('mysql').remote,
				nocache: true
			}, function (err, response, buffer) {
    			if (err) {
        			tools.error('error:', err);
    			}
    			else {

    				// -> Split files
    				var lines = buffer.split("\n") ;
    				var dumpFiles = {} ;
    				var dumpName = null ;
    				_.each(lines, function(line){
    					var regs = line.match(/\-\-\ Export\ Name\ \:\ (.*)/) ;
    					if ( regs ) dumpName = regs[1] ;
    					if ( dumpName ) {
    						dumpFiles[dumpName] = dumpFiles[dumpName] || [] ;
    						dumpFiles[dumpName].push(line) ;
    					}
    				}) ;

    				// -> Store files
    				_.each(dumpFiles, function(content, name){
    					content = content.join("\n") ;
    					name = self.get('localPath')+self.get('id')+'/mysql.dump/'+name ;
    					tools.createFullPath(name, function() {
    						fs.writeFile(name, content, function() {
    							self.trace('dump.mysql > '+name) ;
    						}) ;
    					}) ;
    				}) ;

    			}
			}) ;

		}

	},

	// -> Connect to remote
	connectRemote: function() {	
		var self = this ;

		// -> Init connexion and wait for opening
		if ( self.get('type') == 'ftp' ) {
			if ( self.isInit ) self.trace('Open FTP link >> '+self.get('host'), 'purple') ;
			if ( self.isInit ) self.set({startTime: tools.now()}); 
			try {
				self.conn = new self.FTPClient({ 
					host: self.get('host'),
					debug: true,
					port: self.get('port')
				});
				self.conn.on('connect', function() {
					self.conn.status = 'connected' ;
					self.auth() ;
				}) ;
				self.conn.on('error', function(err) {
					tools.error('Error :: '+json(err)) ;
					self.errors.push(err) ;
					self.conn.end() ;
					self.conn.status = 'disconnected' ;
					self.isInit = true ;
					tools.log('Try to reconnect in 1000ms... ') ;
					if ( self.reconnectTTL ) clearTimeout(self.reconnectTTL) ;
					self.reconnectTTL = setTimeout(function() {
						tools.log('Reconnecting... ') ;
						self.connectRemote() ;
					}, 1000) ;

				}) ;
				self.conn.on('timeout', function(err) {
					tools.error(err+' > timeout') ;
				}) ;
				self.conn.on('close', function(err) {
					//tools.log(' > close', 'yellow') ;
				}) ;
				self.conn.on('end', function() {
					//tools.log(' > end', 'yellow') ;
				}) ;
				self.conn.on('authenticiated', function() {
					if ( self.isInit ) tools.log('> authenticiated') ;
					self.isInit = false ;
					self.remoteUnqueue() ;
				}) ;
				self.conn.on('access_denied', function() {
					tools.error('> access_denied') ;
				}) ;
				self.conn.connect();

			} catch(err) {
				tools.error(err);
			}
		}

		// -> Ssh connexion
		else if ( self.get('type') == 'ssh' ) {
			if ( self.isInit ) self.trace('Open SSH link >> '+self.get('host'), 'purple') ;
			if ( self.isInit ) self.set({startTime: tools.now()}); 
			
			try {

				self.isInit = false ;
				self.conn = {} ;
				self.conn.status = 'connected' ;
				self.remoteUnqueue() ;


			} catch(err) {
				tools.error(err);
			}
			
		}
	},

	// -> Authentification
	auth: function() {
		var self = this ;

		// -> Auth with ftp ?
		if ( self.get('type') == 'ftp' ) {
			self.conn.auth(self.get('user'), self.get('password'), function(err) {
				self.conn.emit(err?'access_denied':'authenticiated') ;
			}) ;
		}

	},

	// -> Scan local dir
	scanLocalDir: function(onComplete) {

		var self = this ;

		// -> Walk over local repositary
		self.set({localRepositary: self.get('localPath')+self.get('id')+'/'}) ;
		tools.debug('LocalPath :: '+ self.get('localRepositary')) ;

		// -> Create local dir if not exists
		tools.createFullPath(self.get('localRepositary')+'index', function(err, success) {
			tools.walk(self.get('localRepositary'), function(err, data) {
				if ( err ) {
					tools.error(err) ;
					onComplete(err) ;
				} else {
					_.each(data, function(file){
						var localPath = file.path.replace(new RegExp(self.get('localRepositary')), '') ;
						self.localCatalog[localPath] = file ;
						self.totalLocalSize += parseInt(file.size) ;
						self.trace('Local : '+localPath + " ["+ file.mtime + '] > ' + tools.number_format(file.size/1024, 2)+'ko', 'yellow');	
					})

					//static_catalog = {files:manifestFiles, lastVersion: lastVersion, totalSize: totalSize} ;
					onComplete(null) ;
				}
			})
		}) ;
	},

	// -> Trace
	trace: function(msg, color) {
		var self = this;

		// -> Get stats
		var stats = {} ;

		if ( self.completeFiles && self.completeFiles.length ) {
			var counter = 0 ;
			stats.averageDL = _.reduce(self.completeFiles, function(memo, file) {
				if ( file.downloadRate ) {
					counter++ ;
					memo = memo + parseInt(file.downloadRate);
				}
				return memo ;
			}, 0) ;
			stats.averageDL = stats.averageDL/counter ;
		}
		stats.maxSize = Math.max(self.totalLocalSize, self.totalRemoteSize) ;
		stats.advance = 100*self.completeSize/stats.maxSize ;
		stats.percent = tools.number_format(stats.advance, 2) ;
		stats.totalSize = tools.formatSize(Math.max(self.totalLocalSize, self.totalRemoteSize))||0 ;
		stats.completeSize = tools.formatSize(self.completeSize)||0 ;

		// -> Get ETA
		stats.runningTime = tools.now() - self.get('initTime') ;
		stats.eta = tools.formatTime(100*stats.runningTime/stats.advance) ;
		if ( stats.averageDL ) {
			stats.eta = tools.formatTime((stats.maxSize-self.completeSize)/stats.averageDL)||0 ;
		}

		// -> Assign stats to model
		self.set({stats: stats}) ;

		// -> Output logs
		var preffixTrace = (tools.now()-self.get('startTime'))+' | '+self.id+' > ' ;
		tools.log(preffixTrace + msg , color);	

		// -> Counters
		if ( ! /^List/.test(msg) ) {
			tools.debug(preffixTrace +"["+stats.completeSize+"/"+stats.totalSize+"] => "+stats.percent+'% | Avg Download : '+(tools.formatSize(stats.averageDL)||0)+'/s | Eta : '+stats.eta);
		}
	},

	// -> Scan Complete
	scanComplete: function() {
		var self = this ;

		// -> Say it's complete
		tools.log(self.get('id') + ' > complete ' ) ;

		// -> Build a report
		var report = {
			catalog: self.completeFiles,
			id: self.get('id'),
			started: self.get('initTime'),
			duration: tools.now() - self.get('initTime'),
			totalSize: self.totalRemoteSize,
			count: {}
		} ;

		// -> Get stats on new files
		report.count.newFiles = _.reduce(self.completeFiles, function(memo, file) {
			if ( file.action == 'download' ) {
				memo = memo+1;
				report.downloadedSize = (report.downloadedSize||0) + parseInt(file.size) ;
			}
			return memo ;
		}, 0) ;

		// -> Get stats on local files
		report.count.noChangeFiles = _.reduce(self.completeFiles, function(memo, file) {
			if ( file.action == 'local' ) memo = memo +1;
			return memo ;
		}, 0) ;

		// -> OUtput
		var filenameHisto = __dirname+'/reports/'+self.get('id')+'_'+report.started+'.json' ;
		tools.createFullPath(filenameHisto, function() {
			fs.writeFile(filenameHisto, json(report, null, 4), function() {
				self.trace('** OK **') ;
			}) ;
		}) ;

		// -> OUtput
		var filename = __dirname+'/reports/'+self.get('id')+'_latest.json' ;
		tools.createFullPath(filename, function() {
			fs.writeFile(filename, json(report, null, 4), function() {
				self.trace('** OK **') ;
			}) ;
		}) ;


	},

	// -> Add a remote file to sync
	addRemoteFile: function(entry) {
		var self = this ;

		entry.localPath = self.get('localPath')+self.get('id')+entry.path ;

		// -> Add to remote catalog
		self.remoteCatalog[entry.path] = entry ;

		// -> Look if file exists in local repositary
		//console.log(entry.path) ;
		var localFile = self.localCatalog[entry.path] ;
		if ( localFile && entry.type == 'FILE' ) {
			self.trace(('LocalFile exists >> '+entry.path)) ;

			// -> Correct date
			if ( entry.mtime > tools.now() ) {
				entry.mtime = new Date( entry.mtime.getTime() - (1000*3600*24*365) ) ;
			}

			// -> File is uptodate
			if ( entry.mtime <= localFile.mtime ) {
				entry.action = 'local' ;
			}

		}

		// -> Add to download queue
		self.remoteQueue.push(entry) ;

		// -> Add to target size
		//console.log("**** size :: "+parseInt(entry.size)) ;
		if ( entry.size > 0) {
			self.totalRemoteSize += parseInt(entry.size||0) ;

			if ( entry.size > 1024*1024 ) {
				self.trace('BIG FILE ***** '+entry.path+' ('+tools.formatSize(entry.size)+')', 'purple') ;
			}
		}

		// -> Trace
		//self.trace('List : '+ entry.path + " ["+ entry.mtime + '] > ' + tools.number_format(entry.size/1024, 2)+'ko', 'lcyan');	

	},

	// -> Get something to do
	remoteUnqueue: function() {
		var self = this ;

		// -> Exit if not connected
		if ( self.conn.status != 'connected' ) {
			tools.error(self.get('id') +' > remoteUnqueue :: not connected !') ;
			return false;
		}

		// -> Shift first queue element
		var entry = self.remoteQueue.shift() ;

		// -> Increment counter
		if ( self.lastEntry && self.lastEntry.type == 'FILE' ) {

			// -> If download stats
			if ( self.lastEntry.startDownload ) {
				self.lastEntry.downloadRate = self.lastEntry.size/(self.lastEntry.stopDownload-self.lastEntry.startDownload) ;
			}

			// -> Add to complete files
			self.completeFiles.push(self.lastEntry) ;

			// -> Add to complete size
			if ( self.lastEntry.size ) {
				self.completeSize += parseInt(self.lastEntry.size) ;
			}

		} 
		self.lastEntry = entry ;

		// -> No more things to do => complete
		if ( ! entry ) {

			// -> Build remote archive
			if ( self.get('type') == 'ssh' && self.remoteArchive && self.remoteArchive.length ) {
				//console.log(self.remoteArchive) ;
				self.downloadArchive() ;
			}

			// -> In other cases, that's the end
			else {
				self.scanComplete() ;	
			}
			
			return false; 
		}

		// -> Route action
		if ( entry.action == 'list' ) {
			self.scanRemoteDir(entry) ;
		}
		else if ( entry.action == 'download' ) {
			self.downloadFile(entry) ;
		}
		else {
			self.remoteUnqueue() ;
		}

	},

	// -> Get ssh path
	getSSHPath: function() {
		var self = this ;
		var args = [] ;

		// -> Add ssh private key
		if ( self.get('ssh_key_file') ) {
			args.push('-i', self.get('ssh_key_file')); 
		}

		// -> Add user and hostname
		args.push(self.get('user')+'@'+self.get('host')) ;

		// -> Return args
		return args.join(' ') ;

	},

	// -> Download an archive via ssh
	downloadArchive: function() {
		var self = this ;

		// -> Set archive file names
		var archiveFileIndex = '/tmp/node-remote-backup.archive.txt' ;
		var archiveFile = self.get("remote_path")+'node-remote-backup.tar.gz'; 
		var localArchiveFile = self.get('localPath')+self.get('id')+'/'+path.basename(archiveFile) ;

		// -> Build temp remote Archive include files
		fs.writeFileSync(archiveFileIndex, self.remoteArchive.join("\n")) ;

		// -> Build command to copy include file
		function buildArchiveIndex() {
			var args = [] ;

			// -> Add ssh private key
			if ( self.get('ssh_key_file') ) {
				args.push('-i', self.get('ssh_key_file')); 
			}

			// -> Add source
			args.push(archiveFileIndex) ;

			// -> Add destination
			args.push(self.get('user')+'@'+self.get('host')+':'+archiveFileIndex) ;

			// -> Prepare command line
			var cmd = 'scp '+args.join(' ') ;
			exec(cmd, function(err, stdout, stderr) {
				self.trace(" <- Successful copy to "+archiveFileIndex);
				console.log(err, stdout, stderr) ;
                onArchiveIndexSended() ;
			}) ;
		}

		// -> When file sended
		function onArchiveIndexSended() {

			var args = [] ;

			// -> Add ssh private key
			if ( self.get('ssh_key_file') ) {
				args.push('-i', self.get('ssh_key_file')); 
			}

			// -> Add user and host
			args.push(self.get('user')+'@'+self.get('host')) ;

			// -> Add command
			args.push('"tar -zcvf '+archiveFile+' --files-from='+archiveFileIndex+' --no-recursion"')

			// -> Send ssh command
			var cmd = 'ssh '+args.join(' ') ;
			exec(cmd, function(err, stdout, stderr) {
				self.trace(" <- Successful backup created to "+archiveFile);
				console.log(err, stdout, stderr) ;
                getArchive() ;
			}) ;

			console.log(cmd) ;
		}

		// -> Download archive
		function getArchive() {

			var args = [] ;

			// -> Add ssh private key
			if ( self.get('ssh_key_file') ) {
				args.push('-i', self.get('ssh_key_file')); 
			}

			// -> Add source to download
			args.push(self.get('user')+'@'+self.get('host')+':'+archiveFile) ;

			// -> Add destination
			args.push(localArchiveFile) ;
			//args.push('"tar -zcvf '+archiveFile+' --files-from='+archiveFileIndex+' --no-recursion"')

			// -> Send ssh command
			var cmd = 'scp '+args.join(' ') ;
			
			exec(cmd, function(err, stdout, stderr) {
				self.trace(" <- Successful backup retrieved to "+archiveFile);
				console.log(err, stdout, stderr) ;
                unpackArchive() ;
			}) ;

			console.log(cmd) ;
		}

		// -> Unpack archive
		function unpackArchive() {
			var cmd = ['tar', 'xvf', localArchiveFile, '-C '+self.get('localPath')+self.get('id')+'/'].join(' ') ;
			exec(cmd, function(err, stdout, stderr) {
				self.trace(" <- Successful backup unpacked : "+localArchiveFile);
				console.log(err, stdout, stderr) ;
                cleanTempFiles() ;
			}) ;

		}

		// -> Clean temp files
		function cleanTempFiles() {

			// -> Local files
			try { fs.unlinkFileSync(archiveFileIndex) ; } catch(e) {}
			try { fs.unlinkFileSync(localArchiveFile) ; } catch(e) {}

			// -> Remote files
			var cmd = ['ssh', self.getSSHPath(), '"rm -f '+archiveFileIndex+' '+archiveFile+'"'].join(' ') ;
			exec(cmd, function(err, stdout, stderr) {
				self.trace(" <- Successful removing temp files : "+localArchiveFile);
				console.log(err, stdout, stderr) ;
                self.scanComplete() ;
			}) ;

		}

		// -> Start
		buildArchiveIndex() ;
	},

	// -> Download a file
	downloadFile: function(entry) {
		var self = this ;

		// -> Start to downloading file
		//console.log(entry) ;
		self.trace('Download : '+entry.path, 'green') ;
		tools.createFullPath(entry.localPath, function(err) {

			// -> FTP
			if ( self.get('type') == 'ftp' ) {
				self.lastEntry.startDownload = tools.now() ;
				self.conn.get(entry.path, function(e, stream) {

					if ( e || ! stream ) {
						tools.error('Error:: '+json(e)+' -> '+json(stream)+entry.path+' => '+entry.localPath) ;
					} 
					else {
						stream.on('success', function() {

							// -> Set mtime same as server
							//tools.warning(entry.mtime) ;

							// -> Remember 
							self.lastEntry.stopDownload = tools.now() ;

							// -> Close connexion
							self.conn.end() ;
							self.connectRemote() ;

							// -> Destroy the stream
							stream.destroySoon() ;

						});

						stream.on('error', function(e) {
							console.log('ERROR during get(): ' + util.inspect(e));
							self.conn.end() ;
						});
						stream.pipe(fs.createWriteStream(entry.localPath));
					}

				}) ;
			}

			// -> FTP
			else if ( self.get('type') == 'ssh' ) {


				// -- Add file to remote tar
				self.remoteArchive = self.remoteArchive || [] ;
				self.remoteArchive.push(entry.path) ;
				self.remoteUnqueue() ;

			}

		});


	},


	// -> Remote scan
	scanRemoteDir: function(_entry) {
		var self = this ;
		var remotePath = _entry.path ;

		// -> FTP
		if ( self.get('type') == 'ftp' ) {

			self.conn.list(remotePath, function(err, iter) {

				iter.on('entry', function(entry) {
					if ( entry.name == '.' || entry.name == '..' ) { }
					else if (entry.type === 'l') {
						entry.type = 'LINK';
					}
					else if (entry.type === '-') {
						entry.type = 'FILE';
						entry.mtime = new Date(Date.parse(self.formatDate(entry))) ;
						entry.remotePath = remotePath ;
						entry.path = remotePath+entry.name ;
						entry.action = 'download' ;
						delete entry.owner ;
						delete entry.group ;
						delete entry.date ;
						delete entry.time ;
						if ( ! (new RegExp(self.get('ignore_regex'))).test(remotePath+entry.name) ) {
							self.addRemoteFile(entry) ;
						} else {
							tools.warning('-- '+self.id+' > ' + remotePath+entry.name + " ["+ entry.mtime + '] ' + entry.size + ' ' + ' ' + entry.name);	
						}
						
					}
					else if (entry.type === 'd' ) {
						entry.type = 'DIR';
						entry.mtime = Date.parse(self.formatDate(entry)) ;
						entry.remotePath = remotePath ;
						if ( ! (new RegExp(self.get('ignore_regex'))).test(remotePath+entry.name) ) {
							entry.path = remotePath+entry.name+'/' ;
							entry.action = 'list' ;
							self.addRemoteFile(entry) ;
						}
					}
				});

				iter.on('success', function() {
        			self.remoteUnqueue() ;
      			});

      			iter.on('error', function(e) {
		        	tools.error('ERROR during list(): ' + json(e));
		        	self.conn.end() ;
		      	});

			}) ;
		}

		// -> SSH
		else if ( self.get('type') == 'ssh' ) {

			self.trace('Scan remote dir...') ;

			var args = [] ;

			if ( self.get('ssh_key_file') ) {
				args.push('-i', self.get('ssh_key_file')); 
			}
			//args.push('-t') ;
			args.push(self.get('user')+'@'+self.get('host')) ;
			args.push("find "+remotePath+" -type f -exec ls -dl {} \\;") ;

			//console.log('ssh ', args) ;

			var child  = spawn('ssh', args) ;
			var list = '' ;
			child.stdout.on('data', function (data) {
			  list += data ;
			  //console.log(data.toString()) ;
			});

			child.stderr.on('data', function (data) {
			  console.log('stderr: ' + data);
			});

			child.on('exit', function (code) {
			  	console.log('child process exited with code ' + code);
			  	//console.log(list.split("\n")) ;
			  	list = list.split("\n") ;
			  	_.each(list, function(line){

			  		//console.log(line) ;
			  		var els = tools.trim(line.replace(/\s{2,}/g, ' ')).split(' ');
			  		if ( els.length ) {
				  		var entry = {} ;
				  		entry.type = 'FILE';
				  		entry.remotePath = remotePath ;
				  		entry.action = 'download' ;
				  		entry.perms = els.shift() ;
				  		els.shift() ;
				  		entry.rights = {
				  			user: els.shift(),
				  			group: els.shift()
				  		}
				  		entry.size = parseInt(els.shift()) ;
				  		entry.mtime = new Date(Date.parse(els.shift()+' '+els.shift())) ;
				  		entry.path = els.join(' ') ;
				  		entry.name = path.basename(entry.path) ;

				  		if ( entry.size > 0 ) {
				  			//console.log(entry) ;
				  			self.addRemoteFile(entry) ;
				  		}

			  		}
			  		// 8 -rwxrwxrwx 1 www-data www-data 8075 2012-01-19 10:56 /var/www/blog/wp-admin/includes/widgets.php

			  	}) ;
				
				// -> Start queue unshift
				self.remoteUnqueue() ;

			});


			// ssh -i ~/7thside.pem ubuntu@tacos.7thside.com 'find /var/www/ -ls'

		}
	},

	// -> Format date
	formatDate: function(entry) {
		var _date = (entry.date.year < 10 ? '0' : '') + entry.date.year + '-' + (entry.date.month < 10 ? '0' : '') + entry.date.month + '-' + (entry.date.date < 10 ? '0' : '') + entry.date.date ;
		if ( entry.time ) {
			_date += ' '+(entry.time.hour < 10 ? '0' : '')+entry.time.hour+':'+(entry.time.minute < 10 ? '0' : '')+entry.time.minute+':'+(entry.time.second||'00'); 	
		}
	  	return _date ;
	}

}) ;

// -- Loop over clients
var links = {} ;
_.each(config.clients, function(client, id){
	client.id = id ;
	client.localPath = config.localRepositary ;
	links[id] = new RemoteBackup(client) ;
}) ;

// -- Bind errors
process.on('uncaughtException', function (err) {
  	console.log('Caught exception: ' + err);
});