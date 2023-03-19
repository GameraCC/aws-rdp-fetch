const config = require('./lib/config.json')
const fs = require('fs')
const child = require('node:child_process')
const { keyboard, Key, mouse, Button, clipboard, Point } = require('@nut-tree/nut-js')
const { v4: uuidv4 } = require('uuid')
const request = require('request')
const find = require('find-process')
const { HandleParsing } = require('./parse')
const ffi = require('ffi-napi')
let isPortReachable

const RDP_FILES_PATH = './rdps'

keyboard.config.autoDelayMs = 0
mouse.config.autoDelayMs = 0
mouse.config.mouseSpeed = 999999999999

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
				`${config.username}: C:\\Windows\\System32\\cmd.exe (Remote)`
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
					`${config.username}: C:\\Windows\\System32\\cmd.exe (Remote)`
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

const KillRDPProcesses = () =>
	new Promise(async (res) => {
		console.log('[STATUS] Terminating Active RDP Processes')
		const results = await find('name', 'mstsc.exe')
		results.forEach(({ pid }) => process.kill(pid))
		return res()
	})

const SendUploadRDP = (uploadCommand) =>
	new Promise(async (res) => {
		const handles = await GetRDPShellWindowHandles()

		if (!handles.length) {
			console.log('[ERROR] No RDP shells found')
			return
		}

		for (const handle of handles) {
			// await new Promise((resolve) => setTimeout(resolve, 2500))
			console.log(`[STATUS] [Handle ${handle}] Focusing handle`)

			await SetFocusToHandle(handle)
			await new Promise((resolve) => setTimeout(resolve, 100))

			console.log(`[STATUS] [Handle ${handle}] Injecting upload command`)
			await keyboard.type(uploadCommand)
			await keyboard.type(Key.Enter)
		}

		return res()
	})

const ClearS3Bucket = ({ uuid, prefix }) =>
	new Promise((resolve) => {
		try {
			console.log(`[STATUS] [${uuid}] [${prefix}] Clearing S3 file upload bucket`)

			const data = {
				uuid,
				prefix
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
						if (err) {
							console.error(
								`[STATUS] [${uuid}] [${prefix}] Error clearing S3 file upload bucket, request error:`,
								res.statusCode
							)
							return resolve()
						} else {
							if (res.statusCode === 200) {
								console.log(`[SUCCESS] [${uuid}] [${prefix}] Cleared S3 file upload bucket`)
								return resolve()
							} else {
								console.error(
									`[STATUS] [${uuid}] [${prefix}] Error clearing S3 file upload bucket, status:`,
									res.statusCode
								)
								return resolve()
							}
						}
					} catch (err) {
						console.error(
							`[STATUS] [${uuid}] [${prefix}] Error clearing S3 file upload bucket, caught request error:`,
							res.statusCode
						)
						return resolve()
					}
				}
			)
		} catch (err) {
			console.error(`[STATUS] [${uuid}] [${prefix}] Error clearing S3 file upload bucket, caught error:`, err)
			return resolve()
		}
	})

const GenerateUploadCommand = ({ upload_bucket_url, upload_endpoint, uuid, path, prefix }) =>
	`curl -s ${upload_bucket_url} -o ./aws-rdp-productivity-upload.exe && aws-rdp-productivity-upload.exe --uuid="${uuid}" --endpoint="${upload_endpoint}" --path="${path.replace(
		/\\\\/g,
		'\\'
	)}" --prefix="${prefix}" && del aws-rdp-productivity-upload.exe && exit`

class RDP {
	constructor({ ip, username, password, uuid, prefix }) {
		this.ip = ip
		this.username = username
		this.password = password
		this.uuid = uuid
		this.prefix = prefix

		this.online = false
	}

	generateRdpFile = () =>
		new Promise((res) => {
			console.log(`[STATUS] [${this.uuid}] [${this.prefix}] [${this.ip}] Generating RDP file`)

			// Encrypt the RDP password to be inputted into a RDP file, this is required.
			child.exec(
				`('${this.password}' | ConvertTo-SecureString -AsPlainText -Force) | ConvertFrom-SecureString;`,
				{ shell: 'powershell.exe' },
				(err, stdout, stderr) => {
					if (err || stderr.length) {
						console.error(
							`[ERROR] [${this.uuid}] [${this.prefix}] [${this.ip}] Error generating RDP file (command), err:`,
							err
						)
						return res()
					}

					const encrypted_password = stdout

					// Generate the RDP file data with the RDP username, password, and remote host address
					this.rdpFileData = `
                        full address:s:${this.ip}
                        username:s:${this.username}
                        password 51:b:${encrypted_password}
                        remoteapplicationmode:i:1
                        disableremoteappcapscheck:i:0
                        prompt for credentials on client:i:0
                        alternate shell:s:rdpinit.exe
                        remoteapplicationname:s:Command Prompt
                        remoteapplicationprogram:s:C:\\Windows\\System32\\cmd.exe
                        redirectclipboard:i:0
                        encode redirected video capture:i:0
                        redirectposdevices:i:0
                        redirectprinters:i:0
                        redirectcomports:i:0
                        redirectsmartcards:i:0
                        redirectwebauthn:i:0
                        devicestoredirect:s:*
                        drivestoredirect:s:*
                        redirectdrives:i:0
                        session bpp:i:8
                        span monitors:i:0
                        use multimon:i:0
                        allow font smoothing:i:0
                    `
					return res()
				}
			)
		})

	createRdpFile = () =>
		new Promise((res) => {
			try {
				console.log(`[STATUS] [${this.uuid}] [${this.prefix}] [${this.ip}] Creating RDP file`)

				if (!this.rdpFileData) {
					console.error(
						`[ERROR] [${this.uuid}] [${this.prefix}] [${this.ip}] Error creating RDP file, no RDP file generated`
					)
					return res()
				}

				fs.writeFile(`${RDP_FILES_PATH}/${this.ip}.rdp`, this.rdpFileData, { encoding: 'utf-8' }, (err) => {
					if (err) {
						console.error(
							`[ERROR] [${this.uuid}] [${this.prefix}] [${this.ip}] Error saving RDP file, err:`,
							err
						)
					}
					return res()
				})
			} catch (err) {
				console.error(`[ERROR] [${this.uuid}] [${this.prefix}] [${this.ip}] Error creating RDP file, err:`, err)
				return res()
			}
		})

	checkRDPPortStatus = () =>
		new Promise(async (res) => {
			try {
				console.log(`[STATUS] [${this.uuid}] [${this.prefix}] [${this.ip}] Checking RDP Port Status`)

				this.online = await isPortReachable(3389, { host: this.ip })

				if (this.online) console.log(`[STATUS] [${this.uuid}] [${this.prefix}] [${this.ip}] Server is online`)
				else console.log(`[STATUS] [${this.uuid}] [${this.prefix}] [${this.ip}] Server is offline`)

				return res()
			} catch (err) {
				console.error(
					`[ERROR] [${this.uuid}] [${this.prefix}] [${this.ip}] Error Checking RDP Port Status, err:`,
					err
				)
				return res()
			}
		})

	initializeRdp = () =>
		new Promise(async (res) => {
			try {
				console.log(`[STATUS] [${this.uuid}] [${this.prefix}] [${this.ip}] Initializing RDP`)

				// Launch the RDP process
				child.exec(`"${__dirname}\\rdps\\${this.ip}.rdp"`)

				// RDP initialization delay
				setTimeout(res, config.rdp_delay)
			} catch (err) {
				console.error(`[ERROR] [${this.uuid}] [${this.prefix}] [${this.ip}] Error Initializing RDP, err:`, err)
				return res()
			}
		})

	start = () =>
		new Promise(async (res) => {
			try {
				await this.generateRdpFile()
				await this.createRdpFile()
				await this.checkRDPPortStatus()

				if (this.online) await this.initializeRdp()

				return res()
			} catch (err) {
				return res()
			}
		})
}

const main = async (_) => {
	// Load promisified ES module imports
	isPortReachable = (await import('is-port-reachable')).default

	const uuid = uuidv4()
	const promises = []

	// Kill previously running RDP processes
	await KillRDPProcesses()

	for (const ip of config.instances) {
		const rdp = new RDP({
			ip,
			username: config.username,
			password: config.password,
			uuid,
			prefix: config.prefix
		})

		promises.push(rdp.start())
	}

	/**
	 * Initialize all RDPs (which also contains a delay for resolving the promise, if the RDPs are not initialized within the delay time-frame,
	 * the function returns and terminates the child process attempting to initalize the RDP)
	 */
	await Promise.all(promises)

	const uploadCommand = GenerateUploadCommand({
		upload_bucket_url: config.upload_bucket_url,
		upload_endpoint: config.upload_endpoint,
		uuid,
		path: config.path,
		prefix: config.prefix
	})

	// Upload files from all RDPs sequentially (consequence of library being used to manipulate keystrokes on each PID)
	await SendUploadRDP(uploadCommand)

	// RDP termination delay
	console.log(
		`[STATUS] [${uuid}] [${config.prefix}] Waiting ${config.terminate_delay}ms prior to terminating active RDP processes`
	)
	await new Promise((resolve) => setTimeout(resolve, config.terminate_delay))

	// Kill remaining RDP processes
	await KillRDPProcesses()

	// Fetch data from S3
	console.log(`[STATUS] [${uuid}] [${config.prefix}] Fetching data from S3`)
	const fetchProcess = child.exec('npm run fetch')
	fetchProcess.stdout.on('data', (data) => console.log(data))
	fetchProcess.stderr.on('data', (data) => console.log(data))

	await new Promise((resolve) => {
		fetchProcess.on('close', resolve)
	})

	// Clear the S3 bucket upon completion of parsing
	await ClearS3Bucket({ uuid, prefix: config.prefix })

	// Handle parsing of data from /raw
	await HandleParsing({ uuid, prefix: config.prefix })
}

main()
