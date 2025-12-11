/**
 * TokenScanner - Enhanced Design Token Detection
 * 
 * Phase 1 Improvements:
 * 1. Scan ALL CSS rules, not just :root
 * 2. Recursively handle @media, @supports rules
 * 3. Relaxed color detection - any valid color value
 * 4. Framework prefix support (Tailwind, Material, Chakra, etc.)
 * 5. DOM color extraction for ALL page elements
 * 6. Support for iframe document scanning
 */

export default class TokenScanner {
    constructor() {
        this.tokens = {
            colors: [],
            spacing: [],
            typography: [],
            radius: []
        };
        this.scanned = false;
        this.colorVars = new Map();
        this.spacingVars = new Map();
        this.radiusVars = new Map();
        this.targetDoc = null;
        this.targetWin = null;

        // Lumi's own prefixes to exclude
        this.lumiPrefixes = [
            '--dock-', '--lumi-', '--glass-', '--surface-',
            '--shadow', '--radius-panel', '--radius-chip', '--header-'
        ];

        // Known framework prefixes to include
        this.frameworkPrefixes = [
            '--tw-',      // Tailwind CSS
            '--mdc-',     // Material Design Components
            '--mat-',     // Angular Material
            '--chakra-',  // Chakra UI
            '--bs-',      // Bootstrap
            '--ant-',     // Ant Design
            '--wp--',     // WordPress
            '--spectrum-', // Adobe Spectrum
            '--pf-',      // PatternFly
            '--carbon-',  // IBM Carbon
        ];
    }

    /**
     * Set target document for scanning (for iframe support)
     * @param {Document} doc - The document to scan
     * @param {Window} win - The window object for getComputedStyle
     */
    setTargetDocument(doc, win) {
        this.targetDoc = doc;
        this.targetWin = win;
        // Reset scan state when target changes
        this.scanned = false;
        this.colorVars.clear();
        this.spacingVars.clear();
        this.radiusVars.clear();
    }

    scan() {
        if (this.scanned) return this.tokens;

        const doc = this.targetDoc || document;
        const win = this.targetWin || window;

        // 1. Scan all CSS stylesheets for CSS variables
        this.scanAllStylesheets(doc);

        // 2. Always extract colors from DOM elements (captures Tailwind and other utility classes)
        this.extractDOMColors(doc, win);

        // 3. Convert Maps to Arrays and deduplicate
        this.tokens.colors = this.deduplicateColors(
            Array.from(this.colorVars.entries()).map(([name, value]) => ({ name, value }))
        );
        this.tokens.spacing = Array.from(this.spacingVars.entries())
            .map(([name, value]) => ({ name, value }));
        this.tokens.radius = Array.from(this.radiusVars.entries())
            .map(([name, value]) => ({ name, value }));

        // 4. Sort tokens
        this.tokens.spacing.sort((a, b) => this.parsePx(a.value) - this.parsePx(b.value));
        this.tokens.colors.sort((a, b) => a.name.localeCompare(b.name));

        this.scanned = true;
        return this.tokens;
    }

    scanAllStylesheets(doc) {
        const targetDoc = doc || document;
        try {
            Array.from(targetDoc.styleSheets).forEach(sheet => {
                try {
                    // Check if we can access the rules (CORS check)
                    if (sheet.cssRules) {
                        this.scanRules(sheet.cssRules);
                    }
                } catch (e) {
                    // CORS or other access error, skip this stylesheet
                }
            });
        } catch (e) {
            // Fallback: do nothing
        }
    }

    scanRules(rules) {
        if (!rules) return;

        Array.from(rules).forEach(rule => {
            try {
                // CSSMediaRule - @media queries
                if (rule.type === 4 && rule.cssRules) {
                    this.scanRules(rule.cssRules);
                }
                // CSSSupportsRule - @supports queries  
                else if (rule.type === 12 && rule.cssRules) {
                    this.scanRules(rule.cssRules);
                }
                // CSSStyleRule - regular style rules
                else if (rule.type === 1) {
                    this.extractVarsFromRule(rule);
                }
            } catch (e) {
                // Skip problematic rules
            }
        });
    }

    extractVarsFromRule(rule) {
        const style = rule.style;
        if (!style) return;

        for (let i = 0; i < style.length; i++) {
            const prop = style[i];

            // Only process CSS custom properties
            if (!prop.startsWith('--')) continue;

            // Skip Lumi's own variables
            if (this.isLumiVar(prop)) continue;

            const val = style.getPropertyValue(prop).trim();
            if (!val) continue;

            // Categorize the variable
            this.categorizeVar(prop, val);
        }
    }

    categorizeVar(name, value) {
        // Check if value is a color (relaxed detection)
        if (this.isColor(value)) {
            const normalized = this.normalizeColor(value);
            if (normalized) {
                this.colorVars.set(name, normalized);
                return;
            }
        }

        // Check for spacing values
        if (this.isSpacing(name, value)) {
            this.spacingVars.set(name, value);
            return;
        }

        // Check for radius values
        if (name.toLowerCase().includes('radius') && this.isLength(value)) {
            this.radiusVars.set(name, value);
            return;
        }
    }

    isLumiVar(name) {
        return this.lumiPrefixes.some(prefix => name.startsWith(prefix));
    }

    isColor(value) {
        if (!value) return false;

        // Quick check for obvious color formats
        if (value.startsWith('#') ||
            value.startsWith('rgb') ||
            value.startsWith('hsl') ||
            value.startsWith('oklch') ||
            value.startsWith('oklab') ||
            value.startsWith('lab') ||
            value.startsWith('lch') ||
            value.startsWith('color(')) {
            return true;
        }

        // Check for gradients
        if (value.includes('gradient')) {
            return true;
        }

        // Check for named colors using Option element trick
        const s = new Option().style;
        s.color = value;
        return s.color !== '';
    }

    normalizeColor(value) {
        // Gradients can't be normalized via Option.style.color trick
        if (value.includes('gradient')) {
            return value;
        }

        // Try to parse and normalize the color
        try {
            const s = new Option().style;
            s.color = value;
            return s.color || value;
        } catch (e) {
            return value;
        }
    }

    isSpacing(name, value) {
        const nameLower = name.toLowerCase();
        const isSpacingName = nameLower.includes('spacing') ||
            nameLower.includes('gap') ||
            nameLower.includes('margin') ||
            nameLower.includes('padding') ||
            nameLower.includes('space');
        return isSpacingName && this.isLength(value);
    }

    isLength(value) {
        return /^-?\d*\.?\d+(px|rem|em|%|vh|vw|ch|ex)$/.test(value.trim());
    }

    /**
     * Extract frequently used colors from DOM elements
     * This captures colors from Tailwind, utility classes, and inline styles
     * @param {Document} doc - Target document
     * @param {Window} win - Target window for getComputedStyle
     */
    extractDOMColors(doc, win) {
        const targetDoc = doc || document;
        const targetWin = win || window;

        const colorCounts = new Map();
        // Expanded list of color-related CSS properties
        const colorProps = [
            'color',
            'backgroundColor',
            'backgroundImage', // For gradients
            'borderColor',
            'borderTopColor',
            'borderRightColor',
            'borderBottomColor',
            'borderLeftColor',
            'outlineColor',
            'textDecorationColor',
            'fill',
            'stroke'
        ];

        try {
            // Scan ALL elements for complete color coverage
            const elements = targetDoc.querySelectorAll('body *');
            // Scan all elements (up to 2000) for comprehensive coverage
            const maxElements = Math.min(elements.length, 2000);

            let scannedCount = 0;
            let skippedCount = 0;
            for (let i = 0; i < maxElements; i++) {
                const el = elements[i];
                // Skip Lumi's UI elements (dock and bar), but NOT viewport-root content (user page)
                // #lumi-viewport-root contains user's page content - DON'T skip it
                if (el.closest('#lumi-dock-root, #lumi-viewport-bar-root')) {
                    skippedCount++;
                    continue;
                }

                scannedCount++;
                try {
                    const styles = targetWin.getComputedStyle(el);
                    colorProps.forEach(prop => {
                        const val = styles[prop];
                        if (val && this.isValidDOMColor(val)) {
                            const count = colorCounts.get(val) || 0;
                            colorCounts.set(val, count + 1);
                        }
                    });
                } catch (e) {
                    // Skip inaccessible elements
                }
            }

            // Add top 50 most used colors (that aren't already in colorVars)
            const sortedColors = [...colorCounts.entries()]
                .filter(([color]) => !this.isDuplicateColor(color))
                .sort((a, b) => b[1] - a[1])
                .slice(0, 50);

            console.log(`[TokenScanner] Adding ${sortedColors.length} page colors to token list`);

            sortedColors.forEach(([color], index) => {
                // Use descriptive names for DOM-extracted colors
                const name = `--page-color-${index + 1}`;
                this.colorVars.set(name, color);
            });

        } catch (e) {
            // Fallback extraction failed
        }
    }

    isValidDOMColor(value) {
        if (!value) return false;
        // Filter out transparent and default black
        if (value === 'transparent' ||
            value === 'rgba(0, 0, 0, 0)' ||
            value === 'rgb(0, 0, 0)') {
            return false;
        }
        // Include gradients
        if (value.includes('gradient')) {
            return true;
        }
        return value.startsWith('rgb') || value.startsWith('hsl');
    }

    isDuplicateColor(newColor) {
        // Check if this color already exists in colorVars
        for (const existingColor of this.colorVars.values()) {
            if (this.colorsAreSimilar(existingColor, newColor)) {
                return true;
            }
        }
        return false;
    }

    colorsAreSimilar(color1, color2) {
        // Simple string comparison for now
        return color1 === color2;
    }

    deduplicateColors(colors) {
        const seen = new Set();
        return colors.filter(({ value }) => {
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
        });
    }

    parsePx(value) {
        if (value.endsWith('px')) return parseFloat(value);
        if (value.endsWith('rem')) return parseFloat(value) * 16;
        if (value.endsWith('em')) return parseFloat(value) * 16;
        return 0;
    }

    getColors() {
        this.scan();
        return this.tokens.colors;
    }

    getSpacing() {
        this.scan();
        return this.tokens.spacing;
    }

    getRadius() {
        this.scan();
        return this.tokens.radius;
    }

    /**
     * Force rescan (useful when page content changes)
     */
    rescan() {
        this.scanned = false;
        this.colorVars.clear();
        this.spacingVars.clear();
        this.radiusVars.clear();
        return this.scan();
    }
}
