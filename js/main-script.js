void function () {
	'use strict';

	focus();

	const fs = require('fs');
	const path = require('path');
	const electron = require('electron');
	const aa = require('aa');

	// range 0～n-1までの数字の配列
	const range = require('./range');

	// HTML要素のイベントと値にプロパティを接続するユーティリティ
	const m_on = require('./mithril-on')(m);

	const { openItem, showItemInFolder } = require('./electron-shell')(electron);

	const Config = require('./config-local-storage');
	const config = new Config('electron-mithril-async-file-search', {});

	const findDirFiles = require('./find-dir-files');
	const findController = { isCancel: false, cancel, progress };
	const INVISIBLE_PROP = findDirFiles.INVISIBLE_PROP;
	// const CLEAN_PROP = findDirFiles.CLEAN_PROP;
	const ERROR_PROP = findDirFiles.ERROR_PROP;
	const HIDE_PROP = findDirFiles.HIDE_PROP;

	// prop変数
	const flagDebug = m.prop(false);
	const flagUsage = m.prop(false);
	const flagReleaseNotes = m.prop(false);
	const flagWishList = m.prop(false);
	const flagFilter = config.propValue(false, 'flagFilter');
	const flagAdvanced = config.propValue(false, 'flagAdvanced');
	// 検索文字列
	const textSearch = config.propRexfer('', 'search');
	// 含める文字列 (検索結果)
	const textIncludes = config.propRexfer('', 'includes');
	// 含めない文字列 (検索結果)
	const textExcludes = config.propRexfer('', 'excludes');
	// 検索スキップ文字列
	const textSearchSkip = config.propRexfer(
		'^node_modules,^.git$,^.svn$', 'searchSkip');
	// 閉じておく文字列 (検索結果)
	const textClose = config.propRexfer(
		'^old$,backup,^旧$,^save$,^保存$,^node_modules,^.git$,^.svn$', 'close');
	// フォルダ履歴
	const folderHistory = config.propValue([], 'folderHistory');
	const folderHistorySearchResult = {}; // 検索結果
	const folderHistorySearch = {}; // 検索文字列
	// 検索文字列の履歴
	const searchHistory = config.propValue([], 'searchHistory');

	const textMaxFiles = config.propValue(3000, 'maxFiles');
	const textMaxTotalFiles = config.propValue(100000, 'maxTotalFiles');
	// 通知メッセージ
	const textMessage = m.prop('検索できます');

	const isWindows = process.platform === 'win32';

	let targetDir = path.resolve(process.env.AAA_TARGET_DIR);
	let targetDirChildren; // ターゲット・ディレクトリ直下のサブ・ディレクトリ一覧
	const initialTargetDir = targetDir;
	let driveLetters = isWindows ? ['C:\\'] : null;
	let timer; // 検索中のインターバルタイマー
	const MAX_INDENT = 20; // 最大インデントの深さ
	const indentSpace = '　';
	const SUBTREE_RETAIN = { subtree: 'retain' };

	// 使い方表示
	const viewUsage = require('./view-usage')(m);

	// リリース・ノート表示
	const viewReleaseNotes = require('./view-release-notes')(m);
	const version = viewReleaseNotes.list[0];
	document.title = '非同期ファイル検索 (electron + mithril) - ' + version;

	// やりたいことリスト表示
	const viewWishList = require('./view-wish-list')(m);

	// デバッグ表示
	const viewDebug = require('./view-debug')(m, __dirname, __filename);

	isWindows && require('./windows-get-drive-letters')().then(list => {
		driveLetters = list.map(x => x + ':\\');
		m.redraw(true);
	});

	targetDirChanged();

	m.mount($div, { view: viewMain });

	// メインview
	function viewMain() {
		let dir = targetDir;
		if (dir.length > 1 && dir.endsWith(path.sep))
			dir = dir.substr(0, dir.length - 1);
		const paths = dir.split(path.sep).map(x => x + path.sep);
		if (dir.substr(0, 2) === '\\\\') {
			paths.shift(); paths.shift();
			const host = paths.shift(), share = paths.shift();
			paths.unshift('\\\\' + host + share);
		}
		return [
			m('h3', { key: 'title' }, 'ファイル検索 - ',

				timer || !driveLetters ? '' :
				m('select.button', {
					onchange: e => {
						if (e.target.value) {
							targetDir = e.target.value;
							targetDirChanged();
							// m.redraw(true);
						}
					}
				},
					m('option.button', { key: '', value: '', selected: true }, ''),
					m('option.button', { key: initialTargetDir, value: initialTargetDir }, '<初>'),
					// m('option.button', { key: '.', value: '.' }, '<現>'),

					// ドライブレターのリスト (Windowsのみ)
					driveLetters &&
					driveLetters.map(x => m('option.button',
						{ key: x, selected: x.substr(0, 2) === targetDir.substr(0, 2) }, x))),
				' ',

				timer ? m('font[color=green]', targetDir) :
					paths.map((x, i) => i === paths.length - 1 ? m('span.current', ' ' + x + ' ') : [
						m('button.button', {
							onclick: () => {
								if (i === 0) targetDir = paths[0];
								else targetDir = paths.slice(0, i + 1).join('');
								targetDirChanged();
								m.redraw(true);
							}
						}, x),
					]),
				(timer || !targetDirChildren || !targetDirChildren.length ? ' ' :
					m('select.button', {
						onchange: e => {
							if (e.target.value) {
								targetDir = path.resolve(targetDir, e.target.value);
								targetDirChanged();
								m.redraw(true);
							}
						}
					}, m('option.button'),
						targetDirChildren.map(x => m('option.button', x)))),
				timer ? m('font[color=red]', ' - 検索中') : ''),

			timer || !folderHistory().length ? '' :
			m('h3', { key: 'folderHistory' }, 'フォルダ履歴 - ',
				m('select.button', {
					onchange: e => {
						if (e.target.value) {
							targetDir = e.target.value;
							targetDirChanged();
							// m.redraw(true);
						}
					}
				},
					m('option.button', { key: '', value: '' }, ''),
					// フォルダ履歴
					folderHistory().map(x =>
						m('option.button', { key: x, selected: x === targetDir }, x))),
				' ', m('button.button', { onclick: () => folderHistory([]) }, 'クリア')),

			m('div', { key: 'condition' },
				timer ? [
					m('div',
						m('button.button', { onclick: cancel }, 'ｷｬﾝｾﾙ'),
						m('span', ' '),
						m('b', m('font[color=red]', textSearch()))),
					textIncludes() || textExcludes() ? [m('hr'), m('div', '検索結果フィルタ')] : '',
					textIncludes() ? m('div', '絞込: 「', textIncludes(), '」を含む') : '',
					textExcludes() ? m('div', '除外: 「', textExcludes(), '」を含まない') : '',
					m('hr'),
					m('div', '検索最大ファイル数を制限'),
					m('div', '最大ファイル数/フォルダ: 「', textMaxFiles(), '」'),
					m('div', '最大ファイル数/トータル: 「', textMaxTotalFiles(), '」'),
					m('div', '検索したくないファイルやフォルダ: 「', textSearchSkip(), '」'),
					m('div', '検索時に閉じておくフォルダ: 「', textClose(), '」'),
				] : [
						m('font[color=gray][size=1]', '※ワイルドカード*?検索できます。' +
							'空白でAND、コンマとセミコロンでOR、マイナスでNOT。' +
							'優先順位：マイナス、コンマ、空白、セミコロンの順。'),

						// 検索
						m('form', { onsubmit: search },
							m('div', '検　索　: ',
								m('input', m_on('change', 'value', textSearch,
									{
										autofocus: true, placeholder: '検索したい文字列', size: 100,
										onfocus: selectThisText
									})),
								' ', m('button.button[type=submit]', { onclick: search }, '検索')),

							!searchHistory().length ? '' : m('div', '検索履歴: ',
								m('select.button', { onclick: e =>
									textSearch(e.target.value) },
									searchHistory().map(x => m('option.button',
										{ selected: x === textSearch() }, x))),
								' ', m('button.button', { onclick: () =>
									searchHistory([]) }, 'クリア'))),
						//m('hr'),

						// 検索オプション
						m('div',
							m('input[type=checkbox]',
								m_on('click', 'checked', flagAdvanced)),
							m('font[color=purple]',
								m('span', { onclick: () => flagAdvanced(!flagAdvanced()) },
									'検索オプション'),
								flagAdvanced() ? [

									m('div', ' 　 　 検索したくない: ',
										m('input', m_on('change', 'value', textSearchSkip,
											{
												autofocus: true, size: 100,
												placeholder: '検索したくないファイルやフォルダ'
											})),
										' : 検索したくないファイルやフォルダ'),

									m('div',
										' 　 　 検索時に閉じる: ',
										m('input', m_on('change', 'value', textClose,
											{ placeholder: '検索時に閉じておくフォルダ', size: 100 })),
										' : 検索時に閉じておくフォルダ'),
									m('div', ' 　 　 検索最大ファイル数を制限: 　 ',
										m('span',
											' 　 最大ファイル数/フォルダ: ',
											m('input', m_on('change', 'value', textMaxFiles,
												{ placeholder: '最大ファイル数/フォルダ', size: 10 }))),
										m('span',
											' 　 最大ファイル数/トータル: ',
											m('input', m_on('change', 'value', textMaxTotalFiles,
												{ placeholder: '最大ファイル数/トータル', size: 10 })))),
								] : '')),
						//m('hr'),

						// 検索結果フィルタ
						m('div',
							m('input[type=checkbox]',
								m_on('click', 'checked', flagFilter)),
							m('font[color=darkblue]',
								m('span', { onclick: () => flagFilter(!flagFilter()) },
									'検索結果フィルタ'),
								flagFilter() ? [
									m('div', ' 　 　 結果を絞り込み: ',
										m('input', m_on('change', 'value', textIncludes,
											{ placeholder: '含む', size: 100 })),
										' を含む'),
									m('div', ' 　 　 結果から非表示: ',
										m('input', m_on('change', 'value', textExcludes,
											{ placeholder: '含まない', size: 100 })),
										' を含まない'),
								] : '')),

					]
			),
			m('hr', { key: 'hr-search' }),

			// メッセージ
			m('div', { key: 'message' }, m('b', textMessage())),
			m('hr', { key: 'hr-message' }),

			// 検索結果
			folderHistorySearch[targetDir] ?
				m('h3', '検索: ' + folderHistorySearch[targetDir]) : '',
			viewSearchResult(),
			m('hr', { key: 'hr-result' }),

			// 使い方表示
			m('div', { key: 'usage' },
				m('input[type=checkbox]',
					m_on('click', 'checked', flagUsage)),
				m('font[color=gray]',
					{ onclick: () => flagUsage(!flagUsage()) },
					'使い方',
					flagUsage() ? viewUsage() : '')),

			// リリース・ノート表示
			m('div', { key: 'release-notes' },
				m('input[type=checkbox]',
					m_on('click', 'checked', flagReleaseNotes)),
				m('font[color=darkblue]',
					{ onclick: () => flagReleaseNotes(!flagReleaseNotes()) },
					'リリース・ノート: ' + version,
					flagReleaseNotes() ? viewReleaseNotes() : '')),

			// やりたいことリスト表示
			m('div', { key: 'wish-list' },
				m('input[type=checkbox]',
					m_on('click', 'checked', flagWishList)),
				m('font[color=purple]',
					{ onclick: () => flagWishList(!flagWishList()) },
					'やりたいことリスト',
					flagWishList() ? viewWishList() : '')),

			// デバッグ表示
			m('div', { key: 'debug' },
				m('input[type=checkbox]',
					m_on('click', 'checked', flagDebug)),
				m('font[color=brown]',
					{ onclick: () => flagDebug(!flagDebug()) },
					'デバッグ表示 (環境変数など)',
					(flagDebug() ? viewDebug() : '')))
		];
	}

	function selectThisText(e) {
		this.select(0, this.value.length);
	}

	// ツリー表示
	function viewNode(nodePath, node, i, n) {
		if (typeof node === 'object' && node !== null) {
			let keys = Object.getOwnPropertyNames(node);
			return [
				keys.filter(prop => !prop.startsWith(INVISIBLE_PROP)).map(prop => {
					const child = node[prop];
					const fullPath = (nodePath.join(path.sep) + path.sep + prop).substr(i === 0);
					if (prop === ERROR_PROP)
						return child === undefined ? [] :
							m('tr', { key: fullPath },
								range(i + 1).map(x => m('td.indent', indentSpace)),
								m('td.error', { colspan: n - i }, child + ''));
					let vdom = [];
					if (child ||
						(!textSearch.rexfer || textSearch.rexfer.test(prop)) &&
						(!textIncludes.rexfer || textIncludes.rexfer.test(prop)) &&
						(!textExcludes.rexfer || !textExcludes.rexfer.test(prop))) {

						vdom.push(m('tr', { key: fullPath }, [
							range(i).map(x => m('td.indent', indentSpace)),
							child ?
								m('td.indent', {}, m('input[type=checkbox]',
									m_on('click', 'checked', v =>
										v === undefined ? !child[HIDE_PROP] :
											(child[HIDE_PROP] = !v))
								)) :
								m('td.indent.folder',
									{ onclick: () => showItemInFolder(fullPath) },
									'■'),
							m(child ? 'td.folder' : 'td.file', {
								colspan: n - i,
								title: fullPath.substring(targetDir.length + 1),
								onclick: child && !isWindows ?
									() => showItemInFolder(fullPath) :
									() => openItem(fullPath)
							}, prop)
						]));
					}
					if (child && !child[HIDE_PROP])
						vdom.push(viewNode(nodePath.concat(prop), child, i + 1, n));
					return vdom;
				})
			];
		}
		else
			return [];
	}

	// 結果表示 ツリー形式
	function viewSearchResult() {
		return m('table',
			{ width: '100%', cellPadding: 0, border: 0, borderColor: 'lightgray', cellSpacing: 0 },
			viewNode([], { [targetDir]: folderHistorySearchResult[targetDir] }, 0, MAX_INDENT)
		);
	}

	// 検索コールバック
	function progress(object) {
		folderHistorySearchResult[targetDir] = object.wholeObject;
	}

	// 検索
	function search() {
		textMessage('検索中...');
		if (timer) return;
		aa(function* () {
			m.redraw(true);

			// 検索文字列の履歴に追加
			const s = textSearch();
			searchHistory([s]
				.concat(searchHistory().filter(x => x !== s))
				.filter((x, i) => i < 10));

			// 検索フォルダ履歴に追加
			folderHistory([targetDir]
				.concat(folderHistory().filter(x => x !== targetDir))
				.filter((x, i) => i < 10));

			folderHistorySearchResult[targetDir] = {};
			folderHistorySearch[targetDir] = textSearch();

			timer = setInterval(() => m.redraw(true), 500);
			findController.isCancel = false;
			findController.maxFiles = textMaxFiles();
			findController.maxTotalFiles = textMaxTotalFiles();

			try {
				yield findDirFiles(targetDir,
					textSearch.rexfer,
					textSearchSkip.rexfer,
					textClose.rexfer,
					findController);
				if (!findController.isCancel)
					textMessage('完了しました');
			} catch (e) {
				cancel();
				console.error('search err:');
				console.error(e);
				alert(e.stack);
			}
			finish();
		});
		return false;
	}

	// キャンセル
	function cancel() {
		if (!findController.isCancel)
			textMessage('キャンセルしました');
		finish();
	}

	// 終了
	function finish() {
		findController.isCancel = true;
		if (timer) clearInterval(timer);
		timer = null;
		m.redraw(true);
		setTimeout(() => m.redraw(true), 500);
	}

	// ターゲット・ディレクトリが変更された時に、サブ・ディレクトリ一覧を取得する
	function targetDirChanged() {
		aa(function* () {
			targetDir = path.resolve(targetDir);
			if (targetDir.length > (isWindows ? 3 : 2) && targetDir.substr(-1) === path.sep)
				targetDir = targetDir.substr(0, targetDir.length - 1);
			targetDirChildren = null;
			folderHistorySearchResult[targetDir] = folderHistorySearchResult[targetDir] ||
				{ [ERROR_PROP]: 'まだ検索していません' };
			m.redraw(true);
			try {
				const names = yield cb => fs.readdir(targetDir, cb);
				targetDirChildren = (yield names.map(name => function* () {
					try {
						const stat = yield cb => fs.stat(path.resolve(targetDir, name), cb);
						return { name, stat };
					} catch (e) { return { name } }
				})).filter(x => x.stat && x.stat.isDirectory()).map(x => x.name);
			} catch (e) { }
			m.redraw(true);
		});
	}

}();
