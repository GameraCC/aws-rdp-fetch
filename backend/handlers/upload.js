const { UploadFile } = require('../lib')

const INTERNAL_SERVER_ERROR = { statusCode: 500 }

/**
 * ENDPOINT: /upload
 * BODY: {
 *  uuid: '123',
 *  prefix: '123',
 *  data: {} || [] // object, not stringified
 * }
 */

/**
 * Upload filename and path to /${uuid}-${prefix}/${ip}.json on S3
 */
exports.handler = async (event) => {
	try {
		// Decode base64 encoded event body if content-type is not application/json
		if (event.isBase64Encoded) event.body = Buffer.from(event.body, 'base64').toString('utf-8')

		var { uuid, prefix, data } = JSON.parse(event.body)
		if (!uuid || !prefix || !data) return INTERNAL_SERVER_ERROR

		await UploadFile({
			uuid,
			prefix,
			ip: event.requestContext.http.sourceIp,
			data,
			file_type: 'json'
		})

		return {
			statusCode: 200
		}
	} catch (err) {
		// Log error to cloudwatch
		console.error('Error uploading file to S3, err:', err)
		return INTERNAL_SERVER_ERROR
	}
}
