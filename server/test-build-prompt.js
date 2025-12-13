#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Extract just the buildPrompt function and its dependencies
const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Extract renderElementDetail function
const renderDetailMatch = serverCode.match(/function renderElementDetail\([\s\S]+?\n\}/);
const pickStylesMatch = serverCode.match(/function pickStyles\([\s\S]+?\n\}/);
const buildPromptMatch = serverCode.match(/function buildPrompt\(context\)[\s\S]+?(?=\nfunction [a-z]|$)/);

if (!buildPromptMatch || !renderDetailMatch || !pickStylesMatch) {
    console.error('Failed to extract functions');
    process.exit(1);
}

// Evaluate the functions
eval(pickStylesMatch[0]);
eval(renderDetailMatch[0]);
eval(buildPromptMatch[0]);

// Load sample context
const samplePath = process.argv[2] || path.join(__dirname, 'samples', 'sample-context.json');
const context = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

// Generate and print prompt
const prompt = buildPrompt(context);
console.log('--- GENERATED PROMPT ---');
console.log(prompt);
console.log('\n--- END ---');
