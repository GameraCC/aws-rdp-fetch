const config = require('./lib/config.json')
const fs = require('fs')
const child = require('node:child_process')
const processWindows = require('node-process-windows')
const { keyboard, Key, mouse, Button, clipboard, Point } = require('@nut-tree/nut-js')
const { v4: uuidv4 } = require('uuid')
const request = require('request')
const find = require('find-process')
const { HandleParsing } = require('./parse')
let isPortReachable

const RDP_FILES_PATH = './rdps'

// curl -s https://aws-rdp-productivity-backend-v1-upload-bucket.s3.amazonaws.com/aws-rdp-productivity-upload.exe -o ./aws-rdp-productivity-upload.exe && aws-rdp-productivity-upload.exe --uuid="1234-1234-1234" --endpoint="https://erapu53s3e.execute-api.us-east-1.amazonaws.com/upload" --path="C:\Users\Admin\Desktop\test-directory" --prefix="test" && rm aws-rdp-productivity-upload.exe

const KillRDPProcesses = () =>
	new Promise(async (res) => {
		console.log('[STATUS] Terminating Processes')
		const results = await find('name', 'mstsc.exe')
		results.forEach(({ pid }) => process.kill(pid))
		return res()
	})

const SendUploadRDP = (uploadCommand) =>
	new Promise(async (res) => {
		const results = await find('name', 'mstsc.exe')
		keyboard.config.autoDelayMs = 0
		mouse.config.autoDelayMs = 0
		mouse.config.mouseSpeed = 999999999999

		if (!results.length) {
			console.log('[ERROR] No RDP shells found')
			return
		}

		await mouse.setPosition(new Point(256, 256))
		await new Promise((resolve) => setTimeout(resolve, 25))
		await mouse.click(Button.RIGHT)
		await new Promise((resolve) => setTimeout(resolve, 25))

		for (const result of results) {
			// await new Promise((resolve) => setTimeout(resolve, 2500))
			console.log(`[STATUS] [PID ${result.pid}] Focusing process`)

			// Focus the shell process
			processWindows.focusWindow(result.pid)
			await new Promise((resolve) => setTimeout(resolve, 100))

			console.log(`[STATUS] [PID ${result.pid}] Fullscreening shell`)

			await keyboard.type(Key.F11) // Full screen the focused shell
			await new Promise((resolve) => setTimeout(resolve, 250))
			await mouse.setPosition(new Point(256, 256))
			await new Promise((resolve) => setTimeout(resolve, 250))

			console.log(`[STATUS] [PID ${result.pid}] Injecting upload command`)

			await clipboard.setContent(uploadCommand) // Copy and paste the upload command
			await new Promise((resolve) => setTimeout(resolve, 25))
			await mouse.click(Button.RIGHT)
			await new Promise((resolve) => setTimeout(resolve, 25))
			await keyboard.type(Key.Enter)
			await new Promise((resolve) => setTimeout(resolve, 25))
			await keyboard.type(Key.F11) // Unfullscreen screen the focused shell

			await new Promise((resolve) => setTimeout(resolve, 250))
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
	)}" --prefix="${prefix}" && del aws-rdp-productivity-upload.exe`

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
				`("${this.password}" | ConvertTo-SecureString -AsPlainText -Force) | ConvertFrom-SecureString;`,
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
                        disableremoteappcapscheck:i:1
                        prompt for credentials on client:i:0
                        alternate shell:s:rdpinit.exe
                        remoteapplicationname:s:Command Prompt
                        remoteapplicationprogram:s:C:\\Windows\\System32\\cmd.exe
                        remoteapplicationcmdline:s:
                        redirectclipboard:i:1
                        redirectposdevices:i:0
                        redirectprinters:i:1
                        redirectcomports:i:1
                        redirectsmartcards:i:1
                        devicestoredirect:s:*
                        drivestoredirect:s:*
                        redirectdrives:i:1
                        session bpp:i:32
                        span monitors:i:1
                        use multimon:i:1
                        allow font smoothing:i:1
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

				return res()
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

	// Initialize all RDPs
	await Promise.all(promises)

	// RDP initialization delay
	await new Promise((resolve) => setTimeout(resolve, config.rdp_delay))

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
	await new Promise((resolve) => setTimeout(resolve, config.terminate_delay))

	// Kill remaining RDP processes
	await KillRDPProcesses()

	// Fetch data from S3
	const fetchProcess = child.exec('npm run fetch')
	await new Promise((resolve) => {
		fetchProcess.on('close', resolve)
	})

	// Clear the S3 bucket upon completion of parsing
	await ClearS3Bucket({ uuid, prefix: config.prefix })

	// Handle parsing of data from /raw
	await HandleParsing({ uuid, prefix: config.prefix })
}

main()
