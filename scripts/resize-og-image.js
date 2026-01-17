import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try multiple possible input paths
const possibleInputs = [
  join(__dirname, '../public/og-image.png/poop-pay-logo.png'),
  join(__dirname, '../public/poop-pay-logo-original.png'),
  join(__dirname, '../public/poop-pay-logo.png')
];

let inputPath = null;
for (const path of possibleInputs) {
  if (existsSync(path)) {
    inputPath = path;
    break;
  }
}

const outputPath = join(__dirname, '../public/og-image.png');

// Check if input file exists
if (!existsSync(inputPath)) {
  console.error('Input file not found:', inputPath);
  process.exit(1);
}

// Resize image to 1200x360 (user requested) or 1200x630 (Open Graph standard)
// Using 1200x360 as requested, but will create both versions
const targetWidth = 1200;
const targetHeight = 360; // User requested
const standardHeight = 630; // Open Graph standard

async function resizeImage() {
  try {
    // Create 1200x360 version (user requested)
    await sharp(inputPath)
      .resize(targetWidth, targetHeight, {
        fit: 'contain',
        background: { r: 255, g: 253, b: 208, alpha: 1 } // Cream background #FFFDD0
      })
      .toFile(outputPath);
    
    console.log(`✅ Created og-image.png (${targetWidth}x${targetHeight})`);
    
    // Also create standard 1200x630 version
    const standardOutputPath = join(__dirname, '../public/og-image-standard.png');
    await sharp(inputPath)
      .resize(targetWidth, standardHeight, {
        fit: 'contain',
        background: { r: 255, g: 253, b: 208, alpha: 1 }
      })
      .toFile(standardOutputPath);
    
    console.log(`✅ Created og-image-standard.png (${targetWidth}x${standardHeight}) - Open Graph standard`);
    console.log('📝 Note: Using 1200x360 as requested. For better social media sharing, consider using 1200x630 (standard).');
  } catch (error) {
    console.error('Error resizing image:', error);
    process.exit(1);
  }
}

resizeImage();
