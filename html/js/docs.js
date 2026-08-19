/* html/js/docs.js */

document.addEventListener('DOMContentLoaded', () => {
    // Lookup table mapping tab ID keys to Markdown files
    const tabToMdMap = {
        'tab-overview': 'docs/overview.md',
        'tab-shredding': 'docs/shredding.md',
        'tab-smart': 'docs/smart.md',
        'tab-partition': 'docs/partition.md',
        'tab-speed': 'docs/speed.md'
    };

    // Promises cache to prevent duplicate fetches
    const tabPromises = {};

    // 1. Tab Switching Logic
    const navItems = document.querySelectorAll('.docs-nav-item');
    const tabContents = document.querySelectorAll('.docs-tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');

            // Deactivate all nav items and hide all tab content blocks
            navItems.forEach(nav => nav.classList.remove('active'));
            tabContents.forEach(content => {
                content.classList.remove('active');
                // Ensure display overrides from search are cleared when switching normally
                content.style.display = '';
            });

            // Activate chosen items
            item.classList.add('active');
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
                loadTabContent(targetTab);
            }
        });
    });

    // 2a. Initialize Accordions
    function initializeAccordions(container) {
        const accordionTitles = container.querySelectorAll('.accordion-title');
        accordionTitles.forEach(title => {
            if (!title.dataset.bound) {
                title.dataset.bound = 'true';
                title.addEventListener('click', () => {
                    const panel = title.nextElementSibling;
                    title.classList.toggle('active');
                    if (panel) {
                        panel.classList.toggle('active');
                    }
                });
            }
        });
    }

    // 2b. Initialize Sub-Tabs (Nested Tabs)
    function initializeSubTabs(container) {
        const subTabButtons = container.querySelectorAll('.docs-sub-tab');
        const subTabContents = container.querySelectorAll('.docs-subtab-content');

        subTabButtons.forEach(btn => {
            if (!btn.dataset.bound) {
                btn.dataset.bound = 'true';
                btn.addEventListener('click', () => {
                    const targetSubtab = btn.getAttribute('data-subtab');

                    subTabButtons.forEach(b => b.classList.remove('active'));
                    subTabContents.forEach(c => c.classList.remove('active'));

                    btn.classList.add('active');
                    const targetContent = container.querySelector(`#${targetSubtab}`);
                    if (targetContent) {
                        targetContent.classList.add('active');
                    }
                });
            }
        });
    }

    // 3. Load Tab Content from Markdown
    function loadTabContent(tabId) {
        if (tabPromises[tabId]) {
            return tabPromises[tabId];
        }

        const targetContent = document.getElementById(tabId);
        if (!targetContent) {
            tabPromises[tabId] = Promise.resolve();
            return tabPromises[tabId];
        }

        // Special handling for nested sub-tabs under Disk Shredding
        if (tabId === 'tab-shredding') {
            const standardFile = window.currentLanguage === 'fr' ? 'docs/fr/shredding.md' : 'docs/shredding.md';
            const nvmeFile = window.currentLanguage === 'fr' ? 'docs/fr/nvme.md' : 'docs/nvme.md';

            tabPromises[tabId] = Promise.all([
                fetch(standardFile).then(r => {
                    if (!r.ok) throw new Error(`Failed to fetch standard: ${r.statusText}`);
                    return r.text();
                }),
                fetch(nvmeFile).then(r => {
                    if (!r.ok) throw new Error(`Failed to fetch NVMe: ${r.statusText}`);
                    return r.text();
                })
            ]).then(([standardMarkdown, nvmeMarkdown]) => {
                const standardHtml = parseMarkdownToHTML(standardMarkdown);
                const nvmeHtml = parseMarkdownToHTML(nvmeMarkdown);

                const standardContainer = targetContent.querySelector('#shredding-standard');
                const nvmeContainer = targetContent.querySelector('#shredding-nvme');

                if (standardContainer) standardContainer.innerHTML = standardHtml;
                if (nvmeContainer) nvmeContainer.innerHTML = nvmeHtml;

                initializeAccordions(targetContent);
                initializeSubTabs(targetContent);
            }).catch(err => {
                console.error(err);
                targetContent.innerHTML = `<p style="color: var(--accent-red); padding: 15px;">Error loading documentation: ${err.message}</p>`;
            });

            return tabPromises[tabId];
        }

        const filePath = tabToMdMap[tabId];
        if (!filePath) {
            tabPromises[tabId] = Promise.resolve();
            return tabPromises[tabId];
        }

        let resolvedPath = filePath;
        if (window.currentLanguage === 'fr') {
            resolvedPath = filePath.replace('docs/', 'docs/fr/');
        }

        tabPromises[tabId] = fetch(resolvedPath)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${resolvedPath}: ${response.statusText}`);
                }
                return response.text();
            })
            .then(markdown => {
                const html = parseMarkdownToHTML(markdown);
                targetContent.innerHTML = html;
                initializeAccordions(targetContent);
            })
            .catch(err => {
                console.error(err);
                targetContent.innerHTML = `<p style="color: var(--accent-red); padding: 15px;">Error loading documentation: ${err.message}</p>`;
            });

        return tabPromises[tabId];
    }

    // Load active tab initially
    const activeTabItem = document.querySelector('.docs-nav-item.active');
    if (activeTabItem) {
        loadTabContent(activeTabItem.getAttribute('data-tab'));
    }

    // Listen for language changes dynamically to reload the documentation
    document.addEventListener('dh-language-changed', () => {
        // Clear cached tab promises
        for (const key in tabPromises) {
            delete tabPromises[key];
        }
        // Reset rendered tab contents (avoid wiping the shredding subtab structure skeleton)
        tabContents.forEach(content => {
            if (content.id === 'tab-shredding') {
                const std = content.querySelector('#shredding-standard');
                const nvm = content.querySelector('#shredding-nvme');
                if (std) std.innerHTML = '';
                if (nvm) nvm.innerHTML = '';
            } else {
                content.innerHTML = '';
            }
        });
        // Re-load the currently active tab in the new language
        const activeTabItem = document.querySelector('.docs-nav-item.active');
        if (activeTabItem) {
            loadTabContent(activeTabItem.getAttribute('data-tab'));
        }
    });

    // Ensure all tabs are fetched and loaded (used for search filtering)
    async function ensureAllTabsLoaded() {
        const promises = Object.keys(tabToMdMap).map(tabId => loadTabContent(tabId));
        await Promise.all(promises);
    }

    // 4. Zero-Dependency Regex Markdown-to-HTML Parser
    function parseMarkdownToHTML(markdown) {
        if (!markdown) return '';

        // Normalize line endings
        const normalized = markdown.replace(/\r\n/g, '\n').trim();

        // Split into block elements by double newlines
        const blocks = normalized.split(/\n{2,}/);

        // Helper to parse inline styles (bold, code)
        const inlineParse = (text) => {
            let html = text;
            // Bold: **text**
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            // Inline code: `text`
            html = html.replace(/`(.*?)`/g, '<code>$1</code>');
            return html;
        };

        const parsedBlocks = blocks.map(block => {
            const trimmedBlock = block.trim();
            if (!trimmedBlock) return '';

            // Accordion blocks
            if (trimmedBlock.startsWith(':::accordion')) {
                const match = trimmedBlock.match(/^:::accordion\s+(.*?)\n([\s\S]*?)\n:::/);
                if (match) {
                    const title = match[1].trim();
                    const content = match[2].trim();
                    return `<div class="accordion-item">
                        <div class="accordion-title">${title}</div>
                        <div class="accordion-panel">
                            <p>${inlineParse(content)}</p>
                        </div>
                    </div>`;
                }
            }

            // GitHub-style alerts / Blockquotes
            if (trimmedBlock.startsWith('>')) {
                const lines = trimmedBlock.split('\n');
                const firstLine = lines[0];
                const match = firstLine.match(/^>\s*\[!(NOTE|WARNING|IMPORTANT)\]/i);
                if (match) {
                    const type = match[1].toUpperCase();
                    const contentLines = lines.slice(1).map(l => l.replace(/^>\s?/, ''));
                    const text = contentLines.join('\n').trim();

                    let title = "Note";
                    let alertClass = "info-alert";
                    const isFr = (window.currentLanguage === 'fr');

                    if (type === "NOTE") {
                        title = isFr ? "Remarque" : "Note";
                        alertClass = "info-alert";
                        if (text.includes("PRIVILEGED") || text.includes("PRIVILÉGIÉS")) {
                            title = isFr ? "Isolation des privilèges" : "Privilege Isolation";
                        } else if (text.includes("prevent unnecessary") || text.includes("inutile")) {
                            title = isFr ? "Politique de cache SMART" : "SMART Cache Policy";
                            alertClass = "info-alert mt-15";
                        }
                    } else if (type === "WARNING") {
                        title = isFr ? "Avertissement de destruction" : "Destruction Warning";
                        alertClass = "warning-alert";
                    } else if (type === "IMPORTANT") {
                        title = isFr ? "Important" : "Important";
                        alertClass = "info-alert";
                        if (text.includes("Docker containers") || text.includes("conteneurs Docker")) {
                            title = isFr ? "Mappage du contrôleur NVMe" : "NVMe Controller Device Mapping";
                            alertClass = "info-alert mt-15";
                        } else if (text.includes("Speed test benchmark") || text.includes("vitesse sont alloués")) {
                            title = isFr ? "Garanties de test de performance" : "Benchmark Safeguards";
                        }
                    }

                    return `<div class="${alertClass}">
                        <strong>${title}</strong>
                        <p>${inlineParse(text)}</p>
                    </div>`;
                }
            }

            // Tables
            if (trimmedBlock.startsWith('|')) {
                const lines = trimmedBlock.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length >= 2) {
                    const headers = lines[0].split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
                    const isSeparator = /^\|?[\s\-\|]+$/.test(lines[1]);
                    if (isSeparator) {
                        const rows = [];
                        for (let i = 2; i < lines.length; i++) {
                            const cells = lines[i].split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
                            rows.push(cells);
                        }

                        const theadHtml = `<thead>
                            <tr>
                                ${headers.map(h => `<th>${inlineParse(h)}</th>`).join('')}
                            </tr>
                        </thead>`;

                        const tbodyHtml = `<tbody>
                            ${rows.map(row => `<tr>
                                ${row.map(cell => `<td>${inlineParse(cell)}</td>`).join('')}
                            </tr>`).join('')}
                        </tbody>`;

                        return `<table class="docs-table">
                            ${theadHtml}
                            ${tbodyHtml}
                        </table>`;
                    }
                }
            }

            // Checklists and Bullet Lists
            if (trimmedBlock.startsWith('-')) {
                const lines = trimmedBlock.split('\n').map(l => l.trim()).filter(Boolean);
                const isChecklist = lines.some(l => l.startsWith('- [ ]') || l.startsWith('- [x]'));
                if (isChecklist) {
                    let checkboxCounter = 1;
                    const itemsHtml = lines.map(line => {
                        const isChecked = line.startsWith('- [x]');
                        const text = line.replace(/^-\s*\[[ xX]\]\s*/, '');
                        const id = `chk-step-${checkboxCounter++}`;
                        return `<div class="checklist-item">
                            <input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''} disabled>
                            <label for="${id}">${inlineParse(text)}</label>
                        </div>`;
                    }).join('\n');
                    return `<div class="checklist-box">
                        ${itemsHtml}
                    </div>`;
                } else {
                    const itemsHtml = lines.map(line => {
                        const text = line.replace(/^-\s*/, '');
                        return `<li>${inlineParse(text)}</li>`;
                    }).join('\n');
                    return `<ul>${itemsHtml}</ul>`;
                }
            }

            // Headings
            if (trimmedBlock.startsWith('#')) {
                const match = trimmedBlock.match(/^(#{1,6})\s+(.*)$/);
                if (match) {
                    const level = match[1].length;
                    const text = match[2].trim();
                    if (level === 4) {
                        return `<h4 class="section-title">${inlineParse(text)}</h4>`;
                    } else {
                        return `<h${level}>${inlineParse(text)}</h${level}>`;
                    }
                }
            }

            // Code Blocks
            if (trimmedBlock.startsWith('```')) {
                const lines = trimmedBlock.split('\n');
                const codeLines = lines.slice(1, lines.length - 1);
                const code = codeLines.join('\n');
                return `<pre><code>${code}</code></pre>`;
            }

            // Default: Paragraph
            return `<p>${inlineParse(trimmedBlock)}</p>`;
        });

        return parsedBlocks.filter(Boolean).join('\n');
    }

    // 5. Documentation Search Filtering
    const searchInput = document.getElementById('docs-search');
    if (searchInput) {
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.toLowerCase().trim();

            if (query) {
                // Pre-load all documentation tabs so search queries evaluate comprehensively
                await ensureAllTabsLoaded();
            }

            if (!query) {
                // Restore default states when query is cleared
                tabContents.forEach(content => {
                    content.style.display = '';
                    content.querySelectorAll('h3, h4, p, li, tr, .checklist-item, .accordion-item').forEach(el => {
                        el.style.display = '';
                    });
                });
                
                // Restore classes to only show active tab
                const activeTabItem = document.querySelector('.docs-nav-item.active');
                const activeTab = activeTabItem ? activeTabItem.getAttribute('data-tab') : 'tab-overview';
                tabContents.forEach(content => {
                    if (content.id === activeTab) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }

                    // Reset sub-tabs to default active states
                    const subtabs = content.querySelectorAll('.docs-sub-tab');
                    const subtabContents = content.querySelectorAll('.docs-subtab-content');
                    if (subtabs.length > 0) {
                        subtabs.forEach((btn, idx) => {
                            if (idx === 0) btn.classList.add('active');
                            else btn.classList.remove('active');
                        });
                        subtabContents.forEach((c, idx) => {
                            if (idx === 0) c.classList.add('active');
                            else c.classList.remove('active');
                        });
                    }
                });
                return;
            }

            tabContents.forEach(content => {
                let matchInTab = false;
                const searchableElements = content.querySelectorAll('h3, h4, p, li, tr, .accordion-item, .checklist-item');

                searchableElements.forEach(el => {
                    const text = el.textContent.toLowerCase();
                    if (text.includes(query)) {
                        el.style.display = '';
                        matchInTab = true;

                        // Automatically open matching accordion panels
                        if (el.classList.contains('accordion-item')) {
                            const title = el.querySelector('.accordion-title');
                            const panel = el.querySelector('.accordion-panel');
                            if (title && panel) {
                                title.classList.add('active');
                                panel.classList.add('active');
                            }
                        }

                        // Automatically switch to matching sub-tab
                        const subtabContent = el.closest('.docs-subtab-content');
                        if (subtabContent) {
                            const subtabId = subtabContent.id;
                            const subtabBtn = content.querySelector(`.docs-sub-tab[data-subtab="${subtabId}"]`);
                            if (subtabBtn) {
                                // Deactivate sibling sub-tabs and sub-tab contents
                                content.querySelectorAll('.docs-sub-tab').forEach(b => b.classList.remove('active'));
                                content.querySelectorAll('.docs-subtab-content').forEach(c => c.classList.remove('active'));
                                subtabBtn.classList.add('active');
                                subtabContent.classList.add('active');
                            }
                        }
                    } else {
                        el.style.display = 'none';
                    }
                });

                // Display/hide entire tab contents based on search results
                if (matchInTab) {
                    content.style.display = 'block';
                    content.classList.add('active');
                } else {
                    content.style.display = 'none';
                    content.classList.remove('active');
                }
            });
        });
    }
});
