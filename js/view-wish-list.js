'use strict';

module.exports = function (m) {

	return viewWishList;

	// やりたいことリスト表示
	function viewWishList() {
		const list = [
			'更新日時など',
			'いろいろと実現した。後、やることは?',
		];
		return m('ul', list.map(x => m('li', x)));
	}

};
