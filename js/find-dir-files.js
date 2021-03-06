// ディレクトリやファイルを探す

void function () {
	'use strict';

	module.exports = findDirFiles;

	const path = require('path');
	const fs = require('fs');
	const aa = require('aa');
	const Executors = require('executors');

	const statAsync = aa.thunkify(fs, fs.stat);
	const readdirAsync = aa.thunkify(fs, fs.readdir);
	if (typeof statAsync !== 'function')
		throw new TypeError('eh!? statAsync');
	if (typeof readdirAsync !== 'function')
		throw new TypeError('eh!? readdirAsync');

	const INVISIBLE_PROP = ' ';
	const PARENT_PROP = ' parent';
	const CLEAN_PROP = ' clean';
	const HIDE_PROP = ' hide';
	const ERROR_PROP = '*';
	const CANCEL_ERROR = new Error('キャンセル');
	const SEARCHING = '検索中です';

	// 特殊なデータ・クラス
	function SpecialData(prop, val) {
		if (arguments.length !== 0)
			this[prop] = val;
	}

	// ディレクトリとファイルを検索
	function *findDirFiles(dir, rexSearch, rexSearchSkip, rexClose, controller) {
		if (!controller) controller = {};
		if (controller.isCancel)
			return new SpecialData(ERROR_PROP, CANCEL_ERROR);
		const maxFiles = controller.maxFiles || 3000;
		const maxTotalFiles = controller.maxTotalFiles || 100000;
		const {progress} = controller;
		let wholeObject;
		let filesCount = 0;

		const xqtorRead = Executors(10);
		const xqtorStat = Executors(10);
		const result = yield *find(dir);

		if (filesCount > maxTotalFiles)
			result[ERROR_PROP] = new RangeError(
				'合計ファイル数の制限 (' +
				maxTotalFiles + ') を超えました (' +
				filesCount + ')');

		if (typeof result[ERROR_PROP] === 'string' &&
				(result[ERROR_PROP] + '').startsWith(SEARCHING))
			delete result[ERROR_PROP];

		return result;

		// cancel
		function *cancel() {
			try {
				yield *xqtorRead.cancel();
				yield *xqtorStat.cancel();
			} catch(e) {
				yield *xqtorRead.end();
				yield *xqtorStat.end();
			}
		}

		// find
		function *find(dir) {
			if (filesCount > maxTotalFiles)
				return undefined;

			const result = new SpecialData();
			if (!wholeObject) {
				wholeObject = result;
				wholeObject[ERROR_PROP] = SEARCHING;
				setDirty(result);
				progress &&
				progress({isDirectory:true, file: dir, wholeObject, dir, name: '', stat: null});
			}

			if (typeof wholeObject[ERROR_PROP] === 'string' &&
					(wholeObject[ERROR_PROP] + '').startsWith(SEARCHING))
				wholeObject[ERROR_PROP] = SEARCHING + ' (' + filesCount + ')';

			try {
				const names = yield xqtorRead(readdirAsync, dir);
				if (controller.isCancel) {
					result[ERROR_PROP] = CANCEL_ERROR;
					setDirty(result);
					yield *cancel();
					return result;
				}
				if (names.length > maxFiles) {
					result[ERROR_PROP] = new RangeError(
						'ファイル数の制限 (' +
						maxFiles + ') を超えました (' +
						names.length + ')');
					setDirty(result);
					return result;
				}
				filesCount += names.length;
				if (filesCount > maxTotalFiles)
					return undefined;

				yield names.map(name => function *() {
					if (rexSearchSkip && rexSearchSkip.test(name))
						return;

					// 名前順 (readdirの結果の順番) に子キーを設定
					result[name] = undefined;
					setDirty(result);
					try {
						var file = path.resolve(dir, name);
						const stat = yield xqtorStat(statAsync, file);
						if (controller.isCancel) {
							result[name] = new SpecialData(ERROR_PROP, CANCEL_ERROR);
							setDirty(result);
							return yield *cancel();
						}
						if (stat.isDirectory()) {
							const r = yield *find(file);
							if (controller.isCancel) {
								result[name] = new SpecialData(ERROR_PROP, CANCEL_ERROR);
								setDirty(result);
								return yield *cancel();
							}
							if (r && (rexClose && rexClose.test(name))) r[HIDE_PROP] = true;
							if (r || !rexSearch || rexSearch.test(name)) {
								result[name] = r || new SpecialData();
								if (r) r[PARENT_PROP] = result;
								setDirty(result);
								progress &&
								progress({isDirectory:true, file: file + path.sep, wholeObject, dir, name, stat});
							}
							else delete result[name];
						}
						else if (!rexSearch || rexSearch.test(name)) {
							result[name] = null;
							setDirty(result);
							progress &&
							progress({isDirectory:false, file, wholeObject, dir, name, stat});
						}
						else delete result[name];
					} catch (e) {
						result[name] = new SpecialData(ERROR_PROP, e);
						setDirty(result);
					}
				});
				return (validKeysCount(result) || undefined) && result;
			} catch (e) {
				result[ERROR_PROP] = e;
				setDirty(result);
				return result;
			}

		} // find

		function setDirty(x) {
			if (!x) return;
			do { x[CLEAN_PROP] = false; }
			while (x = x[PARENT_PROP]);
		}

		function validKeysCount(x) {
			return Object.keys(x).filter(x => !x.startsWith(' ')).length;
		}

	} // findDirFiles
	findDirFiles.INVISIBLE_PROP = INVISIBLE_PROP;
	findDirFiles.ERROR_PROP = ERROR_PROP;
	// findDirFiles.CLEAN_PROP = CLEAN_PROP;
	findDirFiles.HIDE_PROP = HIDE_PROP;

}();
