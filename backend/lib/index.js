const { BUCKET_NAME, BUCKET_REGION } = process.env
const { S3Client, DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3')

const client = new S3Client({ region: BUCKET_REGION })

/**
 * Upload filename and path to /${uuid}-${fileprefix}/${ip}.json on S3
 *
 * ACL by default is private -- data is not publicly accessible
 */
const UploadFile = ({ uuid, prefix, ip, data, file_type }) =>
	new Promise(async (res, rej) => {
		try {
			const command = new PutObjectCommand({
				Bucket: BUCKET_NAME,
				Key: `${uuid}-${prefix}/${ip}.${file_type}`,
				Body: data
			})

			await client.send(command)

			return res()
		} catch (err) {
			console.error('Error uploading file, err:', err)
			return rej(err)
		}
	})

/**
 * @function DeleteFolder
 *
 * Delete folder /${path}-${fileprefix} on the S3 bucket
 *
 * @param {string} uuid - The associated folder-identifying uuid to be deleted
 * @param {string} prefix - The associated folder-identifying prefix to be deleted
 */
const DeleteFolder = ({ uuid, prefix }) =>
	new Promise(async (res, rej) => {
		try {
			const listCommand = new ListObjectsV2Command({
				Bucket: BUCKET_NAME,
				Prefix: `${uuid}-${prefix}`
			})

			const response = await client.send(listCommand)

			if (!response?.Contents?.length) return res()

			const deleteCommand = new DeleteObjectsCommand({
				Bucket: BUCKET_NAME,
				Delete: {
					Objects: response.Contents.map(({ Key }) => ({ Key }))
				}
			})

			await client.send(deleteCommand)

			return res()
		} catch (err) {
			console.error('Error deleting folder, err:', err)
			return rej(err)
		}
	})

module.exports = {
	DeleteFolder,
	UploadFile
}
