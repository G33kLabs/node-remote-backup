var http = require('http')
  , https = require('https')
  , tls = false
  , url = require('url')
  , util = require('util')
  , path = require('path')
  , stream = require('stream')
  , qs = require('querystring')
  , tools = require('./tools.kit')
  ;
	
var isUrl = /^https?:/;

var cachePath = path.normalize(__dirname+'/../tmp/html') ;

var globalPool = {};

var Request = function (options) {
	stream.Stream.call(this);
	this.readable = true;
	this.writable = true;
	
	for (i in options) {
		this[i] = options[i];
	}
	if (!this.pool) this.pool = globalPool;
	this.dests = [];
}

util.inherits(Request, stream.Stream);
Request.prototype.getAgent = function (host, port) {
	if (!this.pool[host+':'+port]) {
		this.pool[host+':'+port] = new this.httpModule.Agent({host:host, port:port});
	}
	return this.pool[host+':'+port];
}

Request.prototype.request = function () {  

	var options = this;
	
	if (options.url) {
		// People use this property instead all the time so why not just support it.
		options.uri = options.url;
		delete options.url;
	}
	
	if (!options.uri) {
		throw new Error("options.uri is a required argument");
	} else {
		if (typeof options.uri == "string") options.uri = url.parse(options.uri);
	}
	if (options.proxy) {
		if (typeof options.proxy == 'string') options.proxy = url.parse(options.proxy);
	}
	
	// Fetch url
	var fetchUri = function(cb) {
	
		options._redirectsFollowed = options._redirectsFollowed || 0;
		options.maxRedirects = (options.maxRedirects !== undefined) ? options.maxRedirects : 10;
		options.followRedirect = (options.followRedirect !== undefined) ? options.followRedirect : true;
		
		options.encoding = options.encoding || 'binary' ;
		options.method = options.method || 'GET';
		options.headers = options.headers || {};
		options.startFetch = options.startFetch || (new Date().getTime()) ;
		
		var setHost = false;
		if (!options.headers.host) {
			options.headers.host = options.uri.hostname;
			if (options.uri.port) {
			  if ( !(options.uri.port === 80 && options.uri.protocol === 'http:') &&
			       !(options.uri.port === 443 && options.uri.protocol === 'https:') )
			  options.headers.host += (':'+options.uri.port);
			}
			setHost = true;
		}
		
		if (!options.uri.pathname) {options.uri.pathname = '/';}
		if (!options.uri.port) {
			if (options.uri.protocol == 'http:') {options.uri.port = 80;}
			else if (options.uri.protocol == 'https:') {options.uri.port = 443;}
		}
		
		if (options.bodyStream || options.responseBodyStream) {
			console.error('options.bodyStream and options.responseBodyStream is deprecated. You should now send the request object to stream.pipe()');
			this.pipe(options.responseBodyStream || options.bodyStream)
		}
		
		if (options.proxy) {
			options.port = options.proxy.port;
			options.host = options.proxy.hostname;
		} else {
			options.port = options.uri.port;
			options.host = options.uri.hostname;
		}
		
		if (options.onResponse === true) {
			options.onResponse = options.callback;
			delete options.callback;
		}
		
		var clientErrorHandler = function (error) {
			if (setHost) delete options.headers.host;
			if ( typeof options.emit == 'function' ) options.emit('error', error);
		};
		if (options.onResponse) options.on('error', function (e) {options.onResponse(e)}); 
		if (options.callback) options.on('error', function (e) {options.callback(e)});
		
		
		if (options.uri.auth && !options.headers.authorization) {
			options.headers.authorization = "Basic " + toBase64(options.uri.auth.split(':').map(qs.unescape).join(':'));
		}
		if (options.proxy && options.proxy.auth && !options.headers['proxy-authorization']) {
			options.headers['proxy-authorization'] = "Basic " + toBase64(options.proxy.auth.split(':').map(qs.unescape).join(':'));
		}
		
		options.path = options.uri.href.replace(options.uri.protocol + '//' + options.uri.host, '');
		if (options.path.length === 0) options.path = '/';
		
		if (options.proxy) options.path = (options.uri.protocol + '//' + options.uri.host + options.path);
	
		if (options.json) {
			options.headers['content-type'] = 'application/json';
			options.body = JSON.stringify(options.json);		
		} else if (options.multipart) {
			options.body = '';
			options.headers['content-type'] = 'multipart/related;boundary="frontier"';
			
			if (!options.multipart.forEach) throw new Error('Argument error, options.multipart.');
			options.multipart.forEach(function (part) {
				var body = part.body;
				if(!body) throw Error('Body attribute missing in multipart.');
				delete part.body;
				options.body += '--frontier\r\n'; 
				Object.keys(part).forEach(function(key){
					options.body += key + ': ' + part[key] + '\r\n'
				})
				options.body += '\r\n' + body + '\r\n';
			})
			options.body += '--frontier--'
		}
		
		if (options.body) {
			if (!Buffer.isBuffer(options.body)) {
				options.body = new Buffer(options.body);
			}
			if (options.body.length) {
				options.headers['content-length'] = options.body.length;
			} else {
				throw new Error('Argument error, options.body.');
			}
		}
		
		//tools.log({"http:":http, "https:":https}) ;
		options.httpModule = {"http:":http, "https:":https}[options.proxy ? options.proxy.protocol : options.uri.protocol]
		
		if (!options.httpModule) throw new Error("Invalid protocol");
	  
		if (options.pool === false) {
			options.agent = false;
		} else {
			if (options.maxSockets) {
				options.agent = options.getAgent(options.host, options.port);
				options.agent.maxSockets = options.maxSockets;
			}
			if (options.pool.maxSockets) {
				options.agent = options.getAgent(options.host, options.port);
				options.agent.maxSockets = options.pool.maxSockets;
			}
		}
		
		// -- Set P3P, UA and cookie
		options.headers["User-Agent"] = options.ua || "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10.6; fr; rv:1.9.2.15) Gecko/20110303 Firefox/3.6.15" ;
		options.headers['Cookie'] = ( options.cookie ? options.cookie : '') ;
		
		// -- Exec request
		options.req = options.httpModule.request(options, function (response) {
			
			tools.debug(' -> '+json(options.uri)) ;
			
			response.setEncoding(options.encoding);
			options.response = response;
			if (setHost) delete options.headers.host;
			
			// -- Store cookies
			if ( response.headers['set-cookie'] ) {
				options.cookie = '' ;
				Object.keys(response.headers['set-cookie']).forEach(function(key){
					options.cookie += ((response.headers['set-cookie'][key]||'').split(';')[0])+'; ' ;
				})
			} 
	    	
	    	// -- Redirect		
			if (response.statusCode >= 300 && 
			    response.statusCode < 400  && 
			    options.followRedirect     && 
			    options.method !== 'PUT' && 
			    options.method !== 'POST' &&
			    response.headers.location) {
				
				if (options._redirectsFollowed >= options.maxRedirects) {
					if ( typeof options.emit == 'function' ) options.emit('error', new Error("Exceeded maxRedirects. Probably stuck in a redirect loop."));
				}
				options._redirectsFollowed += 1;
				if (!isUrl.test(response.headers.location)) {
					response.headers.location = url.resolve(options.uri.href, response.headers.location);
				}
				options.uri = response.headers.location;
				delete options.req;
				delete options.agent;
				if (options.headers) {
					delete options.headers.host;
				}
				request(options, options.callback);
				return; // Ignore the rest of the response
			} else {
				options._redirectsFollowed = 0;
				// Be a good stream and emit end when the response is finished.
				// Hack to emit end on close because of a core bug that never fires end
				response.on('close', function () {if ( typeof options.emit == 'function' ) options.emit('end')})
				
				if (options.encoding) {
					if (options.dests.length !== 0) {
						console.error("Ingoring encoding parameter as this stream is being piped to another stream which makes the encoding option invalid.");
					} else {
						response.setEncoding(options.encoding);
					}
				}
				
				response.fetchTime = ( new Date().getTime() ) - options.startFetch ;
				
				if (options.dests.length !== 0) {
					options.dests.forEach(function (dest) {
						response.pipe(dest);
					})
					if (options.onResponse) options.onResponse(null, response);
					if ( cb ) cb(null, response, options.responseBodyStream) ;
					
				} else {
					if (options.onResponse) {
						options.onResponse(null, response);
					}
					if (options.callback) {
						var buffer = '';
						response.on("data", function (chunk) { 
							buffer += chunk; 
						})
						response.on("end", function () { 		
							if ( cb ) cb(null, response, buffer) ;
						})
						;
					}
				}
			}
		})
		
		options.req.on('error', clientErrorHandler);
		
		options.once('pipe', function (src) {
			if (options.ntick) throw new Error("You cannot pipe to this stream after the first nextTick() after creation of the request stream.")
			options.src = src;
			options.on('pipe', function () {
				console.error("You have already piped to this stream. Pipeing twice is likely to break the request.")
			})
		})
		
		process.nextTick(function () {
			if (options.body) {
				options.req.write(options.body);
				options.req.end();
			} else if (options.requestBodyStream) {
				console.warn("options.requestBodyStream is deprecated, please pass the request object to stream.pipe.")
				options.requestBodyStream.pipe(options);
			} else if (!options.src) {
				options.req.end();
			}
			options.ntick = true;
		})
		
	}
	
	// Try to get version in cache
	if ( ! options.nocache ) {
		
		// -> Build an url key
		var urlKey = tools.md5(options.uri.href) ;
		
		// -> Test cache file
		tools.getCache({url_id: urlKey}, function(data){
			if ( ! data ) {
				fetchUri(function(err, response, data) {
					tools.storeCache({url_id: urlKey, src: data}, function(res) {
						if (options.callback) options.callback(null, response, data);
					})
				}) ;
			} else {
				if (options.callback) options.callback(null, null, data);
			}
		}) ;
		
	} else {
		fetchUri(function(err, response, data) {
			if (options.callback) options.callback(null, response, data);
		}) ;		
	}
} 

Request.prototype.pipe = function (dest) {
	if (this.response) throw new Error("You cannot pipe after the response event.")
	this.dests.push(dest);
}
Request.prototype.write = function () {
	if (!this.req) throw new Error("This request has been piped before http.request() was called.");
	this.req.write.apply(this.req, arguments);
}
Request.prototype.end = function () {
	if (!this.req) throw new Error("This request has been piped before http.request() was called.");
	this.req.end.apply(this.req, arguments);
}
Request.prototype.pause = function () {
	if (!this.req) throw new Error("This request has been piped before http.request() was called.");
	this.req.pause.apply(this.req, arguments);
}
Request.prototype.resume = function () {
	if (!this.req) throw new Error("This request has been piped before http.request() was called.");
	this.req.resume.apply(this.req, arguments);
}

function request (options, callback) {
  if (callback) options.callback = callback;
  var r = new Request(options);
  r.request();
  return r; 
}

module.exports = request;

request.get = request;
request.post = function (options, callback) {
  options.method = 'POST';
  return request(options, callback);
};
request.put = function (options, callback) {
  options.method = 'PUT';
  return request(options, callback);
};
request.head = function (options, callback) {
  options.method = 'HEAD';
  if (options.body || options.requestBodyStream || options.json || options.multipart) {
    throw new Error("HTTP HEAD requests MUST NOT include a request body.");
  }
  return request(options, callback);
};
request.del = function (options, callback) {
  options.method = 'DELETE';
  return request(options, callback);
}