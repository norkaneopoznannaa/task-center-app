/**
 * Script to create app icon for Task Center
 * Uses node-canvas to generate a simple icon
 */
const fs = require('fs');
const path = require('path');

// Create icon directory
const iconDir = path.join(__dirname, '../public');
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// Create a simple SVG icon
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="256" height="256" rx="32" fill="#60a5fa"/>

  <!-- Checklist icon -->
  <g transform="translate(64, 64)">
    <!-- Paper -->
    <rect x="0" y="0" width="128" height="160" rx="8" fill="#ffffff" opacity="0.95"/>

    <!-- Lines (tasks) -->
    <line x1="20" y1="30" x2="108" y2="30" stroke="#1e40af" stroke-width="4" stroke-linecap="round"/>
    <line x1="20" y1="60" x2="108" y2="60" stroke="#1e40af" stroke-width="4" stroke-linecap="round"/>
    <line x1="20" y1="90" x2="108" y2="90" stroke="#1e40af" stroke-width="4" stroke-linecap="round"/>
    <line x1="20" y1="120" x2="80" y2="120" stroke="#1e40af" stroke-width="4" stroke-linecap="round"/>

    <!-- Checkmarks -->
    <circle cx="20" cy="30" r="8" fill="#22c55e"/>
    <circle cx="20" cy="60" r="8" fill="#22c55e"/>
    <circle cx="20" cy="90" r="8" fill="#ef4444"/>
    <circle cx="20" cy="120" r="8" fill="#f59e0b"/>

    <!-- Priority indicator (star) -->
    <path d="M 108 10 L 112 18 L 120 18 L 114 23 L 116 31 L 108 26 L 100 31 L 102 23 L 96 18 L 104 18 Z" fill="#fbbf24"/>
  </g>
</svg>`;

const svgPath = path.join(iconDir, 'icon.svg');
fs.writeFileSync(svgPath, svgContent, 'utf-8');

console.log(`[OK] SVG icon created at: ${svgPath}`);

// Create HTML file to convert SVG to PNG manually if needed
const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Icon Preview - Task Center</title>
  <style>
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #1f2937;
      font-family: system-ui, -apple-system, sans-serif;
      color: white;
    }
    .icon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
      padding: 20px;
      max-width: 800px;
    }
    .icon-card {
      background: #374151;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
    }
    img {
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
    h1 {
      margin: 0 0 30px 0;
    }
    .size-label {
      margin-top: 10px;
      font-size: 12px;
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <h1>Task Center Icon Preview</h1>
  <div class="icon-grid">
    <div class="icon-card">
      <img src="icon.svg" width="256" height="256" />
      <div class="size-label">256x256</div>
    </div>
    <div class="icon-card">
      <img src="icon.svg" width="128" height="128" />
      <div class="size-label">128x128</div>
    </div>
    <div class="icon-card">
      <img src="icon.svg" width="64" height="64" />
      <div class="size-label">64x64</div>
    </div>
    <div class="icon-card">
      <img src="icon.svg" width="32" height="32" />
      <div class="size-label">32x32</div>
    </div>
    <div class="icon-card">
      <img src="icon.svg" width="16" height="16" />
      <div class="size-label">16x16</div>
    </div>
  </div>
  <p style="margin-top: 30px; opacity: 0.6;">Icon for Task Center Desktop App</p>
</body>
</html>`;

const htmlPath = path.join(iconDir, 'icon-preview.html');
fs.writeFileSync(htmlPath, htmlContent, 'utf-8');

console.log(`[OK] Icon preview HTML created at: ${htmlPath}`);
console.log(`\n[INFO] To view the icon, open: file:///${htmlPath.replace(/\\/g, '/')}`);
console.log(`[INFO] SVG icon ready to use!`);
