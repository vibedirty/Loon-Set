const cookieVal = '';

const header = {
	Accept: 'application/json, text/plain, */*',
	'Content-Type': 'application/json;charset=UTF-8',
	'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
	Cookie: cookieVal,
}
function checkin(){
	const params = {
		url: 'https://glados.one/api/user/checkin',
		headers: {...header},
		body: JSON.stringify({"token":"glados.one"})
	};
	console.log(params);
	$httpClient.post(params, function(error,response,data){
		console.log(error,response, data);
		$done();
	});
}
checkin()