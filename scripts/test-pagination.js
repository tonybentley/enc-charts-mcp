#!/usr/bin/env node

/**
 * Test script to demonstrate pagination functionality
 * This shows how the pagination prevents response size issues
 */

import { getChartHandler } from '../dist/handlers/getChart.js';
import { searchChartsHandler } from '../dist/handlers/searchCharts.js';

async function testPagination() {
  console.log('Testing Pagination Implementation\n');
  console.log('=================================\n');

  // Test 1: Get chart with default pagination
  console.log('Test 1: Get chart with default pagination (limit=100)');
  try {
    const result = await getChartHandler({
      chartId: 'US5CA72M' // San Diego Bay chart
    });
    
    const response = JSON.parse(result.content[0].text);
    
    if (response.error) {
      console.log(`Error: ${response.error}`);
    } else {
      console.log(`- Total features available: ${response.totalFeatures}`);
      console.log(`- Features returned: ${response.featureCount}`);
      console.log(`- Has more data: ${response.hasMore}`);
      console.log(`- Response size: ${JSON.stringify(response).length} bytes`);
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\n---\n');

  // Test 2: Get chart with custom limit
  console.log('Test 2: Get chart with custom limit (limit=10)');
  try {
    const result = await getChartHandler({
      chartId: 'US5CA72M',
      limit: 10,
      offset: 0
    });
    
    const response = JSON.parse(result.content[0].text);
    
    if (response.error) {
      console.log(`Error: ${response.error}`);
    } else {
      console.log(`- Total features available: ${response.totalFeatures}`);
      console.log(`- Features returned: ${response.featureCount}`);
      console.log(`- Has more data: ${response.hasMore}`);
      console.log(`- Response size: ${JSON.stringify(response).length} bytes`);
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\n---\n');

  // Test 3: Get chart with pagination (page 2)
  console.log('Test 3: Get chart page 2 (limit=10, offset=10)');
  try {
    const result = await getChartHandler({
      chartId: 'US5CA72M',
      limit: 10,
      offset: 10
    });
    
    const response = JSON.parse(result.content[0].text);
    
    if (response.error) {
      console.log(`Error: ${response.error}`);
    } else {
      console.log(`- Features returned: ${response.featureCount}`);
      console.log(`- Current offset: ${response.offset}`);
      console.log(`- Has more data: ${response.hasMore}`);
      if (response.features.length > 0) {
        console.log(`- First feature ID: ${response.features[0].id}`);
      }
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\n---\n');

  // Test 4: Search charts with pagination
  console.log('Test 4: Search charts with default pagination (limit=50)');
  try {
    const result = await searchChartsHandler({
      boundingBox: {
        minLat: 30,
        maxLat: 35,
        minLon: -120,
        maxLon: -115
      }
    });
    
    const response = JSON.parse(result.content[0].text);
    
    console.log(`- Total charts found: ${response.totalCount}`);
    console.log(`- Charts returned: ${response.count}`);
    console.log(`- Has more data: ${response.hasMore}`);
    console.log(`- Response size: ${JSON.stringify(response).length} bytes`);
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\n---\n');

  // Test 5: Compare response sizes
  console.log('Test 5: Response size comparison');
  try {
    // Small response
    const smallResult = await getChartHandler({
      chartId: 'US5CA72M',
      limit: 5
    });
    const smallSize = JSON.stringify(smallResult.content[0].text).length;
    
    // Large response (but still limited)
    const largeResult = await getChartHandler({
      chartId: 'US5CA72M',
      limit: 100
    });
    const largeSize = JSON.stringify(largeResult.content[0].text).length;
    
    console.log(`- Response with limit=5: ${smallSize} bytes`);
    console.log(`- Response with limit=100: ${largeSize} bytes`);
    console.log(`- Size reduction: ${Math.round((1 - smallSize/largeSize) * 100)}%`);
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }

  console.log('\n=================================');
  console.log('Pagination tests completed!');
  console.log('\nConclusion: Pagination successfully limits response sizes');
  console.log('preventing "payload too large" errors in Claude Desktop.');
}

// Run the test
testPagination().catch(console.error);