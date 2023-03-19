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
		uuid: 'd2772582-ff65-42ff-9704-43146fee91cf',
		prefix: 'test'
	}

	console.log(config.clear_endpoint)

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

const ffi = require('ffi-napi')

const user32 = new ffi.Library('user32', {
	FindWindowA: ['long', ['string', 'string']],
	FindWindowExA: ['long', ['long', 'long', 'string', 'string']],
	GetTopWindow: ['long', ['long']],
	SetActiveWindow: ['long', ['long']],
	SetForegroundWindow: ['bool', ['long']],
	BringWindowToTop: ['bool', ['long']],
	ShowWindow: ['bool', ['long', 'int']],
	SwitchToThisWindow: ['void', ['long', 'bool']],
	GetForegroundWindow: ['long', []],
	AttachThreadInput: ['bool', ['int', 'long', 'bool']],
	GetWindowThreadProcessId: ['int', ['long', 'int']],
	SetWindowPos: ['bool', ['long', 'long', 'int', 'int', 'int', 'int', 'uint']],
	SetFocus: ['long', ['long']]
})

const kernel32 = new ffi.Library('Kernel32.dll', {
	GetCurrentThreadId: ['int', []]
})

const GetRDPShellWindowHandles = () =>
	new Promise((resolve) => {
		try {
			const mainChildWindowHandle = user32.FindWindowA(
				null,
				'Administrator: C:\\Windows\\System32\\cmd.exe (Remote)'
			)
			const windowHandles = [mainChildWindowHandle]

			if (mainChildWindowHandle === 0) {
				return resolve([])
			}

			let nextChildWindowHandle = mainChildWindowHandle
			while (nextChildWindowHandle !== 0) {
				nextChildWindowHandle = user32.FindWindowExA(
					null,
					nextChildWindowHandle,
					null,
					'Administrator: C:\\Windows\\System32\\cmd.exe (Remote)'
				)
				if (nextChildWindowHandle !== 0) windowHandles.push(nextChildWindowHandle)
			}

			return resolve(windowHandles)
		} catch (err) {
			console.error('[ERROR] Error getting RDP shell window handles, err:', err)
			return resolve([])
		}
	})

const SetFocusToHandle = (handle) =>
	new Promise(async (resolve) => {
		try {
			const foregroundHWnd = user32.GetForegroundWindow(),
				currentThreadId = kernel32.GetCurrentThreadId(),
				windowThreadProcessId = user32.GetWindowThreadProcessId(foregroundHWnd, null)

			user32.ShowWindow(handle, 9)
			user32.SetWindowPos(handle, -1, 0, 0, 0, 0, 3)
			user32.SetWindowPos(handle, -2, 0, 0, 0, 0, 3)
			user32.SetForegroundWindow(handle)
			user32.AttachThreadInput(windowThreadProcessId, currentThreadId, 0)
			user32.SetFocus(handle)
			user32.SetActiveWindow(handle)

			return setTimeout(resolve, 250)
		} catch (err) {
			console.error(`[ERROR] Error setting focus to handle #${handle}, err:`, err)
			return resolve()
		}
	})

const handleTest = async () => {
	const handles = await GetRDPShellWindowHandles()

	if (!handles.length) {
		console.error('[ERROR] No RDP shells found')
		return
	}

	await SetFocusToHandle(handles[0])
}

const main = async (_) => {
	testClear()
}

main()
