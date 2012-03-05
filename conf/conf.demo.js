exports.clients = {
	'server.demo': {
		"type": "sftp",
		"host": "demo.domain.com",
		"user": "www-data",
		"port": 22,
		"remote_path": "/var/www/",
		"ignore_regex": "(sftp-settings\\.json|\\.svn|\\.hg|\\.git|\\.bzr|_darcs|CVS|\\.DS_Store|Thumbs\\.db|desktop\\.ini)",
		"ssh_key_file": "~/ssh-key.pem"
	},
	'server.demo.ftp': {
		"type": "ftp",
		"host": "demo.domain.com",
		"user": "www-data",
		"password": "xxxxxxx",
		"port": 21,
		"remote_path": "/var/www/",
		"ignore_regex": "(sftp-settings\\.json|\\.svn|\\.hg|\\.git|\\.bzr|_darcs|CVS|\\.DS_Store|Thumbs\\.db|desktop\\.ini)"
	}
} ;,
