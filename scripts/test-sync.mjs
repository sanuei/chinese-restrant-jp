import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  console.log("Searching for place ID...");
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent('知音食堂 池袋')}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();
  
  if (!searchData.results || searchData.results.length === 0) {
    console.error("No place found", searchData);
    return;
  }
  
  const placeId = searchData.results[0].place_id;
  console.log("Found Place ID:", placeId);
  
  console.log("Calling local sync API...");
  const syncRes = await fetch('http://localhost:3000/api/admin/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ADMIN_SECRET}`
    },
    body: JSON.stringify({ place_id: placeId })
  });
  
  const syncData = await syncRes.json();
  console.log("Sync Result:", syncData);
}

run();
