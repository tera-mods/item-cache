const HOOK_LAST = { order: 100, filter: { fake: null } }

module.exports = function ItemCache(mod) {
	const S_ITEMLIST_HEADER = mod.compileProto(`
uint32	_items
uint64	gameId
int32	inventory
int32	pocket
int32	pockets
int32	size
int64	gold
int32	lootSettings
bool	open
bool	requested
bool	first
bool	more
bool	lastBatch
`)
	const S_VIEW_WARE_EX_HEADER = mod.compileProto(`
uint32	_items
uint64	gameId
int32	type
int32	action
int32	offset
int32	lastUsedSlot
int32	slotsUsed
int64	gold
int16	slots
`)

	let gameId = -1n,
		lock = false,
		inventoryHeader = null,
		warehouse = new Map()

	mod.hook('S_LOGIN', mod.patchVersion < 81 ? 12 : 13, event => {
		({gameId} = event)
		inventoryHeader = null
		warehouse.delete(9) // Character-specific pet bank
	})

	mod.hook('S_ITEMLIST', S_ITEMLIST_HEADER, HOOK_LAST, event => {
		if(lock) return

		if(event.gameId === gameId && event.inventory === 0) inventoryHeader = event
	})

	mod.hook('C_SHOW_ITEMLIST', 1, HOOK_LAST, event => {
		if(event.gameId !== gameId || event.container !== 0 || !event.requested) return
		if(event.pocket === 0) {
			lock = true
			mod.send('S_ITEMLIST', S_ITEMLIST_HEADER, {
				gameId,
				inventory: 0,
				pocket: -1, // Overwrite a non-existent pocket, which allows us to send an empty item list
				pockets: inventoryHeader.pockets,
				size: 0,
				gold: inventoryHeader.gold,
				open: true,
				requested: true,
				first: true,
				more: false,
				lastBatch: true
			})
			lock = false
		}
		return false
	})

	mod.hook('S_VIEW_WARE_EX', 'raw', HOOK_LAST, (code, data) => {
		if(lock) return

		const event = mod.parse('S_VIEW_WARE_EX', S_VIEW_WARE_EX_HEADER, data)

		if(event.gameId !== gameId || event.action) return

		let warePages = warehouse.get(event.type)
		if(!warePages) warehouse.set(event.type, warePages = new Map())
		else
			// Update warehouse-wide information for existing pages
			for(let page of warePages.values()) data.copy(page, 28, 28, 46)

		warePages.set(event.offset, Buffer.from(data))
	})

	// Pre-send pages from cache, letting server overwrite them later. Note that C_VIEW_WARE *cannot* be blocked without causing issues
	mod.hook('C_VIEW_WARE', 2, HOOK_LAST, event => {
		if(event.gameId !== gameId) return

		const page = warehouse.get(event.type)?.get(event.offset)
		if(page) {
			page.writeBigUInt64LE(gameId, 8)

			lock = true
			mod.toClient(page)
			lock = false
		}
	})
}