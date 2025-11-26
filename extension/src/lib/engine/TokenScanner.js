/**
 * TokenScanner - Scans the page for Design Tokens (CSS Variables & Common Values)
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
    }

    scan() {
        if (this.scanned) return this.tokens;

        const colorVars = new Map();
        const spacingVars = new Map();
        const radiusVars = new Map();

        // 1. Scan CSS Variables from document.styleSheets (if accessible)
        // Note: accessing cssRules can be blocked by CORS for external sheets.
        // We'll try our best, and fallback to computed styles on :root.

        // Scan :root computed style for variables
        const rootStyle = window.getComputedStyle(document.documentElement);
        // There is no API to enumerate all defined variables on an element.
        // We have to rely on iterating styleSheets or known conventions.
        // However, we can try to guess common prefixes or just rely on what we find in sheets.

        try {
            Array.from(document.styleSheets).forEach(sheet => {
                try {
                    Array.from(sheet.cssRules).forEach(rule => {
                        if (rule.type === 1 && (rule.selectorText === ':root' || rule.selectorText === 'html' || rule.selectorText === 'body')) {
                            const style = rule.style;
                            for (let i = 0; i < style.length; i++) {
                                const prop = style[i];
                                if (prop.startsWith('--')) {
                                    const val = style.getPropertyValue(prop).trim();
                                    this.categorizeVar(prop, val, { colorVars, spacingVars, radiusVars });
                                }
                            }
                        }
                    });
                } catch (e) {
                    // CORS or other access error, ignore
                }
            });
        } catch (e) { }

        // Convert Maps to Arrays
        this.tokens.colors = Array.from(colorVars.entries()).map(([name, value]) => ({ name, value }));
        this.tokens.spacing = Array.from(spacingVars.entries()).map(([name, value]) => ({ name, value }));
        this.tokens.radius = Array.from(radiusVars.entries()).map(([name, value]) => ({ name, value }));

        // Sort tokens
        this.tokens.spacing.sort((a, b) => this.parsePx(a.value) - this.parsePx(b.value));

        this.scanned = true;
        return this.tokens;
    }

    categorizeVar(name, value, { colorVars, spacingVars, radiusVars }) {
        // Colors
        if (name.includes('color') || name.includes('bg') || name.includes('text') || name.includes('primary') || name.includes('accent') || name.includes('gray') || value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl')) {
            // Basic check if value is a color
            if (this.isColor(value)) {
                colorVars.set(name, value);
                return;
            }
        }

        // Spacing
        if (name.includes('spacing') || name.includes('gap') || name.includes('margin') || name.includes('padding')) {
            if (value.endsWith('px') || value.endsWith('rem') || value.endsWith('em')) {
                spacingVars.set(name, value);
                return;
            }
        }

        // Radius
        if (name.includes('radius')) {
            radiusVars.set(name, value);
            return;
        }
    }

    isColor(value) {
        const s = new Option().style;
        s.color = value;
        return s.color !== '';
    }

    parsePx(value) {
        if (value.endsWith('px')) return parseFloat(value);
        if (value.endsWith('rem')) return parseFloat(value) * 16; // Assumption
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
}
