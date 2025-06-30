import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function capture() {
  const browser = await chromium.launch({ headless: true });
  
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
    
    const htmlPath = path.join(__dirname, 'docs/failures/coastline-extraction-enhanced/fixed-visualization.html');
    await page.goto(`file://${htmlPath}`);
    
    // Wait for map to load
    await page.waitForTimeout(3000);
    
    // Take screenshot with dark base
    await page.screenshot({ 
      path: path.join(__dirname, 'docs/failures/coastline-extraction-enhanced/fixed-dark-base.png')
    });
    
    // Switch to satellite view
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const satelliteLabel = labels.find(label => label.textContent.includes('Satellite'));
      if (satelliteLabel) {
        satelliteLabel.querySelector('input')?.click();
      }
    });
    
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: path.join(__dirname, 'docs/failures/coastline-extraction-enhanced/fixed-satellite-view.png')
    });
    
    console.log('✓ Screenshots captured');
    
  } finally {
    await browser.close();
  }
}

capture().catch(console.error);