void function () {
	'use strict';

	const path = require('path');

	const dirRex = /\$\$\$/g;
	const exeRex = /###/g;
	const yenRex = /\\/g;
	const yen2Str = '\\\\';

	const child_process = require('child_process');
	const fs = require('fs');

	const eleExe = path.resolve('..\\node_modules\\electron\\dist\\electron.exe');
	const srcDir = path.resolve('..');

	const buff = fs.readFileSync('xx-e.reg').toString('UTF16LE')
	.replace(dirRex, srcDir.replace(yenRex, yen2Str))
	.replace(exeRex, eleExe.replace(yenRex, yen2Str));
	fs.writeFileSync('xx-e.reg-tmp.reg', Buffer.from(buff, 'UTF16LE'));

	const res = child_process.spawnSync('regedit', ['/s', 'xx-e.reg.log']);
	if (res.status || res.signal)
		return console.error(res.status, res.signal);
} ();
