/**
 * Snippet Preview Popover
 * 
 * Hover on a news title to show a floating popover with the article snippet.
 * Only shows when the parent .news-item has a data-snippet attribute.
 * Uses event delegation — no per-item listeners needed.
 */

let _popover = null;
let _hideTimer = null;
let _showTimer = null;

function _ensurePopover() {
    if (_popover) return _popover;
    _popover = document.createElement('div');
    _popover.className = 'snippet-popover';
    _popover.addEventListener('mouseenter', () => clearTimeout(_hideTimer));
    _popover.addEventListener('mouseleave', () => _hide());
    document.body.appendChild(_popover);
    return _popover;
}

function _show(titleEl) {
    clearTimeout(_hideTimer);
    clearTimeout(_showTimer);

    const item = titleEl.closest('.news-item');
    if (!item) return;

    const snippet = item.dataset.snippet;
    if (!snippet) return;

    // Small delay to avoid flicker when moving mouse across titles
    _showTimer = setTimeout(() => {
        const pop = _ensurePopover();
        const imgSrc = item.dataset.snippetImg;
        let html = `<div class="snippet-popover-text">${snippet}</div>`;
        if (imgSrc) {
            html += `<img class="snippet-popover-img" src="${imgSrc}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
        }
        pop.innerHTML = html;
        pop.classList.add('visible');

        // Position below the title
        const rect = titleEl.getBoundingClientRect();
        const popW = 340;
        let left = rect.left;
        left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
        pop.style.width = popW + 'px';
        pop.style.left = left + 'px';

        // Place off-screen to measure
        pop.style.top = '-9999px';
        const popH = pop.offsetHeight;

        // Prefer below title; fall back to above if not enough space
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow >= popH + 8) {
            pop.style.top = (rect.bottom + 4 + window.scrollY) + 'px';
        } else {
            pop.style.top = (rect.top - popH - 4 + window.scrollY) + 'px';
        }
    }, 300);
}

function _hide() {
    clearTimeout(_showTimer);
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(() => {
        if (_popover) _popover.classList.remove('visible');
    }, 100);
}

// Event delegation on title links
document.addEventListener('mouseenter', (e) => {
    const title = e.target.closest('.news-title');
    if (title) _show(title);
}, true);

document.addEventListener('mouseleave', (e) => {
    const title = e.target.closest('.news-title');
    if (title) _hide();
}, true);
