import { ready } from './core.js';

function normalizeTarget(t) {
    const node = t;
    if (!node) return null;
    if (node.nodeType === 3) return node.parentElement || null;
    return node;
}

function isScrollableX(el) {
    if (!el) return false;
    const sw = el.scrollWidth || 0;
    const cw = el.clientWidth || 0;
    return sw > cw + 1;
}

function findPlatformGridFromTarget(t) {
    const el = normalizeTarget(t);
    const card = el?.closest?.('.platform-card');
    const grid = card?.closest?.('.platform-grid');
    return grid || null;
}

function isInTitleArea(t) {
    const el = normalizeTarget(t);
    if (!el?.closest) return false;
    if (el.closest('.platform-drag-handle')) return false;
    return !!el.closest('.platform-header') || !!el.closest('.platform-name');
}

ready(() => {
    const DRAG_THRESHOLD_PX = 4; // Lowered for quicker response

    let activePointerId = null;
    let activeIsMouse = false;
    let activeGrid = null;
    let startX = 0;
    let startScrollLeft = 0;
    let didDrag = false;
    let suppressClickUntil = 0;

    // ======================================
    // Momentum Scrolling Implementation
    // ======================================
    let momentumAnimationFrame = null;
    let momentumVelocity = 0;
    let lastMoveTime = 0;
    let lastMoveX = 0;
    const FRICTION = 0.92; // Friction coefficient (lower = faster stop)
    const MIN_VELOCITY = 0.5; // Stop threshold

    function stopMomentum() {
        if (momentumAnimationFrame) {
            cancelAnimationFrame(momentumAnimationFrame);
            momentumAnimationFrame = null;
        }
        momentumVelocity = 0;
    }

    // ======================================
    // Snap to Nearest Card
    // ======================================
    function findNearestCardPosition(grid) {
        if (!grid) return null;

        const cards = Array.from(grid.querySelectorAll('.platform-card'));
        if (cards.length === 0) return null;

        const gridRect = grid.getBoundingClientRect();
        const gridLeft = gridRect.left;
        const scrollLeft = grid.scrollLeft || 0;

        let nearestCard = null;
        let minDistance = Infinity;

        for (const card of cards) {
            const cardRect = card.getBoundingClientRect();
            const cardLeft = cardRect.left;

            // Calculate distance from card's left edge to grid's left edge
            const distance = Math.abs(cardLeft - gridLeft);

            if (distance < minDistance) {
                minDistance = distance;
                nearestCard = card;
            }
        }

        if (!nearestCard) return null;

        // Calculate the scroll position needed to align this card
        const cardOffsetLeft = nearestCard.offsetLeft || 0;
        return cardOffsetLeft;
    }

    function snapToNearestCard(grid) {
        if (!grid) return;

        const targetPosition = findNearestCardPosition(grid);
        if (targetPosition === null) return;

        const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
        const clampedPosition = Math.max(0, Math.min(maxScrollLeft, targetPosition));

        // Smoothly scroll to the nearest card
        grid.scrollTo({
            left: clampedPosition,
            behavior: 'smooth'
        });
    }

    function applyMomentumScroll(grid, velocity) {
        if (!grid || !isScrollableX(grid)) return;
        stopMomentum();
        momentumVelocity = velocity;

        function animate() {
            if (Math.abs(momentumVelocity) < MIN_VELOCITY) {
                stopMomentum();
                // Snap to nearest card after momentum ends
                setTimeout(() => snapToNearestCard(grid), 100);
                return;
            }

            momentumVelocity *= FRICTION;
            const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
            const current = grid.scrollLeft || 0;
            const next = Math.max(0, Math.min(maxScrollLeft, current + momentumVelocity));

            // Direct assignment for smooth momentum
            grid.scrollLeft = next;

            // Check if we hit the edge
            if (next <= 0 || next >= maxScrollLeft) {
                stopMomentum();
                // Snap to nearest card when hitting edge
                setTimeout(() => snapToNearestCard(grid), 100);
                return;
            }

            momentumAnimationFrame = requestAnimationFrame(animate);
        }

        momentumAnimationFrame = requestAnimationFrame(animate);
    }

    // ======================================
    // Wheel Event Optimization
    // ======================================
    let wheelRAFPending = false;
    let wheelTargetGrid = null;
    let wheelAccumulatedDelta = 0;
    let wheelStopTimer = null;

    function processWheelScroll() {
        wheelRAFPending = false;
        if (!wheelTargetGrid || !isScrollableX(wheelTargetGrid)) {
            wheelAccumulatedDelta = 0;
            return;
        }

        const delta = wheelAccumulatedDelta;
        wheelAccumulatedDelta = 0;

        if (!delta) return;

        const maxScrollLeft = Math.max(0, (wheelTargetGrid.scrollWidth || 0) - (wheelTargetGrid.clientWidth || 0));
        const current = wheelTargetGrid.scrollLeft || 0;
        const next = Math.max(0, Math.min(maxScrollLeft, current + delta));

        // Use direct scrollLeft assignment for instant response (no stuttering)
        wheelTargetGrid.scrollLeft = next;

        // Clear previous timer and set new one to detect scroll end
        if (wheelStopTimer) {
            clearTimeout(wheelStopTimer);
        }
        wheelStopTimer = setTimeout(() => {
            wheelStopTimer = null;
            // Snap to nearest card after wheel scrolling stops
            snapToNearestCard(wheelTargetGrid);
        }, 150); // Wait 150ms after last wheel event
    }

    // ======================================
    // Drag State Management
    // ======================================
    const clear = () => {
        // Calculate velocity before clearing state
        const now = performance.now();
        const dt = now - lastMoveTime;
        let velocity = 0;

        if (didDrag && activeGrid && dt > 0 && dt < 100) {
            // Calculate velocity based on recent movement
            const recentDx = lastMoveX - startX;
            velocity = -recentDx / (dt / 16); // Convert to per-frame velocity
            velocity = Math.max(-50, Math.min(50, velocity)); // Clamp velocity
        }

        const grid = activeGrid;

        activePointerId = null;
        activeIsMouse = false;
        activeGrid = null;
        startX = 0;
        startScrollLeft = 0;
        didDrag = false;
        lastMoveTime = 0;
        lastMoveX = 0;

        try { document.body.classList.remove('tr-platform-title-dragging'); } catch (_) { }

        // Apply momentum scrolling after drag ends
        if (grid && Math.abs(velocity) > 2) {
            applyMomentumScroll(grid, velocity);
        }
    };

    const beginDrag = (target, clientX, fromMiddleButton = false) => {
        // For middle button, allow drag from anywhere in the card
        if (fromMiddleButton) {
            const card = normalizeTarget(target)?.closest?.('.platform-card');
            if (!card) return false;
            const grid = card.closest('.platform-grid');
            if (!grid || !isScrollableX(grid)) return false;

            stopMomentum();
            activeGrid = grid;
            startX = clientX;
            startScrollLeft = grid.scrollLeft || 0;
            didDrag = false;
            lastMoveTime = performance.now();
            lastMoveX = clientX;
            try { document.body.classList.add('tr-platform-title-dragging'); } catch (_) { }
            return true;
        }

        // Left button: require title area
        if (!isInTitleArea(target)) return false;
        if (document.querySelector('.platform-card.dragging')) return false;

        const grid = findPlatformGridFromTarget(target);
        if (!grid || !isScrollableX(grid)) return false;

        // Stop any ongoing momentum when starting new drag
        stopMomentum();

        activeGrid = grid;
        startX = clientX;
        startScrollLeft = grid.scrollLeft || 0;
        didDrag = false;
        lastMoveTime = performance.now();
        lastMoveX = clientX;

        try { document.body.classList.add('tr-platform-title-dragging'); } catch (_) { }
        return true;
    };

    document.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.button !== 1) return;
        const target = normalizeTarget(e.target);
        const isMiddle = e.button === 1;
        if (!beginDrag(target, e.clientX, isMiddle)) return;
        activePointerId = e.pointerId;
        // Prevent middle-click autoscroll
        if (isMiddle) {
            try { e.preventDefault(); } catch (_) { }
        }
    }, { passive: false });

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0 && e.button !== 1) return;
        if (activePointerId !== null) return;
        const target = normalizeTarget(e.target);
        const isMiddle = e.button === 1;
        if (!beginDrag(target, e.clientX, isMiddle)) return;
        activeIsMouse = true;
        // Prevent middle-click autoscroll
        if (isMiddle) {
            try { e.preventDefault(); } catch (_) { }
        }
    }, { passive: false });

    document.addEventListener('pointermove', (e) => {
        if (activePointerId === null || e.pointerId !== activePointerId) return;
        if (!activeGrid) return;
        if (document.querySelector('.platform-card.dragging')) {
            clear();
            return;
        }

        const dx = e.clientX - startX;
        if (!didDrag && Math.abs(dx) < DRAG_THRESHOLD_PX) return;

        didDrag = true;
        try { e.preventDefault(); } catch (_) { }

        // Track for velocity calculation
        lastMoveTime = performance.now();
        lastMoveX = e.clientX;

        const maxScrollLeft = Math.max(0, (activeGrid.scrollWidth || 0) - (activeGrid.clientWidth || 0));
        const next = Math.max(0, Math.min(maxScrollLeft, startScrollLeft - dx));

        // Direct assignment for instant response
        activeGrid.scrollLeft = next;
    }, { passive: false });

    document.addEventListener('mousemove', (e) => {
        if (!activeIsMouse) return;
        if (!activeGrid) return;
        if (document.querySelector('.platform-card.dragging')) {
            clear();
            return;
        }

        const dx = e.clientX - startX;
        if (!didDrag && Math.abs(dx) < DRAG_THRESHOLD_PX) return;

        didDrag = true;
        try { e.preventDefault(); } catch (_) { }

        // Track for velocity calculation
        lastMoveTime = performance.now();
        lastMoveX = e.clientX;

        const maxScrollLeft = Math.max(0, (activeGrid.scrollWidth || 0) - (activeGrid.clientWidth || 0));
        const next = Math.max(0, Math.min(maxScrollLeft, startScrollLeft - dx));

        // Direct assignment for instant response
        activeGrid.scrollLeft = next;
    }, { passive: false });

    const onPointerEnd = () => {
        if (activePointerId === null) return;
        if (didDrag) suppressClickUntil = Date.now() + 600;
        clear();
    };

    document.addEventListener('pointerup', onPointerEnd, { passive: true });
    document.addEventListener('pointercancel', onPointerEnd, { passive: true });

    document.addEventListener('mouseup', () => {
        if (!activeIsMouse) return;
        if (didDrag) suppressClickUntil = Date.now() + 600;
        clear();
    }, { passive: true });

    document.addEventListener('click', (e) => {
        const now = Date.now();
        if (now > suppressClickUntil) return;
        const target = normalizeTarget(e.target);
        if (!isInTitleArea(target)) return;
        try { e.preventDefault(); } catch (_) { }
        try { e.stopPropagation(); } catch (_) { }
        try { e.stopImmediatePropagation(); } catch (_) { }
    }, true);

    // ======================================
    // Optimized Wheel Event Handler
    // ======================================
    document.addEventListener('wheel', (e) => {
        const pointEl = (typeof document.elementFromPoint === 'function')
            ? document.elementFromPoint(e.clientX, e.clientY)
            : null;
        const target = normalizeTarget(pointEl || e.target);
        if (!e.shiftKey) return;
        if (!isInTitleArea(target)) return;
        if (document.querySelector('.platform-card.dragging')) return;

        const grid = findPlatformGridFromTarget(target);
        if (!grid || !isScrollableX(grid)) return;

        // Stop any ongoing momentum
        stopMomentum();

        // Normalize delta based on deltaMode
        let delta = (typeof e.deltaX === 'number' && e.deltaX !== 0) ? e.deltaX : e.deltaY;

        if (e.deltaMode === 1) { // DOM_DELTA_LINE
            delta *= 20; // Approximate pixels per line
        } else if (e.deltaMode === 2) { // DOM_DELTA_PAGE
            delta *= (grid.clientWidth || 100);
        }

        if (!delta) return;

        try { e.preventDefault(); } catch (_) { }

        // Accumulate delta and schedule RAF-throttled update
        wheelTargetGrid = grid;
        wheelAccumulatedDelta += delta;

        if (!wheelRAFPending) {
            wheelRAFPending = true;
            requestAnimationFrame(processWheelScroll);
        }
    }, { passive: false });

    // ======================================
    // Keyboard Arrow Navigation
    // ======================================
    function navigateToCard(grid, direction) {
        if (!grid) return;

        const cards = Array.from(grid.querySelectorAll('.platform-card'));
        if (cards.length === 0) return;

        const gridRect = grid.getBoundingClientRect();
        const gridLeft = gridRect.left;
        const scrollLeft = grid.scrollLeft || 0;

        // Find current visible card (closest to left edge)
        let currentIndex = 0;
        let minDistance = Infinity;

        cards.forEach((card, idx) => {
            const cardRect = card.getBoundingClientRect();
            const distance = Math.abs(cardRect.left - gridLeft);
            if (distance < minDistance) {
                minDistance = distance;
                currentIndex = idx;
            }
        });

        // Calculate target index
        const targetIndex = Math.max(0, Math.min(cards.length - 1, currentIndex + direction));
        if (targetIndex === currentIndex && minDistance < 10) {
            // Already at edge, try to go one more
            const nextIdx = Math.max(0, Math.min(cards.length - 1, currentIndex + direction));
            if (nextIdx !== currentIndex) {
                const targetCard = cards[nextIdx];
                if (targetCard) {
                    stopMomentum();
                    grid.scrollTo({
                        left: targetCard.offsetLeft || 0,
                        behavior: 'smooth'
                    });
                }
            }
            return;
        }

        const targetCard = cards[targetIndex];
        if (!targetCard) return;

        stopMomentum();
        grid.scrollTo({
            left: targetCard.offsetLeft || 0,
            behavior: 'smooth'
        });
    }

    function getActiveGrid() {
        // Find the active tab pane
        const activePane = document.querySelector('.tab-pane.active');
        if (!activePane) return null;

        // Skip if RSS carousel tab is active (has its own keyboard nav)
        const paneId = activePane.id || '';
        if (paneId === 'tab-rsscol-rss') return null;

        const grid = activePane.querySelector('.platform-grid');
        if (!grid || !isScrollableX(grid)) return null;

        return grid;
    }

    document.addEventListener('keydown', (e) => {
        // Skip if in input/textarea/select
        const target = e.target;
        if (target && target instanceof Element) {
            if (target.closest('input,textarea,select')) return;
        }

        // Skip if modal is open
        if (document.querySelector('.settings-modal-overlay.show')) return;

        // Skip if RSS catalog preview modal is open
        if (document.getElementById('rssCatalogPreviewModal')?.classList.contains('show')) return;

        // Only handle arrow keys
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

        const grid = getActiveGrid();
        if (!grid) return;

        e.preventDefault();
        navigateToCard(grid, e.key === 'ArrowRight' ? 1 : -1);
    });
});
