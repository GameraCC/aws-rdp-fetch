/**
 * This binary is meant to be compiled into an executable to be deployed remotely
 * through RDP connections to upload a configurable file path to the upload endpoint
 *
 * EXECUTABLE is meant to be executed as follows
 *
 * ./bin/upload.exe --uuid="1234-1234-1234" --endpoint="https://abc.execute-api.us-east-1.amazonaws.com/upload" --path="C:\Users\Admin\Desktop\test-directory" --prefix="test"
 * node index.js --uuid="1234-1234-1234" --endpoint="https://abc.execute-api.us-east-1.amazonaws.com/upload" --path="C:\Users\Admin\Desktop\test-directory" --prefix="test"
 */

const request = require('request')
const commandLineArgs = require('command-line-args')
const fs = require('fs')

const definitions = [
	{ name: 'uuid', type: String },
	{ name: 'endpoint', type: String },
	{ name: 'path', type: String },
	{ name: 'prefix', type: String }
]

const options = commandLineArgs(definitions)

const main = async (_) => {
	try {
		console.log('[STATUS] Looking for files')
		const files = fs.readdirSync(options.path)
		const match = files.filter((name) => name.startsWith(options.prefix))?.[0]

		if (!match) return

		console.log(`[STATUS] Found file: ${match}`)

		const file = fs.readFileSync(`${options.path}/${match}`, { encoding: 'utf-8' })

		// Pointless. but adds an JSON validation check
		const parsed = JSON.parse(file)

		const data = {
			uuid: options.uuid,
			prefix: options.prefix,
			data: JSON.stringify(parsed)
		}

		console.log(`[STATUS] Uploading file: ${match}`)

		request(
			{
				url: options.endpoint,
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify(data)
			},
			(err, res) => {
				try {
					if (err) {
						console.error('[ERROR] Request error uploading file, err:', err)
						return
					} else {
						if (res.statusCode === 200) {
							console.log('[SUCCESS] Uploaded file')
							return
						} else {
							console.error(`[ERROR] Error uploading file, status code: ${res.statusCode}`)
							return
						}
					}
				} catch (err) {
					console.error('[ERROR] Error uploading file, err:', err)
					return
				}
			}
		)
	} catch (err) {
		console.error('Error sending request, err:', err)
		return
	}
}

main()

// request({
//     url: endpoint,
//     method: ''
// }, (err, res) => {

// })
