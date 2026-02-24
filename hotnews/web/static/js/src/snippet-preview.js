/**
 * Snippet Preview Popover
 * 
 * Hover on the preview button (👁) to show a floating popover with the article snippet.
 * Uses event delegation — no per-item listeners needed.
 */

let _popover = null;
let _hideTimer = null;

function _ensurePopover() {
    if (_popover) return _popover;
    _popover = document.createElement('div');
    _popover.className = 'snippet-popover';
    _popover.addEventListener('mouseenter', () => clearTimeout(_hideTimer));
    _popover.addEventListener('mouseleave', () => _hide());
    document.body.appendChild(_popover);
    return _popover;
}

function _show(btn) {
    clearTimeout(_hideTimer);
    const item = btn.closest('.news-item');
    if (!item) return;

    const snippet = item.dataset.snippet;
    if (!snippet) return;

    const pop = _ensurePopover();
    const imgSrc = item.dataset.snippetImg;
    let html = `<div class="snippet-popover-text">${snippet}</div>`;
    if (imgSrc) {
        html += `<img class="snippet-popover-img" src="${imgSrc}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
    }
    pop.innerHTML = html;
    pop.classList.add('visible');

    // Position: above the button, centered horizontally
    const rect = btn.getBoundingClientRect();
    const popW = 320;
    let left = rect.left + rect.width / 2 - popW / 2;
    // Keep within viewport
    left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
    pop.style.width = popW + 'px';
    pop.style.left = left + 'px';

    // Temporarily place off-screen to measure height
    pop.style.top = '-9999px';
    const popH = pop.offsetHeight;

    // Prefer above; fall back to below if not enough space
    const spaceAbove = rect.top;
    if (spaceAbove >= popH + 8) {
        pop.style.top = (rect.top - popH - 6 + window.scrollY) + 'px';
    } else {
        pop.style.top = (rect.bottom + 6 + window.scrollY) + 'px';
    }
}

function _hide() {
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(() => {
        if (_popover) _popover.classList.remove('visible');
    }, 120);
}

// Event delegation
document.addEventListener('mouseenter', (e) => {
    const btn = e.target.closest('.news-preview-btn');
    if (btn) _show(btn);
}, true);

document.addEventListener('mouseleave', (e) => {
    const btn = e.target.closest('.news-preview-btn');
    if (btn) _hide();
}, true);
