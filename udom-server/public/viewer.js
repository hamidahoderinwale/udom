let allSnapshots = [];
let allPreferences = [];
let preferenceStats = {};

// Format date with proper timezone handling
function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  
  // Handle both Unix timestamps (seconds) and milliseconds
  const ts = typeof timestamp === 'number' 
    ? (timestamp < 1e12 ? timestamp * 1000 : timestamp) 
    : timestamp;
  
  const date = new Date(ts);
  
  // Check if date is valid
  if (isNaN(date.getTime())) return 'Invalid date';
  
  // Format with locale and timezone options
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });
}

// Format date for compact display (without timezone)
function formatDateCompact(timestamp) {
  if (!timestamp) return 'N/A';
  
  const ts = typeof timestamp === 'number' 
    ? (timestamp < 1e12 ? timestamp * 1000 : timestamp) 
    : timestamp;
  
  const date = new Date(ts);
  
  if (isNaN(date.getTime())) return 'Invalid date';
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadData() {
  const container = document.getElementById('snapshots-container');
  const errorContainer = document.getElementById('error-container');
  errorContainer.innerHTML = '';

  try {
    container.innerHTML = '<div class="loading">Loading snapshots...</div>';

    // Load preferences stats first
    await loadPreferenceStats();

    // Load all preferences
    await loadPreferences();

    // Load snapshots
    const artifactId = document.getElementById('filter-artifact-id').value.trim();
    const artifactType = document.getElementById('filter-artifact-type').value.trim();
    const hasIntent = document.getElementById('filter-has-intent').value;
    const hasPreferences = document.getElementById('filter-has-preferences').value;
    const limit = parseInt(document.getElementById('filter-limit').value) || 50;

    let url = 'http://localhost:3000/snapshots?limit=' + limit;
    if (artifactId) url += '&artifact_id=' + encodeURIComponent(artifactId);
    if (artifactType) url += '&artifact_type=' + encodeURIComponent(artifactType);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const snapshots = await response.json();
    
    // Apply client-side filters
    let filteredSnapshots = snapshots;
    
    // Filter by intent
    if (hasIntent === 'true') {
      filteredSnapshots = filteredSnapshots.filter(s => {
        const intent = s.observations?.intent || {};
        return !!(intent.user_intent || intent.inferred_intent);
      });
    } else if (hasIntent === 'false') {
      filteredSnapshots = filteredSnapshots.filter(s => {
        const intent = s.observations?.intent || {};
        return !intent.user_intent && !intent.inferred_intent;
      });
    }

    // Filter by preferences
    if (hasPreferences === 'true') {
      filteredSnapshots = filteredSnapshots.filter(s => {
        const snapshotId = s.metadata?.snapshot_id;
        if (!snapshotId) return false;
        const prefs = allPreferences.filter(p => p.snapshot_id === snapshotId);
        return prefs.length > 0;
      });
    } else if (hasPreferences === 'false') {
      filteredSnapshots = filteredSnapshots.filter(s => {
        const snapshotId = s.metadata?.snapshot_id;
        if (!snapshotId) return true;
        const prefs = allPreferences.filter(p => p.snapshot_id === snapshotId);
        return prefs.length === 0;
      });
    }

    // Apply limit after all filters (client-side limit as backup)
    // Note: Server-side limit is already applied, but we respect it here too
    if (limit > 0 && filteredSnapshots.length > limit) {
      filteredSnapshots = filteredSnapshots.slice(0, limit);
    }

    allSnapshots = filteredSnapshots;

    updateStats(filteredSnapshots);
    renderSnapshots(filteredSnapshots);
  } catch (error) {
    errorContainer.innerHTML = `<div class="error">Error loading data: ${error.message}</div>`;
    container.innerHTML = '<div class="empty-state"><h2>Failed to load snapshots</h2><p>Make sure the server is running on http://localhost:3000</p></div>';
  }
}

async function loadPreferenceStats() {
  try {
    const response = await fetch('http://localhost:3000/preferences/stats');
    if (response.ok) {
      preferenceStats = await response.json();
    }
  } catch (error) {
    // Silent fail - stats are optional
  }
}

async function loadPreferences() {
  try {
    const response = await fetch('http://localhost:3000/preferences?limit=1000');
    if (response.ok) {
      allPreferences = await response.json();
    }
  } catch (error) {
    // Silent fail - preferences are optional
  }
}

function updateStats(snapshots) {
  document.getElementById('total-snapshots').textContent = snapshots.length;
  
  const uniqueArtifacts = new Set(snapshots.map(s => s.metadata?.artifact_id).filter(Boolean));
  document.getElementById('total-artifacts').textContent = uniqueArtifacts.size;

  // Update intent stats
  const withIntent = snapshots.filter(s => {
    const intent = s.observations?.intent || {};
    return intent.user_intent || intent.inferred_intent;
  }).length;
  const userIntentCount = snapshots.filter(s => s.observations?.intent?.user_intent).length;
  const inferredIntentCount = snapshots.filter(s => s.observations?.intent?.inferred_intent).length;
  
  document.getElementById('total-intent').textContent = withIntent;
  if (withIntent > 0) {
    const intentRate = Math.round((withIntent / snapshots.length) * 100);
    document.getElementById('intent-breakdown').textContent = `${userIntentCount} user, ${inferredIntentCount} inferred (${intentRate}%)`;
  } else {
    document.getElementById('intent-breakdown').textContent = 'No intent data';
  }

  // Update preference stats
  const totalPrefs = preferenceStats.total || 0;
  const accepted = preferenceStats.accepted || 0;
  const rejected = preferenceStats.rejected || 0;
  document.getElementById('total-preferences').textContent = totalPrefs;
  if (totalPrefs > 0) {
    const acceptanceRate = Math.round((accepted / totalPrefs) * 100);
    document.getElementById('preference-breakdown').textContent = `${accepted} accepted, ${rejected} rejected (${acceptanceRate}% acceptance)`;
  } else {
    document.getElementById('preference-breakdown').textContent = 'No preferences recorded';
  }

  if (snapshots.length > 0) {
    const latest = snapshots[0];
    const timestamp = latest.metadata?.timestamp;
    if (timestamp) {
      document.getElementById('last-updated').textContent = formatDateCompact(timestamp);
    }
  }
}

function renderSnapshots(snapshots) {
  const container = document.getElementById('snapshots-container');

  if (snapshots.length === 0) {
    container.innerHTML = '<div class="empty-state"><h2>No snapshots found</h2><p>Try adjusting your filters or capture some snapshots from the Figma plugin</p></div>';
    return;
  }

  container.innerHTML = snapshots.map(snapshot => {
    const metadata = snapshot.metadata || {};
    const elements = snapshot.elements || [];
    const relations = snapshot.relations || [];
    const intent = snapshot.observations?.intent || {};
    const preferences = allPreferences.filter(p => p.snapshot_id === metadata.snapshot_id);
    
    // Extract screenshot image
    const images = snapshot.rendering_manifest?.assets?.images || [];
    const screenshotImage = images.length > 0 ? images[0] : null;

    // Count preference types
    const acceptedCount = preferences.filter(p => p.user_action?.type === 'accepted').length;
    const rejectedCount = preferences.filter(p => p.user_action?.type === 'dismissed').length;

    const hasIntent = intent.user_intent || intent.inferred_intent;
    const intentPreview = intent.user_intent || (intent.inferred_intent && typeof intent.inferred_intent === 'object' 
      ? `${intent.inferred_intent.action_type || 'Action'} on ${intent.inferred_intent.focus_area || 'element'}`
      : (typeof intent.inferred_intent === 'string' ? intent.inferred_intent : 'Intent detected'));

    return `
      <div class="snapshot-card" data-snapshot-id="${escapeHtml(metadata.snapshot_id)}">
        <div class="snapshot-card-header">
          <div class="snapshot-header">
            <div>
              <div class="snapshot-title">${metadata.artifact_id ? metadata.artifact_id.split('/').pop() : 'Untitled'}</div>
              <div class="snapshot-id">${metadata.snapshot_id}</div>
            </div>
          </div>
        </div>
        
        ${screenshotImage ? `
          <div class="snapshot-screenshot">
            <img src="${screenshotImage.url}" 
                 alt="Screenshot of ${escapeHtml(metadata.artifact_id ? metadata.artifact_id.split('/').pop() : 'component')}"
                 loading="lazy" />
          </div>
        ` : ''}
        
        ${hasIntent ? `
          <div class="snapshot-intent-preview has-intent">
            <div class="intent-preview-label">Intent</div>
            <div class="intent-preview-text">${escapeHtml(intentPreview)}</div>
          </div>
        ` : `
          <div class="snapshot-intent-preview">
            <div class="intent-preview-label">No Intent</div>
          </div>
        `}
        
        <div class="snapshot-meta">
          <span class="meta-badge type">${metadata.artifact_type || 'unknown'}</span>
          <span class="meta-badge">${formatDateCompact(metadata.timestamp)}</span>
          <span class="meta-badge">${elements.length} elements</span>
          ${acceptedCount > 0 ? `<span class="meta-badge preference-accepted">${acceptedCount} accepted</span>` : ''}
          ${rejectedCount > 0 ? `<span class="meta-badge preference-rejected">${rejectedCount} rejected</span>` : ''}
        </div>
        
        <div class="snapshot-content">
          ${hasIntent ? `
            <div class="intent-section intent-section-full">
              ${intent.user_intent ? `
                <div style="margin-bottom: ${intent.inferred_intent || intent.change_summary ? '16px' : '0'};">
                  <div class="intent-label">User Intent</div>
                  <div class="intent-text">${escapeHtml(intent.user_intent)}</div>
                </div>
              ` : ''}
              ${intent.inferred_intent ? `
                <div class="intent-inferred">
                  <div class="intent-label">Inferred Intent</div>
                  ${typeof intent.inferred_intent === 'object' ? `
                    <div class="intent-inferred-item">Action: ${intent.inferred_intent.action_type || 'N/A'}</div>
                    <div class="intent-inferred-item">Focus: ${intent.inferred_intent.focus_area || 'N/A'}</div>
                    ${intent.inferred_intent.confidence ? `<div class="intent-inferred-item">Confidence: ${intent.inferred_intent.confidence}</div>` : ''}
                  ` : `<div class="intent-text">${JSON.stringify(intent.inferred_intent)}</div>`}
                </div>
              ` : ''}
              ${intent.change_summary ? `
                <div class="intent-inferred" style="margin-top: 16px;">
                  <div class="intent-label">Change Summary</div>
                  <div class="intent-text">${escapeHtml(intent.change_summary)}</div>
                </div>
              ` : ''}
            </div>
          ` : ''}
          
          ${preferences.length > 0 ? `
            <div class="preference-section">
              <div class="intent-label">Preferences</div>
              <div class="preference-stats">
                <div class="preference-stat">
                  <div class="preference-stat-label">Total</div>
                  <div class="preference-stat-value">${preferences.length}</div>
                </div>
                ${acceptedCount > 0 ? `
                  <div class="preference-stat">
                    <div class="preference-stat-label">Accepted</div>
                    <div class="preference-stat-value">${acceptedCount}</div>
                  </div>
                ` : ''}
                ${rejectedCount > 0 ? `
                  <div class="preference-stat">
                    <div class="preference-stat-label">Rejected</div>
                    <div class="preference-stat-value rejected">${rejectedCount}</div>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}
          
          <div class="snapshot-preview">
            <div class="json-viewer">${formatJsonPreview(snapshot)}</div>
          </div>
        </div>
        
        <div class="snapshot-footer">
          <div class="snapshot-stats-inline">
            ${preferences.length > 0 ? `<span>${preferences.length} preferences</span>` : ''}
          </div>
          <div class="snapshot-actions">
            <button class="btn btn-primary" data-snapshot-id="${escapeHtml(metadata.snapshot_id)}" data-action="view-details">View Details</button>
            <button class="btn" data-snapshot-id="${escapeHtml(metadata.snapshot_id)}" data-action="copy-id">Copy ID</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function formatJsonPreview(obj) {
  try {
    const str = JSON.stringify(obj, null, 2);
    // Escape HTML first, then apply syntax highlighting
    const escaped = escapeHtml(str);
    return escaped
      .replace(/(".*?")\s*:/g, '<span class="json-key">$1</span>:')
      .replace(/:\s*(".*?")/g, ': <span class="json-string">$1</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
  } catch (e) {
    return '<span class="json-error">Error formatting JSON</span>';
  }
}

function showSnapshotDetails(snapshotId) {
  const snapshot = allSnapshots.find(s => s.metadata?.snapshot_id === snapshotId);
  if (!snapshot) {
    alert('Snapshot not found');
    return;
  }

  const preferences = allPreferences.filter(p => p.snapshot_id === snapshotId);
  const modal = document.getElementById('snapshot-modal');
  const modalBody = document.getElementById('snapshot-modal-body');
  
  // Extract screenshot image
  const images = snapshot.rendering_manifest?.assets?.images || [];
  const screenshotImage = images.length > 0 ? images[0] : null;

  // Build modal content
  let content = '';
  
  // Screenshot section (if available)
  if (screenshotImage) {
    content += `
      <div class="modal-section modal-screenshot-section">
        <h3>Screenshot</h3>
        <div class="modal-screenshot">
          <img src="${screenshotImage.url}" 
               alt="Screenshot of ${escapeHtml(snapshot.metadata?.artifact_id ? snapshot.metadata.artifact_id.split('/').pop() : 'component')}" />
        </div>
        ${screenshotImage.dimensions ? `
          <p class="screenshot-dimensions">${screenshotImage.dimensions.width} × ${screenshotImage.dimensions.height}px</p>
        ` : ''}
      </div>
    `;
  }
  
  content += `
    <div class="modal-section">
      <h3>Snapshot Information</h3>
      <p><strong>ID:</strong> ${escapeHtml(snapshotId)}</p>
      <p><strong>Artifact:</strong> ${escapeHtml(snapshot.metadata?.artifact_id || 'N/A')}</p>
      <p><strong>Timestamp:</strong> ${escapeHtml(formatDate(snapshot.metadata?.timestamp))}</p>
      <p><strong>Artifact Type:</strong> ${escapeHtml(snapshot.metadata?.artifact_type || 'N/A')}</p>
    </div>
  `;

  if (snapshot.observations?.intent) {
    content += `
      <div class="modal-section">
        <h3>Intent Data</h3>
        <pre>${escapeHtml(JSON.stringify(snapshot.observations.intent, null, 2))}</pre>
      </div>
    `;
  }

  if (preferences.length > 0) {
    content += `
      <div class="modal-section">
        <h3>Preferences (${preferences.length})</h3>
        ${preferences.map(p => `
          <div class="modal-preference-item">
            <strong>Action:</strong> ${escapeHtml(p.user_action?.type || 'N/A')}<br>
            <strong>Rule ID:</strong> ${escapeHtml(p.user_action?.rule_id || 'N/A')}<br>
            ${p.user_action?.action_taken ? `<strong>Action Taken:</strong> ${escapeHtml(p.user_action.action_taken)}<br>` : ''}
            <strong>Timestamp:</strong> ${escapeHtml(formatDate(p.timestamp))}
          </div>
        `).join('')}
      </div>
    `;
  }

  content += `
    <div class="modal-section">
      <h3>Full Snapshot Data</h3>
      <pre>${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre>
    </div>
  `;

  modalBody.innerHTML = content;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeSnapshotModal() {
  const modal = document.getElementById('snapshot-modal');
  modal.style.display = 'none';
  document.body.style.overflow = ''; // Restore scrolling
}

// Close modal on Escape key
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    const modal = document.getElementById('snapshot-modal');
    if (modal.style.display === 'flex') {
      closeSnapshotModal();
    }
  }
});

function copySnapshotId(snapshotId, buttonElement) {
  navigator.clipboard.writeText(snapshotId).then(() => {
    // Simple notification without alert
    const btn = buttonElement || event?.target;
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1000);
    }
  }).catch(() => {
    alert('Failed to copy snapshot ID');
  });
}

// Event delegation for snapshot card clicks
document.addEventListener('click', function(event) {
  // Handle snapshot card click
  const snapshotCard = event.target.closest('.snapshot-card');
  if (snapshotCard && !event.target.closest('.snapshot-actions')) {
    const snapshotId = snapshotCard.getAttribute('data-snapshot-id');
    if (snapshotId) {
      showSnapshotDetails(snapshotId);
    }
  }

  // Handle button clicks
  const button = event.target.closest('[data-action]');
  if (button) {
    const action = button.getAttribute('data-action');
    const snapshotId = button.getAttribute('data-snapshot-id');
    
    if (action === 'view-details' && snapshotId) {
      event.stopPropagation();
      showSnapshotDetails(snapshotId);
    } else if (action === 'copy-id' && snapshotId) {
      event.stopPropagation();
      copySnapshotId(snapshotId, button);
    }
  }
});

// Setup filter event listeners
function setupFilters() {
  const artifactIdInput = document.getElementById('filter-artifact-id');
  const artifactTypeInput = document.getElementById('filter-artifact-type');
  const hasIntentSelect = document.getElementById('filter-has-intent');
  const hasPreferencesSelect = document.getElementById('filter-has-preferences');
  const limitInput = document.getElementById('filter-limit');

  // Debounce function to avoid too many API calls
  let debounceTimer;
  function debounceLoadData() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadData();
    }, 300);
  }

  // Add event listeners for text inputs (with debounce)
  artifactIdInput.addEventListener('input', debounceLoadData);
  artifactTypeInput.addEventListener('input', debounceLoadData);
  limitInput.addEventListener('input', debounceLoadData);

  // Add event listeners for selects (immediate)
  hasIntentSelect.addEventListener('change', loadData);
  hasPreferencesSelect.addEventListener('change', loadData);

  // Allow Enter key to trigger refresh on text inputs
  artifactIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadData();
    }
  });
  artifactTypeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadData();
    }
  });
  limitInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadData();
    }
  });
}

// Load data on page load
loadData();
setupFilters();

// Auto-refresh every 30 seconds
setInterval(loadData, 30000);

