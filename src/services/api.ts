// src/services/api.ts

// const API_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL as string;
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzLW2IMHKtY6BwXmztYJbd-vZ28QUYk3rGQJMJ2r-o6I8_WvjLn6UwBdQZKRkvw4Ckb/exec"
// src/services/api.ts

export const fetchSheetData = async (sheetName: string) => {
  const cacheKey = `ev_cache_${sheetName}`;
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=read&sheet=${sheetName}&t=${Date.now()}`, {
      redirect: "follow", 
    });

    if (!response.ok) throw new Error("Network Error");
    
    const data = await response.json();
    
    // 👈 Data က Array အစစ်ဟုတ်မှသာ လက်ခံမည် (Error object များကို ရှောင်ရှားရန်)
    if (Array.isArray(data)) {
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    } else if (data && data.data && Array.isArray(data.data)) {
      localStorage.setItem(cacheKey, JSON.stringify(data.data));
      return data.data;
    } else {
      throw new Error("Invalid Data Format from API");
    }
  } catch (error) {
    console.warn(`Offline or API Error for ${sheetName}:`, error);
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) return JSON.parse(cachedData);
    return []; // 👈 null အစား [] (Empty Array) ပြန်ပေးမည် (App Crash မဖြစ်စေရန်)
  }
};

export const appendSheetData = async (sheetName: string, rowData: any[]) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ action: 'append', sheet: sheetName, data: JSON.stringify(rowData) })
    });
    return await response.json();
  } catch (error) {
    console.error("Failed to append data", error);
    throw error;
  }
};

export const deleteSheetData = async (sheetName: string, id: string) => {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ action: 'delete', sheet: sheetName, id: id })
    });
    
    const result = await response.json();
    // 👈 Sheet ထဲမှာ တကယ်မဖျက်နိုင်ရင် Error ပြန်ကန်ပေးပါမည် (UI မှာ ပျောက်မသွားတော့ပါ)
    if (result.status !== 'success') {
        throw new Error(result.message);
    }
    return result;
  } catch (error) {
    console.error("Failed to delete data", error);
    throw error; // UI က Catch ထဲရောက်သွားပါမည်
  }
};