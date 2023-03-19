const { DeleteFolder } = require('../lib')

const INTERNAL_SERVER_ERROR = { statusCode: 500 }

/**
 *
 * ENDPOINT: /clear
 * BODY: {
 *  uuid: '123',
 *  prefix: '123',
 * }
 */

/**
 * Delete folder /${path}-${prefix} on S3
 */
exports.handler = async (event) => {
	try {
		// Decode base64 encoded event body if content-type is not application/json
		if (event.isBase64Encoded) event.body = Buffer.from(event.body, 'base64').toString('utf-8')

		var { uuid, prefix } = JSON.parse(event.body)
		if (!uuid || !prefix) return INTERNAL_SERVER_ERROR

		await DeleteFolder({ uuid, prefix })

		return {
			statusCode: 200
		}
	} catch (err) {
		// Log error to cloudwatch
		console.error('Error clearing S3 folder, err:', err)
		return {
			statusCode: INTERNAL_SERVER_ERROR
		}
	}
}
