const cookieVal = '';

const header = {
	Accept: 'application/json, text/plain, */*',
	'Content-Type': 'application/json;charset=UTF-8',
	'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
	Cookie: cookieVal,
}
function formatAmount(value) {
	if (value == null) return '未知';
	const str = String(value);

	return str
		.replace(/(\.\d*?[1-9])0+$/, '$1')
		.replace(/\.0+$/, '');
}

function checkin(){
	const params = {
		url: 'https://glados.one/api/user/checkin',
		headers: {...header},
		body: JSON.stringify({"token":"glados.one"})
	};
	$httpClient.post(params, function(error,response,data){
		console.log('end request')
		if(error){
			$notification.post('GlaDOS签到错误','',String(error));
		}else {
			let json;
			try{
				json = JSON.parse(data);
			}catch(e){
				$notification.post('GlaDOS返回解析失败', '', String(e));
				$done();
				return;
			}
			if(json.code === 0){
				$notification.post('GlaDOS签到成功', '当前积分总计:' + formatAmount(json.list?.[0]?.balance), json.message);
			}else {
				$notification.post('GlaDos签到失败', '当前积分总计:' + formatAmount(json.list?.[0]?.balance), json.message, );
			}
		}
		$done();
	});
}
checkin()