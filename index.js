const HOOK_LAST = {order: 100, filter: {fake: null}}

module.exports = function ItemCache(dispatch) {
	let gameId = null,
		lock = false,
		inven = null,
		invenNew = null,
		ware = {}

	dispatch.hook('S_LOGIN', mod.patchVersion < 81 ? 12 : 13, event => {
		({gameId} = event)
		inven = invenNew = null
		delete ware[9] // Pet bank
	})

	dispatch.hook('S_INVEN', 'raw', HOOK_LAST, (code, data) => {
		if(lock) return

		if(data[25]) invenNew = [] // Check first flag

		invenNew.push(data = Buffer.from(data))

		data[24] = 1 // Set open flag

		if(!data[26]) { // Check more flag
			inven = invenNew
			invenNew = null
		}
	})

	dispatch.hook('C_SHOW_INVEN', 1, HOOK_LAST, event => {
		if(event.unk !== 1) return // Type?

		lock = true
		for(let data of inven) dispatch.toClient(data)
		return lock = false
	})

	dispatch.hook('S_VIEW_WARE_EX', 'raw', HOOK_LAST, (code, data) => {
		if(lock) return

		const event = {
			gameId: BigInt(data.readUInt32LE(8)) | BigInt(data.readUInt32LE(12)) << 32n,
			type: data.readInt32LE(16),
			action: data.readInt32LE(20),
			offset: data.readInt32LE(24)
		}

		if(event.gameId !== gameId || event.action) return

		let wareType = ware[event.type]

		if(!wareType) wareType = ware[event.type] = {}
		else
			for(let page of Object.values(wareType)) { // Update global information for each page
				data.copy(page, 8, 8, 20)
				data.copy(page, 28, 28, 46)
			}

		wareType[event.offset] = Buffer.from(data)
	})

	dispatch.hook('C_VIEW_WARE', 2, HOOK_LAST, event => {
		if(event.gameId !== gameId) return

		const wareType = ware[event.type]

		if(wareType && wareType[event.offset]) {
			lock = true
			dispatch.toClient(wareType[event.offset]) // Pre-send the requested page
			lock = false
		}
	})
}