////////////////////////////////////////////////////////////////////////// DECLARE GLOBALS
GLOBAL._ = require('underscore') ;
GLOBAL.Backbone = require('backbone') ;
GLOBAL.json = JSON.stringify ;

////////////////////////////////////////////////////////////////////////// LOAD LIBS
exports.crypto = require('crypto') ;
exports.sys = require('util') ;
exports.path = require('path') ;
exports.colors = require('./termcolors.js').colors ;

var fs = require('fs') ;

// -- Return filesize
exports.formatSize = function(bytes) {
	var labels = new Array('TB', 'GB', 'MB', 'kB', 'b');
	var measurements = new Array(1099511627776, 1073741824, 1048576, 1024, 1);
	for(var i=0; i<measurements.length; i++) {
		var conv = bytes/measurements[i];
		if(conv > 1) {
			return exports.number_format((conv*10)/10, 3, '.')+' '+labels[i];
		}
	}
}

// -- Format time
exports.formatTime = function(ms) {
    var secs = ms/1000 ;
    var hr = Math.floor(secs / 3600);
    var min = Math.floor((secs - (hr * 3600))/60);
    var sec = Math.floor(secs - (hr * 3600) - (min * 60));
    
    if (hr < 10) hr = "0" + hr;
    if (min < 10) min = "0" + min;
    if (sec < 10) sec = "0" + sec;
    if (hr) hr = "00";
    return (hr > 0 ? hr + ':' : '') + min + ':' + sec;
}


// -- Number Format
exports.number_format = function(number, decimals, dec_point, thousands_sep) {
    number = (number + '').replace(/[^0-9+\-Ee.]/g, '');
    var n = !isFinite(+number) ? 0 : +number,
        prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
        sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep,
        dec = (typeof dec_point === 'undefined') ? '.' : dec_point,
        s = '',
        toFixedFix = function (n, prec) {
            var k = Math.pow(10, prec);
            return '' + Math.round(n * k) / k;
        };
    // Fix for IE parseFloat(0.55).toFixed(0) = 0;
    s = (prec ? toFixedFix(n, prec) : '' + Math.round(n)).split('.');
    if (s[0].length > 3) {
        s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
    }
    if ((s[1] || '').length < prec) {
        s[1] = s[1] || '';
        s[1] += new Array(prec - s[1].length + 1).join('0');
    }
    return s.join(dec);
}

// -- Walk directory
exports.walk = function(dir, done) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var i = 0;
    (function next() {
      var file = list[i++];
      if (!file) return done(null, results);
      file = dir + '/' + file;
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          exports.walk(file, function(err, res) {
            results = results.concat(res);
            next();
          });
        } else {
          results.push({path: file, mtime: stat.mtime, size: stat.size});
          next();
        }
      });
    })();
  });
};

/*
 * Given an attribute name, dot returns a function that when given an object returns the value of the specified attribute.  
 * This function is used in examples above to get the value attributes of rows fetched by CouchDB queries.
 */
exports.dot = function(attr) {
    return function(obj) {
        return obj[attr];
    }
}

///////////////////////////////////////////////////////////////////////// CONSOLE LOGGING
// Log & error functions
exports.log = function(obj, color) { 
	color = color || 'green'; 
	if (typeof obj == 'string' ) exports.sys.puts(exports.colors[color](obj, true)) ; 
	else exports.sys.puts(exports.colors[color](json(obj, null, 4), true)) ; 
}
exports.debug = function(obj) { exports.log(obj, 'lgray') ; }
exports.error = function(obj) { exports.log(obj, 'red') ; }
exports.warning = function(obj) { exports.log(obj, 'brown') ; }

/////////////////////////////////////////////////////////////////// STRING FUNCTIONS

// -- Return an integer random value
exports.rand = function() {
	
	var r = Math.random() ;
	var args = [] ;
	for ( i in arguments ) args.push(arguments[i]) ;

	if ( args.length == 0 ) return Math.floor(r*10000000000000000) ;
	else if ( args.length == 1 ) return Math.floor(r*args[0]) ;
	else if ( args.length == 2 ) return parseFloat(args[0]) + Math.floor(r*(args[1]-args[0])) ;

}

// -- Return now timestamp
exports.now = function() {
	return (new Date().getTime()) ;
}

// -- Trim a string
exports.trim = function(str) {
	return (str||'').replace(/^\s+|\s+$/g,"").toString();
}

exports.ucwords = function(str) {
    return (str + '').replace(/^([a-z])|\s+([a-z])/g, function ($1) {
        return $1.toUpperCase();
    });
} ;


// -- Sripslashes
exports.stripslashes = function(str) {
	str=(str||'').replace(/\\'/g,'\'');
	str=str.replace(/\\"/g,'"');
	str=str.replace(/\\0/g,'\0');
	str=str.replace(/\\\\/g,'\\');
	return str;
}

// -- Short for json stringhify function
GLOBAL.json = JSON.stringify ;
exports.json = JSON.stringify ;

// -- Return md5
exports.md5 = function(str) {
	return exports.crypto.createHash('md5').update(str).digest("hex");
}

// -- Clean a string from json
exports.cleanStr = function(str) {
	return (str||'').replace(/^\s+|\s+$/g,"").replace(/^\"(.*)\"$/, "$1");
}

// -- Return a clean html string
exports.cleanHtml = function(html) {
	html = html || '' ;
	
	// -- Replace unused tabs and retuns
	html = html.replace(/\n/g, '') ;
	html = html.replace(/\r/g, '') ;
	html = html.replace(/\t/g, '') ;
	
	// -- Remove xml header for dom parsing
	html = html.replace('<?xml version="1.0" encoding="ISO-8859-1"?>', '') ;
	//html = '<html'+html.split('<html')[1] ;
	
	// -- Trim html
	html = exports.trim(html) ;
	
	// -- Return formated html
	return html ;
	
}

// -- Return a clean number from string
exports.cleanNumber = function(str) {
	return parseFloat((str||'').replace(/ /g, '')) ;
}

/////////////////////////////////////////////////////////////////// CACHE

// -- Return cache file name
exports.getCacheFile = function(doc){
	var cacheDir = __dirname+'/../tmp/html/'
	if ( ! doc.url_id && doc.url ) doc.url_id = exports.md5(doc.url) ;
	
	var cacheFilename = exports.path.normalize(cacheDir+(doc.url_id).substr(0,2)+'/'+(doc.url_id).substr(2,2)+'/'+doc.url_id+'.html') ;
	tools.log('Cache filename : '+cacheFilename, 'cyan') ;
	
	return cacheFilename ;
}
 
// -- Store html page cache : Create directory and xrite cache file
exports.storeCache = function(doc, callback) {
	if ( ! doc.src ) return false ;
	var cacheFile = exports.getCacheFile(doc);
	var sourceContent = doc.src ;
	
	exports.createFullPath(cacheFile, function(err){
		if ( err) {
			if ( typeof callback == 'function' ) callback(err) ;
			exports.error(err) ;
		} else {
			try {
				//doc.src = doc.src || '' ;
				require('fs').writeFile(cacheFile, sourceContent, function(err) {
				    if(err) {
				    	exports.error(err);
				    	if ( typeof callback == 'function' ) callback(err) ;
				    } else {
				    	if ( typeof callback == 'function' ) callback(cacheFile+ " was saved!") ;
				        //exports.log(cacheFile+ " was saved!");
				    }
				}); 
			} catch(e) {
				exports.error(e);
			}
		}
	}) ;
	
}

// -- Get cache
exports.getCache = function(doc, cb) {
	var cacheFile = exports.getCacheFile(doc);
	try {
		if ( typeof cb == 'function' ) {
			require('fs').readFile(cacheFile, 'utf-8', function(err, data) {
				cb(data) ;
			}) ;
		} else {
			return require('fs').readFileSync(cacheFile, 'utf-8') ;
		}
	} catch(e) {
		//exports.debug('No cache : '+cacheFile) ;
		return false ;
	}
}
	
// -- Recursive mkdir -p
exports.createFullPath = function(fullPath, callback) {
	var parts = exports.path.dirname(exports.path.normalize(fullPath)).split("/"),
		working = '/',
		pathList = [];
	
	for(var i = 0, max = parts.length; i < max; i++) {
		working = exports.path.join(working, parts[i]);
		pathList.push(working);
	}
	
	var recursePathList = function recursePathList(paths) {
		if(0 === paths.length) { callback(null); return ; }
		var working = paths.shift();
		try {
			exports.path.exists(working, function(exists) {
				if(!exists) {
					try {
						require('fs').mkdir(working, 0755, function() {
							recursePathList(paths);
						});
					} catch(e) {
						callback(new Error("Failed to create path: " + working + " with " + e.toString()));
					}
				} else { recursePathList(paths); }
			});
		} catch(e) { callback(new Error("Invalid path specified: " + working)); }
	}
	
	if(0 === pathList.length) callback(new Error("Path list was empty"));
	else recursePathList(pathList);
}

// -- Load node-request crawl plugin -------------------------
// tools.request(obj, function (err, response, buffer) {
//	    console.log(response) ;
//	    if (error) {
//	        console.log('error:', err);
//	    }
//	}) ;
// ----------------------------------------------------------
exports.request = require('./node-request') ;

	
// -- Return a formated process mem usage in Mb -------------
// tools.getMemUsage(mem, function (data) {
//	    console.log(data) ; 	// 115.62
//	}) ;
// ----------------------------------------------------------
exports.getMemUsage = function(mem) {
	if ( ! mem || ! mem.heapTotal ) return false;
	return (mem.rss/1024/1024).toFixed(2) ;
}


// -- Return public ip address ------------------------------
exports.getServerIp = function() {
	var os=require('os'),
		ifaces=os.networkInterfaces(),
		ips = [];

	for (var dev in ifaces) {
		ifaces[dev].forEach(function(details){
			if (details.family=='IPv4' && details.address != '127.0.0.1') {
				ips.push(details.address) ;
			}
		});
	}

	return ips ;
}


exports.str_pad = function (input, pad_length, pad_string, pad_type) {
    // http://kevin.vanzonneveld.net
    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // + namespaced by: Michael White (http://getsprink.com)
    // +      input by: Marco van Oort
    // +   bugfixed by: Brett Zamir (http://brett-zamir.me)
    // *     example 1: str_pad('Kevin van Zonneveld', 30, '-=', 'STR_PAD_LEFT');
    // *     returns 1: '-=-=-=-=-=-Kevin van Zonneveld'
    // *     example 2: str_pad('Kevin van Zonneveld', 30, '-', 'STR_PAD_BOTH');
    // *     returns 2: '------Kevin van Zonneveld-----'
    var half = '',
        pad_to_go;

    var str_pad_repeater = function (s, len) {
        var collect = '',
            i;

        while (collect.length < len) {
            collect += s;
        }
        collect = collect.substr(0, len);

        return collect;
    };

    input += '';
    pad_string = pad_string !== undefined ? pad_string : ' ';

    if (pad_type != 'STR_PAD_LEFT' && pad_type != 'STR_PAD_RIGHT' && pad_type != 'STR_PAD_BOTH') {
        pad_type = 'STR_PAD_RIGHT';
    }
    if ((pad_to_go = pad_length - input.length) > 0) {
        if (pad_type == 'STR_PAD_LEFT') {
            input = str_pad_repeater(pad_string, pad_to_go) + input;
        } else if (pad_type == 'STR_PAD_RIGHT') {
            input = input + str_pad_repeater(pad_string, pad_to_go);
        } else if (pad_type == 'STR_PAD_BOTH') {
            half = str_pad_repeater(pad_string, Math.ceil(pad_to_go / 2));
            input = half + input + half;
            input = input.substr(0, pad_length);
        }
    }

    return input;
}


// -- PHPJS : base64 encode & decode
exports.base64_encode = function(data){var b64="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";var o1,o2,o3,h1,h2,h3,h4,bits,i=0,ac=0,enc="",tmp_arr=[];if(!data){return data;}
data=exports.utf8_encode(data+'');do{o1=data.charCodeAt(i++);o2=data.charCodeAt(i++);o3=data.charCodeAt(i++);bits=o1<<16|o2<<8|o3;h1=bits>>18&0x3f;h2=bits>>12&0x3f;h3=bits>>6&0x3f;h4=bits&0x3f;tmp_arr[ac++]=b64.charAt(h1)+b64.charAt(h2)+b64.charAt(h3)+b64.charAt(h4);}while(i<data.length);enc=tmp_arr.join('');switch(data.length%3){case 1:enc=enc.slice(0,-2)+'==';break;case 2:enc=enc.slice(0,-1)+'=';break;}
return enc;}

exports.base64_decode = function(data){var b64="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";var o1,o2,o3,h1,h2,h3,h4,bits,i=0,ac=0,dec="",tmp_arr=[];if(!data){return data;}
data+='';do{h1=b64.indexOf(data.charAt(i++));h2=b64.indexOf(data.charAt(i++));h3=b64.indexOf(data.charAt(i++));h4=b64.indexOf(data.charAt(i++));bits=h1<<18|h2<<12|h3<<6|h4;o1=bits>>16&0xff;o2=bits>>8&0xff;o3=bits&0xff;if(h3==64){tmp_arr[ac++]=String.fromCharCode(o1);}else if(h4==64){tmp_arr[ac++]=String.fromCharCode(o1,o2);}else{tmp_arr[ac++]=String.fromCharCode(o1,o2,o3);}}while(i<data.length);dec=tmp_arr.join('');dec=exports.utf8_decode(dec);return dec;}

exports.utf8_decode = function(str_data){var tmp_arr=[],i=0,ac=0,c1=0,c2=0,c3=0;str_data+='';while(i<str_data.length){c1=str_data.charCodeAt(i);if(c1<128){tmp_arr[ac++]=String.fromCharCode(c1);i++;}else if((c1>191)&&(c1<224)){c2=str_data.charCodeAt(i+1);tmp_arr[ac++]=String.fromCharCode(((c1&31)<<6)|(c2&63));i+=2;}else{c2=str_data.charCodeAt(i+1);c3=str_data.charCodeAt(i+2);tmp_arr[ac++]=String.fromCharCode(((c1&15)<<12)|((c2&63)<<6)|(c3&63));i+=3;}}
return tmp_arr.join('');}
exports.utf8_encode = function(string){string=(string+'').replace(/\r\n/g,"\n").replace(/\r/g,"\n");var utftext="";var start,end;var stringl=0;start=end=0;stringl=string.length;for(var n=0;n<stringl;n++){var c1=string.charCodeAt(n);var enc=null;if(c1<128){end++;}else if((c1>127)&&(c1<2048)){enc=String.fromCharCode((c1>>6)|192)+String.fromCharCode((c1&63)|128);}else{enc=String.fromCharCode((c1>>12)|224)+String.fromCharCode(((c1>>6)&63)|128)+String.fromCharCode((c1&63)|128);}
if(enc!=null){if(end>start){utftext+=string.substring(start,end);}
utftext+=enc;start=end=n+1;}}
if(end>start){utftext+=string.substring(start,string.length);}
return utftext;}

// -- Sprintf
// This code is in the public domain. Feel free to link back to http://jan.moesen.nu/
exports.sprintf = function() {
    if (!arguments || arguments.length < 1 || !RegExp) {
        return;
    }

    var str = arguments[0];
    var re = /([^%]*)%('.|0|\x20)?(-)?(\d+)?(\.\d+)?(%|b|c|d|u|f|o|s|x|X)(.*)/;
    var a = b = [], numSubstitutions = 0, numMatches = 0;
    while (a = re.exec(str)) {
        var leftpart = a[1], pPad = a[2], pJustify = a[3], pMinLength = a[4];
        var pPrecision = a[5], pType = a[6], rightPart = a[7];

        numMatches++;

        if (pType == '%') {
            subst = '%';
        } else {
            numSubstitutions++;
            if (numSubstitutions >= arguments.length) {
                exports.error('Error! Not enough function arguments (' + (arguments.length - 1) + ', excluding the string)\nfor the number of substitution parameters in string (' + numSubstitutions + ' so far).');
            }

            var param = arguments[numSubstitutions];
            var pad = '';
            if (pPad && pPad.substr(0,1) == "'") {
                pad = leftpart.substr(1,1);
            } else if (pPad) {
                pad = pPad;
            }

            var justifyRight = true;
            if (pJustify && pJustify === "-") {
                justifyRight = false;
            }

            var minLength = -1;
            if (pMinLength) {
                minLength = parseInt(pMinLength);
            }

            var precision = -1;
            if (pPrecision && pType == 'f') {
                precision = parseInt(pPrecision.substring(1));
            }

            var subst = param;
            if (pType == 'b') {
                subst = parseInt(param).toString(2);
            } else if (pType == 'c') {
                subst = String.fromCharCode(parseInt(param));
            } else if (pType == 'd') {
                subst = parseInt(param) ? parseInt(param) : 0;
            } else if (pType == 'u') {
                subst = Math.abs(param);
            } else if (pType == 'f') {
                subst = (precision > -1) ? Math.round(parseFloat(param) * Math.pow(10, precision)) / Math.pow(10, precision): parseFloat(param);
            } else if (pType == 'o') {
                subst = parseInt(param).toString(8);
            } else if (pType == 's') {
                subst = param;
            } else if (pType == 'x') {
                subst = ('' + parseInt(param).toString(16)).toLowerCase();
            } else if (pType == 'X') {
                subst = ('' + parseInt(param).toString(16)).toUpperCase();
            }
        }

        str = leftpart + subst + rightPart;
    }

    return str;
}

// -- Get Mime type by extension
exports.getMimeType = function (path) {
	var extTypes = { 
		"3gp"   : "video/3gpp"
		, "a"     : "application/octet-stream"
		, "ai"    : "application/postscript"
		, "aif"   : "audio/x-aiff"
		, "aiff"  : "audio/x-aiff"
		, "asc"   : "application/pgp-signature"
		, "asf"   : "video/x-ms-asf"
		, "asm"   : "text/x-asm"
		, "asx"   : "video/x-ms-asf"
		, "atom"  : "application/atom+xml"
		, "au"    : "audio/basic"
		, "avi"   : "video/x-msvideo"
		, "bat"   : "application/x-msdownload"
		, "bin"   : "application/octet-stream"
		, "bmp"   : "image/bmp"
		, "bz2"   : "application/x-bzip2"
		, "c"     : "text/x-c"
		, "cab"   : "application/vnd.ms-cab-compressed"
		, "cc"    : "text/x-c"
		, "chm"   : "application/vnd.ms-htmlhelp"
		, "class"   : "application/octet-stream"
		, "com"   : "application/x-msdownload"
		, "conf"  : "text/plain"
		, "cpp"   : "text/x-c"
		, "crt"   : "application/x-x509-ca-cert"
		, "css"   : "text/css"
		, "csv"   : "text/csv"
		, "cxx"   : "text/x-c"
		, "deb"   : "application/x-debian-package"
		, "der"   : "application/x-x509-ca-cert"
		, "diff"  : "text/x-diff"
		, "djv"   : "image/vnd.djvu"
		, "djvu"  : "image/vnd.djvu"
		, "dll"   : "application/x-msdownload"
		, "dmg"   : "application/octet-stream"
		, "doc"   : "application/msword"
		, "dot"   : "application/msword"
		, "dtd"   : "application/xml-dtd"
		, "dvi"   : "application/x-dvi"
		, "ear"   : "application/java-archive"
		, "eml"   : "message/rfc822"
		, "eps"   : "application/postscript"
		, "exe"   : "application/x-msdownload"
		, "f"     : "text/x-fortran"
		, "f77"   : "text/x-fortran"
		, "f90"   : "text/x-fortran"
		, "flv"   : "video/x-flv"
		, "for"   : "text/x-fortran"
		, "gem"   : "application/octet-stream"
		, "gemspec" : "text/x-script.ruby"
		, "gif"   : "image/gif"
		, "gz"    : "application/x-gzip"
		, "h"     : "text/x-c"
		, "hh"    : "text/x-c"
		, "htm"   : "text/html"
		, "html"  : "text/html"
		, "ico"   : "image/vnd.microsoft.icon"
		, "ics"   : "text/calendar"
		, "ifb"   : "text/calendar"
		, "iso"   : "application/octet-stream"
		, "jar"   : "application/java-archive"
		, "java"  : "text/x-java-source"
		, "jnlp"  : "application/x-java-jnlp-file"
		, "jpeg"  : "image/jpeg"
		, "jpg"   : "image/jpeg"
		, "js"    : "application/javascript"
		, "json"  : "application/json"
		, "log"   : "text/plain"
		, "m3u"   : "audio/x-mpegurl"
		, "m4v"   : "video/mp4"
		, "man"   : "text/troff"
		, "mathml"  : "application/mathml+xml"
		, "mbox"  : "application/mbox"
		, "mdoc"  : "text/troff"
		, "me"    : "text/troff"
		, "mid"   : "audio/midi"
		, "midi"  : "audio/midi"
		, "mime"  : "message/rfc822"
		, "mml"   : "application/mathml+xml"
		, "mng"   : "video/x-mng"
		, "mov"   : "video/quicktime"
		, "mp3"   : "audio/mpeg"
		, "mp4"   : "video/mp4"
		, "mp4v"  : "video/mp4"
		, "mpeg"  : "video/mpeg"
		, "mpg"   : "video/mpeg"
		, "ms"    : "text/troff"
		, "msi"   : "application/x-msdownload"
		, "odp"   : "application/vnd.oasis.opendocument.presentation"
		, "ods"   : "application/vnd.oasis.opendocument.spreadsheet"
		, "odt"   : "application/vnd.oasis.opendocument.text"
		, "ogg"   : "application/ogg"
		, "p"     : "text/x-pascal"
		, "pas"   : "text/x-pascal"
		, "pbm"   : "image/x-portable-bitmap"
		, "pdf"   : "application/pdf"
		, "pem"   : "application/x-x509-ca-cert"
		, "pgm"   : "image/x-portable-graymap"
		, "pgp"   : "application/pgp-encrypted"
		, "pkg"   : "application/octet-stream"
		, "pl"    : "text/x-script.perl"
		, "pm"    : "text/x-script.perl-module"
		, "png"   : "image/png"
		, "pnm"   : "image/x-portable-anymap"
		, "ppm"   : "image/x-portable-pixmap"
		, "pps"   : "application/vnd.ms-powerpoint"
		, "ppt"   : "application/vnd.ms-powerpoint"
		, "ps"    : "application/postscript"
		, "psd"   : "image/vnd.adobe.photoshop"
		, "py"    : "text/x-script.python"
		, "qt"    : "video/quicktime"
		, "ra"    : "audio/x-pn-realaudio"
		, "rake"  : "text/x-script.ruby"
		, "ram"   : "audio/x-pn-realaudio"
		, "rar"   : "application/x-rar-compressed"
		, "rb"    : "text/x-script.ruby"
		, "rdf"   : "application/rdf+xml"
		, "roff"  : "text/troff"
		, "rpm"   : "application/x-redhat-package-manager"
		, "rss"   : "application/rss+xml"
		, "rtf"   : "application/rtf"
		, "ru"    : "text/x-script.ruby"
		, "s"     : "text/x-asm"
		, "sgm"   : "text/sgml"
		, "sgml"  : "text/sgml"
		, "sh"    : "application/x-sh"
		, "sig"   : "application/pgp-signature"
		, "snd"   : "audio/basic"
		, "so"    : "application/octet-stream"
		, "svg"   : "image/svg+xml"
		, "svgz"  : "image/svg+xml"
		, "swf"   : "application/x-shockwave-flash"
		, "t"     : "text/troff"
		, "tar"   : "application/x-tar"
		, "tbz"   : "application/x-bzip-compressed-tar"
		, "tcl"   : "application/x-tcl"
		, "tex"   : "application/x-tex"
		, "texi"  : "application/x-texinfo"
		, "texinfo" : "application/x-texinfo"
		, "text"  : "text/plain"
		, "tif"   : "image/tiff"
		, "tiff"  : "image/tiff"
		, "torrent" : "application/x-bittorrent"
		, "tr"    : "text/troff"
		, "txt"   : "text/plain"
		, "vcf"   : "text/x-vcard"
		, "vcs"   : "text/x-vcalendar"
		, "vrml"  : "model/vrml"
		, "war"   : "application/java-archive"
		, "wav"   : "audio/x-wav"
		, "wma"   : "audio/x-ms-wma"
		, "wmv"   : "video/x-ms-wmv"
		, "wmx"   : "video/x-ms-wmx"
		, "wrl"   : "model/vrml"
		, "wsdl"  : "application/wsdl+xml"
		, "xbm"   : "image/x-xbitmap"
		, "xhtml"   : "application/xhtml+xml"
		, "xls"   : "application/vnd.ms-excel"
		, "xml"   : "application/xml"
		, "xpm"   : "image/x-xpixmap"
		, "xsl"   : "application/xml"
		, "xslt"  : "application/xslt+xml"
		, "yaml"  : "text/yaml"
		, "yml"   : "text/yaml"
		, "zip"   : "application/zip"
	}
	
	var i = path.lastIndexOf('.');
	console.log(i, path) ;
	var ext = (i < 0) ? '' : path.substr(i+1);
	return extTypes[ext.toLowerCase()] || 'application/octet-stream';
	
	// ----
	/*		
	return {
		getExt: function (path) {
			var i = path.lastIndexOf('.');
			return (i < 0) ? '' : path.substr(i);
		},
		getContentType: function (ext) {
			return extTypes[ext.toLowerCase()] || 'application/octet-stream';
		}
	};
	*/
};

// Declare as a global var : tools
GLOBAL.tools = exports ;