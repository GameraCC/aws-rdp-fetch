const { compile } = require('nexe')

const main = async () => {
	console.log('[STATUS] Building executable')
	try {
		compile({
			input: './index.js',
			output: './bin/aws-rdp-productivity-upload.exe',
			build: true
		})
			.then(() => {
				console.log('[SUCCESS] Built executable')
			})
			.catch((err) => {
				console.error('[ERROR] Error building executable, err:', err)
				return
			})
	} catch (err) {
		console.error('[ERROR] Error building executable, err:', err)
		return
	}
}

main()
