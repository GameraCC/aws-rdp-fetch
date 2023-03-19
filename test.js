const config = require('./lib/config.json')
const request = require('request')

const testUpload = () => {
	const data = {
		uuid: '1234-1234-1234-1234',
		prefix: 'test_file_prefix',
		data: {
			test: {
				a: 'b'
			}
		}
	}

	request(
		{
			url: config.upload_endpoint,
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify(data)
		},
		(err, res) => {
			try {
				if (err) console.error(err)
				else {
					console.log(res.statusCode)
					console.log(res.body)
				}
			} catch (err) {
				console.error(err)
			}
		}
	)
}

const testClear = () => {
	const data = {
		uuid: '1234-1234-1234-1234',
		prefix: 'test_file_prefix'
	}

	request(
		{
			url: config.clear_endpoint,
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify(data)
		},
		(err, res) => {
			try {
				if (err) console.error(err)
				else {
					console.log(res.statusCode)
					console.log(res.body)
				}
			} catch (err) {
				console.error(err)
			}
		}
	)
}

const main = async (_) => {
	const find = require('find-process')
	const processWindows = require('node-process-windows')

	const results = await find('name', 'mstsc.exe')
	const pid = results[0].pid
	processWindows.focusWindow(pid)
}

main()
