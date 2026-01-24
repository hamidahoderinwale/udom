function showSection(event, sectionId) {
    event.preventDefault();

    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    // Remove active from ALL nav items (including any duplicates)
    document.querySelectorAll('.nav-item, .nav-subitem').forEach(item => {
        item.classList.remove('active');
    });

    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (!targetSection) {
        console.error(`Section "${sectionId}" not found`);
        return;
    }
    targetSection.classList.add('active');

    // Mark clicked nav item as active - ensure only one
    const clickedLink = event.target.closest('a');
    if (clickedLink) {
        // Remove active from any other links that might point to same section
        document.querySelectorAll(`a[onclick*="${sectionId}"]`).forEach(link => {
            link.classList.remove('active');
        });
        
        // Mark only the clicked link as active
        clickedLink.classList.add('active');
        
        // If subitem clicked, also activate parent nav-item
        if (clickedLink.classList.contains('nav-subitem')) {
            const section = clickedLink.closest('.nav-section');
            const mainNavItem = section?.querySelector(`.nav-item[onclick*="${sectionId}"]`);
            if (mainNavItem && mainNavItem !== clickedLink) {
                mainNavItem.classList.add('active');
            }
        }
    }

    // Scroll to top
    window.scrollTo({top: 0, behavior: 'smooth'});
}

function filterArtifacts(category, event) {
    // Fix: Use class selector instead of ID since tables use class
    const tables = document.querySelectorAll('.artifact-types-table');
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Mark clicked button as active
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: find button by category
        const buttons = document.querySelectorAll('.filter-btn');
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${category}'`)) {
                btn.classList.add('active');
            }
        });
    }

    // Filter each table's rows
    tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');
        const tableCategory = table.dataset.category;
        const tableWorkspace = table.dataset.workspace === 'true';

        rows.forEach(row => {
            let show = false;

            if (category === 'all') {
                show = true;
            } else if (category === 'visual') {
                show = tableCategory === 'visual';
            } else if (category === 'code') {
                show = tableCategory === 'code';
            } else if (category === 'text') {
                show = tableCategory === 'text';
            } else if (category === 'workspace') {
                show = tableWorkspace;
            }

            row.style.display = show ? '' : 'none';
        });

        // Hide/show entire table if no rows visible
        const visibleRows = Array.from(table.querySelectorAll('tbody tr')).filter(r => r.style.display !== 'none');
        if (category !== 'all' && visibleRows.length === 0) {
            table.closest('h3')?.nextElementSibling?.style.setProperty('display', 'none', 'important');
        } else {
            table.closest('h3')?.nextElementSibling?.style.removeProperty('display');
        }
    });
}

// Interactive Hierarchy Functions
function toggleNode(header) {
    const node = header.closest('.tree-node');
    if (node) {
        node.classList.toggle('expanded');
    }
}

function expandAllHierarchy() {
    document.querySelectorAll('#hierarchy-tree .tree-node[data-expandable="true"]').forEach(node => {
        node.classList.add('expanded');
    });
}

function collapseAllHierarchy() {
    document.querySelectorAll('#hierarchy-tree .tree-node.expanded').forEach(node => {
        node.classList.remove('expanded');
    });
}

function filterHierarchyByType(artifactType) {
    const tree = document.getElementById('hierarchy-tree');
    if (tree) {
        tree.setAttribute('data-artifact-type', artifactType);
    }
}

let currentTooltipElement = null;

// Initialize tooltip toggle handlers
document.addEventListener('DOMContentLoaded', function() {
    const tooltip = document.getElementById('hierarchy-tooltip');
    
    // Handle click on toggle buttons
    document.querySelectorAll('.tree-toggle-info').forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent node toggle
            
            const element = button.closest('[data-examples]') || button.closest('[data-field]');
            const examplesData = element?.getAttribute('data-examples');
            const fieldName = element?.getAttribute('data-field') || 
                            button.closest('.tree-node-header')?.querySelector('.tree-key')?.textContent ||
                            button.closest('.tree-leaf')?.getAttribute('data-field');
            
            if (!examplesData && !fieldName) return;
            
            // If clicking the same button, toggle off
            if (currentTooltipElement === button && tooltip?.classList.contains('visible')) {
                hideTooltip();
                return;
            }
            
            currentTooltipElement = button;
            
            const currentType = document.getElementById('artifact-type-filter')?.value || 'all';
            let examples = {};
            if (examplesData) {
                try {
                    examples = JSON.parse(examplesData);
                } catch (err) {
                    console.error('Error parsing examples:', err);
                }
            }
            
            // Get example for current artifact type, fallback to 'all'
            const example = examples[currentType] || examples['all'] || 
                           (fieldName ? `Field: ${fieldName}` : 'No example available');
            
            // Format the example
            let formattedExample = example;
            try {
                // Try to parse and pretty-print JSON if it's a JSON string
                if (typeof example === 'string' && (example.startsWith('{') || example.startsWith('[') || example.startsWith('"'))) {
                    const parsed = JSON.parse(example);
                    formattedExample = JSON.stringify(parsed, null, 2);
                }
            } catch (err) {
                // If not JSON, use as-is (could be plain text explanation)
                formattedExample = example;
            }
            
            // Show tooltip
            const tooltipFieldName = document.getElementById('tooltip-field-name');
            const tooltipExample = document.getElementById('tooltip-example');
            
            if (tooltipFieldName) tooltipFieldName.textContent = fieldName || 'Field Information';
            if (tooltipExample) {
                // Check if it's JSON (starts with { or [) or plain text
                if (typeof formattedExample === 'string' && (formattedExample.startsWith('{') || formattedExample.startsWith('['))) {
                    tooltipExample.innerHTML = '<pre>' + formattedExample + '</pre>';
                } else {
                    tooltipExample.innerHTML = '<p>' + formattedExample + '</p>';
                }
            }
            
            if (tooltip) {
                tooltip.classList.add('visible');
                // Position tooltip near the button
                const rect = button.getBoundingClientRect();
                positionTooltipNearElement(rect, tooltip);
                // Mark button as active
                button.classList.add('active');
            }
        });
    });
    
    // Close tooltip when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.tree-toggle-info') && !e.target.closest('.hierarchy-tooltip')) {
            hideTooltip();
        }
    });
});

function positionTooltipNearElement(elementRect, tooltip) {
    if (!tooltip) return;
    
    const padding = 10;
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Position to the right of the element, or left if not enough space
    let left = elementRect.right + padding;
    let top = elementRect.top;
    
    // Adjust if tooltip goes off right edge
    if (left + tooltipRect.width > viewportWidth) {
        left = elementRect.left - tooltipRect.width - padding;
    }
    
    // Adjust if tooltip goes off bottom edge
    if (top + tooltipRect.height > viewportHeight) {
        top = viewportHeight - tooltipRect.height - padding;
    }
    
    // Ensure tooltip stays within viewport
    left = Math.max(padding, Math.min(left, viewportWidth - tooltipRect.width - padding));
    top = Math.max(padding, Math.min(top, viewportHeight - tooltipRect.height - padding));
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

function positionTooltip(event, tooltip) {
    if (!tooltip) return;
    
    const padding = 10;
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = event.clientX + padding;
    let top = event.clientY + padding;
    
    // Adjust if tooltip goes off right edge
    if (left + tooltipRect.width > viewportWidth) {
        left = event.clientX - tooltipRect.width - padding;
    }
    
    // Adjust if tooltip goes off bottom edge
    if (top + tooltipRect.height > viewportHeight) {
        top = event.clientY - tooltipRect.height - padding;
    }
    
    // Ensure tooltip stays within viewport
    left = Math.max(padding, Math.min(left, viewportWidth - tooltipRect.width - padding));
    top = Math.max(padding, Math.min(top, viewportHeight - tooltipRect.height - padding));
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('hierarchy-tooltip');
    if (tooltip) {
        tooltip.classList.remove('visible');
    }
    // Remove active class from button
    if (currentTooltipElement) {
        currentTooltipElement.classList.remove('active');
    }
    currentTooltipElement = null;
}

// Generic tab switching function for all tabbed sections
function switchTab(event, sectionId, tabName) {
    event.preventDefault();
    
    // Get the parent tab container
    const tabContainer = event.target.closest('.tab-container');
    if (!tabContainer) return;
    
    // Remove active class from all tabs and content within this container
    tabContainer.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    tabContainer.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Activate clicked tab
    event.target.classList.add('active');
    
    // Show corresponding content
    const contentId = `${sectionId}-tab-${tabName}`;
    const content = document.getElementById(contentId);
    if (content) {
        content.classList.add('active');
    }
}

// Backwards compatibility for examples page
function switchExampleTab(event, tabName) {
    switchTab(event, 'example', tabName);
}

// Modal Functions
function openPluginModal() {
    const modal = document.getElementById('plugin-modal');
    if (modal) {
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
}

function closePluginModal() {
    const modal = document.getElementById('plugin-modal');
    if (modal) {
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('plugin-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closePluginModal();
            }
        });
    }
    
    // Close on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closePluginModal();
        }
    });
    
    // Add anchor links to all headings
    addAnchorLinks();
    
    // Add copy buttons to code blocks
    addCopyButtons();
    
    // Initialize back to top button
    initBackToTop();
    
    // Initialize syntax highlighting
    initSyntaxHighlighting();
    
    // Initialize search functionality
    initSearch();
    
    // Lazy load sections for performance
    initLazyLoading();
    
    // Initialize interactive code tooltips
    initCodeTooltips();
});

// Add anchor links to headings
function addAnchorLinks() {
    const headings = document.querySelectorAll('h1, h2, h3');
    headings.forEach(heading => {
        if (!heading.id) {
            const id = heading.textContent.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
            heading.id = id;
        }
        
        const anchor = document.createElement('a');
        anchor.href = `#${heading.id}`;
        anchor.className = 'heading-anchor';
        anchor.setAttribute('aria-label', `Link to ${heading.textContent}`);
        anchor.innerHTML = '#';
        anchor.style.opacity = '0';
        anchor.style.marginLeft = '8px';
        anchor.style.textDecoration = 'none';
        anchor.style.transition = 'opacity 0.2s';
        
        heading.style.position = 'relative';
        heading.appendChild(anchor);
        
        heading.addEventListener('mouseenter', () => {
            anchor.style.opacity = '0.6';
        });
        heading.addEventListener('mouseleave', () => {
            anchor.style.opacity = '0';
        });
    });
}

// Add copy buttons to code blocks
function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('pre');
    codeBlocks.forEach(block => {
        const button = document.createElement('button');
        button.className = 'copy-code-btn';
        button.setAttribute('aria-label', 'Copy code to clipboard');
        button.innerHTML = '📋';
        button.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            background: #8a7a6a;
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 6px 10px;
            cursor: pointer;
            font-size: 14px;
            opacity: 0.7;
            transition: opacity 0.2s;
        `;
        
        const parent = block.parentElement;
        if (parent && parent.classList.contains('example-box')) {
            parent.style.position = 'relative';
            parent.appendChild(button);
            
            button.addEventListener('mouseenter', () => {
                button.style.opacity = '1';
            });
            button.addEventListener('mouseleave', () => {
                button.style.opacity = '0.7';
            });
            
            button.addEventListener('click', async () => {
                const text = block.textContent || '';
                try {
                    await navigator.clipboard.writeText(text);
                    button.innerHTML = '✓';
                    setTimeout(() => {
                        button.innerHTML = '📋';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });
        }
    });
}

// Back to top button
function initBackToTop() {
    const button = document.createElement('button');
    button.id = 'back-to-top';
    button.setAttribute('aria-label', 'Back to top');
    button.innerHTML = '↑';
    button.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 32px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #8a7a6a;
        color: #fff;
        border: none;
        font-size: 20px;
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s;
        z-index: 999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(button);
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            button.style.opacity = '1';
            button.style.pointerEvents = 'auto';
        } else {
            button.style.opacity = '0';
            button.style.pointerEvents = 'none';
        }
    });
    
    button.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// Syntax highlighting
function initSyntaxHighlighting() {
    if (typeof hljs !== 'undefined') {
        document.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
        
        // Also highlight standalone pre blocks
        document.querySelectorAll('pre:not(:has(code))').forEach((block) => {
            const code = document.createElement('code');
            code.className = 'language-json';
            code.textContent = block.textContent;
            block.textContent = '';
            block.appendChild(code);
            hljs.highlightElement(code);
        });
    }
}

// Search functionality
function initSearch() {
    const searchContainer = document.createElement('div');
    searchContainer.id = 'search-container';
    searchContainer.style.cssText = `
        position: fixed;
        top: 16px;
        right: 24px;
        z-index: 1000;
        width: 220px;
    `;
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'search-input';
    searchInput.placeholder = 'Search documentation...';
    searchInput.setAttribute('aria-label', 'Search documentation');
    searchInput.style.cssText = `
        width: 100%;
        padding: 10px 16px;
        border: 2px solid #e0d5c7;
        border-radius: 6px;
        font-size: 14px;
        background: #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
    
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'search-results';
    resultsContainer.style.cssText = `
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: #fff;
        border: 2px solid #e0d5c7;
        border-top: none;
        border-radius: 0 0 6px 6px;
        max-height: 400px;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        margin-top: 2px;
    `;
    
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(resultsContainer);
    document.body.appendChild(searchContainer);
    
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim().toLowerCase();
        
        if (query.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }
        
        searchTimeout = setTimeout(() => {
            performSearch(query, resultsContainer);
        }, 200);
    });
    
    // Close results on outside click
    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target)) {
            resultsContainer.style.display = 'none';
        }
    });
}

function performSearch(query, resultsContainer) {
    const results = [];
    const sections = document.querySelectorAll('.section');
    const headings = document.querySelectorAll('h1, h2, h3, h4');
    
    headings.forEach(heading => {
        const text = heading.textContent.toLowerCase();
        const section = heading.closest('.section');
        if (!section) return;
        
        const sectionId = section.id;
        const sectionTitle = section.querySelector('h1')?.textContent || sectionId;
        
        if (text.includes(query)) {
            results.push({
                title: heading.textContent,
                section: sectionTitle,
                sectionId: sectionId,
                element: heading,
                type: heading.tagName.toLowerCase()
            });
        }
    });
    
    // Also search in content
    sections.forEach(section => {
        const text = section.textContent.toLowerCase();
        const sectionId = section.id;
        const sectionTitle = section.querySelector('h1')?.textContent || sectionId;
        
        if (text.includes(query) && !results.find(r => r.sectionId === sectionId)) {
            results.push({
                title: sectionTitle,
                section: sectionTitle,
                sectionId: sectionId,
                element: section.querySelector('h1') || section,
                type: 'section'
            });
        }
    });
    
    displaySearchResults(results, resultsContainer, query);
}

function displaySearchResults(results, container, query) {
    if (results.length === 0) {
        container.innerHTML = '<div style="padding: 16px; color: #8a7a6a;">No results found</div>';
        container.style.display = 'block';
        return;
    }
    
    const html = results.slice(0, 10).map(result => {
        const highlight = result.title.replace(
            new RegExp(`(${query})`, 'gi'),
            '<mark>$1</mark>'
        );
        
        return `
            <div class="search-result-item" 
                 onclick="showSection(event, '${result.sectionId}'); document.getElementById('search-results').style.display='none'; document.getElementById('search-input').value='';"
                 style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0ebe5; transition: background 0.2s;"
                 onmouseover="this.style.background='#f8f6f3'"
                 onmouseout="this.style.background='#fff'">
                <div style="font-weight: 600; color: #2b2b2b; margin-bottom: 4px;">${highlight}</div>
                <div style="font-size: 12px; color: #8a7a6a;">${result.section}</div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
    container.style.display = 'block';
}

// Lazy loading for sections
function initLazyLoading() {
    const sections = document.querySelectorAll('.section:not(.active)');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Section is now visible, could load additional content if needed
                // For now, we just mark it as loaded
                entry.target.setAttribute('data-loaded', 'true');
            }
        });
    }, {
        rootMargin: '50px'
    });
    
    sections.forEach(section => {
        observer.observe(section);
    });
}

// Interactive code tooltips
function initCodeTooltips() {
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'code-field-tooltip';
    tooltip.id = 'code-field-tooltip';
    document.body.appendChild(tooltip);
    
    // Define tooltip content for common fields
    const tooltipData = {
        'artifact_type': {
            title: 'artifact_type',
            content: 'Root discriminator that determines schema extensions. Values: "figma_component", "react_component", "html_element", etc. Controls which properties are available in elements[].properties.'
        },
        'stable_id': {
            title: 'stable_id',
            content: 'Content-addressable identifier derived from element properties. Same content = same stable_id across platforms, enabling cross-artifact linking.'
        },
        'semantic_type': {
            title: 'semantic_type',
            content: 'Universal category transcending tool-specific types (e.g., "button", "input", "card"). Enables cross-platform queries.'
        },
        'schema_version': {
            title: 'schema_version',
            content: 'Systematic uDOM schema version (e.g., "1.0.0") that all adapters conform to. Different from extractor_version which tracks adapter code versions.'
        },
        'extractor_version': {
            title: 'extractor_version',
            content: 'Adapter-specific code version (e.g., "figma-adapter-v1.0.0"). Tracks the version of the extraction adapter, not the uDOM schema.'
        },
        'composition_rules': {
            title: 'composition_rules',
            content: 'Design system patterns: spacing rules, visual hierarchy, constraints (touch targets, line length), and nesting strategies. Optional field for design system extraction.'
        },
        'rendering_manifest': {
            title: 'rendering_manifest',
            content: 'Optional blueprint for visual reconstruction: viewport, render layers (z-index, blend modes), asset references, and quality settings. Only for visual artifacts.'
        },
        'observations': {
            title: 'observations{}',
            content: 'Provenance and context tracking: who, when, how, and why this snapshot was created. Includes provenance, optional intent, and capture_context.'
        }
    };
    
    // Find all code blocks and add hoverable fields
    document.querySelectorAll('pre code, pre').forEach(codeBlock => {
        const text = codeBlock.textContent || codeBlock.innerText;
        
        Object.keys(tooltipData).forEach(field => {
            // Look for field references in the code
            const regex = new RegExp(`"${field}"|'${field}'|${field}`, 'g');
            if (regex.test(text)) {
                // Wrap field names with hoverable spans
                if (codeBlock.innerHTML) {
                    codeBlock.innerHTML = codeBlock.innerHTML.replace(
                        new RegExp(`("${field}"|'${field}'|\\b${field}\\b)`, 'g'),
                        `<span class="code-field-hoverable" data-field="${field}">$1</span>`
                    );
                }
            }
        });
    });
    
    // Add hover listeners
    document.querySelectorAll('.code-field-hoverable').forEach(element => {
        const field = element.getAttribute('data-field');
        const data = tooltipData[field];
        
        if (!data) return;
        
        element.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = `
                <div class="code-field-tooltip-title">${data.title}</div>
                <div class="code-field-tooltip-content">${data.content}</div>
            `;
            tooltip.classList.add('visible');
            positionCodeTooltip(e, tooltip);
        });
        
        element.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });
        
        element.addEventListener('mousemove', (e) => {
            if (tooltip.classList.contains('visible')) {
                positionCodeTooltip(e, tooltip);
            }
        });
    });
}

function positionCodeTooltip(event, tooltip) {
    const padding = 10;
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = event.clientX + padding;
    let top = event.clientY + padding;
    
    // Adjust if tooltip goes off right edge
    if (left + tooltipRect.width > viewportWidth) {
        left = event.clientX - tooltipRect.width - padding;
    }
    
    // Adjust if tooltip goes off bottom edge
    if (top + tooltipRect.height > viewportHeight) {
        top = event.clientY - tooltipRect.height - padding;
    }
    
    // Ensure tooltip stays within viewport
    left = Math.max(padding, Math.min(left, viewportWidth - tooltipRect.width - padding));
    top = Math.max(padding, Math.min(top, viewportHeight - tooltipRect.height - padding));
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

// Sample Data Browser Functions
let sampleDataApiUrl = 'http://localhost:3000';

function setupSampleDataBrowser() {
    const loadBtn = document.getElementById('load-sample-data');
    const clearBtn = document.getElementById('clear-results');
    const filterSelect = document.getElementById('filter-artifact-type');
    
    if (loadBtn) {
        loadBtn.addEventListener('click', loadSampleData);
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', clearSampleDataResults);
    }
    
    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            const filterValue = filterSelect.value;
            loadSampleData(filterValue);
        });
    }
}

async function loadSampleData(artifactType = '') {
    const statusEl = document.getElementById('sample-data-status');
    const resultsEl = document.getElementById('sample-data-results');
    
    if (!statusEl || !resultsEl) return;
    
    // Show loading status
    statusEl.className = 'status-message info';
    statusEl.textContent = 'Loading sample data...';
    resultsEl.innerHTML = '';
    
    try {
        // Build query URL
        let url = `${sampleDataApiUrl}/snapshots`;
        const params = new URLSearchParams();
        if (artifactType) {
            params.append('artifact_type', artifactType);
        }
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        const snapshots = await response.json();
        
        if (snapshots.length === 0) {
            statusEl.className = 'status-message info';
            statusEl.textContent = 'No snapshots found. Make sure sample data is populated (run: node udom-server/populate-sample-data.js)';
            resultsEl.innerHTML = '<div class="empty-state"><p>No data available</p></div>';
            return;
        }
        
        // Display results
        statusEl.className = 'status-message success';
        statusEl.textContent = `Loaded ${snapshots.length} snapshot(s)`;
        
        resultsEl.innerHTML = snapshots.map(snapshot => renderSnapshot(snapshot)).join('');
        
    } catch (error) {
        console.error('Error loading sample data:', error);
        statusEl.className = 'status-message error';
        statusEl.textContent = `Error: ${error.message}. Make sure the server is running (npm start in udom-server/)`;
        resultsEl.innerHTML = '<div class="empty-state"><p>Unable to connect to server</p></div>';
    }
}

function renderSnapshot(snapshot) {
    const metadata = snapshot.metadata || {};
    const elements = snapshot.elements || [];
    const relations = snapshot.relations || [];
    
    const timestamp = metadata.timestamp ? new Date(metadata.timestamp).toLocaleString() : 'N/A';
    const artifactType = metadata.artifact_type || 'unknown';
    const artifactId = metadata.artifact_id || metadata.snapshot_id || 'unknown';
    
    const elementsPreview = elements.length > 2 ? elements.slice(0, 2) : elements;
    const elementsJson = JSON.stringify(elementsPreview, null, 2);
    const hasMoreElements = elements.length > 2;
    
    return `
        <div class="snapshot-card" data-snapshot-id="${metadata.snapshot_id || ''}">
            <div class="snapshot-header">
                <div>
                    <div class="snapshot-id">${metadata.snapshot_id || 'N/A'}</div>
                    <div class="snapshot-meta">
                        <div class="meta-item">
                            <div class="meta-label">Artifact Type</div>
                            <div class="meta-value">${artifactType}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">Artifact ID</div>
                            <div class="meta-value">${artifactId}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">Timestamp</div>
                            <div class="meta-value">${timestamp}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">Elements</div>
                            <div class="meta-value">${elements.length}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">Relations</div>
                            <div class="meta-value">${relations.length}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="snapshot-details">
                <div class="details-section">
                    <h4>Elements (${elements.length})</h4>
                    <div class="details-content" id="elements-${metadata.snapshot_id}">
                        <pre>${elementsJson}${hasMoreElements ? '\n... (' + (elements.length - 2) + ' more)' : ''}</pre>
                    </div>
                    ${hasMoreElements ? `<button class="toggle-details" onclick="toggleFullElements('elements-${metadata.snapshot_id}', ${JSON.stringify(elements).replace(/"/g, '&quot;')})">Show all ${elements.length} elements</button>` : ''}
                </div>
                ${relations.length > 0 ? `
                <div class="details-section">
                    <h4>Relations (${relations.length})</h4>
                    <div class="details-content">
                        <pre>${JSON.stringify(relations, null, 2)}</pre>
                    </div>
                </div>
                ` : ''}
                <div class="details-section">
                    <h4>Full JSON</h4>
                    <div class="details-content">
                        <pre>${JSON.stringify(snapshot, null, 2)}</pre>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function toggleFullElements(elementId, elementsJson) {
    const element = document.getElementById(elementId);
    const button = element.nextElementSibling;
    
    if (!element || !button) return;
    
    try {
        const elements = JSON.parse(elementsJson.replace(/&quot;/g, '"'));
        
        if (element.dataset.expanded === 'true') {
            // Collapse
            const preview = elements.slice(0, 2);
            element.innerHTML = `<pre>${JSON.stringify(preview, null, 2)}\n... (${elements.length - 2} more)</pre>`;
            button.textContent = `Show all ${elements.length} elements`;
            element.dataset.expanded = 'false';
        } else {
            // Expand
            element.innerHTML = `<pre>${JSON.stringify(elements, null, 2)}</pre>`;
            button.textContent = 'Show less';
            element.dataset.expanded = 'true';
        }
    } catch (e) {
        console.error('Error toggling elements:', e);
    }
}

function clearSampleDataResults() {
    const statusEl = document.getElementById('sample-data-status');
    const resultsEl = document.getElementById('sample-data-results');
    const filterSelect = document.getElementById('filter-artifact-type');
    
    if (statusEl) {
        statusEl.className = 'status-message';
        statusEl.textContent = '';
    }
    
    if (resultsEl) {
        resultsEl.innerHTML = '';
    }
    
    if (filterSelect) {
        filterSelect.value = '';
    }
}

// Initialize sample data browser on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSampleDataBrowser);
} else {
    setupSampleDataBrowser();
}

// Mobile sidebar toggle functionality
document.addEventListener('DOMContentLoaded', function() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebar.classList.toggle('active');
            sidebarToggle.classList.toggle('active');
        });
        
        // Close sidebar when clicking outside
        if (mainContent) {
            mainContent.addEventListener('click', function() {
                if (sidebar.classList.contains('active')) {
                    sidebar.classList.remove('active');
                    sidebarToggle.classList.remove('active');
                }
            });
        }
        
        // Close sidebar when clicking a nav item on mobile
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', function() {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                    sidebarToggle.classList.remove('active');
                }
            });
        });
    }
});
