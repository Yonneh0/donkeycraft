// Donkeycraft — Entity Nametag Renderer
// CSS overlay system that projects 3D entity positions to 2D screen space
// and renders nametags with health bars, color-coded by aggressiveness.
(function () {
    'use strict';
    var Donkeycraft = window.Donkeycraft;
    if (!Donkeycraft) return;

    /** Maximum rendering distance for nametags (blocks). */
    var NAMETAG_MAX_DISTANCE = 25;

    /** Minimum opacity for far-away nametags. */
    var NAMETAG_MIN_OPACITY = 0.3;

    /**
     * NametagRenderer — CSS overlay system for rendering entity nametags.
     * @constructor
     * @param {Object} [options] - Configuration options.
     * @param {Donkeycraft.EntityEngine|Donkeycraft.EntityManager} [options.entityManager] - Entity manager reference.
     * @param {Object} [options.camera] - Camera instance for projection.
     * @param {WebGLRenderingContext} [options.gl] - WebGL context for frustum occlusion testing.
     */
    Donkeycraft.NametagRenderer = function (options) {
        options = options || {};
        /**
         * Entity manager reference.
         * @type {Donkeycraft.EntityEngine|Donkeycraft.EntityManager|null}
         */
        this._entityManager = options.entityManager || null;

        /**
         * Camera instance for screen projection.
         * @type {Object|null}
         */
        this._camera = options.camera || null;

        /**
         * WebGL context for frustum occlusion testing.
         * @type {WebGLRenderingContext|null}
         */
        this._gl = options.gl || null;

        /**
         * DOM container element.
         * @type {HTMLElement|null}
         */
        this._container = null;

        /**
         * Cache of nametag DOM elements: entityId → {nameEl, hpBarEl, wrapperEl}.
         * @type {Object.<number, {nameEl: HTMLElement, hpBarEl: HTMLElement, wrapperEl: HTMLElement}>}
         * @private
         */
        this._nametagElements = {};

        /**
         * Event subscribers for entity spawn/despawn/health changes.
         * @type {Array<Function>}
         * @private
         */
        this._subscribers = [];
    };

    /**
     * Initialize the nametag system — creates DOM container.
     * @returns {boolean} True if initialization succeeded.
     */
    Donkeycraft.NametagRenderer.prototype.init = function () {
        if (this._container) return true;

        // Track whether we created the container ourselves (vs reusing pre-existing HTML element)
        this._wasCreatedByRenderer = false;

        // Create or find the DOM container
        var existingContainer = document.getElementById('dk-nametags-container');
        if (existingContainer) {
            this._container = existingContainer;
        } else {
            this._wasCreatedByRenderer = true;
            this._container = document.createElement('div');
            this._container.id = 'dk-nametags-container';
            this._container.style.position = 'absolute';
            this._container.style.top = '0';
            this._container.style.left = '0';
            this._container.style.width = '100vw';
            this._container.style.height = '100vh';
            this._container.style.pointerEvents = 'none';
            this._container.style.zIndex = '100';
            this._container.style.overflow = 'hidden';
            document.body.appendChild(this._container);
        }

        // Subscribe to entity lifecycle events if EventBus is available.
        // Use onSafe which registers on the global EventBus instance.
        // Note: onSafe returns null if no global instance is registered yet.
        // Call resubscribeEvents() after EventBus.setGlobal() is called to
        // register any missed subscriptions.
        this._subscribeEvents();

        return !!this._container;
    };

    /**
     * _subscribeEvents — Register event listeners for entity lifecycle events.
     * Used by init() and resubscribeEvents().
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._subscribeEvents = function () {
        var self = this;
        var events = [
            { name: 'entity:spawn', handler: function (data) { if (data && data.entity) { self._onEntitySpawned(data.entity); } } },
            { name: 'entity:despawn', handler: function (data) { if (data && data.entity) { self._onEntityDespawned(data.entity); } } },
            { name: 'entity:health:changed', handler: function (data) { if (data && data.target) { self._updateNametag(data.target); } } }
        ];

        for (var i = 0; i < events.length; i++) {
            var sub = Donkeycraft.EventBus.onSafe(events[i].name, events[i].handler);
            if (sub) this._subscribers.push(sub);
        }
    };

    /**
     * resubscribeEvents — Re-subscribe to entity lifecycle events.
     * Call this after EventBus.setGlobal() is confirmed to be called,
     * in case init() ran before the global EventBus was registered.
     */
    Donkeycraft.NametagRenderer.prototype.resubscribeEvents = function () {
        if (!Donkeycraft.EventBus) return;

        // Unsubscribe any previously registered (null) subscribers that failed.
        var validSubscribers = [];
        for (var i = 0; i < this._subscribers.length; i++) {
            if (this._subscribers[i]) {
                validSubscribers.push(this._subscribers[i]);
            }
        }
        this._subscribers = validSubscribers;

        // Re-subscribe to all events.
        this._subscribeEvents();
    };

    /**
     * Render all visible nametags each frame.
     * Projects 3D positions to 2D screen space and updates DOM elements.
     */
    Donkeycraft.NametagRenderer.prototype.render = function () {
        if (!this._container || !this._entityManager || !this._camera) return;

        // Get all alive entities from the entity manager
        var entities = this._getEntities();
        if (!entities || !Array.isArray(entities)) return;

        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];
            if (!entity || !entity.isAlive) continue;
            if (!entity.shouldShowNametag) continue;
            if (!entity.shouldShowNametag()) continue;

            this._updateNametag(entity);
        }
    };

    /**
     * Get all alive entities from the entity manager.
     * @returns {Array|null} Array of entity objects or null.
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._getEntities = function () {
        // Try getAllEntities() method first (EntityManager/EntityEngine standard API)
        if (this._entityManager.getAllEntities && typeof this._entityManager.getAllEntities === 'function') {
            return this._entityManager.getAllEntities();
        }
        // Fall back to getEntities() method (some engines use this name)
        if (this._entityManager.getEntities && typeof this._entityManager.getEntities === 'function') {
            return this._entityManager.getEntities();
        }
        // Try direct property access to _entities
        if (this._entityManager._entities && typeof this._entityManager._entities === 'object') {
            var result = [];
            var entityIds = Object.keys(this._entityManager._entities);
            for (var i = 0; i < entityIds.length; i++) {
                var e = this._entityManager._entities[entityIds[i]];
                if (e && e.isAlive) result.push(e);
            }
            return result;
        }
        return null;
    };

    /**
     * Project 3D world position to 2D screen coordinates.
     * @param {Object} worldPos - World position {x, y, z}.
     * @param {Object} camera - Camera instance with getProjectionMatrix and getViewMatrix.
     * @param {WebGLRenderingContext|null} gl - WebGL context for viewport retrieval.
     * @returns {{x: number, y: number, visible: boolean}|null} Screen position or null if off-screen.
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._worldToScreen = function (worldPos, camera, gl) {
        if (!worldPos || !camera) return null;

        var wx = worldPos.x, wy = worldPos.y, wz = worldPos.z;

        // Camera position and matrices
        var camPos = camera.getPosition ? camera.getPosition() : null;
        if (!camPos) return null;

        // Simple frustum check: entity must be in front of camera
        var dx = wx - camPos.x;
        var dy = wy - camPos.y;
        var dz = wz - camPos.z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Camera forward direction
        var yaw = camera.getYaw ? camera.getYaw() : 0;
        var pitch = camera.getPitch ? camera.getPitch() : 0;
        var camFx = -Math.sin(yaw) * Math.cos(pitch);
        var camFy = Math.sin(pitch);
        var camFz = -Math.cos(yaw) * Math.cos(pitch);

        // Dot product: entity must be in front of camera
        var dot = dx * camFx + dy * camFy + dz * camFz;
        if (dot <= 0) return null; // Behind camera

        // Camera right and up vectors
        var camRx = Math.cos(yaw);
        var camRz = -Math.sin(yaw);
        var camUpX = Math.sin(pitch) * Math.cos(yaw);
        var camUpY = Math.cos(pitch);
        var camUpZ = -Math.sin(pitch) * Math.sin(yaw);

        // Relative position
        var relX = dx, relY = dy, relZ = dz;

        // Project onto camera right and up axes
        var rightDot = relX * camRx + relZ * camRz;
        var upDot = relX * camUpX + relY * camUpY + relZ * camUpZ;

        // Field of view — use Config.FOV as the canonical value
        var fov = camera.getFov ? camera.getFov() : (Donkeycraft.Config && Donkeycraft.Config.FOV) || 70;
        var fovRad = fov * Math.PI / 180;
        var fovScale = 1.0 / Math.tan(fovRad / 2);

        // Viewport dimensions
        var viewportWidth = window.innerWidth;
        var viewportHeight = window.innerHeight;
        if (gl && gl.canvas) {
            viewportWidth = gl.canvas.width;
            viewportHeight = gl.canvas.height;
        }

        // Screen coordinates (-1 to 1) — apply aspect ratio correction for non-square viewports
        var aspectRatio = viewportWidth / viewportHeight;
        var ndcX = -(rightDot * fovScale / dot) / aspectRatio;
        var ndcY = (upDot * fovScale / dot);

        // Convert to pixel coordinates
        var screenX = (ndcX + 1) * viewportWidth / 2;
        var screenY = (1 - ndcY) * viewportHeight / 2;

        // Check if on-screen (with some margin)
        var margin = 50;
        if (screenX < -margin || screenX > viewportWidth + margin) return null;
        if (screenY < -margin || screenY > viewportHeight + margin) return null;

        return { x: screenX, y: screenY, distance: dist };
    };

    /**
     * Check if entity is within nametag range and not occluded.
     * @param {Object} entity - Entity object.
     * @param {Object} camera - Camera instance.
     * @returns {boolean} True if visible.
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._isVisible = function (entity, camera) {
        var pos = entity.getPosition ? entity.getPosition() : null;
        if (!pos) return false;

        var camPos = camera.getPosition ? camera.getPosition() : null;
        if (!camPos) return false;

        // Distance check
        var dx = pos.x - camPos.x;
        var dy = pos.y - camPos.y;
        var dz = pos.z - camPos.z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > NAMETAG_MAX_DISTANCE) return false;

        // Height offset: nametag appears above entity head
        return true;
    };

    /**
     * Check if entity is currently on-screen (for hiding vs removing DOM elements).
     * @param {Object} entity - Entity object.
     * @param {Object} camera - Camera instance.
     * @returns {boolean} True if entity projects to screen space.
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._isOnScreen = function (entity, camera) {
        var pos = entity.getPosition ? entity.getPosition() : null;
        if (!pos) return false;

        var eyePos = {
            x: pos.x,
            y: pos.y + (entity.height || 1.8),
            z: pos.z
        };

        var screenPos = this._worldToScreen(eyePos, camera, this._gl);
        return screenPos !== null;
    };

    /**
     * Get CSS color class based on entity aggressiveness.
     * @param {Object} entity - Entity object.
     * @returns {string} CSS class name.
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._getColorClass = function (entity) {
        if (!entity) return 'passive';

        // Check isAggro method first, then fall back to property
        var isAggro = false;
        if (typeof entity.isAggro === 'function') {
            isAggro = entity.isAggro();
        } else if (entity._isAggro !== undefined) {
            isAggro = !!entity._isAggro;
        }

        if (isAggro) return 'hostile';

        // Check entity type for classification
        var type = entity.type || '';
        if (type === 'boss' || type.indexOf('boss') !== -1) return 'boss';
        if (type === 'animal' || type === 'passive' || type === 'cow' || type === 'sheep' || type === 'pig') return 'neutral';

        return 'passive';
    };

    /**
     * Get the display name for an entity.
     * @param {Object} entity - Entity object.
     * @returns {string} Display name.
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._getDisplayName = function (entity) {
        if (!entity) return 'Entity';

        // Try getDisplayName method first
        if (typeof entity.getDisplayName === 'function') {
            var name = entity.getDisplayName();
            if (name) return name;
        }

        // Fall back to displayName property
        if (entity.displayName) return entity.displayName;

        // Fall back to nameTag
        if (entity.nameTag) return entity.nameTag;

        // Fall back to type
        return (entity.type || 'Entity').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    };

    /**
     * Create DOM element for an entity's nametag.
     * @param {Object} entity - Entity object.
     * @returns {{nameEl: HTMLElement, hpBarEl: HTMLElement, wrapperEl: HTMLElement}}
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._createNametagElement = function (entity) {
        var colorClass = this._getColorClass(entity);
        var displayName = this._getDisplayName(entity);

        // Wrapper div for the nametag
        var wrapperEl = document.createElement('div');
        wrapperEl.className = 'dk-nametag ' + colorClass;
        wrapperEl.style.opacity = '1';

        // Name element
        var nameEl = document.createElement('div');
        nameEl.textContent = displayName;
        nameEl.style.fontWeight = 'bold';
        nameEl.style.fontSize = '12px';

        // HP bar container
        var hpBarEl = document.createElement('div');
        hpBarEl.className = 'dk-nametag-hp-bar';

        // HP fill (will be updated dynamically)
        var hpFill = document.createElement('div');
        hpFill.className = 'dk-nametag-hp-fill';
        hpBarEl.appendChild(hpFill);

        wrapperEl.appendChild(nameEl);
        wrapperEl.appendChild(hpBarEl);

        // Store references
        this._nametagElements[entity._id] = {
            nameEl: nameEl,
            hpBarEl: hpBarEl,
            hpFillEl: hpFill,
            wrapperEl: wrapperEl
        };

        // Add to DOM
        if (this._container) {
            this._container.appendChild(wrapperEl);
        }

        return { nameEl: nameEl, hpBarEl: hpBarEl, hpFillEl: hpFill, wrapperEl: wrapperEl };
    };

    /**
     * _updateNametag — Update a nametag's position, text, and HP bar.
     * @param {Object} entity - Entity object.
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._updateNametag = function (entity) {
        if (!entity || !this._container || !this._camera) return;

        // Check distance-based visibility — hide instead of remove to avoid DOM thrashing
        // when entities are near the render distance boundary.
        if (!this._isVisible(entity, this._camera)) {
            var elements = this._nametagElements[entity._id];
            if (elements && elements.wrapperEl) {
                elements.wrapperEl.style.display = 'none';
            }
            return;
        }

        // Check screen-space visibility — skip DOM element creation for off-screen entities.
        // This avoids unnecessary DOM operations when the entity is within range but behind
        // the camera or outside the viewport.
        if (!this._isOnScreen(entity, this._camera)) {
            var elementsOffScreen = this._nametagElements[entity._id];
            if (elementsOffScreen && elementsOffScreen.wrapperEl) {
                elementsOffScreen.wrapperEl.style.display = 'none';
            }
            return;
        }

        // Get or create DOM element (only for on-screen entities within range)
        var elements = this._nametagElements[entity._id];
        if (!elements) {
            elements = this._createNametagElement(entity);
        }

        var wrapperEl = elements.wrapperEl;
        var hpBarEl = elements.hpBarEl;
        var hpFillEl = elements.hpFillEl || elements.hpBarEl.firstChild;

        // Project 3D position to 2D screen coordinates
        // Nametag appears above entity head (offset by height)
        var pos = entity.getPosition ? entity.getPosition() : null;
        if (!pos) return;

        var eyePos = {
            x: pos.x,
            y: pos.y + (entity.height || 1.8),
            z: pos.z
        };

        var screenPos = this._worldToScreen(eyePos, this._camera, this._gl);
        if (!screenPos) {
            wrapperEl.style.display = 'none';
            return;
        }

        // Update position
        wrapperEl.style.display = '';
        wrapperEl.style.left = screenPos.x + 'px';
        wrapperEl.style.top = screenPos.y + 'px';

        // Fade based on distance
        var opacity = 1.0;
        if (screenPos.distance) {
            var maxDist = NAMETAG_MAX_DISTANCE;
            if (screenPos.distance > maxDist * 0.7) {
                opacity = Math.max(NAMETAG_MIN_OPACITY, 1.0 - ((screenPos.distance - maxDist * 0.7) / (maxDist * 0.3)));
            }
        }
        wrapperEl.style.opacity = String(opacity);

        // Update HP bar
        if (hpFillEl && entity.getHealth !== undefined && entity.getMaxHealth !== undefined) {
            var currentHealth = typeof entity.getHealth === 'function' ? entity.getHealth() : 0;
            var maxHealth = typeof entity.getMaxHealth === 'function' ? entity.getMaxHealth() : 20;
            var hpPercent = maxHealth > 0 ? (currentHealth / maxHealth) * 100 : 0;

            hpFillEl.style.width = hpPercent + '%';

            // Update HP bar color class
            hpFillEl.className = 'dk-nametag-hp-fill';
            if (hpPercent > 60) {
                hpFillEl.classList.add('high');
            } else if (hpPercent > 30) {
                hpFillEl.classList.add('medium');
            } else {
                hpFillEl.classList.add('low');
            }
        }

        // Update color class based on aggressiveness
        var colorClass = this._getColorClass(entity);
        wrapperEl.className = 'dk-nametag ' + colorClass;
    };

    /**
     * Remove nametag DOM element for a despawned entity.
     * @param {number} entityId - Entity unique ID.
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._removeNametagElement = function (entityId) {
        var elements = this._nametagElements[entityId];
        if (!elements || !this._container) return;

        var wrapperEl = elements.wrapperEl;
        if (wrapperEl && wrapperEl.parentNode) {
            wrapperEl.parentNode.removeChild(wrapperEl);
        }

        delete this._nametagElements[entityId];
    };

    /**
     * Handle entity spawned event.
     * @param {Object} entity - Spawned entity object.
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._onEntitySpawned = function (entity) {
        if (!entity) return;
        // Nametag will be created lazily on first render
    };

    /**
     * Handle entity despawned event.
     * @param {Object} entity - Despawned entity object.
     * @private
     */
    Donkeycraft.NametagRenderer.prototype._onEntityDespawned = function (entity) {
        if (!entity) return;
        this._removeNametagElement(entity._id);
    };

    /**
     * Cleanup resources and DOM elements.
     */
    Donkeycraft.NametagRenderer.prototype.destroy = function () {
        // Remove all nametag elements from DOM
        for (var id in this._nametagElements) {
            if (this._nametagElements.hasOwnProperty(id)) {
                var el = this._nametagElements[id];
                if (el.wrapperEl && el.wrapperEl.parentNode) {
                    el.wrapperEl.parentNode.removeChild(el.wrapperEl);
                }
            }
        }
        this._nametagElements = {};

        // Unsubscribe from events
        if (Donkeycraft.EventBus && this._subscribers) {
            for (var i = 0; i < this._subscribers.length; i++) {
                try {
                    this._subscribers[i]();
                } catch (e) { }
            }
            this._subscribers = [];
        }

        // Remove container only if we created it (not the pre-existing one in HTML)
        if (this._container && this._container.parentNode && this._wasCreatedByRenderer) {
            this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
        this._entityManager = null;
        this._camera = null;
        this._gl = null;
    };
})();