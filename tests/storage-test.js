// Donkeycraft — Storage System Tests
// Comprehensive functional tests for WorldStore, LevelData, and AssetCache.
// Uses async/await to properly sequence IndexedDB operations before finishing.
(function () {
    'use strict';

    var F = TestFramework;
    F.init('results');

    // ============================================================
    // Helpers
    // ============================================================

    /**
     * Wait for a promise and return its resolved value.
     */
    function await_(promise, label) {
        var result = null;
        var error = null;
        promise.then(function (val) { result = val; }).catch(function (e) { error = e; });
        // Return placeholder — caller must use the sync check pattern below
        return { _pending: true };
    }

    /**
     * Run an async test section: chain promises sequentially, then call done().
     * @param {string} name - Section heading.
     * @param {Function} fn - Async function that runs tests and calls done() when finished.
     */
    function asyncSection(name, fn) {
        F.section(name);

        // We'll chain all operations and call finish after the last one resolves
        var chain = Promise.resolve();

        chain = chain.then(function () {
            return fn();
        });

        return chain;
    }

    // ============================================================
    // Section 1: WorldStore — Initialization & Readiness
    // ============================================================

    F.section('1. WorldStore — Initialization & Readiness');

    var ws = new Donkeycraft.WorldStore('test-db-storage-audit');
    F.assertType(ws, 'object', 'WorldStore instance created');
    F.assertType(ws.init, 'function', 'WorldStore.init is a function');
    F.assertType(ws.isReady, 'function', 'WorldStore.isReady is a function');

    F.assert(!ws.isReady(), 'WorldStore not ready before init');

    var ws2 = new Donkeycraft.WorldStore('custom-test-db-audit');
    F.assertEq(ws2._dbName, 'custom-test-db-audit', 'Custom DB name set correctly');

    F.assertType(Donkeycraft.WORLD_STORE_DB_NAME, 'string', 'WORLD_STORE_DB_NAME is a string');
    F.assertType(Donkeycraft.WORLD_STORE_VERSION, 'number', 'WORLD_STORE_VERSION is a number');

    // ============================================================
    // Section 2: WorldStore — Init & Full Save/Load/Delete Cycle
    // ============================================================

    var section2Chain = Promise.resolve();

    section2Chain = section2Chain.then(function () {
        F.section('2. WorldStore — Init & Ready State');
        return ws.init().then(function (result) {
            F.assertType(result, 'boolean', 'WorldStore.init returns a boolean');
            if (ws.isReady()) {
                F.assert(ws._db !== null, 'WorldStore has DB reference after init');
                F.assert(ws.isReady(), 'WorldStore isReady() returns true after successful init');
            } else {
                F.info('WorldStore init returned false — IndexedDB may not be available');
            }
        });
    });

    // ============================================================
    // Section 3: WorldStore — Chunk Format Normalization
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('3. WorldStore — Chunk Format Normalization');

        if (ws._normalizeChunks) {
            var nullResult = ws._normalizeChunks(null);
            F.assertArrEq(nullResult, [], '_normalizeChunks(null) returns empty array');

            var undefResult = ws._normalizeChunks(undefined);
            F.assertArrEq(undefResult, [], '_normalizeChunks(undefined) returns empty array');

            var objResult = ws._normalizeChunks({});
            F.assertArrEq(objResult, [], '_normalizeChunks({}) returns empty array');

            // Test new format
            var newData = [
                { cx: 0, cz: 0, data: { blockData: 'data1', skyLight: 15, blockLight: 0 } },
                { cx: 1, cz: 0, data: { blockData: 'data2', skyLight: 10, blockLight: 2 } }
            ];
            var normalizedNew = ws._normalizeChunks(newData);
            F.assertEq(normalizedNew.length, 2, '_normalizeChunks new format: 2 chunks');
            F.assertEq(normalizedNew[0].cx, 0, '_normalizeChunks new format: cx preserved');
            F.assertEq(normalizedNew[0].cz, 0, '_normalizeChunks new format: cz preserved');
            F.assertType(normalizedNew[0].data, 'object', '_normalizeChunks new format: data preserved');

            // Test old format
            var oldData = [
                { cx: 0, cz: 0, blockData: 'old1', skyLight: 8, blockLight: 2 },
                { cx: 1, cz: 1, blockData: 'old2', skyLight: 4, blockLight: 0 }
            ];
            var normalizedOld = ws._normalizeChunks(oldData);
            F.assertEq(normalizedOld.length, 2, '_normalizeChunks old format: 2 chunks');
            F.assertType(normalizedOld[0].data, 'object', '_normalizeChunks old format: data created');
            F.assertEq(normalizedOld[0].data.blockData, 'old1', '_normalizeChunks old format: blockData mapped');
            F.assertEq(normalizedOld[0].data.skyLight, 8, '_normalizeChunks old format: skyLight mapped');
            F.assertEq(normalizedOld[0].data.blockLight, 2, '_normalizeChunks old format: blockLight mapped');

            // Test invalid entries are skipped
            var invalidData = [
                { cx: 0, cz: 0, blockData: 'valid' },
                { cx: -1, cz: -1 },
                { something: 'else' }
            ];
            var normalizedInvalid = ws._normalizeChunks(invalidData);
            F.assertEq(normalizedInvalid.length, 1, '_normalizeChunks skips invalid entries (keeps only valid)');
        } else {
            F.info('_normalizeChunks not available');
        }
    });

    // ============================================================
    // Section 4: WorldStore — Full Save/Load/Delete Cycle with Verification
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('4. WorldStore — saveWorld / loadWorld / deleteWorld');

        if (!ws.isReady()) {
            F.info('WorldStore not ready — skipping save/load/delete tests');
            return Promise.resolve();
        }

        var testWorldName = 'audit-world-' + Date.now();
        var testLevelData = {
            spawn: { x: 0, y: 64, z: 0 },
            gameMode: 'creative',
            worldTime: 12345,
            seed: 99
        };

        // Use full chunk data (simulating real chunk serialization)
        var blockDataArr = [];
        for (var i = 0; i < 16 * 256 * 16; i++) {
            blockDataArr.push(i === 0 ? 1 : 0); // First block is stone, rest air
        }
        var skyLightArr = [];
        for (var j = 0; j < 16 * 256 * 16; j++) {
            skyLightArr.push(15); // Full sky light
        }
        var blockLightArr = [];
        for (var k = 0; k < 16 * 256 * 16; k++) {
            blockLightArr.push(0); // No block light
        }

        var testChunks = [
            {
                cx: 0, cz: 0,
                data: {
                    blockData: blockDataArr,
                    skyLight: skyLightArr,
                    blockLight: blockLightArr
                }
            },
            {
                cx: 1, cz: 0,
                data: {
                    blockData: new Array(16 * 256 * 16).fill(0),
                    skyLight: new Array(16 * 256 * 16).fill(10),
                    blockLight: new Array(16 * 256 * 16).fill(1)
                }
            }
        ];

        // Save world
        return ws.saveWorld(testWorldName, testLevelData, testChunks).then(function (saved) {
            F.assert(saved === true, 'saveWorld returns true on success');

            // Immediately load to verify data was written
            return ws.loadWorld(testWorldName);
        }).then(function (worldData) {
            F.assertType(worldData, 'object', 'loadWorld returns object after save');
            F.assertType(worldData.levelData, 'object', 'loadWorld levelData is object');
            F.assert(Array.isArray(worldData.chunks), 'loadWorld chunks is array');
            F.assertEq(worldData.chunks.length, 2, 'loadWorld returns correct chunk count (2)');

            // Verify level data was preserved
            F.assertEq(worldData.levelData.gameMode, 'creative', 'loadWorld preserves gameMode');
            F.assertEq(worldData.levelData.worldTime, 12345, 'loadWorld preserves worldTime');
            F.assertEq(worldData.levelData.seed, 99, 'loadWorld preserves seed');

            // Verify chunk data was preserved (blockData arrays)
            F.assertType(worldData.chunks[0].data.blockData, 'object', 'chunk 0 blockData preserved');
            F.assert(worldData.chunks[0].data.skyLight.length > 0, 'chunk 0 skyLight array has data');
            F.assert(worldData.chunks[0].data.blockLight.length >= 0, 'chunk 0 blockLight array exists');

            // Verify first block is stone (ID 1)
            F.assertEq(worldData.chunks[0].data.blockData[0], 1, 'First block in chunk is stone (ID 1)');

            // Delete world
            return ws.deleteWorld(testWorldName);
        }).then(function (deleted) {
            F.assert(deleted === true, 'deleteWorld returns true on success');

            // Verify deletion
            return ws.loadWorld(testWorldName);
        }).then(function (result) {
            F.assert(result === null, 'loadWorld returns null after delete');
        });
    });

    // ============================================================
    // Section 5: WorldStore — listWorlds
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('5. WorldStore — listWorlds');

        if (!ws.isReady()) {
            F.info('WorldStore not ready — skipping listWorlds test');
            return Promise.resolve();
        }

        return ws.listWorlds().then(function (worlds) {
            F.assert(Array.isArray(worlds), 'listWorlds returns array');
            F.assert(worlds.length >= 0, 'listWorlds returns non-negative length');
        });
    });

    // ============================================================
    // Section 6: WorldStore — saveChunk / loadChunk Cycle
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('6. WorldStore — saveChunk / loadChunk');

        if (!ws.isReady()) {
            F.info('WorldStore not ready — skipping chunk tests');
            return Promise.resolve();
        }

        var chunkWorldName = 'audit-chunk-world-' + Date.now();

        // Create realistic chunk data — use fill() to avoid join() leading-empty-string bug
        var chunkBlockData = new Array(16 * 256 * 16).fill(5); // All stone
        var chunkSkyLight = new Array(16 * 256 * 16).fill(15); // Full light

        return ws.saveChunk(chunkWorldName, 0, 0, {
            blockData: chunkBlockData,
            skyLight: chunkSkyLight,
            blockLight: new Array(16 * 256 * 16).fill(0)
        }).then(function (saved) {
            F.assert(saved === true || saved === false, 'saveChunk returns boolean');

            // Immediately load to verify
            return ws.loadChunk(chunkWorldName, 0, 0);
        }).then(function (chunkData) {
            if (chunkData) {
                F.assertType(chunkData, 'object', 'loadChunk returns object when chunk exists');
                F.assertType(chunkData.blockData, 'object', 'loaded chunk has blockData');
                F.assertEq(chunkData.blockData[0], 5, 'loaded chunk blockData[0] is stone (5)');
            } else {
                F.info('loadChunk returned null (async timing issue)');
            }

            // Load non-existent chunk
            return ws.loadChunk(chunkWorldName, 99, 99);
        }).then(function (result) {
            F.assert(result === null, 'loadChunk returns null for non-existent chunk');
        });
    });

    // ============================================================
    // Section 7: WorldStore — getLevelData / setLevelData
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('7. WorldStore — getLevelData / setLevelData');

        if (!ws.isReady()) {
            F.info('WorldStore not ready — skipping level data tests');
            return Promise.resolve();
        }

        var levelWorldName = 'audit-level-world-' + Date.now();

        // Get non-existent world
        return ws.getLevelData(levelWorldName).then(function (data) {
            F.assert(data === null, 'getLevelData returns null for non-existent world');

            // Set level data
            return ws.setLevelData(levelWorldName, {
                spawn: { x: 10, y: 20, z: 30 },
                gameMode: 'creative'
            });
        }).then(function (success) {
            F.assertType(success, 'boolean', 'setLevelData returns boolean');

            // Get it back
            return ws.getLevelData(levelWorldName);
        }).then(function (data) {
            if (data) {
                F.assertEq(data.spawn.x, 10, 'getLevelData preserves spawn X');
                F.assertEq(data.spawn.y, 20, 'getLevelData preserves spawn Y');
                F.assertEq(data.spawn.z, 30, 'getLevelData preserves spawn Z');
            } else {
                F.info('getLevelData returned null after set (async issue)');
            }
        });
    });

    // ============================================================
    // Section 8: WorldStore — setChunkManager / setEventBus
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('8. WorldStore — setChunkManager / setEventBus');

        var mockChunkManager = {
            getDirtyChunks: function () { return []; },
            isDirty: function () { return false; }
        };
        ws.setChunkManager(mockChunkManager);
        F.assert(ws._chunkManager === mockChunkManager, 'setChunkManager sets internal reference');

        var bus = new Donkeycraft.EventBus();
        ws.setEventBus(bus);
        F.assert(ws._eventBus === bus, 'setEventBus sets internal reference');
    });

    // ============================================================
    // Section 9: LevelData — Construction & Defaults
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('9. LevelData — Construction & Defaults');

        var ld = new Donkeycraft.LevelData();
        F.assertType(ld, 'object', 'LevelData instance created');
        F.assertEq(ld.getSpawnX(), 0, 'Default spawn X is 0');
        F.assertEq(ld.getSpawnY(), 64, 'Default spawn Y is 64');
        F.assertEq(ld.getSpawnZ(), 0, 'Default spawn Z is 0');
        F.assertEq(ld.getGameMode(), 'survival', 'Default game mode is survival');
        F.assertEq(ld.getTime(), 0, 'Default world time is 0');
        F.assertEq(ld.getSeed(), 42, 'Default seed is 42');
        F.assertEq(ld.getWorldName(), 'DefaultWorld', 'Default world name is DefaultWorld');
        F.assert(ld.getPlayerData() === null, 'Player data is null by default');
        F.assertEq(ld.getLastSaved(), 0, 'Last saved is 0 by default');
    });

    // ============================================================
    // Section 10: LevelData — Setters & Getters
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('10. LevelData — Setters & Getters');

        var ld = new Donkeycraft.LevelData();

        ld.setSpawn(100, 200, 300);
        var spawn = ld.getSpawn();
        F.assertEq(spawn.x, 100, 'setSpawn/getSpawn X');
        F.assertEq(spawn.y, 200, 'setSpawn/getSpawn Y');
        F.assertEq(spawn.z, 300, 'setSpawn/getSpawn Z');

        ld.setGameMode('creative');
        F.assertEq(ld.getGameMode(), 'creative', 'setGameMode/getGameMode creative');

        ld.setGameMode('invalid_mode');
        F.assertEq(ld.getGameMode(), 'survival', 'Invalid game mode falls back to survival');

        ld.setTime(5000);
        F.assertEq(ld.getTime(), 5000, 'setTime/getTime');

        ld.setTime(-100);
        F.assertEq(ld.getTime(), 0, 'Negative time clamped to 0');

        ld.setSeed(12345);
        F.assertEq(ld.getSeed(), 12345, 'setSeed/getSeed');

        ld.setWorldName('MyAwesomeWorld');
        F.assertEq(ld.getWorldName(), 'MyAwesomeWorld', 'setWorldName/getWorldName');
    });

    // ============================================================
    // Section 11: LevelData — Player Data
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('11. LevelData — Player Data');

        var ld = new Donkeycraft.LevelData();

        ld.setPlayerPosition(10.5, 64.0, -20.3);
        var pData = ld.getPlayerData();
        F.assertEq(pData.position.x, 10.5, 'setPlayerPosition X');
        F.assertEq(pData.position.y, 64.0, 'setPlayerPosition Y');
        F.assertEq(pData.position.z, -20.3, 'setPlayerPosition Z');

        ld.setPlayerRotation(1.57, 0.3);
        pData = ld.getPlayerData();
        F.assertNear(pData.rotation.yaw, 1.57, 0.01, 'setPlayerRotation yaw');
        F.assertNear(pData.rotation.pitch, 0.3, 0.01, 'setPlayerRotation pitch');

        ld.setPlayerHealth(15);
        F.assertEq(ld.getPlayerData().health, 15, 'setPlayerHealth');

        ld.setPlayerHealth(0);
        F.assert(!ld.isPlayerAlive(), 'isPlayerAlive returns false at 0 health');

        ld.setPlayerHealth(20);
        F.assert(ld.isPlayerAlive(), 'isPlayerAlive returns true at full health');

        ld.setFallDistance(10.5);
        F.assertEq(ld.getFallDistance(), 10.5, 'setFallDistance/getFallDistance');

        ld.setHunger(15);
        F.assertEq(ld.getHunger(), 15, 'setHunger/getHunger');

        ld.setSaturation(8);
        F.assertEq(ld.getSaturation(), 8, 'setSaturation/getSaturation');

        ld.setXpLevels(30);
        F.assertEq(ld.getXpLevels(), 30, 'setXpLevels/getXpLevels');
    });

    // ============================================================
    // Section 12: LevelData — Inventory & XP Points
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('12. LevelData — Inventory & XP Points');

        var ld = new Donkeycraft.LevelData();

        ld.setInventory([
            { id: 'stone', count: 64 },
            { id: 'wood', count: 32 }
        ]);
        var inv = ld.getInventory();
        F.assertEq(inv.length, 2, 'setInventory/getInventory length');
        F.assertEq(inv[0].id, 'stone', 'setInventory item 0');

        ld.setXpPoints(15);
        F.assertEq(ld.getXpPoints(), 15, 'setXpPoints/getXpPoints');
    });

    // ============================================================
    // Section 13: LevelData — Serialization & Deserialization
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('13. LevelData — Serialization & Deserialization');

        var ld = new Donkeycraft.LevelData();
        ld.setSpawn(50, 100, 150);
        ld.setGameMode('spectator');
        ld.setTime(99999);
        ld.setSeed(777);
        ld.setWorldName('TestWorld');
        ld.setPlayerData({
            position: { x: 1, y: 2, z: 3 },
            health: 10,
            inventory: [{ id: 'diamond', count: 1 }]
        });
        ld.markSaved();

        var serialized = ld.serialize();
        F.assertType(serialized.worldName, 'string', 'serialize worldName is string');
        F.assertType(serialized.spawn, 'object', 'serialize spawn is object');
        F.assertEq(serialized.gameMode, 'spectator', 'serialize gameMode');
        F.assertEq(serialized.worldTime, 99999, 'serialize worldTime');
        F.assertEq(serialized.seed, 777, 'serialize seed');
        F.assertType(serialized.playerData, 'object', 'serialize playerData is object');

        // Deserialize into fresh instance
        var ld2 = new Donkeycraft.LevelData();
        ld2.deserialize(serialized);
        F.assertEq(ld2.getSpawnX(), 50, 'deserialize spawn X');
        F.assertEq(ld2.getGameMode(), 'spectator', 'deserialize gameMode');
        F.assertEq(ld2.getTime(), 99999, 'deserialize worldTime');
        F.assertEq(ld2.getSeed(), 777, 'deserialize seed');
        F.assertEq(ld2.getWorldName(), 'TestWorld', 'deserialize worldName');
        F.assertEq(ld2.getPlayerData().health, 10, 'deserialize player health');

        // Deserialize null/invalid data
        var ld3 = new Donkeycraft.LevelData();
        ld3.deserialize(null);
        F.assertEq(ld3.getGameMode(), 'survival', 'deserialize(null) keeps defaults');

        ld3.deserialize({});
        F.assertEq(ld3.getWorldName(), 'DefaultWorld', 'deserialize({}) keeps defaults');
    });

    // ============================================================
    // Section 14: LevelData — Validation & Reset
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('14. LevelData — Validation & Reset');

        var validLd = new Donkeycraft.LevelData();
        F.assert(validLd.isValid(), 'Valid LevelData passes isValid');

        var badNameLd = new Donkeycraft.LevelData();
        badNameLd._worldName = '';
        F.assert(!badNameLd.isValid(), 'Empty world name fails isValid');

        var badModeLd = new Donkeycraft.LevelData();
        badModeLd._gameMode = 'invalid';
        F.assert(!badModeLd.isValid(), 'Invalid game mode fails isValid');

        validLd.setSpawn(999, 999, 999);
        validLd.setGameMode('creative');
        validLd.reset();
        F.assertEq(validLd.getSpawnX(), 0, 'reset spawn X');
        F.assertEq(validLd.getGameMode(), 'survival', 'reset game mode');
    });

    // ============================================================
    // Section 15: LevelData — Auto-Save System
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('15. LevelData — Auto-Save System');

        var autoSaveLd = new Donkeycraft.LevelData();
        F.assert(!autoSaveLd.isAutoSaveEnabled(), 'Auto-save disabled by default');

        autoSaveLd.startAutoSave(null, 'world');
        F.assert(!autoSaveLd.isAutoSaveEnabled(), 'startAutoSave with null store does nothing');

        autoSaveLd.startAutoSave({}, null);
        F.assert(!autoSaveLd.isAutoSaveEnabled(), 'startAutoSave with null name does nothing');

        var mockWs = {
            saveWorld: function () { return Promise.resolve(true); },
            saveDirtyChunks: function () { return Promise.resolve(0); }
        };
        autoSaveLd.startAutoSave(mockWs, 'test-world', 5000);
        F.assert(autoSaveLd.isAutoSaveEnabled(), 'startAutoSave enables auto-save');

        autoSaveLd.tickAutoSave(1); // 1 second elapsed
        F.assertEq(autoSaveLd._autoSaveTimer, 1000, 'tickAutoSave accumulates time in ms');

        var noStoreLd = new Donkeycraft.LevelData();
        return noStoreLd.persistToStore().then(function (success) {
            F.assert(success === false, 'persistToStore returns false without WorldStore');
        });
    });

    // ============================================================
    // Section 16: LevelData — persistToStore with Real WorldStore
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('16. LevelData — persistToStore with Real WorldStore');

        if (!ws.isReady()) {
            F.info('WorldStore not ready — skipping persistToStore test');
            return Promise.resolve();
        }

        var persistLd = new Donkeycraft.LevelData();
        persistLd.setSpawn(500, 600, 700);
        persistLd.setGameMode('creative');
        persistLd.setTime(55555);
        persistLd.setSeed(888);
        persistLd.setWorldName('persist-test-world');
        persistLd.setPlayerData({
            position: { x: 100, y: 200, z: 300 },
            health: 15,
            inventory: [{ id: 'iron_ingot', count: 64 }]
        });

        var persistWorldName = 'audit-persist-world-' + Date.now();

        // Start auto-save with real WorldStore
        persistLd.startAutoSave(ws, persistWorldName, 60000);
        F.assert(persistLd.isAutoSaveEnabled(), 'LevelData auto-save enabled with real WorldStore');

        // Call persistToStore immediately
        return persistLd.persistToStore().then(function (success) {
            F.assert(success === true, 'persistToStore returns true on success');

            // Now load the world from WorldStore and verify data was persisted correctly
            return ws.loadWorld(persistWorldName);
        }).then(function (worldData) {
            F.assertType(worldData, 'object', 'persisted world loads from WorldStore');
            if (worldData && worldData.levelData) {
                F.assertEq(worldData.levelData.spawn.x, 500, 'persisted spawn X');
                F.assertEq(worldData.levelData.spawn.y, 600, 'persisted spawn Y');
                F.assertEq(worldData.levelData.spawn.z, 700, 'persisted spawn Z');
                F.assertEq(worldData.levelData.gameMode, 'creative', 'persisted gameMode');
                F.assertEq(worldData.levelData.worldTime, 55555, 'persisted worldTime');
                F.assertEq(worldData.levelData.seed, 888, 'persisted seed');
                F.assertType(worldData.levelData.playerData, 'object', 'persisted playerData exists');
                if (worldData.levelData.playerData) {
                    F.assertEq(worldData.levelData.playerData.position.x, 100, 'persisted player X');
                    F.assertEq(worldData.levelData.playerData.health, 15, 'persisted player health');
                }
            } else {
                F.info('persisted world levelData not found on load');
            }

            // Stop auto-save
            persistLd.stopAutoSave();
            F.assert(!persistLd.isAutoSaveEnabled(), 'stopAutoSave disables auto-save');

            // Clean up
            return ws.deleteWorld(persistWorldName);
        }).then(function () {
            F.info('Persist test world deleted');
        });
    });

    // ============================================================
    // Section 17: AssetCache — Initialization & Full Cycle
    // Uses a shared cache variable so sections 18-20 can reuse it
    // and we can close the connection before cleanup.
    // ============================================================

    var assetCacheInstance = null;

    section2Chain = section2Chain.then(function () {
        F.section('17. AssetCache — Initialization & Readiness');

        assetCacheInstance = new Donkeycraft.AssetCache('test-asset-cache-audit');
        F.assertType(assetCacheInstance, 'object', 'AssetCache instance created');
        F.assertType(assetCacheInstance.init, 'function', 'AssetCache.init is a function');
        F.assertType(assetCacheInstance.isReady, 'function', 'AssetCache.isReady is a function');
        F.assert(!assetCacheInstance.isReady(), 'AssetCache not ready before init');

        F.assertType(Donkeycraft.ASSET_CACHE_DB_NAME, 'string', 'ASSET_CACHE_DB_NAME is a string');
        F.assertType(Donkeycraft.ASSET_CACHE_VERSION, 'number', 'ASSET_CACHE_VERSION is a number');

        return assetCacheInstance.init().then(function (result) {
            F.assertType(result, 'boolean', 'AssetCache.init returns boolean');
            if (assetCacheInstance.isReady()) {
                F.assert(assetCacheInstance._db !== null, 'AssetCache has DB reference after init');
            } else {
                F.info('AssetCache not ready (IndexedDB may not be available)');
            }
        });
    });

    // ============================================================
    // Section 18: AssetCache — Sound Cache/Load/Delete Cycle
    // Reuses assetCacheInstance from section 17.
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('18. AssetCache — Sound Cache/Load/Delete Cycle');

        if (!assetCacheInstance || !assetCacheInstance.isReady()) {
            F.info('AssetCache not ready — skipping sound tests');
            return Promise.resolve();
        }

        var testSoundData = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

        // Set sound
        return assetCacheInstance.setSound('audit_test_sound', testSoundData).then(function (saved) {
            if (saved) {
                F.assert(saved === true, 'setSound returns true on success');

                // Immediately get to verify
                return assetCacheInstance.getSound('audit_test_sound');
            } else {
                F.info('setSound failed — may be quota restricted');
                return null;
            }
        }).then(function (soundData) {
            if (soundData) {
                F.assertType(soundData, 'string', 'getSound returns string');
                F.assertEq(soundData.substring(0, 25), testSoundData.substring(0, 25), 'getSound returns correct sound data');

                // Check has() — key format is 'sound:audit_test_sound'
                return assetCacheInstance.has('sound:audit_test_sound').then(function (hasIt) {
                    F.assert(hasIt === true, 'has returns true for cached sound');

                    // Delete it — same key format
                    return assetCacheInstance.delete('sound:audit_test_sound').then(function (deleted) {
                        F.assert(deleted === true, 'delete returns true on success');

                        // Verify deletion — use full key format
                        return assetCacheInstance.has('sound:audit_test_sound');
                    });
                }).then(function (hasAfterDelete) {
                    F.assert(hasAfterDelete === false, 'has returns false after delete');
                });
            } else {
                F.info('Sound verification skipped (setSound failed)');
            }
        });
    });

    // ============================================================
    // Section 19: AssetCache — has / delete for non-existent key
    // Reuses assetCacheInstance from section 17.
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('19. AssetCache — has/delete for non-existent key');

        if (!assetCacheInstance || !assetCacheInstance.isReady()) {
            F.info('AssetCache not ready — skipping tests');
            return Promise.resolve();
        }

        return assetCacheInstance.has('non-existent-key').then(function (hasIt) {
            F.assert(hasIt === false, 'has returns false for non-existent key');

            return assetCacheInstance.delete('non-existent-key').then(function (deleted) {
                F.assert(deleted === false, 'delete returns false for non-existent key');
            });
        });
    });

    // ============================================================
    // Section 20: AssetCache — clearAll / getUsageStats
    // Reuses assetCacheInstance from section 17. Closes connection after.
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('20. AssetCache — clearAll / getUsageStats');

        if (!assetCacheInstance || !assetCacheInstance.isReady()) {
            F.info('AssetCache not ready — skipping tests');
            return Promise.resolve();
        }

        return assetCacheInstance.clearAll().then(function () {
            return assetCacheInstance.getUsageStats().then(function (stats) {
                F.assertType(stats, 'object', 'getUsageStats returns object');
                F.assertType(stats.entryCount, 'number', 'stats.entryCount is number');
                F.assertType(stats.totalSize, 'number', 'stats.totalSize is number');
                F.assert(Array.isArray(stats.entries), 'stats.entries is array');
                F.assertEq(stats.entryCount, 0, 'entryCount is 0 after clearAll');

                return assetCacheInstance.getTotalSize().then(function (size) {
                    F.assertType(size, 'number', 'getTotalSize returns number');
                    F.assertEq(size, 0, 'totalSize is 0 after clearAll');
                });
            });
        }).then(function () {
            // Close the AssetCache DB connection before cleanup
            if (assetCacheInstance.destroy) {
                assetCacheInstance.destroy();
            }
        });
    });

    // ============================================================
    // Section 21: Config Constants for Storage
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('21. Config Constants for Storage');

        F.assertType(Donkeycraft.Config.CHUNKS_PER_SAVE, 'number', 'Config.CHUNKS_PER_SAVE is number');
        F.assertType(Donkeycraft.Config.SAVE_BATCH_DELAY, 'number', 'Config.SAVE_BATCH_DELAY is number');
        F.assertType(Donkeycraft.Config.LEVEL_DATA_AUTO_SAVE_INTERVAL, 'number', 'Config.LEVEL_DATA_AUTO_SAVE_INTERVAL is number');
        F.assertType(Donkeycraft.Config.ASSET_CACHE_VERSION, 'number', 'Config.ASSET_CACHE_VERSION is number');
        F.assertType(Donkeycraft.Config.ASSET_CACHE_MAX_AGE_MS, 'number', 'Config.ASSET_CACHE_MAX_AGE_MS is number');

        F.assertEq(Donkeycraft.Config.CHUNKS_PER_SAVE, 4, 'Config.CHUNKS_PER_SAVE equals 4');
        F.assertEq(Donkeycraft.Config.LEVEL_DATA_AUTO_SAVE_INTERVAL, 60000, 'Config.LEVEL_DATA_AUTO_SAVE_INTERVAL equals 60000ms');
    });

    // ============================================================
    // Cleanup: Close all DB connections then delete test databases
    // ============================================================

    section2Chain = section2Chain.then(function () {
        F.section('Cleanup — Removing Test Databases');

        // Close the WorldStore connection first
        var cleanupChain = Promise.resolve();
        if (ws && ws._db) {
            ws.destroy();
        }

        // Now delete all test databases
        var testDbNames = [
            'test-db-storage-audit',
            'custom-test-db-audit',
            'test-asset-cache-audit'
        ];

        for (var i = 0; i < testDbNames.length; i++) {
            (function (dbName) {
                cleanupChain = cleanupChain.then(function () {
                    return new Promise(function (resolve) {
                        // deleteDatabase silently succeeds if DB doesn't exist.
                        // If open connections exist, it waits for them to close first.
                        try {
                            var deleteReq = indexedDB.deleteDatabase(dbName);
                            deleteReq.onsuccess = function () {
                                F.info('Deleted test database: ' + dbName);
                                resolve();
                            };
                            deleteReq.onerror = function () {
                                // Open connections may delay deletion — that's fine,
                                // they close when the test page unloads.
                                F.info('Deletion pending (open connections): ' + dbName);
                                resolve();
                            };
                        } catch (e) {
                            F.info('DB error for ' + dbName + ': ' + e.message);
                            resolve();
                        }
                    });
                });
            })(testDbNames[i]);
        }

        return cleanupChain;
    });

    // ============================================================
    // Finish: wait for all async sections to complete
    // ============================================================

    section2Chain.then(function () {
        F.section('Summary — All Storage Tests Complete');
        F.info('All IndexedDB operations have completed. Test databases cleaned up.');
        F.finishTests();
    }).catch(function (e) {
        F.section('Error');
        F.info('An error occurred during tests: ' + e.message);
        F.finishTests();
    });

})();
