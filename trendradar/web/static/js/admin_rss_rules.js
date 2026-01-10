function _setMorningBriefRulesStatus(msg) {
  const el = document.getElementById('mb-rules-status');
  if (!el) return;
  el.textContent = msg || '';
}

async function loadMorningBriefRules() {
  try {
    _setMorningBriefRulesStatus('Loading...');
    const resp = await fetch(`/api/admin/morning-brief/rules?token=${encodeURIComponent(token)}`);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.detail || 'Load failed');
    const rules = payload?.rules || {};
    const text = JSON.stringify(rules, null, 2);
    const ta = document.getElementById('mb-rules-text');
    if (ta) ta.value = text;
    _setMorningBriefRulesStatus(`Loaded (updated_at=${Number(payload?.updated_at || 0)})`);
  } catch (e) {
    _setMorningBriefRulesStatus('');
    alert(e?.message || String(e));
  }
}

function validateMorningBriefRules() {
  try {
    const ta = document.getElementById('mb-rules-text');
    const text = ta ? String(ta.value || '').trim() : '';
    if (!text) throw new Error('Empty rules JSON');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Rules must be a JSON object');
    }
    _setMorningBriefRulesStatus('Valid JSON');
  } catch (e) {
    _setMorningBriefRulesStatus('Invalid JSON');
    alert(e?.message || String(e));
  }
}

async function saveMorningBriefRules() {
  try {
    const ta = document.getElementById('mb-rules-text');
    const text = ta ? String(ta.value || '').trim() : '';
    if (!text) throw new Error('Empty rules JSON');
    const rules = JSON.parse(text);
    _setMorningBriefRulesStatus('Saving...');
    const resp = await fetch(`/api/admin/morning-brief/rules?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': token
      },
      body: JSON.stringify({ rules })
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.detail || 'Save failed');
    _setMorningBriefRulesStatus(`Saved (updated_at=${Number(payload?.updated_at || 0)})`);
  } catch (e) {
    _setMorningBriefRulesStatus('');
    alert(e?.message || String(e));
  }
}
