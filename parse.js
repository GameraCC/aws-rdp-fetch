const fs = require('fs')
const j2c = require('json2csv')

const HandleParsing = ({ uuid, prefix }) =>
	new Promise((res) => {
		const data = []

		const filenames = fs.readdirSync(`./raw/${uuid}-${prefix}`, { encoding: 'ascii' })

		filenames.forEach((filename) => {
			const file = fs.readFileSync(`./raw/${uuid}-${prefix}/${filename}`, { encoding: 'utf-8' })
			const input = JSON.parse(file)

			data.push(...input)
		})

		// Write output JSON data
		fs.writeFileSync(`./parsed/${uuid}-${prefix}.json`, JSON.stringify(data), {
			encoding: 'utf-8'
		})

		// Write output CSV data
		const csv = j2c.parse(data)
		fs.writeFileSync(`./parsed/${uuid}-${prefix}.csv`, csv, { encoding: 'utf-8' })

		console.log(`\n[STATUS] [${uuid}] [${prefix}] Finished parsing data`)
		console.log(`[STATUS] [${uuid}] [${prefix}] JSON Output: ${__dirname}\\parsed\\${uuid}-${prefix}.json`)
		console.log(`[STATUS] [${uuid}] [${prefix}] CSV Output: ${__dirname}\\parsed\\${uuid}-${prefix}.csv`)

		return res()
	})

module.exports = {
	HandleParsing
}
